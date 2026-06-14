import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Gift, AlertTriangle } from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { giftApi } from '@/api/gift';
import type {
  GiftTariff,
  GiftTariffPeriod,
  GiftPaymentMethod,
  GiftPurchaseRequest,
  SentGift,
  ReceivedGift,
} from '@/api/gift';
import { brandingApi, type TelegramWidgetConfig } from '@/api/branding';
import { copyToClipboard } from '@/utils/clipboard';
import { buildGiftLinks } from '@/utils/giftLinks';
import { GiftDetailsModal } from '@/components/GiftDetailsModal';
import { getApiErrorMessage } from '@/utils/api-error';
import { formatPrice } from '@/utils/format';
import { usePlatform, useHaptic } from '@/platform';

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

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const periodLabel = (
  days: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  const months = Math.floor(days / 30);
  const remainder = days % 30;
  if (months > 0 && remainder === 0) {
    return t('renewPage.month', { count: months });
  }
  return t('renewPage.days', { count: days });
};

const isGiftAvailable = (status: string): boolean =>
  status === 'paid' || status === 'delivered' || status === 'pending_activation';

const isGiftActivated = (gift: SentGift): boolean =>
  gift.status === 'delivered' && gift.activated_by_username != null;

type View = 'main' | 'select' | 'confirm';

