import { useState, useEffect, type ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock, Check, Loader2 } from 'lucide-react';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/auth';
import { useToast } from '../components/Toast';
import { staggerContainer, staggerItem } from '@/components/motion/transitions';
import { cn } from '@/lib/utils';
import ProviderIcon from '../components/ProviderIcon';
import type { MergeAccountPreview } from '../types';

// ── Cabinet-style primitives ─────────────────────────────────────────────────

function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

function ProviderBadgeIcon({ provider }: { provider: string }) {
  return <ProviderIcon provider={provider} className="h-3.5 w-3.5" />;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const min = Math.floor(clamped / 60);
  const sec = clamped % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatBalance(kopeks: number): string {
  return Math.floor(kopeks / 100).toLocaleString();
}

// ── Radio indicator (cabinet-style) ─────────────────────────────────────────

function RadioIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        selected ? 'border-white bg-white' : 'border-white/25 bg-transparent',
      )}
    >
      {selected && <span className="h-2 w-2 rounded-full bg-black" />}
    </span>
  );
}

// ── Account card ────────────────────────────────────────────────────────────

interface AccountCardProps {
  account: MergeAccountPreview;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  showRadio: boolean;
}

function AccountCard({ account, label, isSelected, onSelect, showRadio }: AccountCardProps) {
  const { t } = useTranslation();

  return (
    <GlassCard
      className={cn(
        'p-6 transition-colors',
        isSelected && showRadio && 'border-white/30 bg-white/[0.06]',
      )}
    >
      <h2
        className="mb-5 text-white"
        style={{ fontSize: '1.15rem', fontWeight: 600, letterSpacing: '-0.01em' }}
      >
        {label}
      </h2>

      <div className="space-y-5">
        {/* Auth methods */}
        <div>
          <p className="mb-2 text-[13px] text-white/30">{t('merge.authMethods')}:</p>
          <div className="flex flex-wrap gap-2">
            {account.auth_methods.map((method) => (
              <span
                key={method}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[13px] text-white/65"
                style={{ fontWeight: 500 }}
              >
                <ProviderBadgeIcon provider={method} />
                {t(`profile.accounts.providers.${method}`)}
              </span>
            ))}
          </div>
        </div>

        {/* Subscription */}
        {account.subscription ? (
          <div className="space-y-1">
            <p className="text-[13px] text-white/30">{t('merge.subscription')}:</p>
            <p className="text-[15px] text-white/85" style={{ fontWeight: 500 }}>
              {account.subscription.tariff_name ?? account.subscription.status}
            </p>
            {account.subscription.end_date && (
              <p className="text-[13px] text-white/40">
                {t('merge.until', { date: formatDate(account.subscription.end_date) })}
              </p>
            )}
            <p className="text-[13px] text-white/40">
              {t('merge.traffic')}: {account.subscription.traffic_limit_gb} GB, {t('merge.devices')}
              : {account.subscription.device_limit}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[13px] text-white/30">{t('merge.subscription')}:</p>
            <p className="text-[13px] text-white/30">{t('merge.noSubscription')}</p>
          </div>
        )}

        {/* Balance */}
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] text-white/30">{t('merge.balance')}:</span>
          <span className="text-[15px] text-white/85" style={{ fontWeight: 500 }}>
            {formatBalance(account.balance_kopeks)} ₽
          </span>
        </div>

        {/* Radio selection (only shown when both accounts have subscriptions) */}
        {showRadio && account.subscription && (
          <button
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={onSelect}
            className={cn(
              'mt-1 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
              isSelected
                ? 'border-white/15 bg-white/[0.06]'
                : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
            )}
          >
            <RadioIndicator selected={isSelected} />
            <span className="text-[15px] text-white/75">{t('merge.keepThisSubscription')}</span>
          </button>
        )}
      </div>
    </GlassCard>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <motion.div
      className="mx-auto max-w-xl space-y-5"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={staggerItem}>
        <GlassCard className="p-6">
          <div className="space-y-3">
            <div className="h-6 w-48 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-4 w-72 animate-pulse rounded bg-white/[0.04]" />
          </div>
        </GlassCard>
      </motion.div>

      {Array.from({ length: 2 }).map((_, i) => (
        <motion.div key={i} variants={staggerItem}>
          <GlassCard className="p-6">
            <div className="space-y-4">
              <div className="h-5 w-44 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-4 w-64 animate-pulse rounded bg-white/[0.04]" />
              <div className="h-4 w-48 animate-pulse rounded bg-white/[0.04]" />
              <div className="h-4 w-32 animate-pulse rounded bg-white/[0.04]" />
            </div>
          </GlassCard>
        </motion.div>
      ))}

      <motion.div variants={staggerItem}>
        <div className="h-12 w-full animate-pulse rounded-full bg-white/[0.06]" />
      </motion.div>
    </motion.div>
  );
}

