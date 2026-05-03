import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { AlertTriangle, User, Users, Building2 } from 'lucide-react';
import { subscriptionApi } from '../api/subscription';
import { useTheme } from '../hooks/useTheme';
import { getGlassColors } from '../utils/glassTheme';
import { useCurrency } from '../hooks/useCurrency';
import { useHaptic } from '../platform';
import InsufficientBalancePrompt from '../components/InsufficientBalancePrompt';
import { WebBackButton } from '../components/WebBackButton';
import type { Tariff, TariffsPurchaseOptions } from '../types';

const USE_NEW_SHELL = import.meta.env.VITE_USE_NEW_SHELL !== 'false';

const tariffIcon = (tier: number) => {
  if (tier >= 3) return Building2;
  if (tier >= 2) return Users;
  return User;
};

export default function RenewSubscription() {
  const { subscriptionId } = useParams<{ subscriptionId: string }>();
  const subId = subscriptionId ? Number(subscriptionId) : undefined;

  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isDark } = useTheme();
  const g = getGlassColors(isDark);
  const { formatAmount, currencySymbol } = useCurrency();
  const { impact } = useHaptic();

  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [selectedTariffId, setSelectedTariffId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load subscription detail for tariff name
  const { data: subscriptionResponse } = useQuery({
    queryKey: ['subscription', subId ?? 'default'],
    queryFn: () => subscriptionApi.getSubscription(subId),
    staleTime: 30_000,
  });
  const subscription = subscriptionResponse?.subscription ?? null;

  // Load renewal options (legacy/classic fallback)
  const { data: options, isLoading } = useQuery({
    queryKey: ['renewal-options', subId ?? 'default'],
    queryFn: () => subscriptionApi.getRenewalOptions(subId),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Load purchase options (multi-tariff aware)
  const { data: purchaseOptions } = useQuery({
    queryKey: ['purchase-options', subId],
    queryFn: () => subscriptionApi.getPurchaseOptions(subId),
    staleTime: 0,
  });
  const balanceKopeks = purchaseOptions?.balance_kopeks ?? 0;

  const tariffsMode =
    purchaseOptions?.sales_mode === 'tariffs' ? (purchaseOptions as TariffsPurchaseOptions) : null;
  const allTariffs: Tariff[] = tariffsMode?.tariffs ?? [];
  const currentTariffId = tariffsMode?.current_tariff_id ?? null;

  const renewMutation = useMutation({
    mutationFn: (periodDays: number) => subscriptionApi.renewSubscription(periodDays, subId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', subId] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['renewal-options', subId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options', subId] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      navigate(USE_NEW_SHELL || !subId ? '/subscriptions' : `/subscriptions/${subId}`, {
        replace: true,
      });
    },
    onError: (err: unknown) => {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? null)
          : null;

      if (detail && typeof detail === 'object' && 'code' in (detail as Record<string, unknown>)) {
        const typed = detail as { code: string; missing_amount?: number };
        if (typed.code === 'insufficient_funds' && typed.missing_amount) {
          setError(`insufficient:${typed.missing_amount}`);
          return;
        }
      }
      setError(typeof detail === 'string' ? detail : t('common.error'));
    },
  });

  const switchMutation = useMutation({
    mutationFn: (tariffId: number) => subscriptionApi.switchTariff(tariffId, subId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', subId] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options', subId] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      navigate(USE_NEW_SHELL || !subId ? '/subscriptions' : `/subscriptions/${subId}`, {
        replace: true,
      });
    },
    onError: (err: unknown) => {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? null)
          : null;
      setError(typeof detail === 'string' ? detail : t('common.error'));
    },
  });

  const handleRenew = (periodDays: number) => {
    impact('medium');
    setError(null);
    renewMutation.mutate(periodDays);
  };

  const handleSwitch = (tariffId: number) => {
    impact('medium');
    setError(null);
    switchMutation.mutate(tariffId);
  };

  const isSubmitting = renewMutation.isPending || switchMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  const insufficientMatch = error?.match(/^insufficient:(\d+)$/);
  const missingAmount = insufficientMatch ? Number(insufficientMatch[1]) : null;

  // ─── New cabinet shell (matches VernoVPN gift select view) ──────────
  if (USE_NEW_SHELL) {
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

    // Multi-tariff mode: list all tariffs (Обычный/Семейный/Бизнес/…)
    const isMultiTariff = allTariffs.length > 0;

    // Auto-compute % savings of long period vs the shortest period in same tariff
    const computeAutoDiscount = (
      days: number,
      priceKopeks: number,
      baseDays: number,
      basePriceKopeks: number,
    ): number => {
      if (priceKopeks <= 0 || basePriceKopeks <= 0 || baseDays <= 0 || days <= baseDays) {
        return 0;
      }
      const ratio = priceKopeks / days / (basePriceKopeks / baseDays);
      return Math.max(0, Math.round((1 - ratio) * 100));
    };

    // Build period pill list — discount = max across tariffs (explicit or auto)
    let pillDays: { days: number; discount: number }[] = [];
    if (isMultiTariff) {
      const map = new Map<number, number>();
      allTariffs
        .filter((tr) => tr.is_available)
        .forEach((tr) => {
          const sorted = [...tr.periods].sort((a, b) => a.days - b.days);
          const base = sorted[0];
          sorted.forEach((p) => {
            const explicit = p.discount_percent ?? 0;
            const auto = base
              ? computeAutoDiscount(p.days, p.price_kopeks, base.days, base.price_kopeks)
              : 0;
            const d = Math.max(explicit, auto);
            const cur = map.get(p.days) ?? 0;
            if (d > cur) map.set(p.days, d);
            else if (!map.has(p.days)) map.set(p.days, 0);
          });
        });
      pillDays = [...map.entries()]
        .map(([days, discount]) => ({ days, discount }))
        .sort((a, b) => a.days - b.days);
    } else {
      const sortedOptions = options
        ? [...options].sort((a, b) => a.period_days - b.period_days)
        : [];
      const base = sortedOptions[0];
      pillDays = sortedOptions.map((o) => ({
        days: o.period_days,
        discount: Math.max(
          o.discount_percent ?? 0,
          base
            ? computeAutoDiscount(
                o.period_days,
                o.price_kopeks,
                base.period_days,
                base.price_kopeks,
              )
            : 0,
        ),
      }));
    }

    const activeDays = selectedPeriod ?? pillDays[0]?.days ?? null;

    // Resolve current selection (price for active period & active tariff)
    const activeTariff: Tariff | null = isMultiTariff
      ? (allTariffs.find((tr) => tr.id === selectedTariffId) ??
        allTariffs.find((tr) => tr.id === currentTariffId) ??
        allTariffs[0] ??
        null)
      : null;
    const activeTariffId = activeTariff?.id ?? null;

    // Price for active(tariff,period)
    const activeTariffPeriod = activeTariff
      ? activeTariff.periods.find((p) => p.days === activeDays)
      : null;
    const classicOption =
      !isMultiTariff && options
        ? (options.find((o) => o.period_days === activeDays) ?? null)
        : null;

    const activePriceKopeks =
      activeTariffPeriod?.price_kopeks ?? classicOption?.price_kopeks ?? null;
    const activeOriginalPrice =
      activeTariffPeriod?.original_price_kopeks ?? classicOption?.original_price_kopeks ?? null;
    const activeAffordable = activePriceKopeks != null ? balanceKopeks >= activePriceKopeks : false;

    const isSwitchAction =
      isMultiTariff && activeTariffId != null && activeTariffId !== currentTariffId;

    const handleSubmit = () => {
      if (activeDays == null) return;
      if (isSwitchAction && activeTariffId != null) {
        handleSwitch(activeTariffId);
      } else {
        handleRenew(activeDays);
      }
    };

    return (
      <div style={{ fontFamily: 'Inter, sans-serif' }}>
        {/* Header: title left, back link right */}
        <div className="mb-8 flex items-center justify-between">
          <h1
            className="text-white"
            style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
          >
            {isSwitchAction
              ? t('subscription.switchTariff.title', 'Сменить тариф')
              : t('subscription.extend', 'Продлить подписку')}
          </h1>
          <button
            onClick={() => navigate('/subscriptions')}
            className="text-sm text-white/30 transition-colors hover:text-white/50"
          >
            ← Назад
          </button>
        </div>

        {pillDays.length === 0 ? (
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
            <p className="text-sm text-white/40">
              {t('subscription.noRenewalOptions', 'Нет доступных вариантов продления')}
            </p>
          </div>
        ) : (
          <>
            {/* Period pills */}
            {pillDays.length > 1 && (
              <div className="mb-6 flex justify-center">
                <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
                  {pillDays.map(({ days, discount }) => {
                    const isSel = activeDays === days;
                    return (
                      <button
                        key={days}
                        onClick={() => {
                          impact('light');
                          setSelectedPeriod(days);
                          setError(null);
                        }}
                        className={`relative rounded-full px-4 py-2 text-sm transition-all ${
                          isSel ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/55'
                        }`}
                      >
                        {periodLabel(days)}
                        {discount > 0 && (
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

            {/* Tariff list (multi) or single card */}
            {isMultiTariff ? (
              <div className="mb-6 space-y-3">
                {allTariffs
                  .filter((tr) => tr.is_available)
                  .map((tr) => {
                    const period =
                      activeDays != null
                        ? tr.periods.find((p) => p.days === activeDays)
                        : undefined;
                    const isSel = activeTariffId === tr.id;
                    const unavailable = activeDays != null && !period;
                    const Icon = tariffIcon(tr.tier_level);
                    const months = period ? Math.max(1, Math.round(period.days / 30)) : 0;
                    const monthly =
                      period && months > 1 ? Math.round(period.price_kopeks / months) : null;
                    return (
                      <button
                        key={tr.id}
                        disabled={unavailable}
                        onClick={() => {
                          impact('light');
                          setSelectedTariffId(tr.id);
                          setError(null);
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
                          <Icon size={18} className="shrink-0 text-white/30" strokeWidth={1.5} />
                          <div className="min-w-0 text-left">
                            <p className="text-sm text-white/70" style={{ fontWeight: 500 }}>
                              {tr.name}
                              {tr.id === currentTariffId && (
                                <span className="ml-2 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/40">
                                  Текущий
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-white/25">
                              {tr.is_unlimited_traffic
                                ? 'Безлимит'
                                : tr.traffic_limit_gb > 0
                                  ? `${tr.traffic_limit_gb} ГБ`
                                  : tr.traffic_limit_label}
                              {' • '}
                              до {tr.device_limit} устр.
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {period ? (
                            <>
                              <span
                                className="text-white"
                                style={{ fontSize: '1.2rem', fontWeight: 600 }}
                              >
                                {period.price_kopeks === 0
                                  ? 'Бесплатно'
                                  : `${formatAmount(period.price_kopeks / 100)} ${currencySymbol}`}
                              </span>
                              {monthly != null && (
                                <p className="mt-0.5 text-xs text-white/25">
                                  {formatAmount(monthly / 100)} {currencySymbol}/мес
                                </p>
                              )}
                              {period.original_price_kopeks &&
                                period.original_price_kopeks > period.price_kopeks && (
                                  <p className="mt-0.5 text-xs text-white/25 line-through">
                                    {formatAmount(period.original_price_kopeks / 100)}{' '}
                                    {currencySymbol}
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
            ) : (
              classicOption &&
              subscription && (
                <div className="mb-6 flex w-full items-center justify-between rounded-xl border border-white/20 bg-white/[0.08] p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <User size={18} className="shrink-0 text-white/30" strokeWidth={1.5} />
                    <div className="min-w-0 text-left">
                      <p className="text-sm text-white/70" style={{ fontWeight: 500 }}>
                        {subscription.tariff_name ?? t('subscription.tariff', 'Тариф')}
                      </p>
                      <p className="text-xs text-white/25">
                        {subscription.traffic_limit_gb > 0
                          ? `${subscription.traffic_limit_gb} ГБ`
                          : 'Безлимит'}
                        {' • '}
                        до {subscription.device_limit} устр.
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-white" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                      {classicOption.price_kopeks === 0
                        ? t('subscription.free', 'Бесплатно')
                        : `${formatAmount(classicOption.price_kopeks / 100)} ${currencySymbol}`}
                    </span>
                    {(() => {
                      const months = Math.max(1, Math.round(classicOption.period_days / 30));
                      if (months > 1 && classicOption.price_kopeks > 0) {
                        const perMonth = classicOption.price_kopeks / months;
                        return (
                          <p className="mt-0.5 text-xs text-white/25">
                            {formatAmount(perMonth / 100)} {currencySymbol}/мес
                          </p>
                        );
                      }
                      return null;
                    })()}
                    {activeOriginalPrice && (
                      <p className="mt-0.5 text-xs text-white/25 line-through">
                        {formatAmount(activeOriginalPrice / 100)} {currencySymbol}
                      </p>
                    )}
                  </div>
                </div>
              )
            )}

            {/* Insufficient balance hint */}
            {activePriceKopeks != null && !activeAffordable && activePriceKopeks > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400/70" />
                <p className="text-sm text-amber-400/70">
                  {t(
                    'subscription.insufficientBalanceAmount',
                    'Недостаточно средств. Не хватает {{missing}}',
                    {
                      missing: `${formatAmount(
                        (activePriceKopeks - balanceKopeks) / 100,
                      )} ${currencySymbol}`,
                    },
                  )}{' '}
                  <button
                    onClick={() => navigate('/balance')}
                    className="underline-offset-2 hover:underline"
                  >
                    {t('common.topUpBalance', 'Пополнить баланс')}
                  </button>
                </p>
              </div>
            )}
          </>
        )}

        {/* Insufficient balance prompt from server */}
        {missingAmount && (
          <div className="mb-4">
            <InsufficientBalancePrompt missingAmountKopeks={missingAmount} compact />
          </div>
        )}

        {/* Generic error */}
        {error && !missingAmount && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5">
            <AlertTriangle size={14} className="shrink-0 text-red-400/80" />
            <p className="text-xs text-red-400/80">{error}</p>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleSubmit}
          disabled={
            activeDays == null || activePriceKopeks == null || !activeAffordable || isSubmitting
          }
          className="w-full rounded-full bg-white py-3.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ fontWeight: 500 }}
        >
          {isSubmitting
            ? t('common.processing', 'Обработка...')
            : isSwitchAction
              ? t('subscription.switchTariff.submit', 'Сменить тариф')
              : t('subscription.extend', 'Продлить подписку')}
        </button>
      </div>
    );
  }

  // ─── Legacy shell ───────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <WebBackButton to={`/subscriptions/${subId}`} />
        <div>
          <h1 className="text-2xl font-bold" style={{ color: g.text }}>
            {t('subscription.extend', 'Продлить подписку')}
          </h1>
          {subscription?.tariff_name && (
            <p className="mt-1 text-sm" style={{ color: g.textSecondary }}>
              {subscription.tariff_name}
            </p>
          )}
        </div>
      </div>

      <div
        className="flex items-center justify-between rounded-2xl p-4"
        style={{ background: g.cardBg, border: `1px solid ${g.cardBorder}` }}
      >
        <span className="text-sm" style={{ color: g.textSecondary }}>
          {t('common.balance', 'Баланс')}
        </span>
        <span className="text-base font-semibold" style={{ color: g.text }}>
          {formatAmount(balanceKopeks / 100)} {currencySymbol}
        </span>
      </div>

      {!options || options.length === 0 ? (
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: g.cardBg, border: `1px solid ${g.cardBorder}` }}
        >
          <p style={{ color: g.textSecondary }}>
            {t('subscription.noRenewalOptions', 'Нет доступных вариантов продления')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const isSelected = selectedPeriod === option.period_days;
            const canAfford = balanceKopeks >= option.price_kopeks;
            const months = Math.max(1, Math.round(option.period_days / 30));
            const perMonth = option.price_kopeks / months;

            return (
              <button
                key={option.period_days}
                onClick={() => {
                  impact('light');
                  setSelectedPeriod(option.period_days);
                  setError(null);
                }}
                className="w-full rounded-2xl border p-4 text-left transition-all duration-200"
                style={{
                  background: isSelected
                    ? isDark
                      ? 'rgba(var(--color-accent-400), 0.08)'
                      : 'rgba(var(--color-accent-400), 0.05)'
                    : g.cardBg,
                  borderColor: isSelected ? 'rgb(var(--color-accent-400))' : g.cardBorder,
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-base font-semibold" style={{ color: g.text }}>
                      {option.period_days} {t('common.units.days', 'дней')}
                    </span>
                    {option.discount_percent > 0 && (
                      <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        -{option.discount_percent}%
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-base font-semibold" style={{ color: g.text }}>
                      {option.price_kopeks === 0
                        ? t('subscription.free', 'Бесплатно')
                        : `${formatAmount(option.price_kopeks / 100)} ${currencySymbol}`}
                    </div>
                    {months > 1 && (
                      <div className="text-[11px]" style={{ color: g.textSecondary }}>
                        {formatAmount(perMonth / 100)} {currencySymbol}/
                        {t('common.units.mo', 'мес')}
                      </div>
                    )}
                    {option.original_price_kopeks && (
                      <div className="text-[11px] line-through" style={{ color: g.textSecondary }}>
                        {formatAmount(option.original_price_kopeks / 100)} {currencySymbol}
                      </div>
                    )}
                  </div>
                </div>
                {!canAfford && (
                  <div className="mt-1 text-[11px] text-red-400">
                    {t(
                      'subscription.insufficientBalanceAmount',
                      'Недостаточно средств. Не хватает {{missing}}',
                      {
                        missing: `${formatAmount((option.price_kopeks - balanceKopeks) / 100)} ${currencySymbol}`,
                      },
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {missingAmount && <InsufficientBalancePrompt missingAmountKopeks={missingAmount} compact />}

      {error && !missingAmount && (
        <div className="rounded-xl bg-red-400/10 p-3 text-center text-sm text-red-400">{error}</div>
      )}

      {selectedPeriod && (
        <button
          onClick={() => handleRenew(selectedPeriod)}
          disabled={renewMutation.isPending}
          className="w-full rounded-2xl bg-accent-500 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-600 disabled:opacity-50"
        >
          {renewMutation.isPending
            ? t('common.processing', 'Обработка...')
            : t('subscription.extend', 'Продлить подписку')}
        </button>
      )}
    </div>
  );
}
