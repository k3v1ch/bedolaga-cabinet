import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { authApi } from '../api/auth';
import { brandingApi, type TelegramWidgetConfig, type EmailAuthEnabled } from '../api/branding';
import { useToast } from '../components/Toast';
import { Button } from '@/components/primitives/Button';
import { staggerContainer, staggerItem } from '@/components/motion/transitions';
import ProviderIcon from '../components/ProviderIcon';
import { LINK_OAUTH_STATE_KEY, LINK_OAUTH_PROVIDER_KEY, getErrorDetail } from '../utils/oauth';
import { getTelegramInitData } from '../hooks/useTelegramSDK';
import { usePlatform, useIsTelegram } from '@/platform/hooks/usePlatform';
import { useAuthStore } from '../store/auth';
import { isValidEmail } from '../utils/validation';
import type { LinkedProvider } from '../types';

/** Cabinet-style translucent card. */
function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

/** Cabinet-style primary pill button (white pill, black text). */
function PrimaryPillButton({
  children,
  onClick,
  disabled,
  loading,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-50"
      style={{ fontWeight: 500 }}
    >
      {loading && <Loader2 size={12} className="animate-spin" />}
      {children}
    </button>
  );
}

/** Cabinet-style outline pill button. */
function OutlinePillButton({
  children,
  onClick,
  disabled,
  loading,
  variant = 'neutral',
  onBlur,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'neutral' | 'destructive';
  onBlur?: () => void;
}) {
  const base =
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-[13px] transition-colors active:scale-[0.97] disabled:opacity-50';
  const palette =
    variant === 'destructive'
      ? 'border-red-400/30 bg-red-400/[0.04] text-red-400/85 hover:bg-red-400/10 hover:text-red-300'
      : 'border-white/15 bg-transparent text-white/65 hover:bg-white/[0.05] hover:text-white/85';
  return (
    <button
      type="button"
      onClick={onClick}
      onBlur={onBlur}
      disabled={disabled || loading}
      className={`${base} ${palette}`}
      style={{ fontWeight: 500 }}
    >
      {loading && <Loader2 size={12} className="animate-spin" />}
      {children}
    </button>
  );
}

const OAUTH_PROVIDERS = ['google', 'yandex', 'discord', 'vk'];

const isOAuthProvider = (provider: string): boolean => OAUTH_PROVIDERS.includes(provider);

const isLinkableProvider = (provider: string): boolean =>
  isOAuthProvider(provider) || provider === 'telegram' || provider === 'email';

// SessionStorage key for Telegram link CSRF state
export const LINK_TELEGRAM_STATE_KEY = 'link_telegram_state';

const LINK_SCRIPT_LOAD_TIMEOUT_MS = 8000;

