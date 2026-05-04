import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Send } from 'lucide-react';

import { brandingApi, type TelegramWidgetConfig } from '@/api/branding';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import { getPendingCampaignSlug } from '@/utils/campaign';

/**
 * Verno-style Telegram login.
 *
 * Click behavior:
 *  - OIDC enabled on backend → opens Telegram OIDC popup.
 *  - OIDC disabled → requests deep-link token, opens t.me/<bot>?start=webauth_<token>
 *    in a new tab immediately, and silently polls in the background for auth.
 *    No QR is shown — QR fallback lives on a separate screen if we ever need it.
 */

interface Props {
  referralCode?: string;
}

const POLL_INTERVAL_MS = 2500;

export default function CabinetTelegramLogin({ referralCode }: Props) {
  const navigate = useNavigate();
  const loginWithTelegramOIDC = useAuthStore((s) => s.loginWithTelegramOIDC);
  const loginWithDeepLink = useAuthStore((s) => s.loginWithDeepLink);

  const { data: widgetConfig } = useQuery<TelegramWidgetConfig>({
    queryKey: ['telegram-widget-config'],
    queryFn: brandingApi.getTelegramWidgetConfig,
    staleTime: 60_000,
  });

  const botUsername =
    widgetConfig?.bot_username || import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';
  const isOIDC = Boolean(widgetConfig?.oidc_enabled && widgetConfig?.oidc_client_id);

  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');
  const [oidcScriptReady, setOidcScriptReady] = useState(false);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTokenRef = useRef<string | null>(null);
  const pollInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const oidcCallbackRef = useRef<(data: { id_token?: string; error?: string }) => void>(undefined);
  const capturedCampaignRef = useRef<string | null>(null);
  const codesConsumedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (expireTimeoutRef.current) clearTimeout(expireTimeoutRef.current);
    };
  }, []);

  // ── OIDC ──────────────────────────────────────────────────────────────
  oidcCallbackRef.current = async (data: { id_token?: string; error?: string }) => {
    if (!mountedRef.current) return;
    if (data.error || !data.id_token) {
      setError(data.error || 'Ошибка входа через Telegram');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      await loginWithTelegramOIDC(data.id_token);
      if (mountedRef.current) navigate('/');
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      let message = 'Ошибка входа';
      if (isAxiosError(err) && err.response?.data?.detail) message = err.response.data.detail;
      setError(message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOIDC || !widgetConfig?.oidc_client_id) return;
    const scriptId = 'telegram-login-oidc-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const init = () => {
      if (window.Telegram?.Login) {
        window.Telegram.Login.init(
          {
            client_id: Number(widgetConfig.oidc_client_id) || widgetConfig.oidc_client_id,
            request_access: widgetConfig.request_access ? ['write'] : undefined,
            lang: document.documentElement.lang || 'ru',
          },
          (data) => oidcCallbackRef.current?.(data),
        );
        setOidcScriptReady(true);
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://oauth.telegram.org/js/telegram-login.js?3';
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    } else {
      init();
    }
  }, [isOIDC, widgetConfig?.oidc_client_id, widgetConfig?.request_access]);

  // ── Deep-link polling ─────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    if (expireTimeoutRef.current) {
      clearTimeout(expireTimeoutRef.current);
      expireTimeoutRef.current = null;
    }
    pollTokenRef.current = null;
    pollInFlightRef.current = false;
    setPolling(false);
  }, []);

  const schedulePoll = useCallback(() => {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    pollTimeoutRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollOnce = useCallback(async () => {
    const token = pollTokenRef.current;
    if (!token || !mountedRef.current || pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      await loginWithDeepLink(token, capturedCampaignRef.current);
      if (expireTimeoutRef.current) {
        clearTimeout(expireTimeoutRef.current);
        expireTimeoutRef.current = null;
      }
      pollTokenRef.current = null;
      if (mountedRef.current) {
        setPolling(false);
        navigate('/');
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      if (isAxiosError(err)) {
        if (err.response?.status === 202) {
          pollTimeoutRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
          return;
        }
        if (err.response?.status === 410) {
          stopPolling();
          setError('Срок действия ссылки истёк. Попробуйте снова.');
          return;
        }
      }
      stopPolling();
      setError('Не удалось войти. Попробуйте ещё раз.');
    } finally {
      pollInFlightRef.current = false;
    }
  }, [loginWithDeepLink, navigate, stopPolling]);

  // Visibility resume — browsers throttle setTimeout in hidden tabs.
  useEffect(() => {
    if (!polling) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && mountedRef.current && pollTokenRef.current) {
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        pollOnce();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [polling, pollOnce]);

  const startDeepLinkAuth = async () => {
    setError('');
    setLoading(true);

    if (!codesConsumedRef.current) {
      capturedCampaignRef.current = getPendingCampaignSlug();
      codesConsumedRef.current = true;
    }

    try {
      const { token, bot_username, expires_in } = await authApi.requestDeepLinkToken();
      const resolvedBot = bot_username || botUsername;
      const deepLinkUrl = `https://t.me/${resolvedBot}?start=webauth_${token}`;

      pollTokenRef.current = token;
      setPolling(true);

      // Open bot immediately. On most browsers this requires the user gesture;
      // we're inside the click handler so the popup is allowed.
      window.open(deepLinkUrl, '_blank', 'noopener,noreferrer');

      // Start polling
      schedulePoll();

      // Hard expire
      expireTimeoutRef.current = setTimeout(
        () => {
          if (!useAuthStore.getState().isAuthenticated) {
            stopPolling();
            setError('Срок действия ссылки истёк. Попробуйте снова.');
          }
        },
        (expires_in || 300) * 1000,
      );
    } catch {
      setError('Не удалось получить ссылку. Попробуйте позже.');
      setPolling(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    setError('');
    if (isOIDC) {
      setLoading(true);
      if (window.Telegram?.Login) {
        window.Telegram.Login.open();
      } else {
        setLoading(false);
        setError('Telegram Login недоступен, попробуйте обновить страницу.');
      }
      return;
    }
    startDeepLinkAuth();
  };

  // ─────────────────────────────── render ───────────────────────────────

  const disabled = loading || (isOIDC && !oidcScriptReady);

  return (
    <>
      {polling ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#2AABEE]/80 py-3.5 text-white"
            style={{ fontSize: '0.9rem', fontWeight: 500 }}
          >
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
            Ждём подтверждения в Telegram…
          </button>
          <button
            type="button"
            onClick={stopPolling}
            className="text-xs text-white/35 transition-colors hover:text-white/60"
          >
            Отмена
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#2AABEE] py-3.5 text-white transition-all duration-300 hover:bg-[#229ED9] active:scale-[0.97] disabled:opacity-60"
          style={{ fontSize: '0.9rem', fontWeight: 500 }}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
          ) : (
            <Send size={16} />
          )}
          Войти через Telegram
        </button>
      )}

      {error && (
        <p className="mt-2 text-center text-xs text-red-400/80" style={{ lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      {!polling && botUsername && botUsername !== 'your_bot' && (
        <>
          <p className="mt-3 text-center text-xs text-white/30">Или откройте бота в приложении</p>
          <a
            href={
              referralCode
                ? `https://t.me/${botUsername}?start=${encodeURIComponent(referralCode)}`
                : `https://t.me/${botUsername}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block text-center text-sm text-white/55 transition-colors hover:text-white/75"
            style={{ fontWeight: 500 }}
          >
            @{botUsername}
          </a>
        </>
      )}
    </>
  );
}
