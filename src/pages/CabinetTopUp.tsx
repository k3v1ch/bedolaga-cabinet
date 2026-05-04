import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Bitcoin,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  QrCode,
  Sparkles,
} from 'lucide-react';

import { balanceApi } from '@/api/balance';
import { useCurrency } from '@/hooks/useCurrency';
import { checkRateLimit, getRateLimitResetTime, RATE_LIMIT_KEYS } from '@/utils/rateLimit';
import { useCloseOnSuccessNotification } from '@/store/successNotification';
import { useHaptic, usePlatform } from '@/platform';
import type { PaymentMethod, PaymentMethodOption } from '@/types';
import { saveTopUpPendingInfo } from '@/utils/topUpStorage';

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

const getPreferredOptionId = (options?: PaymentMethod['options']) => {
  if (!options || options.length === 0) return null;
  const sbp = options.find((o) => {
    const id = o.id.toLowerCase();
    const name = o.name.toLowerCase();
    return id.includes('sbp') || name.includes('сбп') || name.includes('sbp');
  });
  return sbp?.id ?? options[0].id;
};

const sortOptionsWithSbpFirst = (options?: PaymentMethod['options']) => {
  if (!options || options.length <= 1) return options ?? [];
  const isPreferred = (o: PaymentMethodOption) => {
    const id = o.id.toLowerCase();
    const name = o.name.toLowerCase();
    return id.includes('sbp') || name.includes('сбп') || name.includes('sbp');
  };
  return [...options].sort((a, b) => {
    const ap = isPreferred(a);
    const bp = isPreferred(b);
    if (ap === bp) return 0;
    return ap ? -1 : 1;
  });
};