/** Telegram account linking widget (browser only). Supports OIDC popup and legacy widget. */
function TelegramLinkWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [oidcLoading, setOidcLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const mountedRef = useRef(true);

  const { data: widgetConfig } = useQuery<TelegramWidgetConfig>({
    queryKey: ['telegram-widget-config'],
    queryFn: brandingApi.getTelegramWidgetConfig,
    staleTime: 60000,
  });

  const botUsername =
    widgetConfig?.bot_username || import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';
  const isOIDC = Boolean(widgetConfig?.oidc_enabled && widgetConfig?.oidc_client_id);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleLinkResult = useCallback(
    async (response: Awaited<ReturnType<typeof authApi.linkTelegram>>) => {
      if (response.merge_required && response.merge_token) {
        navigate(`/merge/${response.merge_token}`, { replace: true });
      } else {
        queryClient.invalidateQueries({ queryKey: ['linked-providers'] });
        showToast({ type: 'success', message: t('profile.accounts.linkSuccess') });
      }
    },
    [navigate, queryClient, showToast, t],
  );

  // Handle script load failure (timeout or error)
  const handleScriptFailed = useCallback(() => {
    if (!mountedRef.current || scriptLoaded) return;
    setScriptFailed(true);
  }, [scriptLoaded]);

  // OIDC callback handler (ref pattern to avoid stale closures)
  const handleOIDCCallbackRef =
    useRef<(data: { id_token?: string; error?: string }) => void>(undefined);

  handleOIDCCallbackRef.current = async (data: { id_token?: string; error?: string }) => {
    if (!mountedRef.current) return;
    if (data.error || !data.id_token) {
      setOidcLoading(false);
      showToast({
        type: 'error',
        message: data.error || t('profile.accounts.linkError'),
      });
      return;
    }
    try {
      setOidcLoading(true);
      const response = await authApi.linkTelegram({ id_token: data.id_token });
      if (mountedRef.current) await handleLinkResult(response);
    } catch (err: unknown) {
      if (mountedRef.current) {
        showToast({
          type: 'error',
          message: getErrorDetail(err) || t('profile.accounts.linkError'),
        });
      }
    } finally {
      if (mountedRef.current) setOidcLoading(false);
    }
  };

  // Load OIDC script and init with timeout
  useEffect(() => {
    if (!isOIDC || !widgetConfig?.oidc_client_id) return;

    const scriptId = 'telegram-login-oidc-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const initTelegramLogin = () => {
      if (window.Telegram?.Login) {
        window.Telegram.Login.init(
          {
            client_id: Number(widgetConfig.oidc_client_id) || widgetConfig.oidc_client_id,
            request_access: widgetConfig.request_access ? ['write'] : undefined,
            lang: document.documentElement.lang || 'en',
          },
          (data) => handleOIDCCallbackRef.current?.(data),
        );
        setScriptLoaded(true);
      }
    };

    const timeoutId = setTimeout(() => {
      if (!scriptLoaded) {
        handleScriptFailed();
      }
    }, LINK_SCRIPT_LOAD_TIMEOUT_MS);

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://oauth.telegram.org/js/telegram-login.js?3';
      script.async = true;
      script.onload = () => {
        clearTimeout(timeoutId);
        initTelegramLogin();
      };
      script.onerror = () => {
        clearTimeout(timeoutId);
        handleScriptFailed();
      };
      document.head.appendChild(script);
    } else {
      clearTimeout(timeoutId);
      initTelegramLogin();
    }

    return () => clearTimeout(timeoutId);
  }, [
    isOIDC,
    widgetConfig?.oidc_client_id,
    widgetConfig?.request_access,
    scriptLoaded,
    handleScriptFailed,
  ]);

  // Ref-based callback for legacy widget (avoids re-creating iframe on every render)
  const handleWidgetAuthRef = useRef<(user: Record<string, unknown>) => void>(undefined);
  handleWidgetAuthRef.current = async (user: Record<string, unknown>) => {
    if (!mountedRef.current) return;
    try {
      const response = await authApi.linkTelegram({
        id: user.id as number,
        first_name: user.first_name as string,
        last_name: (user.last_name as string) || undefined,
        username: (user.username as string) || undefined,
        photo_url: (user.photo_url as string) || undefined,
        auth_date: user.auth_date as number,
        hash: user.hash as string,
      });
      if (mountedRef.current) await handleLinkResult(response);
    } catch (err: unknown) {
      if (mountedRef.current) {
        showToast({
          type: 'error',
          message: getErrorDetail(err) || t('profile.accounts.linkError'),
        });
      }
    }
  };

  // Legacy widget effect (only when NOT OIDC) with timeout
  useEffect(() => {
    if (isOIDC || !containerRef.current || !botUsername) return;

    const container = containerRef.current;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const callbackName = '__onTelegramLinkAuth';
    (window as unknown as Record<string, unknown>)[callbackName] = (
      user: Record<string, unknown>,
    ) => {
      handleWidgetAuthRef.current?.(user);
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?23';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'small');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-onauth', `${callbackName}(user)`);
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    const timeoutId = setTimeout(() => {
      if (container && !container.querySelector('iframe')) {
        handleScriptFailed();
      }
    }, LINK_SCRIPT_LOAD_TIMEOUT_MS);

    script.onerror = () => {
      clearTimeout(timeoutId);
      handleScriptFailed();
    };

    container.appendChild(script);

    return () => {
      clearTimeout(timeoutId);
      delete (window as unknown as Record<string, unknown>)[callbackName];
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [isOIDC, botUsername, handleScriptFailed]);

  if (!botUsername && !isOIDC) {
    return null;
  }

  // Script failed to load - show unavailable message with bot link
  if (scriptFailed) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-xs text-dark-400">{t('profile.accounts.telegramLinkUnavailable')}</p>
        <a
          href={`https://t.me/${botUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent-400 transition-colors hover:text-accent-300"
        >
          @{botUsername}
        </a>
      </div>
    );
  }

  if (isOIDC) {
    return (
      <Button
        variant="primary"
        size="sm"
        disabled={oidcLoading || !scriptLoaded}
        loading={oidcLoading}
        onClick={() => {
          setOidcLoading(true);
          if (window.Telegram?.Login) {
            window.Telegram.Login.open();
          } else {
            setOidcLoading(false);
          }
        }}
      >
        {t('profile.accounts.link')}
      </Button>
    );
  }

  return <div ref={containerRef} className="flex items-center" />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <GlassCard key={i} className="p-5">
          <div className="flex animate-pulse items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/[0.06]" />
              <div className="space-y-2">
                <div className="h-3.5 w-24 rounded bg-white/[0.06]" />
                <div className="h-3 w-32 rounded bg-white/[0.04]" />
              </div>
            </div>
            <div className="h-8 w-24 rounded-full bg-white/[0.06]" />
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

export default function ConnectedAccounts() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [confirmingUnlink, setConfirmingUnlink] = useState<string | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [waitingExternalLink, setWaitingExternalLink] = useState(false);
  const pendingLinkProvider = useRef<string | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Email linking inline form state
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [emailValue, setEmailValue] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailConfirmPassword, setEmailConfirmPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  // Email-merge confirmation: the target email belongs to another account, so a
  // one-time code was mailed to it; verifying the code yields the merge token.
  const [emailMergeCodePending, setEmailMergeCodePending] = useState(false);
  const [emailMergeCode, setEmailMergeCode] = useState('');
  const setUser = useAuthStore((state) => state.setUser);

  const { data: emailAuthConfig } = useQuery<EmailAuthEnabled>({
    queryKey: ['email-auth-enabled'],
    queryFn: brandingApi.getEmailAuthEnabled,
    staleTime: 60000,
  });
  const isEmailAuthEnabled = emailAuthConfig?.enabled ?? true;

  const inTelegram = useIsTelegram();
  const platform = usePlatform();

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['linked-providers'],
    queryFn: () => authApi.getLinkedProviders(),
    refetchOnWindowFocus: true,
    // Poll every 5s while waiting for external browser OAuth to complete
    refetchInterval: waitingExternalLink ? 5000 : false,
  });

  // Stop polling after 90 seconds with timeout feedback
  useEffect(() => {
    if (!waitingExternalLink) return;
    const timeout = setTimeout(() => {
      setWaitingExternalLink(false);
      pendingLinkProvider.current = null;
      // Final refresh in case link succeeded during the last polling interval
      queryClient.invalidateQueries({ queryKey: ['linked-providers'] });
      showToast({ type: 'warning', message: t('profile.accounts.pollingTimeout') });
    }, 90_000);
    return () => clearTimeout(timeout);
  }, [waitingExternalLink, showToast, t, queryClient]);

  // Detect successful external link: stop polling when the target provider becomes linked
  useEffect(() => {
    if (!waitingExternalLink || !data || !pendingLinkProvider.current) return;
    const target = data.providers.find((p) => p.provider === pendingLinkProvider.current);
    if (target?.linked) {
      setWaitingExternalLink(false);
      pendingLinkProvider.current = null;
      showToast({ type: 'success', message: t('profile.accounts.linkSuccess') });
    }
  }, [data, waitingExternalLink, showToast, t]);

  const unlinkMutation = useMutation({
    mutationFn: (provider: string) => authApi.unlinkProvider(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linked-providers'] });
      showToast({
        type: 'success',
        message: t('profile.accounts.unlinkSuccess'),
      });
    },
    onError: () => {
      showToast({
        type: 'error',
        message: t('profile.accounts.unlinkError'),
      });
    },
    onSettled: () => {
      setConfirmingUnlink(null);
    },
  });

  const registerEmailMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.registerEmail(email, password),
    onSuccess: async (response) => {
      if (response.merge_required && response.merge_token) {
        navigate(`/merge/${response.merge_token}`, { replace: true });
        return;
      }
      // The email belongs to another account: a one-time code was mailed to it.
      // Switch to the code step; verifying it yields the merge token.
      if (response.merge_required && response.merge_verification === 'email_code') {
        setEmailMergeCodePending(true);
        setEmailMergeCode('');
        setEmailSuccess(t('profile.emailMergeCodeSent'));
        setEmailError(null);
        return;
      }
      setEmailSuccess(t('profile.emailSent'));
      setEmailError(null);
      setEmailValue('');
      setEmailPassword('');
      setEmailConfirmPassword('');
      const updatedUser = await authApi.getMe();
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['linked-providers'] });
      // Note: auth user lives in the zustand store, not in React Query —
      // the explicit setUser above IS the refresh. No ['user'] query exists.
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const detail = err.response?.data?.detail;
      // The email belongs to another account and merging it requires proving
      // ownership: the backend asks for THAT account's password (account-takeover
      // fix). Guide the user to enter it rather than showing a dead-end error.
      if (detail?.includes('merge')) {
        setEmailError(t('profile.emailMergePasswordRequired'));
      } else if (detail?.includes('already registered')) {
        setEmailError(t('profile.emailAlreadyRegistered'));
      } else if (detail?.includes('already have a verified email')) {
        setEmailError(t('profile.alreadyHaveEmail'));
      } else {
        setEmailError(detail || t('common.error'));
      }
      setEmailSuccess(null);
    },
  });

  const verifyEmailMergeMutation = useMutation({
    mutationFn: (code: string) => authApi.verifyEmailMerge(code),
    onSuccess: (response) => {
      if (response.merge_token) {
        navigate(`/merge/${response.merge_token}`, { replace: true });
      }
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setEmailError(err.response?.data?.detail || t('profile.emailMergeCodeInvalid'));
    },
  });

  const handleVerifyMergeCode = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setEmailError(null);
    const code = emailMergeCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setEmailError(t('profile.emailMergeCodeInvalid'));
      return;
    }
    verifyEmailMergeMutation.mutate(code);
  };

  const cancelEmailMerge = () => {
    setEmailMergeCodePending(false);
    setEmailMergeCode('');
    setEmailError(null);
    setEmailSuccess(null);
  };

  const handleEmailSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    if (!emailValue.trim() || !isValidEmail(emailValue.trim())) {
      setEmailError(t('profile.invalidEmail'));
      return;
    }
    if (!emailPassword || emailPassword.length < 8) {
      setEmailError(t('profile.passwordMinLength'));
      return;
    }
    if (emailPassword !== emailConfirmPassword) {
      setEmailError(t('profile.passwordsMismatch'));
      return;
    }
    registerEmailMutation.mutate({ email: emailValue, password: emailPassword });
  };

  const canUnlink = (provider: LinkedProvider): boolean => {
    if (!provider.linked) return false;
    if (!isOAuthProvider(provider.provider)) return false;
    const linkedCount = data?.providers.filter((p) => p.linked).length ?? 0;
    return linkedCount > 1;
  };

  const handleLinkOAuth = async (provider: string) => {
    if (linkingProvider) return;
    setLinkingProvider(provider);
    try {
      const { authorize_url, state } = await authApi.linkProviderInit(provider);
      if (!authorize_url || !state) {
        throw new Error('Invalid response from server');
      }

      // Validate redirect URL — only allow HTTPS to prevent open redirect
      let parsed: URL;
      try {
        parsed = new URL(authorize_url);
      } catch {
        throw new Error('Invalid OAuth redirect URL');
      }
      if (parsed.protocol !== 'https:') {
        throw new Error('Invalid OAuth redirect URL');
      }

      if (inTelegram) {
        // Mini App: open in external browser to avoid WebView OAuth restrictions.
        // The callback will use server-complete flow (auth via state token, no JWT).
        platform.openLink(authorize_url);
        setLinkingProvider(null);
        // Track which provider we're waiting to become linked
        pendingLinkProvider.current = provider;
        // Start polling for linked providers (external browser has no way to notify Mini App)
        setWaitingExternalLink(true);
        showToast({
          type: 'info',
          message: t('profile.accounts.continueInBrowser'),
        });
      } else {
        // Regular browser: navigate within the same tab.
        // Save state in sessionStorage for the callback page to verify.
        sessionStorage.setItem(LINK_OAUTH_STATE_KEY, state);
        sessionStorage.setItem(LINK_OAUTH_PROVIDER_KEY, provider);
        window.location.href = authorize_url;
      }
    } catch (err: unknown) {
      showToast({
        type: 'error',
        message: getErrorDetail(err) || t('profile.accounts.linkError'),
      });
      setLinkingProvider(null);
    }
  };

  const handleLinkTelegram = async () => {
    if (linkingProvider) return;
    const initData = getTelegramInitData();
    if (!initData) return;

    setLinkingProvider('telegram');
    try {
      const response = await authApi.linkTelegram({ init_data: initData });
      if (response.merge_required && response.merge_token) {
        navigate(`/merge/${response.merge_token}`, { replace: true });
      } else {
        queryClient.invalidateQueries({ queryKey: ['linked-providers'] });
        showToast({ type: 'success', message: t('profile.accounts.linkSuccess') });
      }
    } catch (err: unknown) {
      showToast({ type: 'error', message: getErrorDetail(err) || t('profile.accounts.linkError') });
    } finally {
      setLinkingProvider(null);
    }
  };

  const handleLink = async (provider: string) => {
    if (provider === 'telegram') {
      await handleLinkTelegram();
    } else {
      await handleLinkOAuth(provider);
    }
  };

  const handleUnlink = (provider: string) => {
    if (confirmingUnlink === provider) {
      setConfirmingUnlink(null);
      unlinkMutation.mutate(provider);
    } else {
      setConfirmingUnlink(provider);
    }
  };

  const renderLinkButton = (provider: LinkedProvider) => {
    if (provider.provider === 'email') {
      if (!isEmailAuthEnabled) return null;
      return (
        <PrimaryPillButton
          onClick={() => {
            setEmailFormOpen((prev) => !prev);
            setEmailError(null);
            setEmailSuccess(null);
          }}
        >
          {emailFormOpen ? t('common.cancel') : t('profile.accounts.link')}
        </PrimaryPillButton>
      );
    }

    if (provider.provider === 'telegram') {
      if (inTelegram && getTelegramInitData()) {
        // Mini App: one-click button
        return (
          <PrimaryPillButton
            disabled={linkingProvider !== null || waitingExternalLink}
            loading={linkingProvider === 'telegram'}
            onClick={() => handleLink('telegram')}
          >
            {t('profile.accounts.link')}
          </PrimaryPillButton>
        );
      }
      // Browser: Telegram Login Widget — keep widget unchanged per request.
      return <TelegramLinkWidget />;
    }

    if (isOAuthProvider(provider.provider)) {
      return (
        <PrimaryPillButton
          disabled={linkingProvider !== null || waitingExternalLink}
          loading={linkingProvider === provider.provider}
          onClick={() => handleLink(provider.provider)}
        >
          {t('profile.accounts.link')}
        </PrimaryPillButton>
      );
    }

    return null;
  };

  return (
    <motion.div
      className="space-y-4"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Back button — returns to the previous page (typically /profile) */}
      <motion.button
        variants={staggerItem}
        type="button"
        onClick={() => navigate(-1)}
        className="-ml-1 mb-2 inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[15px] text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white/80"
      >
        <ChevronLeft size={18} strokeWidth={1.75} />
        {t('common.back', { defaultValue: 'Назад' })}
      </motion.button>

      {/* Page title */}
      <motion.div variants={staggerItem} className="mb-2">
        <h1
          className="text-white"
          style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('profile.accounts.title')}
        </h1>
        <p className="mt-1.5 text-[15px] text-white/40">{t('profile.accounts.subtitle')}</p>
      </motion.div>

      {/* Loading state */}
      {isLoading && (
        <motion.div variants={staggerItem}>
          <LoadingSkeleton />
        </motion.div>
      )}

      {/* Error state */}
      {isError && (
        <motion.div variants={staggerItem}>
          <GlassCard className="p-7">
            <p className="text-center text-[15px] text-white/45">{t('common.error')}</p>
          </GlassCard>
        </motion.div>
      )}

      {/* Provider cards */}
      {data?.providers.map((provider) => (
        <motion.div key={provider.provider} variants={staggerItem}>
          <GlassCard className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.04]">
                  <ProviderIcon provider={provider.provider} className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] text-white/85" style={{ fontWeight: 500 }}>
                    {t(`profile.accounts.providers.${provider.provider}`)}
                  </p>
                  {provider.identifier && (
                    <p className="mt-0.5 truncate text-[13px] text-white/35">
                      {provider.identifier}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {provider.linked ? (
                  <>
                    <span
                      className="rounded-full border border-green-400/25 bg-green-400/[0.06] px-3 py-1 text-[13px] text-green-400/85"
                      style={{ fontWeight: 500 }}
                    >
                      {t('profile.accounts.linked')}
                    </span>
                    {canUnlink(provider) && (
                      <OutlinePillButton
                        variant={confirmingUnlink === provider.provider ? 'destructive' : 'neutral'}
                        disabled={unlinkMutation.isPending}
                        loading={
                          unlinkMutation.isPending && unlinkMutation.variables === provider.provider
                        }
                        onClick={() => handleUnlink(provider.provider)}
                        onBlur={() => {
                          blurTimeoutRef.current = setTimeout(() => {
                            setConfirmingUnlink((cur) => (cur === provider.provider ? null : cur));
                          }, 150);
                        }}
                      >
                        {confirmingUnlink === provider.provider
                          ? t('profile.accounts.unlinkConfirmBtn')
                          : t('profile.accounts.unlink')}
                      </OutlinePillButton>
                    )}
                  </>
                ) : (
                  isLinkableProvider(provider.provider) && renderLinkButton(provider)
                )}
              </div>
            </div>

            {/* Inline email linking form */}
            {provider.provider === 'email' && !provider.linked && (
              <AnimatePresence>
                {emailFormOpen && (
                  <motion.div
                    key="email-link-form"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-5 border-t border-white/[0.06] pt-5">
                      {emailMergeCodePending ? (
                        /* Email принадлежит другому аккаунту: на него отправлен
                           одноразовый код, подтверждение даёт merge-токен. */
                        <form onSubmit={handleVerifyMergeCode} className="space-y-3">
                          <div>
                            <label
                              htmlFor="email-merge-code"
                              className="mb-1.5 block text-[13px] text-white/30"
                            >
                              {t('profile.emailMergeCodeLabel')}
                            </label>
                            <input
                              id="email-merge-code"
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={emailMergeCode}
                              onChange={(e) => setEmailMergeCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="000000"
                              className="verno-input w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[15px] tracking-[0.5em] text-white/85 placeholder-white/25 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
                              autoComplete="one-time-code"
                            />
                          </div>
                          {emailError && (
                            <div className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-3 text-[13px] text-red-400/85">
                              {emailError}
                            </div>
                          )}
                          {emailSuccess && (
                            <div className="rounded-xl border border-green-400/25 bg-green-400/[0.06] p-3 text-[13px] text-green-400/85">
                              {emailSuccess}
                            </div>
                          )}
                          <button
                            type="submit"
                            disabled={verifyEmailMergeMutation.isPending}
                            className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-50"
                            style={{ fontWeight: 500 }}
                          >
                            {verifyEmailMergeMutation.isPending && (
                              <Loader2 size={14} className="animate-spin" />
                            )}
                            {t('profile.emailMergeConfirm')}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEmailMerge}
                            className="w-full text-[13px] text-white/35 transition-colors hover:text-white/60"
                          >
                            {t('common.cancel')}
                          </button>
                        </form>
                      ) : (
                        <>
                          <p className="mb-4 text-[13px] text-white/40">
                            {t('profile.linkEmailDescription')}
                          </p>
                          <form onSubmit={handleEmailSubmit} className="space-y-3">
                            <div>
                              <label
                                htmlFor="email-link-input"
                                className="mb-1.5 block text-[13px] text-white/30"
                              >
                                Email
                              </label>
                              <input
                                id="email-link-input"
                                type="email"
                                value={emailValue}
                                onChange={(e) => setEmailValue(e.target.value)}
                                placeholder="email@example.com"
                                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 font-mono text-[15px] text-white/85 placeholder-white/25 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
                                autoComplete="email"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="email-link-password"
                                className="mb-1.5 block text-[13px] text-white/30"
                              >
                                {t('auth.password')}
                              </label>
                              <input
                                id="email-link-password"
                                type="password"
                                value={emailPassword}
                                onChange={(e) => setEmailPassword(e.target.value)}
                                placeholder={t('profile.passwordPlaceholder')}
                                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[15px] text-white/85 placeholder-white/25 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
                                autoComplete="new-password"
                              />
                              <p className="mt-1.5 text-[12px] text-white/30">
                                {t('profile.passwordHint')}
                              </p>
                            </div>
                            <div>
                              <label
                                htmlFor="email-link-confirm"
                                className="mb-1.5 block text-[13px] text-white/30"
                              >
                                {t('auth.confirmPassword')}
                              </label>
                              <input
                                id="email-link-confirm"
                                type="password"
                                value={emailConfirmPassword}
                                onChange={(e) => setEmailConfirmPassword(e.target.value)}
                                placeholder={t('profile.confirmPasswordPlaceholder')}
                                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[15px] text-white/85 placeholder-white/25 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.06]"
                                autoComplete="new-password"
                              />
                            </div>

                            {emailError && (
                              <div className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-3 text-[13px] text-red-400/85">
                                {emailError}
                              </div>
                            )}
                            {emailSuccess && (
                              <div className="rounded-xl border border-green-400/25 bg-green-400/[0.06] p-3 text-[13px] text-green-400/85">
                                {emailSuccess}
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={registerEmailMutation.isPending}
                              className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-50"
                              style={{ fontWeight: 500 }}
                            >
                              {registerEmailMutation.isPending && (
                                <Loader2 size={14} className="animate-spin" />
                              )}
                              {t('profile.linkEmail')}
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </GlassCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
