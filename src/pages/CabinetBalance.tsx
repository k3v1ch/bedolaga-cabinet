import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Bitcoin,
  ChevronDown,
  CreditCard,
  Gift,
  Percent,
  QrCode,
  Sparkles,
  X,
} from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { balanceApi } from '@/api/balance';
import { giftApi } from '@/api/gift';
import { useCurrency } from '@/hooks/useCurrency';
import { API } from '@/config/constants';
import { isFailedStatus, isPaidStatus } from '@/utils/paymentStatus';
import type { PaginatedResponse, PaymentMethod, Transaction } from '@/types';

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
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function splitAction(action: string): { main: string; sub: string | null } {
  const m = action.match(/^(.*?)\s*(\(.+\))\s*$/);
  if (m) return { main: m[1].trim(), sub: m[2] };
  return { main: action, sub: null };
}

const normalizeType = (type: string) => type?.toUpperCase?.() ?? type;

function getMethodIcon(methodId: string) {
  const id = methodId.toLowerCase();
  if (id.includes('stars')) return Sparkles;
  if (
    id.includes('crypto') ||
    id.includes('ton') ||
    id.includes('usdt') ||
    id.includes('heleket')
  ) {
    return Bitcoin;
  }
  if (id.includes('sbp') || id.includes('qr') || id.includes('rolly')) return QrCode;
  return CreditCard;
}

