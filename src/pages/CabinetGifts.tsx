import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Gift, Share2, AlertTriangle } from 'lucide-react';

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
import { copyToClipboard } from '@/utils/clipboard';
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

const periodLabel = (days: number): string => {
  const months = Math.floor(days / 30);
  const remainder = days % 30;
  if (months > 0 && remainder === 0) {
    if (months === 1) return '1 месяц';
    if (months >= 2 && months <= 4) return `${months} месяца`;
    return `${months} месяцев`;
  }
  return `${days} дн.`;
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

  const [view, setView] = useState<View>('main');
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
    const errMsg = getApiErrorMessage(
      configError,
      t('gift.failedDesc', { defaultValue: 'Не удалось загрузить подарки.' }),
    );
    return (
      <div style={{ fontFamily: 'Inter, sans-serif' }} className="max-w-xl">
        <h1
          className="mb-6 text-white"
          style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          Подарки
        </h1>
        <GlassCard className="p-5">
          <p className="text-sm text-white/55">{errMsg}</p>
        </GlassCard>
      </div>
    );
  }

  if (!config.is_enabled) {
    return (
      <div style={{ fontFamily: 'Inter, sans-serif' }} className="max-w-xl">
        <h1
          className="mb-6 text-white"
          style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          Подарки
        </h1>
        <GlassCard className="p-6 text-center">
          <Gift size={28} className="mx-auto mb-3 text-white/20" />
          <p className="mb-1.5 text-sm text-white/55" style={{ fontWeight: 500 }}>
            Подарки временно недоступны
          </p>
          <p className="text-xs text-white/30" style={{ lineHeight: 1.6 }}>
            Функция подарков отключена администратором.
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
            style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
          >
            Выбор подарка
          </h1>
          <button
            onClick={() => setView('main')}
            className="text-sm text-white/30 transition-colors hover:text-white/50"
          >
            ← Назад
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
                    className={`relative rounded-full px-4 py-2 text-sm transition-all ${
                      isSel ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/55'
                    }`}
                  >
                    {periodLabel(days)}
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
                    <p className="text-sm text-white/70" style={{ fontWeight: 500 }}>
                      {tariff.name}
                    </p>
                    <p className="truncate text-xs text-white/25">
                      {tariff.traffic_limit_gb > 0 ? `${tariff.traffic_limit_gb} ГБ` : 'Безлимит'}
                      {' • '}
                      до {tariff.device_limit} устр.
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
                        <p className="mt-0.5 text-xs text-white/25">
                          {formatPrice(monthlyPrice)}/мес
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-white/25">недоступно</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setView('confirm')}
          disabled={!selectedTariffId || !selectedPeriodDays}
          className="w-full rounded-full bg-white py-3.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontWeight: 500 }}
        >
          Далее
        </button>
      </motion.div>
    );
  }

  // ────────── CONFIRM VIEW ──────────
  if (view === 'confirm' && selectedTariff && selectedPeriod) {
    const hasGateways = config.payment_methods.length > 0;
    const balanceLabel = `С баланса (${formatPrice(balanceKopeks)})`;
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
            style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
          >
            Подтверждение
          </h1>
          <button
            onClick={() => setView('select')}
            className="text-sm text-white/30 transition-colors hover:text-white/50"
          >
            ← Назад
          </button>
        </div>

        <GlassCard className="mb-4 p-5">
          <p className="text-sm text-white/40" style={{ lineHeight: 1.65 }}>
            Вы покупаете подписку в подарок. После оплаты мы создадим промокод — отправьте его
            другу, чтобы он активировал подписку в своём кабинете. Код также сохранится в разделе
            «Мои подарки», поэтому его можно скопировать или отправить позже.
          </p>
        </GlassCard>

        <GlassCard className="mb-4 p-6">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-white/35">Тариф</span>
              <span className="text-sm text-white/70" style={{ fontWeight: 500 }}>
                {selectedTariff.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-white/35">Срок</span>
              <span className="text-sm text-white/70">{periodLabel(selectedPeriod.days)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-white/35">Устройства</span>
              <span className="text-sm text-white/70">До {selectedTariff.device_limit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-white/35">Трафик</span>
              <span className="text-sm text-white/70">
                {selectedTariff.traffic_limit_gb > 0
                  ? `${selectedTariff.traffic_limit_gb} ГБ`
                  : 'Безлимит'}
              </span>
            </div>
            <div className="flex justify-between border-t border-white/[0.06] pt-3">
              <span className="text-sm text-white/50" style={{ fontWeight: 500 }}>
                Итого
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
                className={`flex-1 rounded-full px-4 py-2 text-sm transition-all ${
                  paymentMode === 'balance'
                    ? 'bg-white/10 text-white'
                    : 'text-white/35 hover:text-white/55'
                }`}
              >
                {balanceLabel}
              </button>
              <button
                onClick={() => setPaymentMode('gateway')}
                className={`flex-1 rounded-full px-4 py-2 text-sm transition-all ${
                  paymentMode === 'gateway'
                    ? 'bg-white/10 text-white'
                    : 'text-white/35 hover:text-white/55'
                }`}
              >
                Через шлюз
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
                          <p className="text-sm text-white/70" style={{ fontWeight: 500 }}>
                            {method.display_name}
                          </p>
                          {method.description && (
                            <p className="truncate text-xs text-white/25">{method.description}</p>
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
                                className={`rounded-full px-3 py-1.5 text-xs transition-all ${
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
            <p className="text-sm text-amber-400/60">
              Недостаточно средств.{' '}
              <Link
                to="/balance"
                className="text-amber-300/80 underline underline-offset-2 transition-colors hover:text-amber-200/90"
              >
                Пополните баланс
              </Link>{' '}
              или выберите оплату через шлюз.
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
              <p className="text-sm text-red-300/80">{submitError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || purchaseMutation.isPending}
          className="w-full rounded-full bg-white py-3.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontWeight: 500 }}
        >
          {purchaseMutation.isPending
            ? 'Оформляем…'
            : paymentMode === 'balance'
              ? `Оплатить с баланса · ${formatPrice(currentPrice)}`
              : `Перейти к оплате · ${formatPrice(currentPrice)}${
                  selectedMethodObj ? ` через ${selectedMethodObj.display_name}` : ''
                }`}
        </button>
      </motion.div>
    );
  }

  // ────────── MAIN VIEW ──────────
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
        style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        Подарки
      </h1>

      {/* ПОДАРИТЬ ПОДПИСКУ */}
      <GlassCard className="mb-4 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1.5 text-sm text-white/55" style={{ fontWeight: 500 }}>
              Подарить подписку
            </p>
            <p className="text-xs text-white/30" style={{ lineHeight: 1.6 }}>
              Купите подписку, получите промокод и отправьте другу — он активирует её в своём
              кабинете.
            </p>
          </div>
          <button
            onClick={() => {
              setSubmitError(null);
              setView('select');
            }}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
            style={{ fontWeight: 500 }}
          >
            <Gift size={14} /> Подарить подписку
          </button>
        </div>
      </GlassCard>

      {/* МОИ ПОДАРКИ */}
      <GlassCard className="p-6">
        <p
          className="mb-4 text-xs text-white/40"
          style={{ fontWeight: 500, letterSpacing: '0.05em' }}
        >
          МОИ ПОДАРКИ
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
            <p className="mb-1.5 text-sm text-white/55" style={{ fontWeight: 500 }}>
              У вас пока нет подарков
            </p>
            <p className="text-xs text-white/30" style={{ lineHeight: 1.6 }}>
              Приобретите подарок для друга — код появится здесь.
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
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const shortCode = gift.token.slice(0, 12);
  const giftCode = `GIFT-${shortCode}`;
  const activated = isGiftActivated(gift);
  const available = !activated && isGiftAvailable(gift.status);

  const statusLabel = activated
    ? 'Активирован'
    : available
      ? 'Доступен'
      : gift.status === 'pending'
        ? 'Ожидает'
        : gift.status === 'failed'
          ? 'Ошибка'
          : gift.status === 'expired'
            ? 'Истёк'
            : gift.status;

  const buildShareMessage = useCallback(() => {
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
    const safeCode = shortCode.replace(/_/g, '%5F');
    const botLink = botUsername ? `https://t.me/${botUsername}?start=GIFT%5F${safeCode}` : null;
    const cabinetLink = `${window.location.origin}/gifts?code=${safeCode}`;
    return [
      `Дарю тебе подписку! Код: ${giftCode}`,
      botLink ? `Активировать через бота: ${botLink}` : null,
      `Активировать в кабинете: ${cabinetLink}`,
    ]
      .filter(Boolean)
      .join('\n');
  }, [shortCode, giftCode]);

  const handleCopy = async () => {
    await copyToClipboard(giftCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    await copyToClipboard(buildShareMessage());
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="break-all font-mono text-sm text-white/70">{giftCode}</p>
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
      <div className="mb-4 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-white/35">Тариф</span>
          <span className="text-white/60">{gift.tariff_name ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">Срок подписки</span>
          <span className="text-white/60">{periodLabel(gift.period_days)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">Устройств</span>
          <span className="text-white/60">до {gift.device_limit}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">Дата покупки</span>
          <span className="text-white/60">{formatDate(gift.created_at)}</span>
        </div>
        {activated && gift.activated_by_username && (
          <div className="flex justify-between">
            <span className="text-white/35">Активировал</span>
            <span className="text-white/60">{gift.activated_by_username}</span>
          </div>
        )}
      </div>
      {!activated && (
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] py-2 text-xs text-white/50 transition-colors hover:bg-white/[0.04]"
          >
            {copied ? (
              <>
                <Check size={12} className="text-green-400" /> Скопировано
              </>
            ) : (
              <>
                <Copy size={12} /> Скопировать
              </>
            )}
          </button>
          <button
            onClick={handleShare}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/[0.08] py-2 text-xs text-white/50 transition-colors hover:bg-white/[0.04]"
          >
            {shared ? (
              <>
                <Check size={12} className="text-green-400" /> Скопировано
              </>
            ) : (
              <>
                <Share2 size={12} /> Поделиться
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function ReceivedGiftRow({ gift }: { gift: ReceivedGift }) {
  const statusLabel =
    gift.status === 'delivered'
      ? 'Получен'
      : gift.status === 'paid'
        ? 'Доступен'
        : gift.status === 'pending_activation'
          ? 'Ожидает активации'
          : gift.status;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm text-white/70" style={{ fontWeight: 500 }}>
          Подарок от {gift.sender_display ?? '—'}
        </p>
        <span className="shrink-0 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/40">
          {statusLabel}
        </span>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-white/35">Тариф</span>
          <span className="text-white/60">{gift.tariff_name ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">Срок подписки</span>
          <span className="text-white/60">{periodLabel(gift.period_days)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">Устройств</span>
          <span className="text-white/60">до {gift.device_limit}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/35">Дата</span>
          <span className="text-white/60">{formatDate(gift.created_at)}</span>
        </div>
      </div>
      {gift.gift_message && (
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.04] p-3">
          <p className="text-xs italic text-white/55" style={{ lineHeight: 1.6 }}>
            {gift.gift_message}
          </p>
        </div>
      )}
    </div>
  );
}
