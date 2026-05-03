import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Mail, RefreshCw, Users } from 'lucide-react';
import { closeMiniApp } from '@telegram-apps/sdk-react';

import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api/auth';
import { isValidEmail } from '@/utils/validation';
import {
  brandingApi,
  getCachedBranding,
  setCachedBranding,
  preloadLogo,
  type BrandingInfo,
  type EmailAuthEnabled,
} from '@/api/branding';
import { getAndClearReturnUrl, tokenStorage } from '@/utils/token';
import { isInTelegramWebApp, getTelegramInitData, useTelegramSDK } from '@/hooks/useTelegramSDK';
import CabinetTelegramLogin from '@/components/auth/CabinetTelegramLogin';
import OAuthProviderIcon from '@/components/OAuthProviderIcon';
import { saveOAuthState } from '@/utils/oauth';
import { getPendingReferralCode } from '@/utils/referral';

interface GlassInputProps {
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  autoFocus?: boolean;
  id?: string;
  name?: string;
}

function GlassInput({
  type = 'text',
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
  autoFocus,
  id,
  name,
}: GlassInputProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={isPassword && show ? 'text' : type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        autoFocus={autoFocus}
        className="verno-input w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-white/25 focus:bg-white/[0.08]"
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 transition-colors hover:text-white/50"
          tabIndex={-1}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </div>
  );
}