export default function CabinetBalance() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const { formatAmount, currencySymbol } = useCurrency();
  const [searchParams] = useSearchParams();
  const paymentHandledRef = useRef(false);

  // ── Data ────────────────────────────────────────────────────────────
  const { data: balanceData, refetch: refetchBalance } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    enabled: isAuthenticated,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: balanceApi.getPaymentMethods,
    enabled: isAuthenticated,
  });

  const [transactionsPage, setTransactionsPage] = useState(1);
  const { data: transactions, isLoading: txLoading } = useQuery<PaginatedResponse<Transaction>>({
    queryKey: ['transactions', transactionsPage],
    queryFn: () => balanceApi.getTransactions({ per_page: 20, page: transactionsPage }),
    enabled: isAuthenticated,
    placeholderData: (previousData) => previousData,
  });

  // ── Refresh user balance on mount (parity со старой Balance) ──────
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // ── Handle payment return from gateway ────────────────────────────
  useEffect(() => {
    if (paymentHandledRef.current) return;
    const paymentStatus = searchParams.get('payment') || searchParams.get('status');
    const normalised = paymentStatus?.toLowerCase() ?? '';
    const isSuccess = isPaidStatus(normalised) || searchParams.get('success') === 'true';
    const isFailed = isFailedStatus(normalised);
    if (isSuccess) {
      paymentHandledRef.current = true;
      navigate('/balance/top-up/result?status=success', { replace: true });
    } else if (isFailed) {
      paymentHandledRef.current = true;
      navigate('/balance/top-up/result?status=failed', { replace: true });
    }
  }, [searchParams, navigate]);

  // ── Local state: top-up form ──────────────────────────────────────
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  const availableMethods = useMemo<PaymentMethod[]>(
    () => (paymentMethods ?? []).filter((m) => m.is_available),
    [paymentMethods],
  );

  // Auto-select first available method when methods load
  useEffect(() => {
    if (!selectedMethod && availableMethods.length > 0) {
      setSelectedMethod(availableMethods[0].id);
    }
  }, [availableMethods, selectedMethod]);

  const selectedMethodObj = useMemo(
    () => availableMethods.find((m) => m.id === selectedMethod) ?? null,
    [availableMethods, selectedMethod],
  );

  const minRubles = selectedMethodObj ? selectedMethodObj.min_amount_kopeks / 100 : 10;
  const maxRubles = selectedMethodObj ? selectedMethodObj.max_amount_kopeks / 100 : Infinity;

  const numAmount = parseFloat(amount.replace(',', '.'));
  const amountInvalid =
    amount !== '' && (Number.isNaN(numAmount) || numAmount < minRubles || numAmount > maxRubles);

  const handleTopUp = () => {
    if (!selectedMethodObj) {
      setAmountError(t('balance.errors.selectMethod', { defaultValue: 'Выберите способ' }));
      return;
    }
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      setAmountError(t('balance.errors.enterAmount', { defaultValue: 'Введите сумму' }));
      return;
    }
    if (numAmount < minRubles || numAmount > maxRubles) {
      setAmountError(
        t('balance.errors.amountRange', {
          min: minRubles,
          max: Number.isFinite(maxRubles) ? maxRubles : '∞',
          defaultValue: `Сумма: ${minRubles} – ${Number.isFinite(maxRubles) ? maxRubles : '∞'} ₽`,
        }),
      );
      return;
    }
    setAmountError(null);
    navigate(`/balance/top-up/${selectedMethodObj.id}?amount=${encodeURIComponent(amount)}`);
  };

  // ── Promocode ──────────────────────────────────────────────────────
  const [promo, setPromo] = useState('');
  const [promocodeLoading, setPromocodeLoading] = useState(false);
  const [promoSelectSubs, setPromoSelectSubs] = useState<Array<{
    id: number;
    tariff_name: string;
    days_left: number;
  }> | null>(null);
  const [promoSelectCode, setPromoSelectCode] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoPopup, setPromoPopup] = useState<{
    type: 'bonus' | 'discount' | 'gift';
    description: string;
    amount: number;
    title?: string;
  } | null>(null);

  const tryActivateGift = async (
    code: string,
  ): Promise<{ ok: true } | { ok: false; recognized: boolean; message: string }> => {
    try {
      const result = await giftApi.activateGiftCode(code);
      const tariff = result.tariff_name ?? '';
      const days = result.period_days ?? 0;
      const description = tariff
        ? `Подарок активирован: ${tariff}${days ? ` на ${days} дн.` : ''}`
        : 'Подарок успешно активирован';
      setPromoPopup({
        type: 'gift',
        title: 'Подарок активирован',
        description,
        amount: 0,
      });
      setTransactionsPage(1);
      setPromo('');
      setPromoSelectSubs(null);
      setPromoSelectCode(null);
      queryClient.invalidateQueries({ queryKey: ['gift-received'] });
      queryClient.invalidateQueries({ queryKey: ['gift-sent'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      await refetchBalance();
      await refreshUser();
      return { ok: true };
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } }; message?: string };
      const raw = axiosError.response?.data?.detail || '';
      const detail = raw.toLowerCase();
      // "Not found" / "invalid" → код не похож на подарочный, пробуем как промокод
      const looksUnknown =
        detail === '' ||
        detail.includes('not found') ||
        detail.includes('invalid code') ||
        detail.includes('invalid gift') ||
        detail.includes('unknown');
      if (looksUnknown) {
        return { ok: false, recognized: false, message: '' };
      }
      const message =
        raw === 'Cannot activate your own gift'
          ? 'Нельзя активировать собственный подарок'
          : detail.includes('expired')
            ? 'Срок действия подарка истёк'
            : detail.includes('already')
              ? 'Этот подарок уже был активирован'
              : raw || 'Не удалось активировать подарок';
      return { ok: false, recognized: true, message };
    }
  };

  const tryActivatePromocode = async (
    code: string,
    subscriptionId?: number,
  ): Promise<{ ok: true } | { ok: false; recognized: boolean; message: string }> => {
    try {
      const result = await balanceApi.activatePromocode(code, subscriptionId);

      if (result.error === 'select_subscription' && result.eligible_subscriptions) {
        setPromoSelectSubs(result.eligible_subscriptions);
        setPromoSelectCode(result.code || code);
        return { ok: true };
      }

      if (result.success) {
        const bonusAmount = (result.balance_after || 0) - (result.balance_before || 0);
        const description = result.bonus_description || t('balance.promocode.success');
        setPromoPopup({
          type: bonusAmount > 0 ? 'bonus' : 'discount',
          description,
          amount: bonusAmount,
        });
        setTransactionsPage(1);
        setPromo('');
        setPromoSelectSubs(null);
        setPromoSelectCode(null);
        await refetchBalance();
        await refreshUser();
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
        queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
        return { ok: true };
      }
      return { ok: false, recognized: false, message: '' };
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } } };
      const errorDetail = axiosError.response?.data?.detail || 'server_error';
      const detail = errorDetail.toLowerCase();
      if (detail.includes('not found')) {
        return { ok: false, recognized: false, message: '' };
      }
      const errorKey = detail.includes('deactivated')
        ? 'inactive'
        : detail.includes('not yet active')
          ? 'not_yet_valid'
          : detail.includes('expired')
            ? 'expired'
            : detail.includes('fully used')
              ? 'used'
              : detail.includes('already used')
                ? 'already_used_by_user'
                : 'server_error';
      return {
        ok: false,
        recognized: true,
        message: t(`balance.promocode.errors.${errorKey}`),
      };
    }
  };

  const handlePromoActivate = async (subscriptionId?: number) => {
    const code = subscriptionId ? promoSelectCode || '' : promo.trim();
    if (!code) return;

    setPromocodeLoading(true);
    setPromoError(null);

    try {
      // Если выбираем подписку для уже распознанного промокода — пропускаем gift-проверку
      if (subscriptionId) {
        const promoResult = await tryActivatePromocode(code, subscriptionId);
        if (!promoResult.ok && promoResult.recognized) {
          setPromoError(promoResult.message);
          setPromoSelectSubs(null);
          setPromoSelectCode(null);
        }
        return;
      }

      // 1) Пробуем как подарочный код
      const giftResult = await tryActivateGift(code);
      if (giftResult.ok) return;
      if (giftResult.recognized) {
        setPromoError(giftResult.message);
        return;
      }

      // 2) Пробуем как промокод
      const promoResult = await tryActivatePromocode(code);
      if (promoResult.ok) return;
      if (promoResult.recognized) {
        setPromoError(promoResult.message);
        setPromoSelectSubs(null);
        setPromoSelectCode(null);
        return;
      }

      // 3) Не распознали ни как промокод, ни как подарок
      setPromoError(
        'Не удалось распознать код. Убедитесь, что вы ввели действующий промокод или подарочный код.',
      );
      setPromoSelectSubs(null);
      setPromoSelectCode(null);
    } finally {
      setPromocodeLoading(false);
    }
  };

  // ── History ────────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);

  const getTypeLabel = (type: string) => {
    switch (normalizeType(type)) {
      case 'DEPOSIT':
        return t('balance.deposit');
      case 'SUBSCRIPTION_PAYMENT':
        return t('balance.subscriptionPayment');
      case 'REFERRAL_REWARD':
        return t('balance.referralReward');
      case 'WITHDRAWAL':
        return t('balance.withdrawal');
      default:
        return type;
    }
  };

  const balanceRubles = balanceData?.balance_rubles ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h1
        className="mb-8 text-white"
        style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        Баланс
      </h1>

      {/* Balance + Top up */}
      <GlassCard className="mb-4 p-6">
        <p className="mb-1 text-xs text-white/35">Текущий баланс</p>
        <p
          className="mb-6 text-white"
          style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-0.03em' }}
        >
          {formatAmount(balanceRubles)} {currencySymbol}
        </p>

        <input
          type="text"
          inputMode="decimal"
          placeholder={
            selectedMethodObj
              ? `Сумма пополнения (от ${minRubles} ${currencySymbol})`
              : `Сумма пополнения (от 10 ${currencySymbol})`
          }
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmountError(null);
          }}
          className={`mb-2 w-full rounded-xl border bg-white/[0.06] px-4 py-3 text-sm text-white/70 placeholder-white/20 outline-none transition-all ${
            amountError || amountInvalid
              ? 'border-amber-500/40 focus:border-amber-500/60'
              : 'border-white/10 focus:border-white/20'
          }`}
        />
        {(amountError || amountInvalid) && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
            <AlertTriangle size={14} className="shrink-0 text-amber-400/70" />
            <p className="text-xs text-amber-400/70">
              {amountError ||
                (selectedMethodObj
                  ? `Сумма от ${minRubles} до ${
                      Number.isFinite(maxRubles) ? maxRubles : '∞'
                    } ${currencySymbol}.`
                  : `Слишком маленькая сумма. Введите сумму от 10 ${currencySymbol}.`)}
            </p>
          </div>
        )}
        {!amountError && !amountInvalid && <div className="mb-2" />}

        {/* Payment methods */}
        <p className="mb-2 text-xs text-white/30">Способ пополнения</p>
        {availableMethods.length === 0 ? (
          <p className="mb-4 text-xs text-white/30">
            {t('balance.noPaymentMethods', { defaultValue: 'Способы оплаты недоступны' })}
          </p>
        ) : (
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {availableMethods.map((m) => {
              const Icon = getMethodIcon(m.id);
              const methodKey = m.id.toLowerCase().replace(/-/g, '_');
              const translatedName = t(`balance.paymentMethods.${methodKey}.name`, {
                defaultValue: '',
              });
              const translatedDesc = t(`balance.paymentMethods.${methodKey}.description`, {
                defaultValue: '',
              });
              const label = translatedName || m.name;
              const desc = translatedDesc || m.description || '';
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMethod(m.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    selectedMethod === m.id
                      ? 'border-white/20 bg-white/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon size={18} className="shrink-0 text-white/30" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white/60" style={{ fontWeight: 500 }}>
                      {label}
                    </p>
                    {desc && <p className="truncate text-[11px] text-white/20">{desc}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={handleTopUp}
          disabled={!selectedMethodObj || availableMethods.length === 0}
          className="w-full rounded-full bg-white py-3.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontWeight: 500 }}
        >
          Пополнить
        </button>
      </GlassCard>

      {/* Promo */}
      <GlassCard className="mb-4 p-6">
        <p
          className="mb-3 text-xs text-white/40"
          style={{ fontWeight: 500, letterSpacing: '0.05em' }}
        >
          ПРОМОКОД ИЛИ ПОДАРОК
        </p>
        <input
          type="text"
          placeholder="Введите промокод или код подарка"
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && promo.trim() && !promocodeLoading) {
              handlePromoActivate();
            }
          }}
          disabled={promocodeLoading}
          className="mb-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/70 placeholder-white/20 outline-none transition-all focus:border-white/20"
        />
        <button
          onClick={() => handlePromoActivate()}
          disabled={!promo.trim() || promocodeLoading}
          className="mb-3 w-full rounded-full bg-white py-3.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-50"
          style={{ fontWeight: 500 }}
        >
          {promocodeLoading ? 'Активация…' : 'Применить'}
        </button>

        <AnimatePresence mode="wait">
          {promoError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-1 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2"
            >
              <AlertTriangle size={14} className="shrink-0 text-red-400/80" />
              <p className="text-xs text-red-400/80">{promoError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {promoSelectSubs && promoSelectSubs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-3"
          >
            <div className="text-xs text-white/55" style={{ fontWeight: 500 }}>
              {t('balance.promocode.selectSubscription', {
                defaultValue: 'К какой подписке применить промокод?',
              })}
            </div>
            {promoSelectSubs.map((sub) => (
              <button
                key={sub.id}
                onClick={() => handlePromoActivate(sub.id)}
                disabled={promocodeLoading}
                className="flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/[0.05] disabled:opacity-50"
              >
                <span>{sub.tariff_name}</span>
                <span className="text-xs text-white/35">
                  {t('balance.promocode.daysLeft', '{{count}} дн.', { count: sub.days_left })}
                </span>
              </button>
            ))}
            <button
              onClick={() => {
                setPromoSelectSubs(null);
                setPromoSelectCode(null);
              }}
              className="text-xs text-white/35 hover:text-white/55"
            >
              {t('common.cancel', { defaultValue: 'Отмена' })}
            </button>
          </motion.div>
        )}
      </GlassCard>

      {/* Promo success popup */}
      <AnimatePresence>
        {promoPopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
            onClick={() => setPromoPopup(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-6 shadow-2xl shadow-black/50 backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-end">
                <button
                  onClick={() => setPromoPopup(null)}
                  className="text-white/25 transition-colors hover:text-white/50"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="py-2 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06]">
                  {promoPopup.type === 'gift' ? (
                    <Gift size={20} className="text-green-400/70" />
                  ) : promoPopup.type === 'bonus' ? (
                    <Gift size={20} className="text-green-400/70" />
                  ) : (
                    <Percent size={20} className="text-green-400/70" />
                  )}
                </div>
                <h3 className="mb-2 text-sm text-white" style={{ fontWeight: 600 }}>
                  {promoPopup.title ??
                    (promoPopup.type === 'bonus'
                      ? 'Промокод активирован'
                      : promoPopup.type === 'gift'
                        ? 'Подарок активирован'
                        : 'Скидка активирована')}
                </h3>
                <p className="mb-5 text-sm text-white/35" style={{ lineHeight: 1.6 }}>
                  {promoPopup.description}
                  {promoPopup.amount > 0 && (
                    <>
                      {' '}
                      {t('balance.promocode.balanceAdded', {
                        amount: promoPopup.amount.toFixed(2),
                      })}
                    </>
                  )}
                </p>
                <button
                  onClick={() => setPromoPopup(null)}
                  className="rounded-full bg-white px-6 py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                  style={{ fontWeight: 500 }}
                >
                  Понятно
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History */}
      <GlassCard className="p-6">
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex w-full items-center justify-between"
        >
          <p className="text-xs text-white/40" style={{ fontWeight: 500, letterSpacing: '0.05em' }}>
            ИСТОРИЯ ОПЕРАЦИЙ
          </p>
          <ChevronDown
            size={16}
            className={`text-white/25 transition-transform duration-300 ${
              historyOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
        <AnimatePresence>
          {historyOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-2">
                {txLoading && !transactions ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
                  </div>
                ) : transactions?.items && transactions.items.length > 0 ? (
                  transactions.items.map((tx) => {
                    const isZero = tx.amount_rubles === 0;
                    const isPositive = tx.amount_rubles > 0;
                    const display = Math.abs(tx.amount_rubles);
                    const sign = isZero ? '' : isPositive ? '+' : '−';
                    const action = tx.description || getTypeLabel(tx.type);
                    const { main, sub } = splitAction(action);
                    return (
                      <div
                        key={tx.id}
                        className="flex items-start justify-between gap-3 border-b border-white/[0.04] py-2.5 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white/50">{main}</p>
                          {sub && <p className="text-xs text-white/30">{sub}</p>}
                          <p className="mt-0.5 text-xs text-white/20">
                            {formatDate(tx.created_at)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className={`text-sm ${
                              isPositive ? 'text-green-400/60' : 'text-white/40'
                            }`}
                          >
                            {sign}
                            {formatAmount(display)} {currencySymbol}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-6 text-center text-xs text-white/30">
                    {t('balance.noTransactions', { defaultValue: 'Нет операций' })}
                  </p>
                )}

                {transactions && transactions.pages > 1 && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => setTransactionsPage((p) => Math.max(1, p - 1))}
                      disabled={transactions.page <= 1}
                      className="flex-1 rounded-full border border-white/[0.08] py-2 text-xs text-white/50 transition-colors hover:bg-white/[0.04] disabled:opacity-40"
                    >
                      {t('common.back', { defaultValue: 'Назад' })}
                    </button>
                    <div className="flex-1 text-center text-xs text-white/35">
                      {t('balance.page', {
                        current: transactions.page,
                        total: transactions.pages,
                      })}
                    </div>
                    <button
                      onClick={() =>
                        setTransactionsPage((p) =>
                          transactions.pages ? Math.min(transactions.pages, p + 1) : p + 1,
                        )
                      }
                      disabled={transactions.page >= transactions.pages}
                      className="flex-1 rounded-full border border-white/[0.08] py-2 text-xs text-white/50 transition-colors hover:bg-white/[0.04] disabled:opacity-40"
                    >
                      {t('common.next', { defaultValue: 'Вперёд' })}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}
