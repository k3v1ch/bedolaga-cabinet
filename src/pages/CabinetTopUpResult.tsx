import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, X as XIcon, Clock } from 'lucide-react';

import { balanceApi } from '@/api/balance';
import { useAuthStore } from '@/store/auth';
import { useCurrency } from '@/hooks/useCurrency';
import { useHaptic } from '@/platform';
import { loadTopUpPendingInfo, clearTopUpPendingInfo } from '@/utils/topUpStorage';
import { isPaidStatus, isFailedStatus } from '@/utils/paymentStatus';

// ── Constants ────────────────────────────────────────────────
const MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL_MS = 3_000;

// ── Shared visual bits ───────────────────────────────────────

function AmountDisplay({ amountKopeks, label }: { amountKopeks: number; label: string }) {
  const { formatAmount, currencySymbol } = useCurrency();
  const amountRubles = amountKopeks / 100;

  return (
    <div className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-4 text-center">
      <p className="text-xs text-white/30">{label}</p>
      <p
        className="mt-1 text-white"
        style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.01em' }}
      >
        {formatAmount(amountRubles)}{' '}
        <span className="text-base text-white/30" style={{ fontWeight: 500 }}>
          {currencySymbol}
        </span>
      </p>
    </div>
  );
}

function IconBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'success' | 'error' | 'muted';
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-green-500/10 text-green-400'
      : tone === 'error'
        ? 'bg-red-500/10 text-red-400'
        : 'bg-white/[0.06] text-white/40';
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.05 }}
      className={`flex h-16 w-16 items-center justify-center rounded-full ${toneClass}`}
    >
      {children}
    </motion.div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full bg-white py-3.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-60"
      style={{ fontWeight: 500 }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-full border border-white/10 py-3 text-sm text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/70"
    >
      {children}
    </button>
  );
}

// ── States ───────────────────────────────────────────────────

function PendingState({ amountKopeks }: { amountKopeks: number | null }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-5 text-center"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
        className="h-14 w-14 rounded-full border-2 border-white/[0.08] border-t-white/60"
      />
      <div>
        <h1
          className="text-white"
          style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('balance.topUpResult.awaitingPayment', { defaultValue: 'Ожидаем оплату' })}
        </h1>
        <p className="mt-2 text-sm text-white/35" style={{ lineHeight: 1.6 }}>
          {t('balance.topUpResult.awaitingPaymentDesc', {
            defaultValue: 'Это может занять до нескольких минут. Страницу можно не закрывать.',
          })}
        </p>
      </div>
      {amountKopeks != null && amountKopeks > 0 && (
        <AmountDisplay
          amountKopeks={amountKopeks}
          label={t('balance.topUpResult.topUpAmount', { defaultValue: 'Сумма пополнения' })}
        />
      )}
    </motion.div>
  );
}

function SuccessState({ amountKopeks }: { amountKopeks: number | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-5 text-center"
    >
      <IconBadge tone="success">
        <Check size={28} strokeWidth={2.25} />
      </IconBadge>
      <div>
        <h1
          className="text-white"
          style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('balance.topUpResult.success', { defaultValue: 'Баланс пополнен' })}
        </h1>
        <p className="mt-2 text-sm text-white/35" style={{ lineHeight: 1.6 }}>
          {t('balance.topUpResult.successDesc', {
            defaultValue: 'Средства уже зачислены на ваш счёт.',
          })}
        </p>
      </div>
      {amountKopeks != null && amountKopeks > 0 && (
        <AmountDisplay
          amountKopeks={amountKopeks}
          label={t('balance.topUpResult.topUpAmount', { defaultValue: 'Сумма пополнения' })}
        />
      )}
      <PrimaryButton onClick={() => navigate('/balance', { replace: true })}>
        {t('balance.topUpResult.goToBalance', { defaultValue: 'Перейти к балансу' })}
      </PrimaryButton>
    </motion.div>
  );
}

function FailedState({ amountKopeks }: { amountKopeks: number | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-5 text-center"
    >
      <IconBadge tone="error">
        <XIcon size={28} strokeWidth={2.25} />
      </IconBadge>
      <div>
        <h1
          className="text-white"
          style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('balance.topUpResult.failed', { defaultValue: 'Оплата не прошла' })}
        </h1>
        <p className="mt-2 text-sm text-white/35" style={{ lineHeight: 1.6 }}>
          {t('balance.topUpResult.failedDesc', {
            defaultValue: 'Попробуйте ещё раз или выберите другой способ оплаты.',
          })}
        </p>
      </div>
      {amountKopeks != null && amountKopeks > 0 && (
        <AmountDisplay
          amountKopeks={amountKopeks}
          label={t('balance.topUpResult.topUpAmount', { defaultValue: 'Сумма пополнения' })}
        />
      )}
      <PrimaryButton onClick={() => navigate('/balance', { replace: true })}>
        {t('balance.topUpResult.tryAgain', { defaultValue: 'Попробовать снова' })}
      </PrimaryButton>
    </motion.div>
  );
}