export default function CabinetLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAuthenticated,
    isLoading: isAuthInitializing,
    loginWithTelegram,
    loginWithEmail,
    registerWithEmail,
  } = useAuthStore(
    useShallow((state) => ({
      isAuthenticated: state.isAuthenticated,
      isLoading: state.isLoading,
      loginWithTelegram: state.loginWithTelegram,
      loginWithEmail: state.loginWithEmail,
      registerWithEmail: state.registerWithEmail,
    })),
  );

  const referralCode = getPendingReferralCode() || '';

  const [authMode, setAuthMode] = useState<'login' | 'register'>(() =>
    referralCode ? 'register' : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordError, setForgotPasswordError] = useState('');

  // Telegram safe area insets
  const { safeAreaInset, contentSafeAreaInset } = useTelegramSDK();
  const safeTop = Math.max(safeAreaInset.top, contentSafeAreaInset.top);
  const safeBottom = Math.max(safeAreaInset.bottom, contentSafeAreaInset.bottom);

  const getReturnUrl = useCallback(() => {
    const stateFrom = (location.state as { from?: string })?.from;
    if (stateFrom && stateFrom !== '/login') return stateFrom;
    const savedUrl = getAndClearReturnUrl();
    if (savedUrl && savedUrl !== '/login') return savedUrl;
    return '/';
  }, [location.state]);

  // Branding
  const cachedBranding = useMemo(() => getCachedBranding(), []);
  const { data: branding } = useQuery<BrandingInfo>({
    queryKey: ['branding'],
    queryFn: async () => {
      const data = await brandingApi.getBranding();
      setCachedBranding(data);
      await preloadLogo(data);
      return data;
    },
    staleTime: 60000,
    initialData: cachedBranding ?? undefined,
    initialDataUpdatedAt: 0,
  });

  // Email auth feature flag
  const { data: emailAuthConfig } = useQuery<EmailAuthEnabled>({
    queryKey: ['email-auth-enabled'],
    queryFn: brandingApi.getEmailAuthEnabled,
    staleTime: 60000,
  });
  const isEmailAuthEnabled = emailAuthConfig?.enabled ?? true;

  // OAuth providers
  const { data: oauthData } = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: authApi.getOAuthProviders,
    staleTime: 60000,
  });
  const oauthProviders = Array.isArray(oauthData?.providers) ? oauthData.providers : [];

  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const handleOAuthLogin = async (provider: string) => {
    setError('');
    setOauthLoading(provider);
    try {
      const { authorize_url, state } = await authApi.getOAuthAuthorizeUrl(provider);
      let parsed: URL;
      try {
        parsed = new URL(authorize_url);
      } catch {
        throw new Error('Invalid OAuth redirect URL');
      }
      if (parsed.protocol !== 'https:') {
        throw new Error('Invalid OAuth redirect URL');
      }
      saveOAuthState(state, provider);
      window.location.href = authorize_url;
    } catch {
      setError(t('auth.oauthError', 'Authorization was denied or failed'));
      setOauthLoading(null);
    }
  };

  const appName = branding ? branding.name : import.meta.env.VITE_APP_NAME || 'VERNO';

  // Document title
  useEffect(() => {
    document.title = appName || 'VPN';
  }, [appName]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate(getReturnUrl(), { replace: true });
    }
  }, [isAuthenticated, navigate, getReturnUrl]);

  // Try Telegram WebApp authentication on mount (with auto-retry on 401)
  useEffect(() => {
    if (isAuthInitializing) return;

    const tryTelegramAuth = async () => {
      const initData = getTelegramInitData();
      if (!isInTelegramWebApp() || !initData) return;

      setIsTelegramWebApp(true);
      setIsLoading(true);

      const MAX_RETRIES = 1;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await loginWithTelegram(initData);
          navigate(getReturnUrl(), { replace: true });
          return;
        } catch (err) {
          const error = err as { response?: { status?: number; data?: { detail?: string } } };
          const status = error.response?.status;
          const detail = error.response?.data?.detail;
          if (import.meta.env.DEV)
            console.warn(`Telegram auth attempt ${attempt + 1} failed:`, status, detail);

          if (status === 401 && attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }

          setError(detail || t('auth.telegramRequired'));
        }
      }

      setIsLoading(false);
    };

    tryTelegramAuth();
  }, [isAuthInitializing, loginWithTelegram, navigate, t, getReturnUrl]);

  const handleRetryTelegramAuth = () => {
    tokenStorage.clearTokens();
    sessionStorage.removeItem('tapps/launchParams');
    sessionStorage.removeItem('telegram_init_data');
    localStorage.removeItem('cabinet-auth');
    localStorage.removeItem('tg_user_id');

    try {
      closeMiniApp();
    } catch {
      window.location.reload();
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !isValidEmail(email.trim())) {
      setError(t('auth.invalidEmail', 'Please enter a valid email address'));
      return;
    }

    if (authMode === 'register') {
      if (password !== confirmPassword) {
        setError(t('auth.passwordMismatch', 'Passwords do not match'));
        return;
      }
      if (password.length < 8) {
        setError(t('auth.passwordTooShort', 'Password must be at least 8 characters'));
        return;
      }
    }

    setIsLoading(true);

    try {
      if (authMode === 'login') {
        await loginWithEmail(email, password);
        navigate(getReturnUrl(), { replace: true });
      } else {
        const result = await registerWithEmail(
          email,
          password,
          firstName || undefined,
          referralCode || undefined,
        );
        setRegisteredEmail(result.email);
      }
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { detail?: string } } };
      const status = error.response?.status;
      const detail = error.response?.data?.detail;

      if (status === 400 && detail?.includes('already registered')) {
        setError(t('auth.emailAlreadyRegistered', 'This email is already registered'));
      } else if (status === 401 || status === 403) {
        if (detail?.includes('verify your email')) {
          setError(t('auth.emailNotVerified', 'Please verify your email first'));
        } else {
          setError(t('auth.invalidCredentials', 'Invalid email or password'));
        }
      } else if (status === 429) {
        setError(t('auth.tooManyAttempts', 'Too many attempts. Please try again later'));
      } else {
        setError(detail || t('common.error'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordError('');

    if (!forgotPasswordEmail.trim() || !isValidEmail(forgotPasswordEmail.trim())) {
      setForgotPasswordError(t('auth.invalidEmail', 'Please enter a valid email address'));
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await authApi.forgotPassword(forgotPasswordEmail.trim());
      setForgotPasswordSent(true);
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { detail?: string } } };
      const detail = error.response?.data?.detail;
      setForgotPasswordError(detail || t('common.error'));
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const closeForgotPasswordModal = () => {
    setShowForgotPassword(false);
    setForgotPasswordEmail('');
    setForgotPasswordSent(false);
    setForgotPasswordError('');
  };

  return (
    <div
      className="relative flex min-h-[100dvh] items-center justify-center bg-black px-6"
      style={{
        fontFamily: 'Inter, sans-serif',
        paddingTop:
          safeTop > 0 ? `${safeTop + 16}px` : 'calc(1rem + env(safe-area-inset-top, 0px))',
        paddingBottom:
          safeBottom > 0 ? `${safeBottom + 16}px` : 'calc(1rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Brand */}
        <Link
          to="/"
          className="mb-8 block text-center tracking-wider text-white"
          style={{ fontSize: '1.15rem', fontWeight: 600 }}
        >
          {(appName ?? 'ВЕРНО').toUpperCase()} <span className="text-white/40">VPN</span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-xl">
          {/* Referral banner */}
          {referralCode && isEmailAuthEnabled && !registeredEmail && !showForgotPassword && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5">
              <Users size={14} className="shrink-0 text-white/50" />
              <span className="text-xs text-white/55" style={{ fontWeight: 500 }}>
                {t('auth.referralInvite')}
              </span>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* Registration success — check email */}
            {registeredEmail ? (
              <motion.div
                key="check-email"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-2 text-center"
              >
                <Mail size={32} className="mx-auto mb-3 text-white/20" />
                <p className="mb-2 text-sm text-white/65" style={{ fontWeight: 500 }}>
                  {t('auth.checkEmail', 'Подтвердите почту')}
                </p>
                <p className="mb-2 text-xs text-white/35" style={{ lineHeight: 1.6 }}>
                  {t('auth.verificationSent', 'Мы отправили ссылку для подтверждения на:')}
                </p>
                <p className="mb-4 text-sm text-white/65" style={{ fontWeight: 500 }}>
                  {registeredEmail}
                </p>
                <button
                  onClick={() => {
                    setRegisteredEmail(null);
                    setAuthMode('login');
                  }}
                  className="text-xs text-white/35 transition-colors hover:text-white/60"
                >
                  {t('auth.backToLogin', 'Вернуться ко входу')}
                </button>
              </motion.div>
            ) : showForgotPassword ? (
              forgotPasswordSent ? (
                <motion.div
                  key="reset-sent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-2 text-center"
                >
                  <Mail size={32} className="mx-auto mb-3 text-white/20" />
                  <p className="mb-2 text-sm text-white/65" style={{ fontWeight: 500 }}>
                    {t('auth.checkEmail', 'Ссылка отправлена')}
                  </p>
                  <p className="mb-4 text-xs text-white/35" style={{ lineHeight: 1.6 }}>
                    {t(
                      'auth.passwordResetSent',
                      'Если аккаунт с такой почтой существует, мы отправили инструкции для сброса пароля.',
                    )}
                  </p>
                  <button
                    onClick={closeForgotPasswordModal}
                    className="mx-auto flex items-center justify-center gap-1 text-xs text-white/35 transition-colors hover:text-white/60"
                  >
                    <ArrowLeft size={12} /> {t('common.back', 'Назад')}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="forgot"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-3"
                >
                  <p className="text-sm text-white/40" style={{ lineHeight: 1.6 }}>
                    {t(
                      'auth.forgotPasswordHint',
                      'Введите email и мы отправим инструкции для сброса пароля.',
                    )}
                  </p>
                  <form onSubmit={handleForgotPassword} className="flex flex-col gap-3">
                    <GlassInput
                      id="forgotEmail"
                      type="email"
                      autoComplete="email"
                      value={forgotPasswordEmail}
                      onChange={setForgotPasswordEmail}
                      placeholder="Email"
                      autoFocus
                    />
                    {forgotPasswordError && (
                      <p className="text-xs text-red-400/80">{forgotPasswordError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={forgotPasswordLoading}
                      className="mt-1 w-full rounded-full bg-white py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-50"
                      style={{ fontWeight: 500 }}
                    >
                      {forgotPasswordLoading
                        ? t('common.loading')
                        : t('auth.sendResetLink', 'Отправить ссылку')}
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={closeForgotPasswordModal}
                    className="mx-auto mt-1 flex items-center justify-center gap-1 text-xs text-white/35 transition-colors hover:text-white/60"
                  >
                    <ArrowLeft size={12} /> {t('common.back', 'Назад')}
                  </button>
                </motion.div>
              )
            ) : (
              <motion.div
                key="auth-flow"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Top error (general) */}
                {error && !isTelegramWebApp && (
                  <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-xs text-red-400/80">
                    {error}
                  </div>
                )}

                {/* Telegram auto-auth (Mini App) */}
                {isLoading && isTelegramWebApp ? (
                  <div className="py-6 text-center">
                    <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
                    <p className="text-sm text-white/45">{t('auth.authenticating')}</p>
                  </div>
                ) : isTelegramWebApp && error ? (
                  <div className="space-y-3 text-center">
                    <p className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-xs text-red-400/80">
                      {error}
                    </p>
                    <button
                      onClick={handleRetryTelegramAuth}
                      className="mx-auto flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                      style={{ fontWeight: 500 }}
                    >
                      <RefreshCw size={14} />
                      {t('auth.tryAgain', 'Повторить')}
                    </button>
                    <p className="text-xs text-white/30">
                      {t(
                        'auth.telegramReopenHint',
                        'Если проблема не уйдёт — закройте и снова откройте приложение',
                      )}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Telegram login — Verno-стиль: синяя CTA + @bot-ссылка, без iframe-widget */}
                    <CabinetTelegramLogin referralCode={referralCode || undefined} />

                    {/* OAuth row */}
                    {oauthProviders.length > 0 && (
                      <>
                        <div className="my-6 flex items-center gap-3">
                          <div className="h-px flex-1 bg-white/[0.08]" />
                          <span className="text-xs text-white/20">{t('auth.or', 'или')}</span>
                          <div className="h-px flex-1 bg-white/[0.08]" />
                        </div>
                        <div className="flex items-stretch gap-2">
                          {oauthProviders.map((provider) => (
                            <button
                              key={provider.name}
                              type="button"
                              onClick={() => handleOAuthLogin(provider.name)}
                              disabled={oauthLoading !== null}
                              className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 transition-all hover:bg-white/[0.07] disabled:opacity-50"
                              title={provider.display_name}
                            >
                              {oauthLoading === provider.name ? (
                                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                              ) : (
                                <OAuthProviderIcon provider={provider.name} className="h-5 w-5" />
                              )}
                              <span className="text-[10px] leading-none text-white/40">
                                {provider.display_name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Email auth */}
                    {isEmailAuthEnabled && (
                      <>
                        <div className="my-6 flex items-center gap-3">
                          <div className="h-px flex-1 bg-white/[0.08]" />
                          <span className="text-xs text-white/20">{t('auth.or', 'или')}</span>
                          <div className="h-px flex-1 bg-white/[0.08]" />
                        </div>

                        {/* Tabs */}
                        <div className="mb-5 flex rounded-full border border-white/[0.08] bg-white/[0.05] p-1">
                          <button
                            type="button"
                            onClick={() => setAuthMode('login')}
                            className={`flex-1 rounded-full py-2 text-sm transition-all ${
                              authMode === 'login'
                                ? 'bg-white/10 text-white'
                                : 'text-white/35 hover:text-white/55'
                            }`}
                          >
                            {t('auth.login', 'Вход')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAuthMode('register')}
                            className={`flex-1 rounded-full py-2 text-sm transition-all ${
                              authMode === 'register'
                                ? 'bg-white/10 text-white'
                                : 'text-white/35 hover:text-white/55'
                            }`}
                          >
                            {t('auth.register', 'Регистрация')}
                          </button>
                        </div>

                        <form className="flex flex-col gap-3" onSubmit={handleEmailSubmit}>
                          {authMode === 'register' && (
                            <GlassInput
                              id="firstName"
                              name="firstName"
                              type="text"
                              autoComplete="given-name"
                              value={firstName}
                              onChange={setFirstName}
                              placeholder={t('auth.firstNamePlaceholder', 'Имя (необязательно)')}
                            />
                          )}

                          <GlassInput
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={setEmail}
                            placeholder="Email"
                          />

                          <GlassInput
                            id="password"
                            name="password"
                            type="password"
                            autoComplete={
                              authMode === 'login' ? 'current-password' : 'new-password'
                            }
                            required
                            value={password}
                            onChange={setPassword}
                            placeholder={t('auth.password', 'Пароль')}
                          />
                          {authMode === 'register' &&
                            password.length > 0 &&
                            password.length < 8 && (
                              <p className="text-xs text-red-400/80">
                                {t(
                                  'auth.passwordTooShort',
                                  'Пароль должен быть не меньше 8 символов',
                                )}
                              </p>
                            )}

                          {authMode === 'register' && (
                            <GlassInput
                              id="confirmPassword"
                              name="confirmPassword"
                              type="password"
                              autoComplete="new-password"
                              required
                              value={confirmPassword}
                              onChange={setConfirmPassword}
                              placeholder={t('auth.confirmPassword', 'Повторите пароль')}
                            />
                          )}

                          <button
                            type="submit"
                            disabled={isLoading}
                            className="mt-1 w-full rounded-full bg-white py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-50"
                            style={{ fontWeight: 500 }}
                          >
                            {isLoading
                              ? t('common.loading')
                              : authMode === 'login'
                                ? t('auth.login', 'Вход')
                                : t('auth.register', 'Зарегистрироваться')}
                          </button>
                        </form>

                        {authMode === 'register' && (
                          <p
                            className="mt-1 text-center text-xs text-white/25"
                            style={{ lineHeight: 1.5 }}
                          >
                            {t(
                              'auth.verificationEmailNotice',
                              'После регистрации на вашу почту будет отправлено письмо для подтверждения',
                            )}
                          </p>
                        )}

                        {authMode === 'login' && (
                          <button
                            type="button"
                            onClick={() => setShowForgotPassword(true)}
                            className="mt-4 block w-full text-center text-xs text-white/30 transition-colors hover:text-white/55"
                          >
                            {t('auth.forgotPassword', 'Забыли пароль?')}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Link
          to="/"
          className="mt-6 inline-block text-sm text-white/20 transition-colors hover:text-white/40"
        >
          ← {t('auth.toHome', 'На главную')}
        </Link>
      </motion.div>
    </div>
  );
}