export default function CabinetGifts() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { openInvoice, capabilities } = usePlatform();
  const haptic = useHaptic();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView: View = searchParams.get('action') === 'new' ? 'select' : 'main';
  const [view, setView] = useState<View>(initialView);

  // Strip the `action=new` query param once consumed so navigating back doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // KELDARI-UI: отдельная страница-список подарков /gifts убрана — она полностью
  // дублирует секцию подарков на /subscriptions. Оставляем только флоу покупки
  // (select/confirm); как только view становится 'main' (по умолчанию, по «Назад»
  // или после оформления) — уводим на /subscriptions.
  useEffect(() => {
    if (view === 'main') navigate('/subscriptions', { replace: true });
  }, [view, navigate]);
  const [selectedTariffId, setSelectedTariffId] = useState<number | null>(null);
  const [selectedPeriodDays, setSelectedPeriodDays] = useState<number | null>(null);
  const [paymentMode, setPaymentMode] = useState<'balance' | 'gateway'>('balance');
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedSubOption, setSelectedSubOption] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    data: config,
    isLoading: configLoading,
    error: configError,
  } = useQuery({
    queryKey: ['gift-config'],
    queryFn: giftApi.getConfig,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const { data: sentGifts, isLoading: sentLoading } = useQuery({
    queryKey: ['gift-sent'],
    queryFn: giftApi.getSentGifts,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const { data: receivedGifts, isLoading: receivedLoading } = useQuery({
    queryKey: ['gift-received'],
    queryFn: giftApi.getReceivedGifts,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  // Auto-select defaults when config loads
  useEffect(() => {
    if (!config) return;
    if (config.tariffs.length > 0 && selectedTariffId === null) {
      const firstTariff = config.tariffs[0];
      setSelectedTariffId(firstTariff.id);
      if (firstTariff.periods.length > 0) {
        setSelectedPeriodDays(firstTariff.periods[0].days);
      }
    }
    if (config.payment_methods.length > 0 && selectedMethod === null) {
      const firstMethod = config.payment_methods[0];
      setSelectedMethod(firstMethod.method_id);
      if (firstMethod.sub_options && firstMethod.sub_options.length >= 1) {
        setSelectedSubOption(firstMethod.sub_options[0].id);
      }
    }
  }, [config, selectedTariffId, selectedMethod]);

  // When tariff changes, ensure period belongs to it
  useEffect(() => {
    if (!config || !selectedTariffId) return;
    const tariff = config.tariffs.find((tr) => tr.id === selectedTariffId);
    if (!tariff) return;
    const has = tariff.periods.some((p) => p.days === selectedPeriodDays);
    if (!has && tariff.periods.length > 0) {
      setSelectedPeriodDays(tariff.periods[0].days);
    }
  }, [selectedTariffId, config, selectedPeriodDays]);

  const selectedTariff: GiftTariff | undefined = useMemo(
    () => config?.tariffs.find((tr) => tr.id === selectedTariffId),
    [config, selectedTariffId],
  );
  const selectedPeriod: GiftTariffPeriod | undefined = useMemo(
    () => selectedTariff?.periods.find((p) => p.days === selectedPeriodDays),
    [selectedTariff, selectedPeriodDays],
  );

  const currentPrice = selectedPeriod?.price_kopeks ?? 0;
  const balanceKopeks = config?.balance_kopeks ?? 0;
  const insufficientBalance = paymentMode === 'balance' && balanceKopeks < currentPrice;

  const purchaseMutation = useMutation({
    mutationFn: (data: GiftPurchaseRequest) => giftApi.createPurchase(data),
    onSuccess: async (result) => {
      if (result.payment_url) {
        const isStars = selectedMethod === 'telegram_stars';
        if (isStars && capabilities.hasInvoice) {
          try {
            const status = await openInvoice(result.payment_url);
            if (status === 'paid') {
              haptic.notification('success');
              queryClient.invalidateQueries({ queryKey: ['balance'] });
              queryClient.invalidateQueries({ queryKey: ['gift-config'] });
              queryClient.invalidateQueries({ queryKey: ['gift-sent'] });
              queryClient.invalidateQueries({ queryKey: ['sent-gifts'] });
              setView('main');
            } else if (status === 'failed') {
              haptic.notification('error');
              setSubmitError(
                t('gift.failedDesc', { defaultValue: 'Не удалось оформить подарок.' }),
              );
            }
          } catch {
            setSubmitError(t('gift.failedDesc', { defaultValue: 'Не удалось оформить подарок.' }));
          }
          return;
        }
        window.location.href = result.payment_url;
      } else {
        queryClient.invalidateQueries({ queryKey: ['balance'] });
        queryClient.invalidateQueries({ queryKey: ['gift-config'] });
        queryClient.invalidateQueries({ queryKey: ['gift-sent'] });
        queryClient.invalidateQueries({ queryKey: ['sent-gifts'] });
        setView('main');
      }
    },
    onError: (err) => {
      const msg = getApiErrorMessage(
        err,
        t('gift.failedDesc', { defaultValue: 'Не удалось оформить подарок.' }),
      );
      setSubmitError(msg);
    },
  });

  const canSubmit = useMemo(() => {
    if (!selectedTariffId || !selectedPeriodDays) return false;
    if (paymentMode === 'gateway' && !selectedMethod) return false;
    if (insufficientBalance) return false;
    return true;
  }, [selectedTariffId, selectedPeriodDays, paymentMode, selectedMethod, insufficientBalance]);

  const handleSubmit = () => {
    if (!selectedTariffId || !selectedPeriodDays || !canSubmit || purchaseMutation.isPending)
      return;
    setSubmitError(null);

    let paymentMethod: string | undefined;
    if (paymentMode === 'gateway' && selectedMethod) {
      paymentMethod = selectedMethod;
      if (selectedSubOption) paymentMethod = `${paymentMethod}_${selectedSubOption}`;
    }

    purchaseMutation.mutate({
      tariff_id: selectedTariffId,
      period_days: selectedPeriodDays,
      payment_mode: paymentMode,
      payment_method: paymentMethod,
    });
  };

  // Loading & error states
  if (configLoading) {
    return (
      <div style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
        </div>
      </div>
    );
  }

  if (configError || !config) {
    const errMsg = getApiErrorMessage(configError, t('giftsPage.loadFailed'));
    return (
      <div style={{ fontFamily: 'Inter, sans-serif' }} className="max-w-xl">
        <h1
          className="mb-6 text-white"
          style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('giftsPage.title')}
        </h1>
        <GlassCard className="p-5">
          <p className="text-[15px] text-white/55">{errMsg}</p>
        </GlassCard>
      </div>
    );
  }

  if (!config.is_enabled) {
    return (
      <div style={{ fontFamily: 'Inter, sans-serif' }} className="max-w-xl">
        <h1
          className="mb-6 text-white"
          style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('giftsPage.title')}
        </h1>
        <GlassCard className="p-7 text-center">
          <Gift size={28} className="mx-auto mb-3 text-white/20" />
          <p className="mb-1.5 text-[15px] text-white/55" style={{ fontWeight: 500 }}>
            {t('giftsPage.unavailableTitle')}
          </p>
          <p className="text-[13px] text-white/30" style={{ lineHeight: 1.6 }}>
            {t('giftsPage.unavailableDesc')}
          </p>
        </GlassCard>
      </div>
    );
  }

  // ────────── SELECT VIEW ──────────
  if (view === 'select') {
    // Union of all distinct period.days across tariffs, sorted ascending
    const periodDaysSet = new Set<number>();
    config.tariffs.forEach((tr) => tr.periods.forEach((p) => periodDaysSet.add(p.days)));
    const allPeriodDays = [...periodDaysSet].sort((a, b) => a - b);

    // Best discount badge per period (max across tariffs: explicit OR auto vs cheapest period)
    const bestDiscountFor = (days: number): number | null => {
      let best = 0;
      config.tariffs.forEach((tr) => {
        const p = tr.periods.find((pp) => pp.days === days);
        if (!p) return;
        const explicit = p.discount_percent ?? 0;
        const sorted = [...tr.periods].sort((a, b) => a.days - b.days);
        const base = sorted[0];
        let auto = 0;
        if (
          base &&
          base.days > 0 &&
          base.price_kopeks > 0 &&
          p.price_kopeks > 0 &&
          p.days > base.days
        ) {
          const ratio = p.price_kopeks / p.days / (base.price_kopeks / base.days);
          auto = Math.max(0, Math.round((1 - ratio) * 100));
        }
        const d = Math.max(explicit, auto);
        if (d > best) best = d;
      });
      return best > 0 ? best : null;
    };

    const activeDays = selectedPeriodDays ?? allPeriodDays[0] ?? null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <div className="mb-8 flex items-center justify-between">
          <h1
            className="text-white"
            style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
          >
            {t('giftsPage.selectTitle')}
          </h1>
          <button
            onClick={() => navigate('/subscriptions')}
            className="text-[15px] text-white/30 transition-colors hover:text-white/50"
          >
            {t('giftsPage.back')}
          </button>
        </div>

        {/* Period pills */}
        {allPeriodDays.length > 1 && (
          <div className="mb-6 flex justify-center">
            <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
              {allPeriodDays.map((days) => {
                const isSel = activeDays === days;
                const discount = bestDiscountFor(days);
                return (
                  <button
                    key={days}
                    onClick={() => setSelectedPeriodDays(days)}
                    className={`relative rounded-full px-4 py-2 text-[15px] transition-all ${
                      isSel ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/55'
                    }`}
                  >
                    {periodLabel(days, t)}
                    {discount && (
                      <span
                        className="absolute -right-1 -top-2.5 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] text-white/70"
                        style={{ fontWeight: 500 }}
                      >
                        −{discount}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tariff cards (with price for active period) */}
        <div className="mb-6 space-y-3">
          {config.tariffs.map((tariff) => {
            const isSel = tariff.id === selectedTariffId;
            const period =
              activeDays != null ? tariff.periods.find((p) => p.days === activeDays) : undefined;
            const months = period ? Math.max(1, Math.round(period.days / 30)) : 0;
            const monthlyPrice =
              period && months > 1 ? Math.round(period.price_kopeks / months) : null;
            const unavailable = activeDays != null && !period;

            return (
              <button
                key={tariff.id}
                disabled={unavailable}
                onClick={() => {
                  setSelectedTariffId(tariff.id);
                  if (activeDays != null && period) setSelectedPeriodDays(activeDays);
                }}
                className={`flex w-full items-center justify-between rounded-xl border p-5 text-left transition-all ${
                  unavailable
                    ? 'cursor-not-allowed border-white/[0.04] bg-white/[0.02] opacity-40'
                    : isSel
                      ? 'border-white/20 bg-white/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Gift size={18} className="shrink-0 text-white/30" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
                      {tariff.name}
                    </p>
                    <p className="truncate text-[13px] text-white/25">
                      {tariff.traffic_limit_gb > 0
                        ? t('giftsPage.trafficGb', { amount: tariff.traffic_limit_gb })
                        : t('giftsPage.unlimited')}
                      {' • '}
                      {t('giftsPage.devicesUpTo', { count: tariff.device_limit })}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {period ? (
                    <>
                      <span className="text-white" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                        {formatPrice(period.price_kopeks)}
                      </span>
                      {monthlyPrice != null && (
                        <p className="mt-0.5 text-[13px] text-white/25">
                          {t('giftsPage.perMonthShort', { price: formatPrice(monthlyPrice) })}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-[13px] text-white/25">{t('giftsPage.unavailable')}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setView('confirm')}
          disabled={!selectedTariffId || !selectedPeriodDays}
          className="w-full rounded-full bg-white py-3.5 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontWeight: 500 }}
        >
          {t('giftsPage.next')}
        </button>
      </motion.div>
    );
  }

  // ────────── CONFIRM VIEW ──────────
  if (view === 'confirm' && selectedTariff && selectedPeriod) {
    const hasGateways = config.payment_methods.length > 0;
    const balanceLabel = t('giftsPage.balanceMode', { amount: formatPrice(balanceKopeks) });
    const selectedMethodObj: GiftPaymentMethod | undefined = config.payment_methods.find(
      (m) => m.method_id === selectedMethod,
    );

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <div className="mb-8 flex items-center justify-between">
          <h1
            className="text-white"
            style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
          >
            {t('giftsPage.confirmTitle')}
          </h1>
          <button
            onClick={() => setView('select')}
            className="text-[15px] text-white/30 transition-colors hover:text-white/50"
          >
            {t('giftsPage.back')}
          </button>
        </div>

        <GlassCard className="mb-4 p-5">
          <p className="text-[15px] text-white/40" style={{ lineHeight: 1.65 }}>
            {t('giftsPage.confirmDescription')}
          </p>
        </GlassCard>

        <GlassCard className="mb-5 p-7">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[15px] text-white/35">{t('giftsPage.tariffLabel')}</span>
              <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
                {selectedTariff.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[15px] text-white/35">{t('giftsPage.periodLabel')}</span>
              <span className="text-[15px] text-white/70">
                {periodLabel(selectedPeriod.days, t)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[15px] text-white/35">{t('giftsPage.devicesLabel')}</span>
              <span className="text-[15px] text-white/70">
                {t('giftsPage.deviceUpTo', { count: selectedTariff.device_limit })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[15px] text-white/35">{t('giftsPage.trafficLabel')}</span>
              <span className="text-[15px] text-white/70">
                {selectedTariff.traffic_limit_gb > 0
                  ? t('giftsPage.trafficGb', { amount: selectedTariff.traffic_limit_gb })
                  : t('giftsPage.unlimited')}
              </span>
            </div>
            <div className="flex justify-between border-t border-white/[0.06] pt-3">
              <span className="text-[15px] text-white/50" style={{ fontWeight: 500 }}>
                {t('giftsPage.totalLabel')}
              </span>
              <span className="text-white" style={{ fontSize: '1.3rem', fontWeight: 600 }}>
                {formatPrice(selectedPeriod.price_kopeks)}
              </span>
            </div>
          </div>
        </GlassCard>

        {/* Payment mode toggle */}
        {hasGateways && (
          <div className="mb-4">
            <div className="inline-flex w-full rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
              <button
                onClick={() => setPaymentMode('balance')}
                className={`flex-1 rounded-full px-4 py-2 text-[15px] transition-all ${
                  paymentMode === 'balance'
                    ? 'bg-white/10 text-white'
                    : 'text-white/35 hover:text-white/55'
                }`}
              >
                {balanceLabel}
              </button>
              <button
                onClick={() => setPaymentMode('gateway')}
                className={`flex-1 rounded-full px-4 py-2 text-[15px] transition-all ${
                  paymentMode === 'gateway'
                    ? 'bg-white/10 text-white'
                    : 'text-white/35 hover:text-white/55'
                }`}
              >
                {t('giftsPage.gatewayMode')}
              </button>
            </div>
          </div>
        )}

        {/* Gateway methods */}
        <AnimatePresence mode="wait">
          {paymentMode === 'gateway' && hasGateways && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-4 overflow-hidden"
            >
              <div className="space-y-2">
                {config.payment_methods.map((method) => {
                  const isSel = method.method_id === selectedMethod;
                  const hasSub = method.sub_options && method.sub_options.length > 1;
                  return (
                    <div
                      key={method.method_id}
                      className={`rounded-xl border transition-all ${
                        isSel
                          ? 'border-white/20 bg-white/[0.08]'
                          : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05]'
                      }`}
                    >
                      <button
                        onClick={() => {
                          setSelectedMethod(method.method_id);
                          if (method.sub_options && method.sub_options.length >= 1) {
                            setSelectedSubOption(method.sub_options[0].id);
                          } else {
                            setSelectedSubOption(null);
                          }
                        }}
                        className="flex w-full items-center gap-3 p-4 text-left"
                      >
                        {method.icon_url && (
                          <img src={method.icon_url} alt="" className="h-6 w-6 object-contain" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
                            {method.display_name}
                          </p>
                          {method.description && (
                            <p className="truncate text-[13px] text-white/25">
                              {method.description}
                            </p>
                          )}
                        </div>
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            isSel ? 'border-white bg-white' : 'border-white/20'
                          }`}
                        >
                          {isSel && <div className="h-2 w-2 rounded-full bg-black" />}
                        </div>
                      </button>
                      {isSel && hasSub && (
                        <div className="border-t border-white/[0.06] px-4 pb-3 pt-3">
                          <div className="flex flex-wrap gap-2">
                            {method.sub_options!.map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => setSelectedSubOption(opt.id)}
                                className={`rounded-full px-3 py-1.5 text-[13px] transition-all ${
                                  selectedSubOption === opt.id
                                    ? 'bg-white text-black'
                                    : 'bg-white/[0.06] text-white/55 hover:bg-white/[0.1]'
                                }`}
                              >
                                {opt.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {insufficientBalance && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400/70" />
            <p className="text-[15px] text-amber-400/60">
              {t('giftsPage.insufficientPart1')}{' '}
              <Link
                to="/balance"
                className="text-amber-300/80 underline underline-offset-2 transition-colors hover:text-amber-200/90"
              >
                {t('giftsPage.insufficientTopUp')}
              </Link>{' '}
              {t('giftsPage.insufficientPart2')}
            </p>
          </div>
        )}

        <AnimatePresence>
          {submitError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3"
            >
              <p className="text-[15px] text-red-300/80">{submitError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || purchaseMutation.isPending}
          className="w-full rounded-full bg-white py-3.5 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontWeight: 500 }}
        >
          {purchaseMutation.isPending
            ? t('giftsPage.processing')
            : paymentMode === 'balance'
              ? t('giftsPage.payFromBalance', { price: formatPrice(currentPrice) })
              : selectedMethodObj
                ? t('giftsPage.payViaGatewayWithMethod', {
                    price: formatPrice(currentPrice),
                    method: selectedMethodObj.display_name,
                  })
                : t('giftsPage.payViaGateway', { price: formatPrice(currentPrice) })}
        </button>
      </motion.div>
    );
  }

  // ────────── MAIN VIEW ──────────
  // Список-страница /gifts убрана (дубль /subscriptions): редирект выполняет effect
  // выше, а сам список не рендерим, чтобы не мелькал.
  if (view === 'main') return null;

  const activeGifts = (sentGifts ?? []).filter((g) => !isGiftActivated(g));
  const activatedGifts = (sentGifts ?? []).filter((g) => isGiftActivated(g));
  const myGiftsLoading = sentLoading || receivedLoading;
  const hasAnyGift =
    activeGifts.length > 0 || activatedGifts.length > 0 || (receivedGifts?.length ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <h1
        className="mb-8 text-white"
        style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        {t('giftsPage.title')}
      </h1>

      {/* ПОДАРИТЬ ПОДПИСКУ */}
      <GlassCard className="mb-5 p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1.5 text-[15px] text-white/55" style={{ fontWeight: 500 }}>
              {t('giftsPage.giftSubscription')}
            </p>
            <p className="text-[13px] text-white/30" style={{ lineHeight: 1.6 }}>
              {t('giftsPage.giftSubscriptionDesc')}
            </p>
          </div>
          <button
            onClick={() => {
              setSubmitError(null);
              setView('select');
            }}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
            style={{ fontWeight: 500 }}
          >
            <Gift size={14} /> {t('giftsPage.giftSubscription')}
          </button>
        </div>
      </GlassCard>

      {/* МОИ ПОДАРКИ */}
      <GlassCard className="p-7">
        <p
          className="mb-4 text-[13px] text-white/40"
          style={{ fontWeight: 500, letterSpacing: '0.05em' }}
        >
          {t('giftsPage.myGiftsHeader')}
        </p>

        {myGiftsLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
          </div>
        ) : !hasAnyGift ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06]">
              <Gift size={20} className="text-white/40" />
            </div>
            <p className="mb-1.5 text-[15px] text-white/55" style={{ fontWeight: 500 }}>
              {t('giftsPage.noGiftsTitle')}
            </p>
            <p className="text-[13px] text-white/30" style={{ lineHeight: 1.6 }}>
              {t('giftsPage.noGiftsDesc')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeGifts.map((gift) => (
              <SentGiftRow key={gift.token} gift={gift} />
            ))}
            {activatedGifts.map((gift) => (
              <SentGiftRow key={gift.token} gift={gift} />
            ))}
            {(receivedGifts ?? []).map((gift) => (
              <ReceivedGiftRow key={gift.token} gift={gift} />
            ))}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}

// ────────── ROW COMPONENTS ──────────

function SentGiftRow({ gift }: { gift: SentGift }) {
  const { t } = useTranslation();
  const [copiedTg, setCopiedTg] = useState(false);
  const [copiedSite, setCopiedSite] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Один общий запрос на всё дерево (react-query дедуплицирует по ключу).
  const { data: widgetConfig } = useQuery<TelegramWidgetConfig>({
    queryKey: ['telegram-widget-config'],
    queryFn: brandingApi.getTelegramWidgetConfig,
    staleTime: 60000,
  });
  const botUsername =
    widgetConfig?.bot_username || import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';

  const shortCode = gift.token.slice(0, 12);
  const giftCode = `GIFT-${shortCode}`;
  const { telegram: tgLink, site: siteLink } = buildGiftLinks(gift.token, botUsername);
  const activated = isGiftActivated(gift);
  const available = !activated && isGiftAvailable(gift.status);

  const statusLabel = activated
    ? t('giftsPage.status.activated')
    : available
      ? t('giftsPage.status.available')
      : gift.status === 'pending'
        ? t('giftsPage.status.pending')
        : gift.status === 'failed'
          ? t('giftsPage.status.failed')
          : gift.status === 'expired'
            ? t('giftsPage.status.expired')
            : gift.status;

  const handleCopyTg = async () => {
    if (!tgLink) return;
    await copyToClipboard(tgLink);
    setCopiedTg(true);
    setTimeout(() => setCopiedTg(false), 2000);
  };
  const handleCopySite = async () => {
    await copyToClipboard(siteLink);
    setCopiedSite(true);
    setTimeout(() => setCopiedSite(false), 2000);
  };

  return (
    <>
    <div
      onClick={() => setShowDetails(true)}
      className="cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.06]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="break-all font-mono text-[15px] text-white/70">{giftCode}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
            available
              ? 'bg-green-500/10 text-green-400/70'
              : activated
                ? 'bg-white/[0.08] text-white/40'
                : 'bg-white/[0.06] text-white/35'
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="mb-4 space-y-1 text-[13px]">
        <div className="flex justify-between">
          <span className="text-white/35">{t('giftsPage.row.tariff')}</span>
          <span className="text-white/60">{gift.tariff_name ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">{t('giftsPage.row.period')}</span>
          <span className="text-white/60">{periodLabel(gift.period_days, t)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">{t('giftsPage.row.devices')}</span>
          <span className="text-white/60">
            {t('giftsPage.row.devicesUpTo', { count: gift.device_limit })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">{t('giftsPage.row.purchaseDate')}</span>
          <span className="text-white/60">{formatDate(gift.created_at)}</span>
        </div>
        {activated && gift.activated_by_username && (
          <div className="flex justify-between">
            <span className="text-white/35">{t('giftsPage.row.activatedBy')}</span>
            <span className="text-white/60">{gift.activated_by_username}</span>
          </div>
        )}
      </div>
      {!activated && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {tgLink && (
            <button
              onClick={handleCopyTg}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] py-2 text-[13px] text-white/50 transition-colors hover:bg-white/[0.04]"
            >
              {copiedTg ? (
                <>
                  <Check size={12} className="text-green-400" /> {t('giftsPage.row.copied')}
                </>
              ) : (
                <>
                  <Copy size={12} /> {t('giftsPage.row.copyTelegram', 'Ссылка Telegram')}
                </>
              )}
            </button>
          )}
          <button
            onClick={handleCopySite}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] py-2 text-[13px] text-white/50 transition-colors hover:bg-white/[0.04]"
          >
            {copiedSite ? (
              <>
                <Check size={12} className="text-green-400" /> {t('giftsPage.row.copied')}
              </>
            ) : (
              <>
                <Copy size={12} /> {t('giftsPage.row.copySite', 'Ссылка на сайт')}
              </>
            )}
          </button>
        </div>
      )}
    </div>
    <AnimatePresence>
      {showDetails && <GiftDetailsModal gift={gift} onClose={() => setShowDetails(false)} />}
    </AnimatePresence>
    </>
  );
}

function ReceivedGiftRow({ gift }: { gift: ReceivedGift }) {
  const { t } = useTranslation();
  const statusLabel =
    gift.status === 'delivered'
      ? t('giftsPage.status.delivered')
      : gift.status === 'paid'
        ? t('giftsPage.status.available')
        : gift.status === 'pending_activation'
          ? t('giftsPage.status.pendingActivation')
          : gift.status;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
          {t('giftsPage.received.from', { sender: gift.sender_display ?? '—' })}
        </p>
        <span className="shrink-0 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/40">
          {statusLabel}
        </span>
      </div>
      <div className="space-y-1 text-[13px]">
        <div className="flex justify-between">
          <span className="text-white/35">{t('giftsPage.row.tariff')}</span>
          <span className="text-white/60">{gift.tariff_name ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">{t('giftsPage.row.period')}</span>
          <span className="text-white/60">{periodLabel(gift.period_days, t)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">{t('giftsPage.row.devices')}</span>
          <span className="text-white/60">
            {t('giftsPage.row.devicesUpTo', { count: gift.device_limit })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">{t('giftsPage.row.date')}</span>
          <span className="text-white/60">{formatDate(gift.created_at)}</span>
        </div>
      </div>
      {gift.gift_message && (
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.04] p-3">
          <p className="text-[13px] italic text-white/55" style={{ lineHeight: 1.6 }}>
            {gift.gift_message}
          </p>
        </div>
      )}
    </div>
  );
}