function TimeoutState({ onRetry, onGoBack }: { onRetry: () => void; onGoBack: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-5 text-center"
    >
      <IconBadge tone="muted">
        <Clock size={26} strokeWidth={1.75} />
      </IconBadge>
      <div>
        <h1
          className="text-white"
          style={{ fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('balance.topUpResult.timeout', { defaultValue: 'Слишком долго' })}
        </h1>
        <p className="mt-2 text-sm text-white/35" style={{ lineHeight: 1.6 }}>
          {t('balance.topUpResult.timeoutDesc', {
            defaultValue:
              'Мы не получили подтверждение оплаты. Если деньги списались — они будут зачислены автоматически.',
          })}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <PrimaryButton onClick={onRetry}>
          {t('common.retry', { defaultValue: 'Повторить проверку' })}
        </PrimaryButton>
        <SecondaryButton onClick={onGoBack}>
          {t('balance.topUpResult.goToBalance', { defaultValue: 'Перейти к балансу' })}
        </SecondaryButton>
      </div>
    </motion.div>
  );
}

// ── Main ─────────────────────────────────────────────────────

export default function CabinetTopUpResult() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const haptic = useHaptic();
  const pollStart = useRef(Date.now());
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const hapticFiredRef = useRef(false);
  const cleanedUpRef = useRef(false);

  const [pendingInfo] = useState(() => loadTopUpPendingInfo());

  const methodFromUrl = searchParams.get('method');

  const redirectStatus = searchParams.get('status') || searchParams.get('payment');
  const isRedirectSuccess = redirectStatus
    ? isPaidStatus(redirectStatus)
    : searchParams.get('success') === 'true';
  const isRedirectFailed = redirectStatus ? isFailedStatus(redirectStatus) : false;

  const parsedPaymentId = pendingInfo?.payment_id ? parseInt(pendingInfo.payment_id, 10) : NaN;
  const canPollById =
    !!(pendingInfo?.method_id && !Number.isNaN(parsedPaymentId)) &&
    !isRedirectSuccess &&
    !isRedirectFailed;

  const canPollByMethod =
    !canPollById && !!methodFromUrl && !isRedirectSuccess && !isRedirectFailed;

  const { data: paymentStatus, refetch } = useQuery({
    queryKey: ['topup-status', pendingInfo?.method_id, parsedPaymentId],
    queryFn: () => balanceApi.getPendingPayment(pendingInfo!.method_id, parsedPaymentId),
    enabled: canPollById && !pollTimedOut,
    refetchInterval: (query) => {
      const payment = query.state.data;
      if (!payment) return POLL_INTERVAL_MS;
      if (payment.is_paid || isPaidStatus(payment.status) || isFailedStatus(payment.status)) {
        return false;
      }
      if (Date.now() - pollStart.current > MAX_POLL_MS) {
        setPollTimedOut(true);
        return false;
      }
      return POLL_INTERVAL_MS;
    },
    retry: 2,
  });

  const { data: latestPayment, refetch: refetchLatest } = useQuery({
    queryKey: ['topup-status-latest', methodFromUrl],
    queryFn: () => balanceApi.getLatestPayment(methodFromUrl!),
    enabled: canPollByMethod && !pollTimedOut,
    refetchInterval: (query) => {
      const payment = query.state.data;
      if (!payment) return POLL_INTERVAL_MS;
      if (payment.is_paid || isPaidStatus(payment.status) || isFailedStatus(payment.status)) {
        return false;
      }
      if (Date.now() - pollStart.current > MAX_POLL_MS) {
        setPollTimedOut(true);
        return false;
      }
      return POLL_INTERVAL_MS;
    },
    retry: 2,
  });

  const effectivePayment = paymentStatus ?? latestPayment;

  const handleRetryPoll = useCallback(() => {
    pollStart.current = Date.now();
    setPollTimedOut(false);
    if (canPollById) refetch();
    else refetchLatest();
  }, [canPollById, refetch, refetchLatest]);

  const handleGoBack = useCallback(() => {
    clearTopUpPendingInfo();
    navigate('/balance', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!pendingInfo && !redirectStatus && !methodFromUrl) {
      navigate('/balance', { replace: true });
    }
  }, [pendingInfo, redirectStatus, methodFromUrl, navigate]);

  const amountKopeks = effectivePayment?.amount_kopeks ?? pendingInfo?.amount_kopeks ?? null;

  const resolvedPaid =
    isRedirectSuccess ||
    effectivePayment?.is_paid ||
    (effectivePayment && isPaidStatus(effectivePayment.status));

  const resolvedFailed =
    isRedirectFailed || (effectivePayment && isFailedStatus(effectivePayment.status));

  useEffect(() => {
    if (cleanedUpRef.current) return;
    if (resolvedPaid) {
      cleanedUpRef.current = true;
      clearTopUpPendingInfo();
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'subscription',
      });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
      refreshUser();
    } else if (resolvedFailed) {
      cleanedUpRef.current = true;
      clearTopUpPendingInfo();
    }
  }, [resolvedPaid, resolvedFailed, queryClient, refreshUser]);

  useEffect(() => {
    if (hapticFiredRef.current) return;
    if (resolvedPaid) {
      hapticFiredRef.current = true;
      haptic.notification('success');
    } else if (resolvedFailed) {
      hapticFiredRef.current = true;
      haptic.notification('error');
    }
  }, [resolvedPaid, resolvedFailed, haptic]);

  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-black px-4 py-8"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl"
        aria-live="polite"
        aria-atomic="true"
      >
        {resolvedPaid ? (
          <SuccessState amountKopeks={amountKopeks} />
        ) : resolvedFailed ? (
          <FailedState amountKopeks={amountKopeks} />
        ) : pollTimedOut ? (
          <TimeoutState onRetry={handleRetryPoll} onGoBack={handleGoBack} />
        ) : (
          <PendingState amountKopeks={amountKopeks} />
        )}
      </div>
    </div>
  );
}
