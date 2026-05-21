import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Copy, Check, ChevronRight, Zap, AlertCircle, Gift } from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { subscriptionApi } from '@/api/subscription';
import { balanceApi } from '@/api/balance';
import { referralApi } from '@/api/referral';
import { giftApi } from '@/api/gift';
import { useBranding } from '@/hooks/useBranding';
import { API } from '@/config/constants';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
}

function GlassCard({ children, className = '' }: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

const planLabelFor = (
  subscription: { is_trial?: boolean; tariff_name?: string | null } | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) => {
  if (!subscription) return '—';
  if (subscription.is_trial) return t('dashboard.home.planTrial');
  return subscription.tariff_name || t('dashboard.home.planActive');
};

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function CabinetHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const { appName } = useBranding();

  const [copied, setCopied] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);

  // Refresh user once on mount (parity с Dashboard)
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Multi-tariff awareness — если включён мульти-тариф, отправляем юзера в /subscriptions
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;

  // Single-tariff subscription
  const { data: subscriptionResponse, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionApi.getSubscription(),
    retry: false,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
    enabled: isAuthenticated && !isMultiTariff,
  });
  const subscription = subscriptionResponse?.subscription ?? null;
  const hasNoSubscription = subscriptionResponse?.has_subscription === false && !subLoading;

  const { data: trialInfo } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: isAuthenticated && hasNoSubscription,
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: () => subscriptionApi.getDevices(),
    enabled: isAuthenticated && !!subscription && !isMultiTariff,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });

  // Balance — pin to header pill in shell, also used for trial status
  useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    enabled: isAuthenticated,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });

  // Referral teaser — for the bottom card
  useQuery({
    queryKey: ['referral-info'],
    queryFn: referralApi.getReferralInfo,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Pending gifts (small banner if any)
  const { data: pendingGifts } = useQuery({
    queryKey: ['pending-gifts'],
    queryFn: giftApi.getPendingGifts,
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: false,
  });

  // Traffic refresh (auto on mount with caching, like Dashboard.tsx)
  const [trafficData, setTrafficData] = useState<{
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
  } | null>(null);
  const [trafficCooldown, setTrafficCooldown] = useState(0);

  const refreshTrafficMutation = useMutation({
    mutationFn: () => subscriptionApi.refreshTraffic(subscription?.id),
    onSuccess: (data) => {
      setTrafficData({
        traffic_used_gb: data.traffic_used_gb,
        traffic_used_percent: data.traffic_used_percent,
        is_unlimited: data.is_unlimited,
      });
      localStorage.setItem(
        `traffic_refresh_ts_${subscription?.id ?? 'default'}`,
        Date.now().toString(),
      );
      setTrafficCooldown(
        data.rate_limited && data.retry_after_seconds ? data.retry_after_seconds : 30,
      );
      queryClient.invalidateQueries({ queryKey: ['subscription', subscription?.id] });
    },
    onError: (error: {
      response?: { status?: number; headers?: { get?: (k: string) => string } };
    }) => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers?.get?.('Retry-After');
        setTrafficCooldown(retryAfter ? parseInt(retryAfter, 10) : 30);
      }
    },
  });

  useEffect(() => {
    if (trafficCooldown <= 0) return;
    const timer = setInterval(() => setTrafficCooldown((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(timer);
  }, [trafficCooldown]);

  const hasAutoRefreshed = useRef(false);
  useEffect(() => {
    if (!subscription || hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;
    const last = localStorage.getItem(`traffic_refresh_ts_${subscription.id ?? 'default'}`);
    const now = Date.now();
    const cacheMs = API.TRAFFIC_CACHE_MS;
    if (last && now - parseInt(last, 10) < cacheMs) {
      const remaining = Math.ceil((cacheMs - (now - parseInt(last, 10))) / 1000);
      if (remaining > 0) setTrafficCooldown(remaining);
      return;
    }
    refreshTrafficMutation.mutate();
  }, [subscription, refreshTrafficMutation]);

  const activateTrialMutation = useMutation({
    mutationFn: () => subscriptionApi.activateTrial(),
    onSuccess: () => {
      setTrialError(null);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['trial-info'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      refreshUser();
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      setTrialError(error.response?.data?.detail || t('common.error', 'Произошла ошибка'));
    },
  });

  // === Layout decisions ===
  const isInactiveSub =
    !!subscription &&
    (subscription.is_expired ||
      subscription.status === 'disabled' ||
      subscription.is_limited === true);
  const isActiveSub = !!subscription && !isInactiveSub;
  const noSubFresh = hasNoSubscription && (trialInfo?.is_available ?? true);
  const noSubTrialUsed = hasNoSubscription && trialInfo && !trialInfo.is_available;

  // For multi-tariff users — redirect them to subscriptions list visually
  if (isMultiTariff) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1
          className="mb-8 text-white"
          style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('dashboard.home.title')}
        </h1>
        <GlassCard className="mb-5 p-7">
          <p className="mb-4 text-[15px] text-white/45">{t('dashboard.home.multiTariffMessage')}</p>
          <Link
            to="/subscriptions"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
            style={{ fontWeight: 500 }}
          >
            {t('dashboard.home.gotoSubscriptions')} <ChevronRight size={16} />
          </Link>
        </GlassCard>
      </motion.div>
    );
  }

  const traffic =
    trafficData ??
    (subscription
      ? {
          traffic_used_gb: subscription.traffic_used_gb,
          traffic_used_percent: subscription.traffic_used_percent,
          is_unlimited: subscription.traffic_limit_gb === 0,
        }
      : null);

  const copyKey = async () => {
    if (!subscription?.subscription_url) return;
    try {
      await navigator.clipboard.writeText(subscription.subscription_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no-op */
    }
  };

  const totalDevices = subscription?.device_limit ?? 0;
  const usedDevices = devicesData?.total ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h1
        className="mb-8 text-white"
        style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        {t('dashboard.home.title')}
      </h1>

      {/* Pending gifts banner */}
      {pendingGifts && pendingGifts.length > 0 && (
        <GlassCard className="mb-5 p-7">
          <div className="mb-2 flex items-center gap-2">
            <Gift size={18} className="text-white/60" />
            <span className="text-[15px] text-white/75" style={{ fontWeight: 500 }}>
              {t('dashboard.home.pendingGifts', { count: pendingGifts.length })}
            </span>
          </div>
          <Link
            to="/gift/result"
            className="inline-flex items-center gap-1.5 text-[15px] text-white/60 transition-colors hover:text-white/85"
          >
            {t('dashboard.home.viewGift')} <ChevronRight size={16} />
          </Link>
        </GlassCard>
      )}

      {/* No subscription, trial available */}
      {noSubFresh && (
        <GlassCard className="mb-5 p-7">
          <div className="mb-2 flex items-center gap-2">
            <Zap size={18} className="text-white/45" />
            <span className="text-[15px] text-white/65" style={{ fontWeight: 500 }}>
              {t('dashboard.home.welcomeBrand', { brand: `${appName ?? 'ВЕРНО'} VPN` })}
            </span>
          </div>
          <p className="mb-4 text-[15px] text-white/40">
            {trialInfo
              ? t('dashboard.home.trialOffer', {
                  days: trialInfo.duration_days,
                  traffic:
                    trialInfo.traffic_limit_gb === 0
                      ? t('dashboard.home.trialUnlimited')
                      : t('dashboard.home.trialTraffic', { amount: trialInfo.traffic_limit_gb }),
                  devices: trialInfo.device_limit,
                })
              : t('dashboard.home.trialOfferShort')}
          </p>
          {trialError && <p className="mb-3 text-[15px] text-red-400/80">{trialError}</p>}
          <button
            onClick={() => activateTrialMutation.mutate()}
            disabled={activateTrialMutation.isPending}
            className="rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-50"
            style={{ fontWeight: 500 }}
          >
            {activateTrialMutation.isPending
              ? t('dashboard.home.activating')
              : t('dashboard.home.activateTrial')}
          </button>
        </GlassCard>
      )}

      {/* No subscription, trial used */}
      {noSubTrialUsed && (
        <GlassCard className="mb-5 p-7">
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle size={18} className="text-white/35" />
            <span className="text-[15px] text-white/45" style={{ fontWeight: 500 }}>
              {t('dashboard.home.noSubscription')}
            </span>
          </div>
          <p className="mb-4 text-[15px] text-white/35">{t('dashboard.home.trialUsed')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => navigate('/subscriptions/renew')}
              className="rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
              style={{ fontWeight: 500 }}
            >
              {t('dashboard.home.selectPlan')}
            </button>
            <button
              onClick={() => navigate('/gifts?action=new')}
              className="flex items-center justify-center gap-1.5 rounded-full border border-white/15 px-6 py-3 text-[15px] text-white/65 transition-colors hover:bg-white/[0.05]"
              style={{ fontWeight: 500 }}
            >
              <Gift size={16} /> {t('dashboard.home.giftSubscription')}
            </button>
          </div>
        </GlassCard>
      )}

      {/* Subscription expired / disabled / limited */}
      {isInactiveSub && subscription && (
        <GlassCard className="mb-5 p-7">
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle size={18} className="text-white/35" />
            <span className="text-[15px] text-white/45" style={{ fontWeight: 500 }}>
              {subscription.is_limited
                ? t('subscriptionPage.limited')
                : t('dashboard.home.noSubscription')}
            </span>
          </div>
          <p className="mb-4 text-[15px] text-white/35">
            {subscription.is_trial
              ? t('dashboard.home.trialUsed')
              : t('dashboard.expired.paidSubtitle')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() =>
                subscription.is_trial
                  ? navigate('/subscriptions/renew')
                  : navigate(`/subscriptions/${subscription.id}/renew`)
              }
              className="rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
              style={{ fontWeight: 500 }}
            >
              {subscription.is_trial ? t('dashboard.home.selectPlan') : t('dashboard.home.renew')}
            </button>
            <button
              onClick={() => navigate('/gifts?action=new')}
              className="flex items-center justify-center gap-1.5 rounded-full border border-white/15 px-6 py-3 text-[15px] text-white/65 transition-colors hover:bg-white/[0.05]"
              style={{ fontWeight: 500 }}
            >
              <Gift size={16} /> {t('dashboard.home.giftSubscription')}
            </button>
          </div>
        </GlassCard>
      )}

      {/* Active subscription */}
      {isActiveSub && subscription && (
        <>
          <GlassCard className="mb-5 p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="text-[15px] text-green-400" style={{ fontWeight: 500 }}>
                    {t('dashboard.home.subscriptionActive')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
                  <p className="text-white/40">
                    {t('dashboard.home.planLabel')}:{' '}
                    <span className="text-white/70">{planLabelFor(subscription, t)}</span>
                  </p>
                  <p className="text-white/40">
                    {t('dashboard.home.activeUntil')}:{' '}
                    <span className="text-white/70">{formatDate(subscription.end_date)}</span>
                  </p>
                  <p className="text-white/40">
                    {t('dashboard.home.devicesLabel')}:{' '}
                    <span className="text-white/70">
                      {t('dashboard.home.devicesOf', {
                        used: usedDevices,
                        total: totalDevices || '∞',
                      })}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
                <button
                  onClick={() => navigate(`/subscriptions/${subscription.id}/renew`)}
                  className="rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                  style={{ fontWeight: 500 }}
                >
                  {t('dashboard.home.renew')}
                </button>
                <button
                  onClick={() => navigate('/gifts?action=new')}
                  className="flex items-center justify-center gap-1.5 rounded-full border border-white/15 px-6 py-3 text-[15px] text-white/65 transition-colors hover:bg-white/[0.05]"
                  style={{ fontWeight: 500 }}
                >
                  <Gift size={16} /> {t('dashboard.home.giftSubscription')}
                </button>
              </div>
            </div>
          </GlassCard>

          {/* Traffic */}
          {traffic && (
            <GlassCard className="mb-5 p-7">
              <div className="mb-3 flex items-center justify-between">
                <p
                  className="text-[13px] text-white/45"
                  style={{ fontWeight: 500, letterSpacing: '0.05em' }}
                >
                  {t('dashboard.home.trafficHeader')}
                </p>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[13px] text-white/55">
                  {traffic.is_unlimited
                    ? t('subscription.unlimited')
                    : t('dashboard.home.trafficUsage', {
                        used: traffic.traffic_used_gb.toFixed(1),
                        total: subscription.traffic_limit_gb,
                      })}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-white/15 to-white/30"
                  style={{
                    width: traffic.is_unlimited
                      ? '100%'
                      : `${Math.min(100, Math.max(0, traffic.traffic_used_percent))}%`,
                  }}
                />
              </div>
              {!traffic.is_unlimited && (
                <button
                  onClick={() => refreshTrafficMutation.mutate()}
                  disabled={trafficCooldown > 0 || refreshTrafficMutation.isPending}
                  className="mt-3 text-[13px] text-white/40 transition-colors hover:text-white/60 disabled:opacity-40"
                >
                  {refreshTrafficMutation.isPending
                    ? t('dashboard.home.trafficRefreshing')
                    : trafficCooldown > 0
                      ? t('dashboard.home.trafficRefreshIn', { seconds: trafficCooldown })
                      : t('dashboard.home.trafficRefresh')}
                </button>
              )}
            </GlassCard>
          )}

          {/* Connection key */}
          {subscription.subscription_url && !subscription.hide_subscription_link && (
            <GlassCard className="mb-5 p-7">
              <p
                className="mb-3 text-[13px] text-white/45"
                style={{ fontWeight: 500, letterSpacing: '0.05em' }}
              >
                {t('dashboard.home.connectionHeader')}
              </p>
              <button
                type="button"
                onClick={copyKey}
                aria-label={t('dashboard.home.copyLink')}
                className="group mb-3 flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.06] active:bg-white/[0.08]"
              >
                <span className="flex-1 truncate font-mono text-[15px] text-white/45 group-hover:text-white/65">
                  {subscription.subscription_url}
                </span>
                <span className="shrink-0 text-white/30 transition-colors group-hover:text-white/55">
                  {copied ? <Check size={17} className="text-green-400" /> : <Copy size={17} />}
                </span>
              </button>
              <button
                onClick={() => navigate('/connection')}
                className="w-full rounded-full border border-white/15 py-3.5 text-[15px] text-white/65 transition-colors hover:bg-white/[0.05]"
                style={{ fontWeight: 500 }}
              >
                {t('dashboard.home.connect')}
              </button>
            </GlassCard>
          )}
        </>
      )}

      {/* Compact referral */}
      <GlassCard className="p-7">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] text-white" style={{ fontWeight: 500 }}>
            {t('dashboard.home.referralTitle')}
          </h3>
          <Link
            to="/referral"
            className="flex items-center gap-1 text-[13px] text-white/30 transition-colors hover:text-white/50"
          >
            {t('dashboard.home.details')} <ChevronRight size={16} />
          </Link>
        </div>
        <p className="mt-2 text-[13px] text-white/30">{t('dashboard.home.referralHint')}</p>
      </GlassCard>
    </motion.div>
  );
}
