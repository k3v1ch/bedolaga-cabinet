import { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { landingApi, type GiftClaimResult } from '../api/landings';
import { getApiErrorMessage } from '../utils/api-error';
import { copyToClipboard } from '@/utils/clipboard';
import { Spinner } from '@/components/ui/Spinner';
import { AnimatedCheckmark } from '@/components/ui/AnimatedCheckmark';
import { cn } from '@/lib/utils';
import { CheckCircleIcon, CheckIcon, CopyIcon } from '@/components/icons';

const MAX_POLL_MS = 10 * 60 * 1000; // poll an unsettled payment for up to 10 min

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

// KELDARI-UI: стиль выровнен под кабинет — тёмный фон, стеклянная карточка,
// шрифт Inter, белые pill-кнопки (как в CabinetSubscription).
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

// Белая «основная» кнопка (как «Продлить» в кабинете)
const PRIMARY_BTN =
  'flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]';
// Вторичная pill-кнопка
const SECONDARY_BTN =
  'flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-[15px] text-white/70 transition-colors hover:bg-white/[0.05]';

export default function GiftClaim() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const startedAt = useRef(Date.now());

  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [result, setResult] = useState<GiftClaimResult | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data: gift,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['gift-claim', token],
    queryFn: () => landingApi.getGiftClaim(token!),
    enabled: !!token,
    retry: 1,
    // Poll only while the payment is still settling (not yet claimable / terminal).
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      if (Date.now() - startedAt.current > MAX_POLL_MS) return false;
      const settled = data.is_claimable || data.status === 'delivered' || data.status === 'failed';
      return settled ? false : 3000;
    },
  });

  const claimMutation = useMutation({
    mutationFn: () => landingApi.claimGift(token!, email.trim()),
    onSuccess: (res) => {
      // One-click cabinet login for a fresh email account; otherwise show the link.
      if (res.auto_login_token) {
        navigate(`/auto-login?token=${encodeURIComponent(res.auto_login_token)}`);
        return;
      }
      setResult(res);
    },
    onError: (err) => {
      setClaimError(
        getApiErrorMessage(err, t('landing.giftClaim.error', 'Could not activate the gift.')),
      );
    },
  });

  const willReplace = gift?.status === 'pending_activation';

  const handleCopyLink = async () => {
    const url = result?.subscription_url;
    if (!url) return;
    try {
      await copyToClipboard(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const periodLabel = useMemo(() => {
    const days = gift?.period_days;
    if (!days) return '';
    return `${days} ${t('gift.days', 'days')}`;
  }, [gift?.period_days, t]);

  if (isLoading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Spinner className="h-12 w-12 border-[3px]" />
          <p className="text-[14px] text-white/40">{t('common.loading', 'Loading...')}</p>
        </div>
      </Shell>
    );
  }

  // 404 / unknown gift
  if (error || !gift || !gift.is_gift) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <h1 className="text-lg text-white" style={{ fontWeight: 600 }}>
            {t('landing.giftClaim.notFoundTitle', 'Gift not found')}
          </h1>
          <p className="text-[14px] text-white/40">
            {t(
              'landing.giftClaim.notFoundDesc',
              'This gift link is invalid or no longer available.',
            )}
          </p>
        </div>
      </Shell>
    );
  }

  // Already activated
  if (gift.status === 'delivered' && !result) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <CheckCircleIcon className="h-14 w-14 text-green-400" />
          <h1 className="text-xl text-white" style={{ fontWeight: 700 }}>
            {t('landing.giftClaim.alreadyTitle', 'Gift already activated')}
          </h1>
          <p className="text-[14px] text-white/40">
            {t('landing.giftClaim.alreadyDesc', 'This gift has already been claimed.')}
          </p>
        </div>
      </Shell>
    );
  }

  // Payment failed/expired → tell the recipient instead of spinning forever
  if (gift.status === 'failed' || gift.status === 'expired') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <h1 className="text-lg text-white" style={{ fontWeight: 600 }}>
            {t('landing.giftClaim.failedTitle', 'Gift unavailable')}
          </h1>
          <p className="text-[14px] text-white/40">
            {t(
              'landing.giftClaim.failedDesc',
              'The payment for this gift did not go through, so it cannot be activated.',
            )}
          </p>
        </div>
      </Shell>
    );
  }

  // Successful web claim → show connection link
  if (result) {
    return (
      <Shell>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5 text-center"
        >
          <AnimatedCheckmark />
          <h1 className="text-xl text-white" style={{ fontWeight: 700 }}>
            {t('landing.giftClaim.successTitle', 'Gift activated!')}
          </h1>
          {result.subscription_url && (
            <>
              <p className="text-[14px] text-white/55">
                {t('landing.giftClaim.connectDesc', 'Use this link to connect:')}
              </p>
              <p className="w-full select-all truncate rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[14px] text-white/70">
                {result.subscription_url}
              </p>
              <button
                type="button"
                onClick={handleCopyLink}
                className={cn(
                  PRIMARY_BTN,
                  copied && 'bg-green-500/20 text-green-400 hover:shadow-none',
                )}
                style={{ fontWeight: 500 }}
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                {copied
                  ? t('common.copied', 'Copied!')
                  : t('landing.giftClaim.copyLink', 'Copy link')}
              </button>
            </>
          )}
        </motion.div>
      </Shell>
    );
  }

  // Payment still settling
  if (!gift.is_claimable) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Spinner className="h-12 w-12 border-[3px]" />
          <h1 className="text-lg text-white" style={{ fontWeight: 600 }}>
            {t('landing.giftClaim.pendingTitle', 'Almost ready...')}
          </h1>
          <p className="text-[14px] text-white/40">
            {t(
              'landing.giftClaim.pendingDesc',
              'The payment is still being confirmed. This page will update automatically.',
            )}
          </p>
        </div>
      </Shell>
    );
  }

  // Claimable — offer Telegram + web arms
  return (
    <Shell>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-5 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.06] text-3xl">
          🎁
        </div>
        <div>
          <h1 className="text-xl text-white" style={{ fontWeight: 700 }}>
            {t('landing.giftClaim.title', 'You have a gift!')}
          </h1>
          {gift.tariff_name && (
            <p className="mt-1 text-[14px] text-white/55">
              {gift.tariff_name}
              {periodLabel ? ` — ${periodLabel}` : ''}
            </p>
          )}
        </div>

        {gift.gift_message && (
          <div className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left">
            <p className="text-[14px] italic text-white/70">&ldquo;{gift.gift_message}&rdquo;</p>
          </div>
        )}

        {willReplace && (
          <p className="w-full rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-[12px] text-amber-300/80">
            {t(
              'landing.giftClaim.replaceWarning',
              'You already have a subscription — activating this gift will replace it.',
            )}
          </p>
        )}

        {/* Telegram arm */}
        {gift.bot_claim_link && (
          <a href={gift.bot_claim_link} className={PRIMARY_BTN} style={{ fontWeight: 500 }}>
            {t('landing.giftClaim.activateTelegram', 'Activate in Telegram')}
          </a>
        )}

        {/* Web/email arm */}
        {!showEmail ? (
          <button type="button" onClick={() => setShowEmail(true)} className={SECONDARY_BTN}>
            {t('landing.giftClaim.activateWeb', 'Activate by email')}
          </button>
        ) : (
          <div className="w-full space-y-3 text-left">
            <label htmlFor="claim-email" className="block text-[13px] text-white/50">
              {t('landing.giftClaim.emailLabel', 'Your email')}
            </label>
            <input
              id="claim-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setClaimError(null);
              }}
              placeholder="email@example.com"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder-white/30 outline-none transition-colors focus:border-white/25"
            />
            {claimError && <p className="text-[13px] text-red-400">{claimError}</p>}
            <button
              type="button"
              disabled={!isValidEmail(email) || claimMutation.isPending}
              onClick={() => claimMutation.mutate()}
              className={cn(
                PRIMARY_BTN,
                (!isValidEmail(email) || claimMutation.isPending) &&
                  'cursor-not-allowed bg-white/10 text-white/40 hover:shadow-none',
              )}
              style={{ fontWeight: 500 }}
            >
              {claimMutation.isPending ? (
                <Spinner className="h-5 w-5 border-2" />
              ) : (
                t('landing.giftClaim.claimNow', 'Get my gift')
              )}
            </button>
          </div>
        )}
      </motion.div>
    </Shell>
  );
}
