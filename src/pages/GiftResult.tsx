import { useCallback, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { giftApi } from '../api/gift';
import { Spinner } from '@/components/ui/Spinner';
import { AnimatedCheckmark } from '@/components/ui/AnimatedCheckmark';
import { AnimatedCrossmark } from '@/components/ui/AnimatedCrossmark';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/utils/clipboard';
import { giftSiteLink } from '@/utils/giftLinks';
import { CheckIcon, CopyIcon, InfoIcon, ExclamationIcon, ClockIcon } from '@/components/icons';

const MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes

const KNOWN_WARNINGS = new Set(['telegram_unresolvable']);

// ============================================================
// Sub-components
// ============================================================

function PendingState() {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <Spinner className="h-16 w-16 border-[3px]" />
      <div>
        <h1 className="text-xl font-bold text-dark-50">
          {t('gift.processing', 'Processing your gift...')}
        </h1>
        <p className="mt-2 text-sm text-dark-400">
          {t('gift.pendingDesc', 'Please wait while we process your payment')}
        </p>
      </div>
    </motion.div>
  );
}

function CodeOnlySuccessState({
  purchaseToken,
  tariffName,
  periodDays,
}: {
  purchaseToken: string;
  tariffName: string | null;
  periodDays: number | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const shortCode = purchaseToken.slice(0, 12);
  const giftCode = `GIFT-${shortCode}`;
  // KELDARI-UI: одна ссылка на подарок → страница /buy/gift/<token>, где получатель
  // сам выбирает активацию в Telegram или по почте (см. utils/giftLinks.ts).
  const siteLink = giftSiteLink(purchaseToken);

  const handleCopy = async () => {
    try {
      await copyToClipboard(siteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <AnimatedCheckmark />

      <div>
        <h1 className="text-xl font-bold text-dark-50">
          {t('gift.codeReadyTitle', 'Gift code is ready!')}
        </h1>
        {tariffName && periodDays !== null && (
          <p className="mt-1 text-sm text-dark-300">
            {tariffName} — {periodDays} {t('gift.days', 'days')}
          </p>
        )}
      </div>

      {/* Gift code display */}
      <div className="w-full rounded-xl border border-accent-500/20 bg-accent-500/5 p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-dark-400">
          {t('gift.codeLabel', 'Gift code')}
        </p>
        <p className="select-all font-mono text-lg font-bold text-accent-400">{giftCode}</p>
      </div>

      {/* Одна ссылка на подарок — ведёт на страницу, где получатель сам выбирает
          активацию в Telegram или по почте. */}
      <div className="w-full rounded-xl border border-dark-700/30 bg-dark-800/40 p-3 text-left">
        <p className="mb-1 text-xs font-medium text-dark-400">
          {t('gift.shareLinkLabel', 'Ссылка на подарок:')}
        </p>
        <p className="mb-3 truncate rounded-lg bg-dark-900/60 px-3 py-2 text-sm text-accent-400">
          {siteLink}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98]',
            copied
              ? 'bg-success-500/20 text-success-400'
              : 'bg-accent-500 text-white hover:bg-accent-400',
          )}
        >
          {copied ? (
            <>
              <CheckIcon className="h-4 w-4" />
              {t('common.copied', 'Copied!')}
            </>
          ) : (
            <>
              <CopyIcon className="h-4 w-4" />
              {t('gift.copyGiftLink', 'Скопировать ссылку на подарок')}
            </>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={() => navigate('/subscriptions')}
        className="w-full rounded-xl border border-dark-700/50 px-6 py-3 text-sm font-medium text-dark-300 transition-colors hover:bg-dark-800/50"
      >
        {t('gift.tabMyGifts', 'My Gifts')}
      </button>
    </motion.div>
  );
}

function DeliveredState({
  recipientContact,
  tariffName,
  periodDays,
  giftMessage,
  warning,
}: {
  recipientContact: string | null;
  tariffName: string | null;
  periodDays: number | null;
  giftMessage: string | null;
  warning: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <AnimatedCheckmark />

      <div>
        <h1 className="text-xl font-bold text-dark-50">{t('gift.successTitle', 'Gift sent!')}</h1>
        {tariffName && periodDays !== null && (
          <p className="mt-1 text-sm text-dark-300">
            {tariffName} — {periodDays} {t('gift.days', 'days')}
          </p>
        )}
        {recipientContact && (
          <p className="mt-2 text-sm text-dark-400">
            {t('gift.successDesc', {
              contact: recipientContact,
              defaultValue: `Sent to ${recipientContact}`,
            })}
          </p>
        )}
        {giftMessage && (
          <p className="mt-2 text-sm italic text-dark-400">&ldquo;{giftMessage}&rdquo;</p>
        )}
      </div>

      {warning && (
        <div className="w-full rounded-xl border border-warning-500/20 bg-warning-500/5 p-3">
          <p className="text-sm text-warning-400">{t(`gift.warning.${warning}`)}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex w-full items-center justify-center rounded-xl bg-accent-500 px-6 py-3 text-sm font-medium text-on-accent transition-colors hover:bg-accent-400"
      >
        {t('gift.backToDashboard', 'Back to dashboard')}
      </button>
    </motion.div>
  );
}

function PendingActivationState({
  recipientContact,
  tariffName,
  periodDays,
  warning,
}: {
  recipientContact: string | null;
  tariffName: string | null;
  periodDays: number | null;
  warning: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      {/* Info icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-warning-500/10">
        <InfoIcon className="h-10 w-10 text-warning-400" />
      </div>

      <div>
        <h1 className="text-xl font-bold text-dark-50">
          {t('gift.pendingActivationTitle', 'Gift pending activation')}
        </h1>
        {tariffName && periodDays !== null && (
          <p className="mt-1 text-sm text-dark-300">
            {tariffName} — {periodDays} {t('gift.days', 'days')}
          </p>
        )}
        {recipientContact && (
          <p className="mt-2 text-sm text-dark-400">
            {t('gift.successDesc', {
              contact: recipientContact,
              defaultValue: `Sent to ${recipientContact}`,
            })}
          </p>
        )}
        <p className="mt-2 text-sm text-dark-400">
          {t(
            'gift.pendingActivationDesc',
            'The recipient currently has an active subscription. Your gift will be activated once their current subscription expires.',
          )}
        </p>
      </div>

      {warning && (
        <div className="w-full rounded-xl border border-warning-500/20 bg-warning-500/5 p-3">
          <p className="text-sm text-warning-400">{t(`gift.warning.${warning}`)}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex w-full items-center justify-center rounded-xl bg-accent-500 px-6 py-3 text-sm font-medium text-on-accent transition-colors hover:bg-accent-400"
      >
        {t('gift.backToDashboard', 'Back to dashboard')}
      </button>
    </motion.div>
  );
}

function FailedState() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <AnimatedCrossmark />

      <div>
        <h1 className="text-xl font-bold text-dark-50">
          {t('gift.failedTitle', 'Something went wrong')}
        </h1>
        <p className="mt-2 text-sm text-dark-400">
          {t('gift.failedDesc', 'Your gift could not be processed. Please try again.')}
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate('/gift')}
        className="flex w-full items-center justify-center rounded-xl bg-accent-500 px-6 py-3 text-sm font-medium text-on-accent transition-colors hover:bg-accent-400"
      >
        {t('gift.tryAgain', 'Try again')}
      </button>
    </motion.div>
  );
}

function PollErrorState() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-warning-500/10">
        <ExclamationIcon className="h-10 w-10 text-warning-400" />
      </div>

      <div>
        <h1 className="text-xl font-bold text-dark-50">
          {t('gift.pollErrorTitle', 'Could not check gift status')}
        </h1>
        <p className="mt-2 text-sm text-dark-400">
          {t(
            'gift.pollErrorDesc',
            'Your purchase was successful. Check your dashboard for details.',
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex w-full items-center justify-center rounded-xl bg-accent-500 px-6 py-3 text-sm font-medium text-on-accent transition-colors hover:bg-accent-400"
      >
        {t('gift.backToDashboard', 'Back to dashboard')}
      </button>
    </motion.div>
  );
}

function PollTimedOutState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-dark-800/50">
        <ClockIcon className="h-10 w-10 text-dark-400" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-dark-50">
          {t('gift.pollTimeout', 'Taking longer than expected')}
        </h1>
        <p className="mt-2 text-sm text-dark-400">
          {t(
            'gift.pollTimeoutDesc',
            'Payment processing is taking longer than usual. You can try checking again.',
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-xl bg-accent-500 px-6 py-3 text-sm font-medium text-on-accent transition-colors hover:bg-accent-400"
      >
        {t('gift.retry', 'Retry')}
      </button>
    </motion.div>
  );
}

function NoTokenState() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-dark-800/50">
        <ExclamationIcon className="h-10 w-10 text-dark-400" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-dark-50">{t('gift.noToken', 'Invalid link')}</h1>
        <p className="mt-2 text-sm text-dark-400">
          {t('gift.noTokenDesc', 'This gift link is invalid or has expired.')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/gift')}
        className="rounded-xl bg-accent-500 px-6 py-3 text-sm font-medium text-on-accent transition-colors hover:bg-accent-400"
      >
        {t('gift.backToGift', 'Go back')}
      </button>
    </motion.div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function GiftResult() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const mode = searchParams.get('mode');
  const rawUrlWarning = searchParams.get('warning');
  const urlWarning = rawUrlWarning && KNOWN_WARNINGS.has(rawUrlWarning) ? rawUrlWarning : null;

  const pollStart = useRef(Date.now());
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const isBalanceMode = mode === 'balance';

  const {
    data: status,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['gift-status', token],
    queryFn: () => giftApi.getPurchaseStatus(token!),
    enabled: !!token && !pollTimedOut,
    refetchInterval: (query) => {
      // Balance mode: fetch once, no polling
      if (isBalanceMode) return false;

      const d = query.state.data;
      const s = d?.status;
      if (s === 'delivered' || s === 'failed' || s === 'pending_activation' || s === 'expired')
        return false;
      // Claimable gifts (code-only AND directed) stay in 'paid' until claimed —
      // stop polling; the buyer shares the link.
      if (s === 'paid' && d?.is_claimable) return false;

      // Check poll timeout
      if (Date.now() - pollStart.current > MAX_POLL_MS) {
        setPollTimedOut(true);
        return false;
      }

      return 3000;
    },
    retry: 2,
  });

  const handleRetryPoll = useCallback(() => {
    pollStart.current = Date.now();
    setPollTimedOut(false);
    refetch();
  }, [refetch]);

  // No token
  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-2xl border border-dark-800/50 bg-dark-900/50 p-8"
          aria-live="polite"
          aria-atomic="true"
        >
          <NoTokenState />
        </div>
      </div>
    );
  }

  const isClaimablePaid =
    status?.status === 'paid' && status?.is_claimable && status?.purchase_token != null;
  const isDelivered = status?.status === 'delivered';
  const isPendingActivation = status?.status === 'pending_activation';
  const isFailed = status?.status === 'failed' || status?.status === 'expired';

  // Warning from status response (persisted on purchase) takes priority over URL param
  const statusWarning =
    status?.warning && KNOWN_WARNINGS.has(status.warning) ? status.warning : null;
  const warning = statusWarning ?? urlWarning;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-2xl border border-dark-800/50 bg-dark-900/50 p-8"
        aria-live="polite"
        aria-atomic="true"
      >
        {isError ? (
          <PollErrorState />
        ) : isClaimablePaid ? (
          <CodeOnlySuccessState
            purchaseToken={status.purchase_token!}
            tariffName={status.tariff_name}
            periodDays={status.period_days}
          />
        ) : isDelivered ? (
          <DeliveredState
            recipientContact={status.recipient_contact_value}
            tariffName={status.tariff_name}
            periodDays={status.period_days}
            giftMessage={status.gift_message}
            warning={warning}
          />
        ) : isPendingActivation ? (
          <PendingActivationState
            recipientContact={status.recipient_contact_value}
            tariffName={status.tariff_name}
            periodDays={status.period_days}
            warning={warning}
          />
        ) : isFailed ? (
          <FailedState />
        ) : pollTimedOut ? (
          <PollTimedOutState onRetry={handleRetryPoll} />
        ) : (
          <PendingState />
        )}
      </div>
    </div>
  );
}
