import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Bitcoin, ChevronRight, CreditCard, QrCode, Sparkles } from 'lucide-react';

import { balanceApi } from '../api/balance';
import { useCurrency } from '../hooks/useCurrency';

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

export default function TopUpMethodSelect() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatAmount, currencySymbol } = useCurrency();

  const amountParam = searchParams.get('amount');
  const amountRubles = amountParam ? parseFloat(amountParam) : null;

  const { data: paymentMethods, isLoading } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: balanceApi.getPaymentMethods,
  });

  const handleMethodClick = (methodId: string) => {
    const params = new URLSearchParams();
    const amount = searchParams.get('amount');
    const returnTo = searchParams.get('returnTo');
    if (amount) params.set('amount', amount);
    if (returnTo) params.set('returnTo', returnTo);
    const qs = params.toString();
    navigate(`/balance/top-up/${methodId}${qs ? `?${qs}` : ''}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="mb-6 flex items-center gap-1.5 text-[15px] text-white/40 transition-colors hover:text-white/65"
      >
        <ArrowLeft size={14} /> {t('common.back', { defaultValue: 'Назад' })}
      </button>

      <h1
        className="text-white"
        style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        {t('balance.selectPaymentMethod', { defaultValue: 'Выберите способ оплаты' })}
      </h1>
      {amountRubles != null && amountRubles > 0 && (
        <p className="mt-1.5 text-[15px] text-white/35">
          {t('balance.topUpAmountHint', {
            defaultValue: 'К пополнению: {{amount}}',
            amount: `${formatAmount(amountRubles)} ${currencySymbol}`,
          })}
        </p>
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
          </div>
        ) : !paymentMethods || paymentMethods.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center">
            <p className="text-[15px] text-white/40">
              {t('balance.noPaymentMethods', { defaultValue: 'Способы оплаты недоступны' })}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((method) => {
              const methodKey = method.id.toLowerCase().replace(/-/g, '_');
              const translatedName = t(`balance.paymentMethods.${methodKey}.name`, {
                defaultValue: '',
              });
              const translatedDesc = t(`balance.paymentMethods.${methodKey}.description`, {
                defaultValue: '',
              });
              const Icon = getMethodIcon(method.id);

              return (
                <button
                  key={method.id}
                  disabled={!method.is_available}
                  onClick={() => method.is_available && handleMethodClick(method.id)}
                  className={`flex w-full items-center justify-between gap-4 rounded-xl border p-5 text-left transition-all ${
                    method.is_available
                      ? 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05]'
                      : 'cursor-not-allowed border-white/[0.04] bg-white/[0.02] opacity-40'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                      <Icon size={20} className="text-white/60" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
                        {translatedName || method.name}
                      </p>
                      <p className="mt-0.5 text-[13px] text-white/25">
                        {(translatedDesc || method.description) &&
                          `${translatedDesc || method.description} · `}
                        {formatAmount(method.min_amount_kopeks / 100, 0)} –{' '}
                        {formatAmount(method.max_amount_kopeks / 100, 0)} {currencySymbol}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-white/25" strokeWidth={1.5} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
