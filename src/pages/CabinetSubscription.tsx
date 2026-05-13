import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Check,
  X,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle,
  Gift,
  ChevronRight,
} from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { subscriptionApi } from '@/api/subscription';
import { balanceApi } from '@/api/balance';
import { giftApi } from '@/api/gift';
import { API } from '@/config/constants';
import type { Subscription } from '@/types';

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

function Popup({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0A0A0A]/95 p-7 shadow-2xl shadow-black/50 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>
  );
}

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const planLabelFor = (
  sub: Subscription | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) => {
  if (!sub) return '—';
  if (sub.is_trial) return t('subscriptionPage.planTrial');
  return sub.tariff_name || t('subscriptionPage.planActive');
};

const kopecksToRubles = (k: number) => (k / 100).toFixed(0);

export default function CabinetSubscription() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [copied, setCopied] = useState(false);
  const [giftCopiedToken, setGiftCopiedToken] = useState<string | null>(null);

  // ── Data ────────────────────────────────────────────────────────────
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;
  const subList = multiSubData?.subscriptions ?? [];

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

  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    enabled: isAuthenticated,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });
  const balanceKopeks = balanceData?.balance_kopeks ?? 0;

  const { data: devicesData } = useQuery({
    queryKey: ['devices', subscription?.id],
    queryFn: () => subscriptionApi.getDevices(subscription?.id),
    enabled: isAuthenticated && !!subscription && !isMultiTariff,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });

  const { data: connectionLinkData } = useQuery({
    queryKey: ['connection-link', subscription?.id],
    queryFn: () => subscriptionApi.getConnectionLink(subscription?.id),
    enabled: isAuthenticated && !!subscription && !isMultiTariff,
    retry: false,
    staleTime: 60_000,
  });

  const { data: sentGifts } = useQuery({
    queryKey: ['sent-gifts'],
    queryFn: giftApi.getSentGifts,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: false,
  });

  // ── Traffic refresh (parity с Dashboard / CabinetHome) ─────────────
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

  // ── Devices: delete / buy / reduce ──────────────────────────────────
  const deleteDeviceMutation = useMutation({
    mutationFn: (hwid: string) => subscriptionApi.deleteDevice(hwid, subscription?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', subscription?.id] });
    },
  });

  // Buy popup state
  const [showBuy, setShowBuy] = useState(false);
  const [buyQty, setBuyQty] = useState(1);
  const [buyState, setBuyState] = useState<'idle' | 'insufficient' | 'success'>('idle');

  const { data: buyPriceData } = useQuery({
    queryKey: ['device-price', subscription?.id, buyQty],
    queryFn: () => subscriptionApi.getDevicePrice(buyQty, subscription?.id),
    enabled: showBuy && !!subscription,
  });

  const buyDevicesMutation = useMutation({
    mutationFn: () => subscriptionApi.purchaseDevices(buyQty, subscription?.id),
    onSuccess: () => {
      setBuyState('success');
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['devices', subscription?.id] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
    onError: () => setBuyState('insufficient'),
  });

  // Reduce popup state
  const [showReduce, setShowReduce] = useState(false);
  const [reduceQty, setReduceQty] = useState(1);
  const [reduceState, setReduceState] = useState<'idle' | 'success'>('idle');

  const { data: reductionInfo } = useQuery({
    queryKey: ['device-reduction-info', subscription?.id],
    queryFn: () => subscriptionApi.getDeviceReductionInfo(subscription?.id),
    enabled: showReduce && !!subscription,
  });

  const reduceMutation = useMutation({
    mutationFn: () => {
      const newLimit = Math.max(
        reductionInfo?.min_device_limit ?? 1,
        (subscription?.device_limit ?? 1) - reduceQty,
      );
      return subscriptionApi.reduceDevices(newLimit, subscription?.id);
    },
    onSuccess: () => {
      setReduceState('success');
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['devices', subscription?.id] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
  });

  // ── Layout decisions ────────────────────────────────────────────────
  const isActiveSub =
    !!subscription &&
    !subscription.is_expired &&
    subscription.status !== 'disabled' &&
    !subscription.is_limited;

  const traffic = useMemo(() => {
    if (trafficData) return trafficData;
    if (subscription) {
      return {
        traffic_used_gb: subscription.traffic_used_gb,
        traffic_used_percent: subscription.traffic_used_percent,
        is_unlimited: subscription.traffic_limit_gb === 0,
      };
    }
    return null;
  }, [trafficData, subscription]);

  const showConnectionBlock =
    !!subscription &&
    !subscription.hide_subscription_link &&
    !connectionLinkData?.hide_link &&
    !!(connectionLinkData?.subscription_url || subscription.subscription_url);

  const connectionUrl =
    connectionLinkData?.subscription_url || subscription?.subscription_url || '';

  const copyKey = async () => {
    if (!connectionUrl) return;
    try {
      await navigator.clipboard.writeText(connectionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no-op */
    }
  };

  const copyGiftCode = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setGiftCopiedToken(token);
      setTimeout(() => setGiftCopiedToken(null), 2000);
    } catch {
      /* no-op */
    }
  };

  // ── Multi-tariff: show simple list ─────────────────────────────────
  if (isMultiTariff) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-8 flex items-center justify-between">
          <h1
            className="text-white"
            style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
          >
            {t('subscriptionPage.title')}
          </h1>
          <button
            onClick={() => navigate('/subscription/purchase')}
            className="rounded-full bg-white px-4 py-2 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
            style={{ fontWeight: 500 }}
          >
            {t('subscriptionPage.newPlan')}
          </button>
        </div>

        {subList.length === 0 ? (
          <GlassCard className="p-7 text-center">
            <p className="mb-4 text-[15px] text-white/40">{t('subscriptionPage.noActiveSubs')}</p>
            <button
              onClick={() => navigate('/subscription/purchase')}
              className="rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
              style={{ fontWeight: 500 }}
            >
              {t('subscriptionPage.selectPlan')}
            </button>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {subList.map((sub) => (
              <Link
                key={sub.id}
                to={`/subscriptions/${sub.id}`}
                className="block rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition-all hover:bg-white/[0.06]"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
                    {sub.tariff_name ||
                      (sub.is_trial
                        ? t('subscriptionPage.planTrial')
                        : t('subscriptionPage.subscriptionFallback'))}
                  </span>
                  <ChevronRight size={16} className="text-white/30" />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  <span className="text-white/35">
                    {t('subscriptionPage.activeUntil')}:{' '}
                    <span className="text-white/65">{formatDate(sub.end_date)}</span>
                  </span>
                  <span className="text-white/35">
                    {t('subscriptionPage.devicesLabel')}:{' '}
                    <span className="text-white/65">{sub.device_limit || '∞'}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  // ── Single-tariff main view ────────────────────────────────────────
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
        {t('subscriptionPage.title')}
      </h1>

      <GlassCard className="mb-5 p-7">
        {isActiveSub && subscription ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <span className="text-[15px] text-green-400" style={{ fontWeight: 500 }}>
                  {t('subscriptionPage.subscriptionActive')}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
                <p className="text-white/35">
                  {t('subscriptionPage.activeUntil')}:{' '}
                  <span className="text-white/65">{formatDate(subscription.end_date)}</span>
                </p>
                <p className="text-white/35">
                  {t('subscriptionPage.planLabel')}:{' '}
                  <span className="text-white/65">{planLabelFor(subscription, t)}</span>
                </p>
                <p className="text-white/35">
                  {t('subscriptionPage.devicesLabel')}:{' '}
                  <span className="text-white/65">
                    {t('subscriptionPage.devicesOf', {
                      used: devicesData?.total ?? 0,
                      total: subscription.device_limit || '∞',
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
                {t('subscriptionPage.renew')}
              </button>
              <button
                onClick={() => navigate('/gifts?action=new')}
                className="flex items-center justify-center gap-1.5 rounded-full border border-white/15 px-6 py-3 text-[15px] text-white/60 transition-colors hover:bg-white/[0.05]"
                style={{ fontWeight: 500 }}
              >
                <Gift size={14} /> {t('subscriptionPage.giftSubscription')}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="mb-4 text-[15px] text-white/40">
              {subscription?.is_expired
                ? t('subscriptionPage.expired')
                : subscription?.is_limited
                  ? t('subscriptionPage.limited')
                  : t('subscriptionPage.noActive')}
            </p>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => navigate('/subscription/purchase')}
                className="w-full rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] sm:w-auto sm:min-w-[220px]"
                style={{ fontWeight: 500 }}
              >
                {subscription ? t('subscriptionPage.renew') : t('subscriptionPage.selectPlan')}
              </button>
              {(subscription || (trialInfo && !trialInfo.is_available)) && (
                <button
                  onClick={() => navigate('/gifts?action=new')}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/15 px-6 py-3 text-[15px] text-white/60 transition-colors hover:bg-white/[0.05] sm:w-auto sm:min-w-[220px]"
                  style={{ fontWeight: 500 }}
                >
                  <Gift size={14} /> {t('subscriptionPage.giftSubscription')}
                </button>
              )}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Traffic + Connection + Devices — only for active sub */}
      {isActiveSub && subscription && (
        <>
          {traffic && (
            <GlassCard className="mb-5 p-7">
              <div className="mb-3 flex items-center justify-between">
                <p
                  className="text-[13px] text-white/40"
                  style={{ fontWeight: 500, letterSpacing: '0.05em' }}
                >
                  {t('subscriptionPage.trafficHeader')}
                </p>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[13px] text-white/50">
                  {traffic.is_unlimited
                    ? t('subscription.unlimited')
                    : t('subscriptionPage.trafficUsage', {
                        used: traffic.traffic_used_gb.toFixed(1),
                        total: subscription.traffic_limit_gb,
                      })}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
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
                  className="mt-3 text-[13px] text-white/35 transition-colors hover:text-white/55 disabled:opacity-40"
                >
                  {refreshTrafficMutation.isPending
                    ? t('subscriptionPage.trafficRefreshing')
                    : trafficCooldown > 0
                      ? t('subscriptionPage.trafficRefreshIn', { seconds: trafficCooldown })
                      : t('subscriptionPage.trafficRefresh')}
                </button>
              )}
            </GlassCard>
          )}

          {showConnectionBlock && (
            <GlassCard className="mb-5 p-7">
              <p
                className="mb-3 text-[13px] text-white/40"
                style={{ fontWeight: 500, letterSpacing: '0.05em' }}
              >
                {t('subscriptionPage.connectionHeader')}
              </p>
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                <span className="flex-1 truncate font-mono text-[15px] text-white/40">
                  {connectionUrl}
                </span>
                <button
                  onClick={copyKey}
                  className="shrink-0 text-white/25 transition-colors hover:text-white/50"
                  aria-label={t('subscriptionPage.copyLink')}
                >
                  {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                </button>
              </div>
              <button
                onClick={() => navigate('/connection')}
                className="w-full rounded-full border border-white/15 py-3 text-[15px] text-white/60 transition-colors hover:bg-white/[0.05]"
                style={{ fontWeight: 500 }}
              >
                {t('subscriptionPage.connect')}
              </button>
            </GlassCard>
          )}

          <GlassCard className="p-7">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p
                  className="text-[13px] text-white/40"
                  style={{ fontWeight: 500, letterSpacing: '0.05em' }}
                >
                  {t('subscriptionPage.devicesHeader')}
                </p>
                <p className="mt-1 text-[13px] text-white/25">
                  {t('subscriptionPage.devicesOf', {
                    used: devicesData?.total ?? 0,
                    total: subscription.device_limit || '∞',
                  })}
                </p>
              </div>
            </div>

            {devicesData && devicesData.devices.length > 0 ? (
              <div className="mb-4 space-y-2">
                {devicesData.devices.map((d) => (
                  <div
                    key={d.hwid}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-3"
                  >
                    <div>
                      <p className="text-[15px] text-white/60">{d.device_model || d.hwid}</p>
                      <p className="text-[13px] text-white/25">{d.platform}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(t('subscriptionPage.deleteDevicePrompt'))) {
                          deleteDeviceMutation.mutate(d.hwid);
                        }
                      }}
                      disabled={deleteDeviceMutation.isPending}
                      className="text-white/20 transition-colors hover:text-red-400/70 disabled:opacity-40"
                      aria-label={t('subscriptionPage.deleteDeviceLabel')}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-[13px] text-white/30">{t('subscriptionPage.noDevicesYet')}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setBuyQty(1);
                  setBuyState('idle');
                  setShowBuy(true);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] py-2.5 text-[15px] text-white/50 transition-colors hover:bg-white/[0.04]"
              >
                <Plus size={14} /> {t('subscriptionPage.buyDevicesShort')}
              </button>
              <button
                onClick={() => {
                  setReduceQty(1);
                  setReduceState('idle');
                  setShowReduce(true);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] py-2.5 text-[15px] text-white/50 transition-colors hover:bg-white/[0.04]"
              >
                <Minus size={14} /> {t('subscriptionPage.reduceDevicesShort')}
              </button>
            </div>
          </GlassCard>
        </>
      )}

      {/* Мои подарки — реальный список из getSentGifts */}
      <GlassCard className="mt-4 p-7">
        <p
          className="mb-4 text-[13px] text-white/40"
          style={{ fontWeight: 500, letterSpacing: '0.05em' }}
        >
          {t('subscriptionPage.giftsHeader')}
        </p>
        {!sentGifts || sentGifts.length === 0 ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06]">
              <Gift size={20} className="text-white/40" />
            </div>
            <p className="mb-1.5 text-[15px] text-white/55" style={{ fontWeight: 500 }}>
              {t('subscriptionPage.giftsEmptyTitle')}
            </p>
            <p className="text-[13px] text-white/30" style={{ lineHeight: 1.6 }}>
              {t('subscriptionPage.giftsEmptyHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sentGifts.map((gift) => {
              const isAvailable = gift.status === 'paid' || gift.status === 'pending_activation';
              return (
                <div
                  key={gift.token}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.04] p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <p className="break-all font-mono text-[15px] text-white/70">{gift.token}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                        isAvailable
                          ? 'bg-green-500/10 text-green-400/70'
                          : 'bg-white/[0.08] text-white/40'
                      }`}
                    >
                      {isAvailable
                        ? t('subscriptionPage.giftAvailable')
                        : t('subscriptionPage.giftActivated')}
                    </span>
                  </div>
                  <div className="mb-4 space-y-1 text-[13px]">
                    <div className="flex justify-between">
                      <span className="text-white/35">{t('subscriptionPage.giftPlan')}</span>
                      <span className="text-white/60">{gift.tariff_name || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/35">{t('subscriptionPage.giftDuration')}</span>
                      <span className="text-white/60">
                        {t('subscriptionPage.giftDurationDays', { days: gift.period_days })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/35">{t('subscriptionPage.giftDevices')}</span>
                      <span className="text-white/60">
                        {t('subscriptionPage.giftDevicesUpTo', {
                          count: gift.device_limit || '∞',
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/35">
                        {t('subscriptionPage.giftPurchaseDate')}
                      </span>
                      <span className="text-white/60">{formatDate(gift.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyGiftCode(gift.token)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] py-2 text-[13px] text-white/50 transition-colors hover:bg-white/[0.04]"
                    >
                      {giftCopiedToken === gift.token ? (
                        <>
                          <Check size={12} className="text-green-400" />{' '}
                          {t('subscriptionPage.copied')}
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> {t('subscriptionPage.copyLink')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Buy devices popup */}
      <AnimatePresence>
        {showBuy && subscription && (
          <Popup onClose={() => setShowBuy(false)}>
            {buyState === 'idle' && (
              <>
                <h3 className="mb-5 text-[15px] text-white" style={{ fontWeight: 600 }}>
                  {t('subscriptionPage.buyDevicesTitle')}
                </h3>
                <div className="mb-5 flex items-center justify-center gap-4">
                  <button
                    onClick={() => setBuyQty(Math.max(1, buyQty - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] text-white/40 transition-colors hover:bg-white/[0.05]"
                  >
                    <Minus size={16} />
                  </button>
                  <span
                    className="w-8 text-center text-white"
                    style={{ fontSize: '1.5rem', fontWeight: 600 }}
                  >
                    {buyQty}
                  </span>
                  <button
                    onClick={() => setBuyQty(buyQty + 1)}
                    disabled={!!buyPriceData?.can_add && buyQty >= buyPriceData.can_add}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] text-white/40 transition-colors hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="mb-5 space-y-2 text-[15px]">
                  <div className="flex justify-between">
                    <span className="text-white/35">{t('subscriptionPage.willBeAdded')}</span>
                    <span className="text-white/60">
                      {t('subscriptionPage.devicesShort', { count: buyQty })}
                    </span>
                  </div>
                  {buyPriceData?.total_price_label && (
                    <div className="flex justify-between">
                      <span className="text-white/35">{t('subscriptionPage.cost')}</span>
                      <span className="text-white/60">{buyPriceData.total_price_label}</span>
                    </div>
                  )}
                  {buyPriceData?.current_device_limit !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-white/35">{t('subscriptionPage.devicesAfter')}</span>
                      <span className="text-white/60">
                        {(buyPriceData.current_device_limit ?? 0) + buyQty}
                      </span>
                    </div>
                  )}
                </div>
                {buyPriceData?.available === false && (
                  <p className="mb-3 text-[13px] text-amber-400/70">
                    {buyPriceData.reason || t('subscriptionPage.purchaseUnavailable')}
                  </p>
                )}
                <button
                  onClick={() => {
                    if (
                      buyPriceData?.total_price_kopeks !== undefined &&
                      buyPriceData.total_price_kopeks > balanceKopeks
                    ) {
                      setBuyState('insufficient');
                      return;
                    }
                    buyDevicesMutation.mutate();
                  }}
                  disabled={buyPriceData?.available === false || buyDevicesMutation.isPending}
                  className="mb-2 w-full rounded-full bg-white py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-50"
                  style={{ fontWeight: 500 }}
                >
                  {buyDevicesMutation.isPending
                    ? t('subscriptionPage.processing')
                    : t('subscriptionPage.confirmPurchase')}
                </button>
                <button
                  onClick={() => setShowBuy(false)}
                  className="w-full rounded-full border border-white/[0.08] py-2 text-[13px] text-white/40 transition-colors hover:bg-white/[0.04]"
                >
                  {t('common.cancel')}
                </button>
              </>
            )}
            {buyState === 'insufficient' && (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-400/70" />
                  <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    {t('subscriptionPage.insufficientFunds')}
                  </h3>
                </div>
                <p className="mb-5 text-[15px] text-white/35">
                  {t('subscriptionPage.insufficientHint', {
                    amount:
                      buyPriceData?.total_price_kopeks !== undefined
                        ? kopecksToRubles(
                            Math.max(0, buyPriceData.total_price_kopeks - balanceKopeks),
                          )
                        : '',
                    currency: '₽',
                  })}
                </p>
                <button
                  onClick={() => {
                    setShowBuy(false);
                    navigate('/balance');
                  }}
                  className="mb-2 w-full rounded-full bg-white py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                  style={{ fontWeight: 500 }}
                >
                  {t('subscriptionPage.topUpBalance')}
                </button>
                <button
                  onClick={() => setShowBuy(false)}
                  className="w-full rounded-full border border-white/[0.08] py-3 text-[15px] text-white/50 transition-colors hover:bg-white/[0.04]"
                >
                  {t('common.close')}
                </button>
              </>
            )}
            {buyState === 'success' && (
              <>
                <div className="mb-4 text-center">
                  <CheckCircle size={28} className="mx-auto mb-3 text-green-400/60" />
                  <h3 className="mb-2 text-[15px] text-white" style={{ fontWeight: 600 }}>
                    {t('subscriptionPage.devicesAdded')}
                  </h3>
                </div>
                <button
                  onClick={() => setShowBuy(false)}
                  className="w-full rounded-full bg-white py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                  style={{ fontWeight: 500 }}
                >
                  {t('subscriptionPage.done')}
                </button>
              </>
            )}
          </Popup>
        )}
      </AnimatePresence>

      {/* Reduce devices popup */}
      <AnimatePresence>
        {showReduce && subscription && (
          <Popup onClose={() => setShowReduce(false)}>
            {reduceState === 'idle' && (
              <>
                <h3 className="mb-5 text-[15px] text-white" style={{ fontWeight: 600 }}>
                  {t('subscriptionPage.reduceDevicesTitle')}
                </h3>
                {reductionInfo?.available === false ? (
                  <>
                    <p className="mb-5 text-[15px] text-white/35">
                      {reductionInfo.reason || t('subscriptionPage.reduceUnavailable')}
                    </p>
                    <button
                      onClick={() => setShowReduce(false)}
                      className="w-full rounded-full border border-white/[0.08] py-3 text-[15px] text-white/50 transition-colors hover:bg-white/[0.04]"
                    >
                      {t('common.close')}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mb-5 flex items-center justify-center gap-4">
                      <button
                        onClick={() => setReduceQty(Math.max(1, reduceQty - 1))}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] text-white/40 transition-colors hover:bg-white/[0.05]"
                      >
                        <Minus size={16} />
                      </button>
                      <span
                        className="w-8 text-center text-white"
                        style={{ fontSize: '1.5rem', fontWeight: 600 }}
                      >
                        {reduceQty}
                      </span>
                      <button
                        onClick={() =>
                          setReduceQty(Math.min(reductionInfo?.can_reduce ?? 1, reduceQty + 1))
                        }
                        disabled={!reductionInfo || reduceQty >= (reductionInfo.can_reduce ?? 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] text-white/40 transition-colors hover:bg-white/[0.05] disabled:opacity-40"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="mb-5 space-y-2 text-[15px]">
                      <div className="flex justify-between">
                        <span className="text-white/35">{t('subscriptionPage.willBeRemoved')}</span>
                        <span className="text-white/60">
                          {t('subscriptionPage.devicesShort', { count: reduceQty })}
                        </span>
                      </div>
                      {reductionInfo && (
                        <div className="flex justify-between">
                          <span className="text-white/35">
                            {t('subscriptionPage.devicesAfter')}
                          </span>
                          <span className="text-white/60">
                            {(reductionInfo.current_device_limit ?? 0) - reduceQty}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => reduceMutation.mutate()}
                        disabled={reduceMutation.isPending}
                        className="flex-1 rounded-full bg-white py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-50"
                        style={{ fontWeight: 500 }}
                      >
                        {reduceMutation.isPending
                          ? t('subscriptionPage.applying')
                          : t('common.confirm')}
                      </button>
                      <button
                        onClick={() => setShowReduce(false)}
                        className="flex-1 rounded-full border border-white/[0.08] py-3 text-[15px] text-white/50 transition-colors hover:bg-white/[0.04]"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {reduceState === 'success' && (
              <>
                <div className="mb-4 text-center">
                  <CheckCircle size={28} className="mx-auto mb-3 text-green-400/60" />
                  <h3 className="mb-2 text-[15px] text-white" style={{ fontWeight: 600 }}>
                    {t('subscriptionPage.devicesReduced')}
                  </h3>
                </div>
                <button
                  onClick={() => setShowReduce(false)}
                  className="w-full rounded-full bg-white py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                  style={{ fontWeight: 500 }}
                >
                  {t('subscriptionPage.done')}
                </button>
              </>
            )}
          </Popup>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
