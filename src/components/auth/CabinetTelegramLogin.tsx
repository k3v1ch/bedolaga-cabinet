import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Send } from 'lucide-react';

import { brandingApi, type TelegramWidgetConfig } from '@/api/branding';
import { useAuthStore } from '@/store/auth';

/**
 * Verno-style Telegram login.
 *
 * Behavior:
 *  - OIDC enabled on backend → click opens Telegram OIDC popup (oauth.telegram.org).
 *  - OIDC disabled → renders the official Telegram Login Widget iframe, which on
 *    click opens the same oauth.telegram.org popup. Telegram remembers the profile
 *    so subsequent logins are one-click.
 */

interface Props {
  referralCode?: string;
}

export default function CabinetTelegramLogin({ referralCode }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loginWithTelegramOIDC = useAuthStore((s) => s.loginWithTelegramOIDC);
  const loginWithTelegramWidget = useAuthStore((s) => s.loginWithTelegramWidget);

  const { data: widgetConfig } = useQuery<TelegramWidgetConfig>({
    queryKey: ['telegram-widget-config'],
    queryFn: brandingApi.getTelegramWidgetConfig,
    staleTime: 60_000,
  });

  const botUsername =
    widgetConfig?.bot_username || import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';
  const isOIDC = Boolean(widgetConfig?.oidc_enabled && widgetConfig?.oidc_client_id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [oidcScriptReady, setOidcScriptReady] = useState(false);

  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const oidcCallbackRef = useRef<(data: { id_token?: string; error?: string }) => void>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── OIDC ──────────────────────────────────────────────────────────────
  oidcCallbackRef.current = async (data: { id_token?: string; error?: string }) => {
    if (!mountedRef.current) return;
    if (data.error || !data.id_token) {
      setError(
        data.error ||
          t('auth.telegram.loginError', { defaultValue: 'Ошибка входа через Telegram' }),
      );
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
      let message = t('auth.telegram.genericError', { defaultValue: 'Ошибка входа' });
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

    const onLoad = () => init();
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://oauth.telegram.org/js/telegram-login.js?3';
      script.async = true;
      script.addEventListener('load', onLoad);
      document.head.appendChild(script);
    } else if (window.Telegram?.Login) {
      init();
    } else {
      // Элемент добавлен другой страницей, но скрипт ещё грузится — дождаться load,
      // иначе кнопка останется disabled (oidcScriptReady так и не станет true).
      script.addEventListener('load', onLoad);
    }
    return () => script?.removeEventListener('load', onLoad);
  }, [isOIDC, widgetConfig?.oidc_client_id, widgetConfig?.request_access]);

  // ── Legacy Telegram Login Widget (non-OIDC) ───────────────────────────────
  // Renders the official Telegram iframe button. Click → oauth.telegram.org popup
  // → data-onauth callback runs in our window with signed user payload → we POST
  // it to /cabinet/auth/telegram/widget. Telegram caches the granted authorization,
  // so the next click immediately resolves without showing the consent popup.
  useEffect(() => {
    if (isOIDC || !widgetContainerRef.current || !botUsername || !widgetConfig) return;

    const container = widgetContainerRef.current;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const callbackName = '__onCabinetTelegramAuth';
    (window as unknown as Record<string, unknown>)[callbackName] = async (
      user: Record<string, unknown>,
    ) => {
      if (!mountedRef.current) return;
      try {
        setLoading(true);
        setError('');
        await loginWithTelegramWidget({
          id: user.id as number,
          first_name: user.first_name as string,
          last_name: (user.last_name as string) || undefined,
          username: (user.username as string) || undefined,
          photo_url: (user.photo_url as string) || undefined,
          auth_date: user.auth_date as number,
          hash: user.hash as string,
        });
        if (mountedRef.current) navigate('/');
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        let message = t('auth.telegram.genericError', { defaultValue: 'Ошибка входа' });
        if (isAxiosError(err) && err.response?.data?.detail) message = err.response.data.detail;
        setError(message);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', widgetConfig.size || 'large');
    script.setAttribute('data-radius', String(widgetConfig.radius ?? 12));
    script.setAttribute('data-userpic', String(widgetConfig.userpic ?? true));
    script.setAttribute('data-onauth', `${callbackName}(user)`);
    if (widgetConfig.request_access) script.setAttribute('data-request-access', 'write');
    script.async = true;
    container.appendChild(script);

    return () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [isOIDC, botUsername, widgetConfig, loginWithTelegramWidget, navigate, t]);

  const handleOIDCClick = () => {
    setError('');
    setLoading(true);
    if (window.Telegram?.Login) {
      window.Telegram.Login.open();
    } else {
      setLoading(false);
      setError(
        t('auth.telegram.unavailable', {
          defaultValue: 'Telegram Login недоступен, попробуйте обновить страницу.',
        }),
      );
    }
  };

  // ─────────────────────────────── render ───────────────────────────────

  return (
    <>
      {isOIDC ? (
        <button
          type="button"
          onClick={handleOIDCClick}
          disabled={loading || !oidcScriptReady}
          className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#2AABEE] py-3.5 text-white transition-all duration-300 hover:bg-[#229ED9] active:scale-[0.97] disabled:opacity-60"
          style={{ fontSize: '0.9rem', fontWeight: 500 }}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
          ) : (
            <Send size={16} />
          )}
          {t('auth.telegram.signIn', { defaultValue: 'Войти через Telegram' })}
        </button>
      ) : (
        <div
          ref={widgetContainerRef}
          className="flex w-full items-center justify-center"
          aria-busy={loading}
        />
      )}

      {error && (
        <p className="mt-2 text-center text-xs text-red-400/80" style={{ lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      {botUsername && botUsername !== 'your_bot' && (
        <>
          <p className="mt-3 text-center text-xs text-white/30">
            {t('auth.telegram.openBotApp', { defaultValue: 'Или откройте бота в приложении' })}
          </p>
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