export default function CabinetTopUp() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { methodId } = useParams<{ methodId: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { formatAmount, currencySymbol, convertAmount, convertToRub, targetCurrency } =
    useCurrency();
  const { openInvoice, openTelegramLink, openLink, platform } = usePlatform();
  const haptic = useHaptic();
  const inputRef = useRef<HTMLInputElement>(null);

  const returnTo = searchParams.get('returnTo');
  const initialAmountRubles = searchParams.get('amount')
    ? parseFloat(searchParams.get('amount')!)
    : undefined;

  const cachedMethods = queryClient.getQueryData<PaymentMethod[]>(['payment-methods']);
  const method = cachedMethods?.find((m) => m.id === methodId);

  const handleNavigateBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleSuccess = useCallback(() => {
    navigate(returnTo || '/balance', { replace: true });
  }, [navigate, returnTo]);

  // Esc → back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleNavigateBack();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleNavigateBack]);

  useCloseOnSuccessNotification(handleSuccess);

  const getInitialAmount = (): string => {
    if (!initialAmountRubles || initialAmountRubles <= 0) return '';
    const converted = convertAmount(initialAmountRubles);
    return targetCurrency === 'IRR' || targetCurrency === 'RUB'
      ? Math.ceil(converted).toString()
      : converted.toFixed(2);
  };

  const [amount, setAmount] = useState(getInitialAmount);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(
    getPreferredOptionId(method?.options),
  );
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Method not in cache → bounce to method selection
  useEffect(() => {
    if (cachedMethods && !method) {
      const params = new URLSearchParams();
      const a = searchParams.get('amount');
      const rt = searchParams.get('returnTo');
      if (a) params.set('amount', a);
      if (rt) params.set('returnTo', rt);
      const qs = params.toString();
      navigate(`/balance/top-up${qs ? `?${qs}` : ''}`, { replace: true });
    }
  }, [cachedMethods, method, navigate, searchParams]);

  useEffect(() => {
    if (!method?.options || method.options.length === 0) {
      if (selectedOption !== null) setSelectedOption(null);
      return;
    }
    const exists = method.options.some((o) => o.id === selectedOption);
    if (!exists) setSelectedOption(getPreferredOptionId(method.options));
  }, [method?.id, method?.options, selectedOption]);

  const starsPaymentMutation = useMutation({
    mutationFn: (amountKopeks: number) => balanceApi.createStarsInvoice(amountKopeks),
    onSuccess: async (data) => {
      if (!data.invoice_url) {
        setError(t('balance.errors.noPaymentLink'));
        return;
      }
      try {
        const status = await openInvoice(data.invoice_url);
        if (status === 'paid') {
          haptic.notification('success');
          setError(null);
          handleSuccess();
        } else if (status === 'failed') {
          haptic.notification('error');
          setError(t('wheel.starsPaymentFailed'));
        }
      } catch (e) {
        setError(t('balance.errors.generic', { details: String(e) }));
      }
    },
    onError: (err: unknown) => {
      haptic.notification('error');
      const axiosError = err as { response?: { data?: { detail?: string }; status?: number } };
      setError(axiosError?.response?.data?.detail || t('balance.errors.invoiceFailed'));
    },
  });

  const topUpMutation = useMutation<
    {
      payment_id: string;
      payment_url?: string;
      invoice_url?: string;
      amount_kopeks: number;
      amount_rubles: number;
      status: string;
      expires_at: string | null;
    },
    unknown,
    number
  >({
    mutationFn: (amountKopeks: number) => {
      if (!method) throw new Error('Method not loaded');
      return balanceApi.createTopUp(amountKopeks, method.id, selectedOption || undefined);
    },
    onSuccess: (data) => {
      const redirectUrl = data.payment_url || data.invoice_url;
      if (redirectUrl) {
        setPaymentUrl(redirectUrl);
        if (method && data.payment_id) {
          const methodKey = method.id.toLowerCase().replace(/-/g, '_');
          const displayName =
            t(`balance.paymentMethods.${methodKey}.name`, { defaultValue: '' }) || method.name;
          saveTopUpPendingInfo({
            amount_kopeks: data.amount_kopeks,
            method_id: method.id,
            method_name: displayName,
            payment_id: data.payment_id,
            created_at: Date.now(),
          });
        }
      }
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '';
      setError(
        detail.includes('not yet implemented') ? t('balance.useBot') : detail || t('common.error'),
      );
    },
  });

  // Auto-focus on desktop
  useEffect(() => {
    if (platform === 'telegram') return;
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [platform]);

  if (!method) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
      </div>
    );
  }

  const hasOptions = !!method.options && method.options.length > 0;
  const orderedOptions = sortOptionsWithSbpFirst(method.options);
  const minRubles = method.min_amount_kopeks / 100;
  const maxRubles = method.max_amount_kopeks / 100;
  const methodKey = method.id.toLowerCase().replace(/-/g, '_');
  const isStarsMethod = methodKey.includes('stars');
  const methodName =
    t(`balance.paymentMethods.${methodKey}.name`, { defaultValue: '' }) || method.name;
  const methodDesc =
    t(`balance.paymentMethods.${methodKey}.description`, { defaultValue: '' }) ||
    method.description ||
    '';
  const Icon = getMethodIcon(method.id);

  const handleSubmit = () => {
    setError(null);
    setPaymentUrl(null);
    inputRef.current?.blur();

    if (!checkRateLimit(RATE_LIMIT_KEYS.PAYMENT, 3, 30000)) {
      setError(
        t('balance.errors.rateLimit', { seconds: getRateLimitResetTime(RATE_LIMIT_KEYS.PAYMENT) }),
      );
      return;
    }
    if (hasOptions && !selectedOption) {
      setError(t('balance.errors.selectMethod'));
      return;
    }
    const amountCurrency = parseFloat(amount);
    if (isNaN(amountCurrency) || amountCurrency <= 0) {
      setError(t('balance.errors.enterAmount'));
      return;
    }
    const amountRubles = convertToRub(amountCurrency);
    if (amountRubles < minRubles || amountRubles > maxRubles) {
      setError(t('balance.errors.amountRange', { min: minRubles, max: maxRubles }));
      return;
    }

    const amountKopeks = Math.round(amountRubles * 100);
    if (isStarsMethod) starsPaymentMutation.mutate(amountKopeks);
    else topUpMutation.mutate(amountKopeks);
  };

  const quickAmounts = [100, 300, 500, 1000].filter((a) => a >= minRubles && a <= maxRubles);
  const currencyDecimals = targetCurrency === 'IRR' || targetCurrency === 'RUB' ? 0 : 2;
  const getQuickValue = (rub: number) =>
    targetCurrency === 'IRR'
      ? Math.round(convertAmount(rub)).toString()
      : convertAmount(rub).toFixed(currencyDecimals);
  const isPending = topUpMutation.isPending || starsPaymentMutation.isPending;

  const handleOpenPayment = () => {
    if (!paymentUrl) return;
    if (paymentUrl.includes('t.me/')) openTelegramLink(paymentUrl);
    else openLink(paymentUrl);
  };

  const handleCopyUrl = async () => {
    if (!paymentUrl) return;
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no-op */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Back link */}
      <button
        onClick={handleNavigateBack}
        className="mb-6 flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/65"
      >
        <ArrowLeft size={14} /> Назад
      </button>

      <h1
        className="mb-6 text-white"
        style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        Пополнение баланса
      </h1>

      {/* Method header card */}
      <GlassCard className="mb-4 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
            <Icon size={20} className="text-white/60" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base text-white" style={{ fontWeight: 600 }}>
              {methodName}
            </p>
            <p className="mt-0.5 text-xs text-white/35">
              {methodDesc ? `${methodDesc} · ` : ''}
              {formatAmount(minRubles, 0)} – {formatAmount(maxRubles, 0)} {currencySymbol}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Sub-options (e.g. SBP / card) */}
      {hasOptions && orderedOptions.length > 0 && (
        <GlassCard className="mb-4 p-6">
          <p
            className="mb-3 text-xs text-white/40"
            style={{ fontWeight: 500, letterSpacing: '0.05em' }}
          >
            СПОСОБ ОПЛАТЫ
          </p>
          <div className="grid grid-cols-2 gap-2">
            {orderedOptions.map((opt) => {
              const isSelected = selectedOption === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedOption(opt.id)}
                  className={`relative rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? 'border-white/20 bg-white/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05]'
                  }`}
                >
                  <p
                    className={`text-sm ${isSelected ? 'text-white/80' : 'text-white/55'}`}
                    style={{ fontWeight: 500 }}
                  >
                    {opt.name}
                  </p>
                  {isSelected && (
                    <span className="absolute right-2.5 top-2.5 inline-flex h-1.5 w-1.5 rounded-full bg-white/70" />
                  )}
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Amount */}
      <GlassCard className="mb-4 p-6">
        <p
          className="mb-3 text-xs text-white/40"
          style={{ fontWeight: 500, letterSpacing: '0.05em' }}
        >
          СУММА ПОПОЛНЕНИЯ
        </p>
        <div className="relative mb-3">
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="0"
            autoComplete="off"
            className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3.5 pr-12 text-white outline-none transition-all placeholder:text-white/20 focus:border-white/20"
            style={{ fontSize: '1.25rem', fontWeight: 500 }}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/35">
            {currencySymbol}
          </span>
        </div>

        {quickAmounts.length > 0 && (
          <div className="mb-3 grid grid-cols-4 gap-2">
            {quickAmounts.map((a) => {
              const val = getQuickValue(a);
              const isSelected = amount === val;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setAmount(val);
                    inputRef.current?.blur();
                  }}
                  className={`rounded-xl border py-2.5 text-sm transition-all ${
                    isSelected
                      ? 'border-white/20 bg-white/[0.08] text-white'
                      : 'border-white/[0.06] bg-white/[0.03] text-white/55 hover:bg-white/[0.05]'
                  }`}
                  style={{ fontWeight: 500 }}
                >
                  {formatAmount(a, 0)} {currencySymbol}
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !amount || parseFloat(amount) <= 0}
          className="w-full rounded-full bg-white py-3.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontWeight: 500 }}
        >
          {isPending ? 'Обработка…' : t('balance.topUp', { defaultValue: 'Пополнить' })}
        </button>
      </GlassCard>

      {/* Error */}
      {error && (
        <GlassCard className="mb-4 border-amber-500/20 bg-amber-500/[0.04] p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400/70" />
            <p className="text-sm text-amber-400/80">{error}</p>
          </div>
        </GlassCard>
      )}

      {/* Payment URL */}
      {paymentUrl && (
        <GlassCard className="mb-4 p-6">
          <div className="mb-3 flex items-center gap-2">
            <Check size={16} className="text-green-400/70" />
            <p className="text-sm text-white" style={{ fontWeight: 500 }}>
              {t('balance.paymentReady', { defaultValue: 'Ссылка на оплату готова' })}
            </p>
          </div>
          <p className="mb-4 text-sm text-white/35" style={{ lineHeight: 1.6 }}>
            {t('balance.clickToOpenPayment', {
              defaultValue: 'Нажмите кнопку ниже, чтобы открыть страницу оплаты в новой вкладке',
            })}
          </p>
          <button
            type="button"
            onClick={handleOpenPayment}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
            style={{ fontWeight: 500 }}
          >
            <ExternalLink size={14} />
            {t('balance.openPaymentPage', { defaultValue: 'Открыть страницу оплаты' })}
          </button>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
            <span className="flex-1 truncate font-mono text-xs text-white/40">{paymentUrl}</span>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="shrink-0 text-white/30 transition-colors hover:text-white/60"
              aria-label="Скопировать"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
          </div>
        </GlassCard>
      )}
    </motion.div>
  );
}
