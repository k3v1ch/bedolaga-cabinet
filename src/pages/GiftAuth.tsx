import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useShallow } from 'zustand/shallow';
import { ArrowLeft, Eye, EyeOff, Gift, Mail } from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api/auth';
import { isValidEmail } from '@/utils/validation';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

// CUSTOM-UI: отдельные страницы входа/регистрации для получения подарка по email.
// Повторяют email-функционал кабинетного логина, но в стиле страницы подарка и с
// возвратом на /buy/gift/<token> (вместо «тупого» редиректа на общий /login).
// Ключ переживает переход между вкладками: письмо подтверждения открывается в новой.
const PENDING_GIFT_KEY = 'verno_pending_gift';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-[#0A0A0A] px-4 py-10"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">
        {children}
      </div>
    </div>
  );
}

const PRIMARY_BTN =
  'flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

interface GlassInputProps {
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  autoFocus?: boolean;
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
  name,
}: GlassInputProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="relative">
      <input
        name={name}
        type={isPassword && show ? 'text' : type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[15px] text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-white/25 focus:bg-white/[0.08]"
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

export default function GiftAuth() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  // CUSTOM-UI: режим (вход/регистрация) определяется маршрутом — /login или /register.
  const mode: 'login' | 'register' = location.pathname.endsWith('/register')
    ? 'register'
    : 'login';
  const { isAuthenticated, loginWithEmail, registerWithEmail } = useAuthStore(
    useShallow((s) => ({
      isAuthenticated: s.isAuthenticated,
      loginWithEmail: s.loginWithEmail,
      registerWithEmail: s.registerWithEmail,
    })),
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  // Inline «forgot password» — без ухода на отдельную страницу.
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');

  // Запоминаем подарок: после входа возвращаемся и активируем; после регистрации
  // и подтверждения почты VerifyEmail вернёт сюда по этому же ключу.
  useEffect(() => {
    if (!token) return;
    try {
      localStorage.setItem(PENDING_GIFT_KEY, token);
    } catch {
      /* ignore */
    }
  }, [token]);

  // Уже авторизован — нечего показывать форму, ведём на подарок (там авто-активация).
  useEffect(() => {
    if (isAuthenticated && token) navigate(`/buy/gift/${token}`, { replace: true });
  }, [isAuthenticated, token, navigate]);

  const switchMode = (m: 'login' | 'register') => {
    if (!token) return;
    setError('');
    navigate(`/buy/gift/${token}/${m}`, { replace: true });
  };

  const parseAuthError = (err: unknown): string => {
    const e = err as { response?: { status?: number; data?: { detail?: string } } };
    const status = e.response?.status;
    const detail = e.response?.data?.detail;
    if (status === 400 && detail?.includes('already registered'))
      return t('auth.emailAlreadyRegistered', 'Эта почта уже зарегистрирована');
    if (status === 401 || status === 403) {
      if (detail?.includes('verify your email'))
        return t('auth.emailNotVerified', 'Сначала подтвердите почту');
      return t('auth.invalidCredentials', 'Неверная почта или пароль');
    }
    if (status === 429)
      return t('auth.tooManyAttempts', 'Слишком много попыток. Попробуйте позже');
    return detail || t('common.error', 'Что-то пошло не так');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const mail = email.trim();
    if (!mail || !isValidEmail(mail)) {
      setError(t('auth.invalidEmail', 'Введите корректный email'));
      return;
    }
    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError(t('auth.passwordMismatch', 'Пароли не совпадают'));
        return;
      }
      if (password.length < 8) {
        setError(t('auth.passwordTooShort', 'Пароль должен быть не меньше 8 символов'));
        return;
      }
    }
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(mail, password);
        // Возврат на подарок — там сработает авто-активация по PENDING_GIFT_KEY.
        navigate(`/buy/gift/${token}`, { replace: true });
      } else {
        const result = await registerWithEmail(mail, password, firstName || undefined);
        setRegisteredEmail(result.email);
      }
    } catch (err) {
      setError(parseAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    const mail = forgotEmail.trim();
    if (!mail || !isValidEmail(mail)) {
      setForgotError(t('auth.invalidEmail', 'Введите корректный email'));
      return;
    }
    setForgotLoading(true);
    try {
      await authApi.forgotPassword(mail);
      setForgotSent(true);
    } catch (err) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      setForgotError(e2.response?.data?.detail || t('common.error', 'Что-то пошло не так'));
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Экран «подтвердите почту» после регистрации ──────────────────────────
  if (registeredEmail) {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 py-2 text-center"
        >
          <Mail size={34} className="mb-1 text-white/25" />
          <h1 className="text-xl text-white" style={{ fontWeight: 700 }}>
            {t('auth.checkEmail', 'Подтвердите почту')}
          </h1>
          <p className="text-[14px] text-white/45" style={{ lineHeight: 1.6 }}>
            {t('auth.verificationSent', 'Мы отправили ссылку для подтверждения на:')}
          </p>
          <p className="text-[15px] text-white/80" style={{ fontWeight: 500 }}>
            {registeredEmail}
          </p>
          <p className="mt-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/45">
            {t(
              'landing.giftClaim.afterVerifyHint',
              'После подтверждения почты подарок активируется автоматически.',
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setRegisteredEmail(null);
              switchMode('login');
            }}
            className="mt-1 text-[13px] text-white/35 transition-colors hover:text-white/60"
          >
            {t('auth.backToLogin', 'Вернуться ко входу')}
          </button>
        </motion.div>
      </Shell>
    );
  }

  // ── Экран «забыли пароль» ────────────────────────────────────────────────
  if (showForgot) {
    return (
      <Shell>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4">
          {forgotSent ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <Mail size={34} className="mb-1 text-white/25" />
              <h1 className="text-xl text-white" style={{ fontWeight: 700 }}>
                {t('auth.checkEmail', 'Ссылка отправлена')}
              </h1>
              <p className="text-[14px] text-white/45" style={{ lineHeight: 1.6 }}>
                {t(
                  'auth.passwordResetSent',
                  'Если аккаунт с такой почтой существует, мы отправили инструкции для сброса пароля.',
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowForgot(false);
                  setForgotSent(false);
                  setForgotEmail('');
                }}
                className="mt-1 flex items-center justify-center gap-1 text-[13px] text-white/35 transition-colors hover:text-white/60"
              >
                <ArrowLeft size={12} /> {t('common.back', 'Назад')}
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-xl text-white" style={{ fontWeight: 700 }}>
                {t('auth.forgotPassword', 'Забыли пароль?')}
              </h1>
              <p className="text-[14px] text-white/45" style={{ lineHeight: 1.6 }}>
                {t(
                  'auth.forgotPasswordHint',
                  'Введите email и мы отправим инструкции для сброса пароля.',
                )}
              </p>
              <form onSubmit={handleForgot} className="flex flex-col gap-3">
                <GlassInput
                  type="email"
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={setForgotEmail}
                  placeholder="Email"
                  autoFocus
                />
                {forgotError && <p className="text-[13px] text-red-400/80">{forgotError}</p>}
                <button type="submit" disabled={forgotLoading} className={PRIMARY_BTN} style={{ fontWeight: 500 }}>
                  {forgotLoading ? (
                    <Spinner className="h-5 w-5 border-2" />
                  ) : (
                    t('auth.sendResetLink', 'Отправить ссылку')
                  )}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setShowForgot(false)}
                className="mx-auto flex items-center justify-center gap-1 text-[13px] text-white/35 transition-colors hover:text-white/60"
              >
                <ArrowLeft size={12} /> {t('common.back', 'Назад')}
              </button>
            </>
          )}
        </motion.div>
      </Shell>
    );
  }

  // ── Основной экран: вкладки вход/регистрация ─────────────────────────────
  return (
    <Shell>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
            <Gift size={22} strokeWidth={1.5} className="text-white/85" />
          </div>
          <h1 className="text-xl text-white" style={{ fontWeight: 700 }}>
            {mode === 'login'
              ? t('landing.giftClaim.authLoginTitle', 'Войдите, чтобы получить подарок')
              : t('landing.giftClaim.authRegisterTitle', 'Регистрация для получения подарка')}
          </h1>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex rounded-full border border-white/[0.08] bg-white/[0.05] p-1">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={cn(
              'flex-1 rounded-full py-2 text-[15px] transition-all',
              mode === 'login' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/55',
            )}
          >
            {t('auth.login', 'Вход')}
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={cn(
              'flex-1 rounded-full py-2 text-[15px] transition-all',
              mode === 'register' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/55',
            )}
          >
            {t('auth.register', 'Регистрация')}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-[13px] text-red-400/80">
            {error}
          </div>
        )}

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <GlassInput
              name="firstName"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={setFirstName}
              placeholder={t('auth.firstNamePlaceholder', 'Имя (необязательно)')}
            />
          )}

          <GlassInput
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={setEmail}
            placeholder="Email"
          />

          <GlassInput
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            value={password}
            onChange={setPassword}
            placeholder={t('auth.password', 'Пароль')}
          />
          {mode === 'register' && password.length > 0 && password.length < 8 && (
            <p className="text-[13px] text-red-400/80">
              {t('auth.passwordTooShort', 'Пароль должен быть не меньше 8 символов')}
            </p>
          )}

          {mode === 'register' && (
            <GlassInput
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder={t('auth.confirmPassword', 'Повторите пароль')}
            />
          )}

          <button type="submit" disabled={isLoading} className={cn(PRIMARY_BTN, 'mt-1')} style={{ fontWeight: 500 }}>
            {isLoading ? (
              <Spinner className="h-5 w-5 border-2" />
            ) : mode === 'login' ? (
              t('auth.login', 'Войти')
            ) : (
              t('auth.register', 'Зарегистрироваться')
            )}
          </button>
        </form>

        {mode === 'register' && (
          <p className="mt-3 text-center text-[13px] text-white/30" style={{ lineHeight: 1.5 }}>
            {t(
              'auth.verificationEmailNotice',
              'После регистрации на вашу почту будет отправлено письмо для подтверждения',
            )}
          </p>
        )}

        {mode === 'login' && (
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            className="mt-4 block w-full text-center text-[13px] text-white/30 transition-colors hover:text-white/55"
          >
            {t('auth.forgotPassword', 'Забыли пароль?')}
          </button>
        )}

        <button
          type="button"
          onClick={() => token && navigate(`/buy/gift/${token}`)}
          className="mx-auto mt-5 flex items-center justify-center gap-1 text-[13px] text-white/25 transition-colors hover:text-white/45"
        >
          <ArrowLeft size={12} /> {t('landing.giftClaim.backToGift', 'Назад к подарку')}
        </button>
      </motion.div>
    </Shell>
  );
}
