import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useBlockingStore } from '../../store/blocking';
import { apiClient, isChannelSubscriptionError } from '../../api/client';

const CHECK_COOLDOWN_SECONDS = 5;

function safeOpenUrl(url: string | undefined | null): void {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      window.open(url, '_blank', 'noopener');
    }
  } catch {
    // invalid URL, do nothing
  }
}

export default function ChannelSubscriptionScreen() {
  const { t } = useTranslation();
  const channelInfo = useBlockingStore((state) => state.channelInfo);
  const clearBlocking = useBlockingStore((state) => state.clearBlocking);
  const [isChecking, setIsChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isCheckingRef = useRef(false);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const allChannels = channelInfo?.channels ?? [];
  const channels = allChannels.filter((ch) => !ch.is_subscribed);

  const checkSubscription = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setIsChecking(true);
    setError(null);

    try {
      await apiClient.get('/cabinet/auth/me');
      clearBlocking();
      window.location.reload();
    } catch (err: unknown) {
      if (isChannelSubscriptionError(err)) {
        setError(t('blocking.channel.notSubscribed'));
      } else {
        setError(t('blocking.channel.checkError'));
      }
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
      setCooldown(CHECK_COOLDOWN_SECONDS);
    }
  }, [clearBlocking, t]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black px-6 py-10"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* Subtle background gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gray-950 to-black" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Brand */}
        <div
          className="mb-8 block text-center tracking-wider text-white"
          style={{ fontSize: '1.15rem', fontWeight: 600 }}
        >
          ВЕРНО <span className="text-white/40">VPN</span>
        </div>

        {/* Glass card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur-xl">
          {/* Telegram glyph */}
          <div className="mb-5 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
              <svg className="h-7 w-7 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1
            className="mb-2 text-center text-white"
            style={{ fontSize: '1.05rem', fontWeight: 600 }}
          >
            {t('blocking.channel.title')}
          </h1>

          {/* Message */}
          <p className="mb-6 text-center text-sm text-white/40" style={{ lineHeight: 1.6 }}>
            {channelInfo?.message || t('blocking.channel.defaultMessage')}
          </p>

          {/* Channel list */}
          {channels.length > 0 && (
            <div className="mb-5 space-y-2">
              {channels.map((ch) => (
                <div
                  key={ch.channel_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="truncate text-sm text-white/80" style={{ fontWeight: 500 }}>
                    {ch.title || ch.channel_id}
                  </span>
                  {ch.channel_link && (
                    <button
                      onClick={() => safeOpenUrl(ch.channel_link)}
                      className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/80"
                    >
                      {t('blocking.channel.openChannel')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Fallback: single legacy channel */}
          {channels.length === 0 && channelInfo?.channel_link && (
            <button
              onClick={() => safeOpenUrl(channelInfo.channel_link)}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#2AABEE] py-3.5 text-white transition-all duration-300 hover:bg-[#229ED9] active:scale-[0.97]"
              style={{ fontSize: '0.9rem', fontWeight: 500 }}
            >
              {t('blocking.channel.openChannel')}
            </button>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5">
              <p className="text-xs text-red-300/80" style={{ lineHeight: 1.5 }}>
                {error}
              </p>
            </div>
          )}

          {/* Check subscription button (primary white pill) */}
          <button
            onClick={checkSubscription}
            disabled={isChecking || cooldown > 0}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none disabled:active:scale-100"
            style={{ fontWeight: 500 }}
          >
            {isChecking ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {t('blocking.channel.checking')}
              </>
            ) : cooldown > 0 ? (
              t('blocking.channel.waitSeconds', { seconds: cooldown })
            ) : (
              t('blocking.channel.checkSubscription')
            )}
          </button>

          {/* Hint */}
          <p className="mt-4 text-center text-xs text-white/25" style={{ lineHeight: 1.5 }}>
            {t('blocking.channel.hint')}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
