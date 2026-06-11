import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useBlockingStore } from '../../store/blocking';
import { apiClient, isChannelSubscriptionError } from '../../api/client';
import { usePlatform } from '../../platform';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { TelegramIcon, ClockIcon, CheckIcon, RestartIcon } from '@/components/icons';

const CHECK_COOLDOWN_SECONDS = 5;

export default function ChannelSubscriptionScreen() {
  const { t } = useTranslation();
  const channelInfo = useBlockingStore((state) => state.channelInfo);
  const clearBlocking = useBlockingStore((state) => state.clearBlocking);
  const [isChecking, setIsChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isCheckingRef = useRef(false);
  const { openLink, openTelegramLink } = usePlatform();

  // Route channel links through the platform adapter: inside the Telegram
  // WebView a raw window.open is intercepted by the client and the link
  // silently fails to open. t.me links use openTelegramLink; others openLink.
  const openChannel = useCallback(
    (url: string | undefined | null) => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
        if (parsed.hostname === 't.me' || parsed.hostname.endsWith('.t.me')) {
          openTelegramLink(url);
        } else {
          openLink(url);
        }
      } catch {
        // invalid URL, do nothing
      }
    },
    [openLink, openTelegramLink],
  );

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

  const screenRef = useFocusTrap<HTMLDivElement>(true, { lockScroll: false });

  // Check-subscription button — 3 states (checking / cooldown / idle).
  let checkIcon: ReactNode;
  let checkLabel: string;
  if (isChecking) {
    checkIcon = <RestartIcon className="h-5 w-5 animate-spin" />;
    checkLabel = t('blocking.channel.checking');
  } else if (cooldown > 0) {
    checkIcon = <ClockIcon className="h-5 w-5" />;
    checkLabel = t('blocking.channel.waitSeconds', { seconds: cooldown });
  } else {
    checkIcon = <CheckIcon className="h-5 w-5" />;
    checkLabel = t('blocking.channel.checkSubscription');
  }

  return (
    <div
      ref={screenRef}
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
              <TelegramIcon className="h-7 w-7 text-white/70" />
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
                      onClick={() => openChannel(ch.channel_link)}
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
              onClick={() => openChannel(channelInfo.channel_link)}
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
            {checkIcon}
            {checkLabel}
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