// ── Centered status (expired / error) ────────────────────────────────────────

function CenteredStatus({ variant, message }: { variant: 'warning' | 'error'; message: string }) {
  const { t } = useTranslation();
  const isWarning = variant === 'warning';

  return (
    <motion.div
      className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 px-4"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={staggerItem}>
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full border',
            isWarning
              ? 'border-amber-400/30 bg-amber-400/[0.08]'
              : 'border-red-400/30 bg-red-400/[0.08]',
          )}
        >
          {isWarning ? (
            <Clock size={28} className="text-amber-400/85" strokeWidth={1.75} />
          ) : (
            <AlertTriangle size={28} className="text-red-400/85" strokeWidth={1.75} />
          )}
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="text-center">
        <p className="text-[17px] text-white/85" style={{ fontWeight: 500 }}>
          {message}
        </p>
      </motion.div>

      <motion.div variants={staggerItem}>
        <Link
          to="/profile/accounts"
          className="text-[15px] text-white/45 transition-colors hover:text-white/75"
        >
          {t('profile.accounts.goToAccounts')}
        </Link>
      </motion.div>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function MergeAccounts() {
  const { t } = useTranslation();
  const { mergeToken } = useParams<{ mergeToken: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [expiresIn, setExpiresIn] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  // Fetch merge preview (no auth required)
  const { data, isLoading, error } = useQuery({
    queryKey: ['merge-preview', mergeToken],
    queryFn: () => {
      if (!mergeToken) return Promise.reject(new Error('Missing merge token'));
      return authApi.getMergePreview(mergeToken);
    },
    enabled: !!mergeToken,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Auto-select subscription when data loads (only once)
  useEffect(() => {
    if (!data) return;
    if (selectedUserId !== null) return;

    const primaryHasSub = !!data.primary.subscription;
    const secondaryHasSub = !!data.secondary.subscription;

    if (primaryHasSub && !secondaryHasSub) {
      setSelectedUserId(data.primary.id);
    } else if (!primaryHasSub && secondaryHasSub) {
      setSelectedUserId(data.secondary.id);
    } else if (!primaryHasSub && !secondaryHasSub) {
      setSelectedUserId(data.primary.id);
    }
    // If both have subs — null until user picks
  }, [data, selectedUserId]);

  // Countdown timer (wall-clock based to avoid drift)
  useEffect(() => {
    if (!data) return;
    const startTime = Date.now();
    const totalSeconds = data.expires_in_seconds;

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = totalSeconds - elapsed;
      if (remaining <= 0) {
        setExpiresIn(0);
        setIsExpired(true);
        clearInterval(interval);
      } else {
        setExpiresIn(remaining);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data]);

  // Execute merge
  const mergeMutation = useMutation({
    mutationFn: () => {
      if (!mergeToken || !selectedUserId) {
        return Promise.reject(new Error('Missing merge token or user selection'));
      }
      return authApi.executeMerge(mergeToken, selectedUserId);
    },
    onSuccess: async (response) => {
      if (!response.success) {
        showToast({ type: 'error', message: t('merge.error') });
        return;
      }

      if (!response.access_token || !response.refresh_token) {
        showToast({ type: 'error', message: t('merge.error') });
        return;
      }

      const { setTokens, setUser, checkAdminStatus } = useAuthStore.getState();
      setTokens(response.access_token, response.refresh_token);
      if (response.user) {
        setUser(response.user);
      }
      try {
        await checkAdminStatus();
      } catch {
        // Non-critical
      }

      queryClient.clear();
      showToast({ type: 'success', message: t('merge.success') });
      navigate('/profile/accounts', { replace: true });
    },
    onError: () => {
      showToast({ type: 'error', message: t('merge.error') });
    },
  });

  const handleMerge = () => {
    if (!selectedUserId || mergeMutation.isPending || isExpired) return;
    mergeMutation.mutate();
  };

  const handleCancel = () => {
    navigate('/profile/accounts', { replace: true });
  };

  // Derived state
  const bothHaveSubscriptions =
    data && !!data.primary.subscription && !!data.secondary.subscription;
  const canConfirm = selectedUserId !== null && !isExpired && !mergeMutation.isPending;
  const combinedBalance = data ? data.primary.balance_kopeks + data.secondary.balance_kopeks : 0;

  // Missing token
  if (!mergeToken) {
    return <CenteredStatus variant="error" message={t('merge.error')} />;
  }

  // Loading
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Fetch error (404 = expired/invalid token)
  if (error || !data) {
    return <CenteredStatus variant="error" message={t('merge.error')} />;
  }

  // Timer expired
  if (isExpired) {
    return <CenteredStatus variant="warning" message={t('merge.expired')} />;
  }

  return (
    <motion.div
      className="mx-auto max-w-xl space-y-5"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Header with warning */}
      <motion.div variants={staggerItem}>
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-6 backdrop-blur-xl">
          <AlertTriangle
            size={22}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-amber-400/85"
          />
          <div>
            <h1
              className="text-white"
              style={{ fontSize: '1.35rem', fontWeight: 600, letterSpacing: '-0.01em' }}
            >
              {t('merge.title')}
            </h1>
            <p className="mt-1.5 text-[14px] text-white/55">{t('merge.description')}</p>
          </div>
        </div>
      </motion.div>

      {/* Subscription choice prompt (when both have subs) */}
      {bothHaveSubscriptions && !selectedUserId && (
        <motion.div variants={staggerItem}>
          <div className="rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-3 backdrop-blur-xl">
            <p className="text-[14px] text-white/75" style={{ fontWeight: 500 }}>
              {t('merge.chooseSubscription')}
            </p>
          </div>
        </motion.div>
      )}

      {/* Account cards */}
      <div
        role={bothHaveSubscriptions ? 'radiogroup' : undefined}
        aria-label={bothHaveSubscriptions ? t('merge.chooseSubscription') : undefined}
        className="space-y-5"
      >
        <motion.div variants={staggerItem}>
          <AccountCard
            account={data.primary}
            label={t('merge.currentAccount')}
            isSelected={selectedUserId === data.primary.id}
            onSelect={() => setSelectedUserId(data.primary.id)}
            showRadio={!!bothHaveSubscriptions}
          />
        </motion.div>

        <motion.div variants={staggerItem}>
          <AccountCard
            account={data.secondary}
            label={t('merge.foundAccount')}
            isSelected={selectedUserId === data.secondary.id}
            onSelect={() => setSelectedUserId(data.secondary.id)}
            showRadio={!!bothHaveSubscriptions}
          />
        </motion.div>
      </div>

      {/* After-merge summary */}
      <motion.div variants={staggerItem}>
        <GlassCard className="p-6">
          <h2
            className="mb-4 text-white"
            style={{ fontSize: '1.05rem', fontWeight: 600, letterSpacing: '-0.01em' }}
          >
            {t('merge.afterMerge')}
          </h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-green-400/30 bg-green-400/[0.08]">
                <Check size={12} strokeWidth={2.5} className="text-green-400/85" />
              </span>
              <span className="text-[14px] text-white/70">{t('merge.allAuthMethodsMerged')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-green-400/30 bg-green-400/[0.08]">
                <Check size={12} strokeWidth={2.5} className="text-green-400/85" />
              </span>
              <span className="text-[14px] text-white/70">
                {t('merge.balanceSummed', { amount: formatBalance(combinedBalance) })}
              </span>
            </li>
            {bothHaveSubscriptions && (
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/[0.08]">
                  <AlertTriangle size={12} strokeWidth={2.25} className="text-amber-400/85" />
                </span>
                <span className="text-[14px] text-white/70">
                  {t('merge.unselectedSubscriptionDeleted')}
                </span>
              </li>
            )}
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-green-400/30 bg-green-400/[0.08]">
                <Check size={12} strokeWidth={2.5} className="text-green-400/85" />
              </span>
              <span className="text-[14px] text-white/70">{t('merge.historyPreserved')}</span>
            </li>
          </ul>
        </GlassCard>
      </motion.div>

      {/* Confirm button (cabinet white pill) */}
      <motion.div variants={staggerItem}>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={handleMerge}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontWeight: 500 }}
        >
          {mergeMutation.isPending && <Loader2 size={14} className="animate-spin" />}
          {mergeMutation.isPending ? t('merge.merging') : t('merge.confirm')}
        </button>
      </motion.div>

      {/* Cancel link */}
      <motion.div variants={staggerItem} className="flex justify-center">
        <button
          type="button"
          onClick={handleCancel}
          className="text-[14px] text-white/40 transition-colors hover:text-white/65"
        >
          {t('merge.cancel')}
        </button>
      </motion.div>

      {/* Countdown timer */}
      <motion.div
        variants={staggerItem}
        className="flex items-center justify-center gap-1.5 pb-6 text-white/30"
      >
        <Clock size={14} strokeWidth={1.75} />
        <span className="text-[13px]">
          {t('merge.expiresIn', { minutes: formatCountdown(expiresIn) })}
        </span>
      </motion.div>
    </motion.div>
  );
}
