import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Copy,
  Check,
  Share2,
  Users,
  Handshake,
  TrendingUp,
  Gift,
  ChevronRight,
  Clock,
  Wallet,
  AlertCircle,
} from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { referralApi } from '@/api/referral';
import { partnerApi } from '@/api/partners';
import { withdrawalApi } from '@/api/withdrawals';
import { brandingApi } from '@/api/branding';
import { useCurrency } from '@/hooks/useCurrency';
import { copyToClipboard } from '@/utils/clipboard';

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

const formatDate = (iso: string | null | undefined, locale = 'ru-RU') => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

function CopyField({
  label,
  value,
  shareText,
}: {
  label: string;
  value: string;
  shareText?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await copyToClipboard(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };
  const share = () => {
    if (!value) return;
    if (navigator.share) {
      navigator.share({ text: shareText || value, url: value }).catch(() => {});
      return;
    }
    const tg = `https://t.me/share/url?url=${encodeURIComponent(value)}${
      shareText ? `&text=${encodeURIComponent(shareText)}` : ''
    }`;
    window.open(tg, '_blank', 'noopener,noreferrer');
  };
  return (
    <div>
      <p className="mb-1.5 text-xs text-white/30">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-2.5">
        <span className="flex-1 truncate font-mono text-sm text-white/35">{value}</span>
        <button
          onClick={copy}
          className="shrink-0 text-white/25 transition-colors hover:text-white/50"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
        <button
          onClick={share}
          className="shrink-0 text-white/25 transition-colors hover:text-white/50"
        >
          <Share2 size={14} />
        </button>
      </div>
    </div>
  );
}

const withdrawalStatusColor: Record<string, string> = {
  completed: 'text-green-400/70',
  approved: 'text-green-400/70',
  pending: 'text-yellow-400/70',
  rejected: 'text-red-400/70',
  cancelled: 'text-white/30',
};

export default function CabinetReferral() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { formatPositive, formatWithCurrency, currencySymbol, formatAmount } = useCurrency();

  // ── Data ──────────────────────────────────────────────────────────
  const { data: info, isLoading } = useQuery({
    queryKey: ['referral-info'],
    queryFn: referralApi.getReferralInfo,
    enabled: isAuthenticated,
  });

  const { data: terms } = useQuery({
    queryKey: ['referral-terms'],
    queryFn: referralApi.getReferralTerms,
    enabled: isAuthenticated,
  });

  const { data: referralList } = useQuery({
    queryKey: ['referral-list'],
    queryFn: () => referralApi.getReferralList({ per_page: 10 }),
    enabled: isAuthenticated,
  });

  const { data: earnings } = useQuery({
    queryKey: ['referral-earnings'],
    queryFn: () => referralApi.getReferralEarnings({ per_page: 10 }),
    enabled: isAuthenticated,
  });

  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: brandingApi.getBranding,
    enabled: isAuthenticated,
    staleTime: 60000,
  });

  const { data: partnerStatus } = useQuery({
    queryKey: ['partner-status'],
    queryFn: partnerApi.getStatus,
    enabled: isAuthenticated,
  });

  const isPartner = partnerStatus?.partner_status === 'approved';

  const { data: withdrawalBalance } = useQuery({
    queryKey: ['withdrawal-balance'],
    queryFn: withdrawalApi.getBalance,
    enabled: isAuthenticated && isPartner,
  });

  const { data: withdrawalHistory } = useQuery({
    queryKey: ['withdrawal-history'],
    queryFn: withdrawalApi.getHistory,
    enabled: isAuthenticated && isPartner,
  });

  const cancelWithdrawalMutation = useMutation({
    mutationFn: withdrawalApi.cancel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['withdrawal-balance'] });
      queryClient.invalidateQueries({ queryKey: ['withdrawal-history'] });
    },
  });

  // ── Derived ───────────────────────────────────────────────────────
  const botReferralLink = info?.bot_referral_link || '';
  const cabinetReferralLink =
    info?.referral_link ||
    (info?.referral_code ? `${window.location.origin}/login?ref=${info.referral_code}` : '');

  const shareText = t('referral.shareMessage', {
    percent: info?.commission_percent || 0,
    botName: branding?.name || import.meta.env.VITE_APP_NAME || 'Cabinet',
    defaultValue: '',
  });

  const partnerStatusValue = partnerStatus?.partner_status ?? 'none';
  const partnerSectionVisible = terms?.partner_section_visible !== false;

  // ── Loading ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
      </div>
    );
  }

  // ── Disabled ──────────────────────────────────────────────────────
  if (terms && !terms.is_enabled) {
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
          {t('referral.title', { defaultValue: 'Реферальная программа' })}
        </h1>
        <GlassCard className="p-8 text-center">
          <Users size={28} className="mx-auto mb-3 text-white/20" />
          <p className="text-sm text-white/40">
            {t('referral.disabled', { defaultValue: 'Реферальная программа отключена' })}
          </p>
        </GlassCard>
      </motion.div>
    );
  }

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
        {t('referral.title', { defaultValue: 'Реферальная программа' })}
      </h1>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GlassCard className="p-5 text-center">
          <Users size={18} className="mx-auto mb-2 text-white/20" />
          <p className="text-white" style={{ fontSize: '1.5rem', fontWeight: 600 }}>
            {info?.total_referrals ?? 0}
          </p>
          <p className="mt-1 text-xs text-white/30">
            {t('referral.stats.totalReferrals', { defaultValue: 'Всего рефералов' })}
          </p>
        </GlassCard>
        <GlassCard className="p-5 text-center">
          <TrendingUp size={18} className="mx-auto mb-2 text-white/20" />
          <p className="text-white" style={{ fontSize: '1.5rem', fontWeight: 600 }}>
            {formatWithCurrency(info?.total_earnings_rubles ?? 0)}
          </p>
          <p className="mt-1 text-xs text-white/30">
            {t('referral.stats.totalEarnings', { defaultValue: 'Общий заработок' })}
          </p>
        </GlassCard>
        <GlassCard className="p-5 text-center">
          <Gift size={18} className="mx-auto mb-2 text-white/20" />
          <p className="text-white" style={{ fontSize: '1.5rem', fontWeight: 600 }}>
            {info?.commission_percent ?? 0}%
          </p>
          <p className="mt-1 text-xs text-white/30">
            {t('referral.stats.commissionRate', { defaultValue: 'Комиссия' })}
          </p>
        </GlassCard>
      </div>

      {/* Referral links */}
      <GlassCard className="mb-4 p-6">
        <p
          className="mb-4 text-xs text-white/40"
          style={{ fontWeight: 500, letterSpacing: '0.05em' }}
        >
          {t('referral.yourLink', { defaultValue: 'ВАШИ РЕФЕРАЛЬНЫЕ ССЫЛКИ' }).toUpperCase()}
        </p>
        <div className="mb-4 space-y-4">
          {botReferralLink && (
            <CopyField
              label={t('referral.botLink', { defaultValue: 'Ссылка на бота' })}
              value={botReferralLink}
              shareText={shareText}
            />
          )}
          {cabinetReferralLink && (
            <CopyField
              label={t('referral.cabinetLink', { defaultValue: 'Ссылка на кабинет' })}
              value={cabinetReferralLink}
              shareText={shareText}
            />
          )}
        </div>
        {info?.commission_percent ? (
          <p className="text-sm text-white/40">
            {t('referral.shareHint', {
              percent: info.commission_percent,
              defaultValue: `До ${info.commission_percent}% с пополнений друзей`,
            })}
          </p>
        ) : null}
      </GlassCard>

      {/* Program conditions */}
      {terms && (
        <GlassCard className="mb-4 p-6">
          <p
            className="mb-3 text-xs text-white/40"
            style={{ fontWeight: 500, letterSpacing: '0.05em' }}
          >
            {t('referral.terms.title', { defaultValue: 'УСЛОВИЯ ПРОГРАММЫ' }).toUpperCase()}
          </p>
          <div className="space-y-2 text-sm text-white/35" style={{ lineHeight: 1.65 }}>
            <p>
              •{' '}
              {t('referral.condition.invite', {
                defaultValue: 'Вы приглашаете друга по своей ссылке',
              })}
            </p>
            <p>
              •{' '}
              {t('referral.condition.minTopup', {
                amount: `${formatAmount(terms.minimum_topup_rubles)} ${currencySymbol}`,
                defaultValue: `Друг регистрируется и пополняет баланс (от ${formatAmount(
                  terms.minimum_topup_rubles,
                )} ${currencySymbol})`,
              })}
            </p>
            <p>
              •{' '}
              {t('referral.condition.commission', {
                percent: terms.commission_percent,
                defaultValue: `Вы получаете ${terms.commission_percent}% с каждого его пополнения`,
              })}
            </p>
            {terms.first_topup_bonus_kopeks > 0 && (
              <p>
                •{' '}
                {t('referral.condition.newUserBonus', {
                  amount: formatPositive(terms.first_topup_bonus_rubles),
                  defaultValue: `Друг получает бонус ${formatPositive(
                    terms.first_topup_bonus_rubles,
                  )} на первое пополнение`,
                })}
              </p>
            )}
            {terms.inviter_bonus_kopeks > 0 && (
              <p>
                •{' '}
                {t('referral.condition.inviterBonus', {
                  amount: formatPositive(terms.inviter_bonus_rubles),
                  defaultValue: `Вы получаете единоразовый бонус ${formatPositive(
                    terms.inviter_bonus_rubles,
                  )} за приглашённого`,
                })}
              </p>
            )}
            {terms.max_commission_payments > 0 && (
              <p>
                •{' '}
                {t('referral.condition.maxPayments', {
                  count: terms.max_commission_payments,
                  defaultValue: `Комиссия начисляется с первых ${terms.max_commission_payments} пополнений`,
                })}
              </p>
            )}
          </div>
        </GlassCard>
      )}

      {/* Referrals list */}
      <GlassCard className="mb-4 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Users size={15} className="text-white/25" />
          <span className="text-sm text-white/40" style={{ fontWeight: 500 }}>
            {t('referral.yourReferrals', { defaultValue: 'Ваши рефералы' })}
          </span>
        </div>
        {referralList?.items && referralList.items.length > 0 ? (
          referralList.items.map((r) => {
            const name =
              r.first_name ||
              (r.username ? `@${r.username}` : null) ||
              t('referral.anonymousUser', { id: r.id, defaultValue: `Пользователь #${r.id}` });
            return (
              <div
                key={r.id}
                className="flex items-start justify-between gap-3 border-b border-white/[0.04] py-2.5 last:border-0"
              >
                <div>
                  <p className="text-sm text-white/50">{name}</p>
                  <p className="text-xs text-white/20">{formatDate(r.created_at, i18n.language)}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs ${r.has_paid ? 'text-green-400/60' : 'text-white/25'}`}>
                    {r.has_paid
                      ? t('referral.status.paid', { defaultValue: 'Оплатил' })
                      : t('referral.status.pending', { defaultValue: 'Регистрация' })}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-white/30">
            {t('referral.noReferrals', { defaultValue: 'У вас пока нет рефералов.' })}
          </p>
        )}
      </GlassCard>

      {/* Earnings history */}
      {earnings?.items && earnings.items.length > 0 && (
        <GlassCard className="mb-4 p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-white/25" />
            <span className="text-sm text-white/40" style={{ fontWeight: 500 }}>
              {t('referral.earningsHistory', { defaultValue: 'История начислений' })}
            </span>
          </div>
          {earnings.items.map((e) => {
            const refName =
              e.referral_first_name ||
              (e.referral_username ? `@${e.referral_username}` : null) ||
              t('referral.anonymousReferral', { defaultValue: 'Реферал' });
            return (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 border-b border-white/[0.04] py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white/50">{refName}</p>
                  <p className="text-xs text-white/20">
                    {t(`referral.reasons.${e.reason}`, {
                      defaultValue: e.reason,
                    })}{' '}
                    • {formatDate(e.created_at, i18n.language)}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-green-400/60" style={{ fontWeight: 500 }}>
                  {formatPositive(e.amount_rubles)}
                </span>
              </div>
            );
          })}
        </GlassCard>
      )}

      {/* ── Partner section ───────────────────────────────────────── */}
      {partnerSectionVisible && partnerStatusValue === 'none' && (
        <GlassCard className="mb-4 p-6">
          <div className="mb-2 flex items-center gap-2">
            <Handshake size={16} className="text-white/25" />
            <span className="text-sm text-white/50" style={{ fontWeight: 500 }}>
              {t('referral.partner.becomePartner', { defaultValue: 'Стать партнером' })}
            </span>
          </div>
          <p className="mb-4 text-xs text-white/25" style={{ lineHeight: 1.6 }}>
            {t('referral.partner.becomePartnerDesc', {
              defaultValue:
                'Партнёрская программа — следующий уровень: повышенная комиссия, вывод заработка, персональные условия.',
            })}
          </p>
          <Link
            to="/referral/partner/apply"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/[0.05]"
          >
            {t('referral.partner.applyButton', { defaultValue: 'Подать заявку' })}{' '}
            <ChevronRight size={14} />
          </Link>
        </GlassCard>
      )}

      {partnerSectionVisible && partnerStatusValue === 'pending' && (
        <GlassCard className="mb-4 border-yellow-500/20 p-6">
          <div className="mb-2 flex items-center gap-2">
            <Clock size={16} className="text-yellow-400/60" />
            <span className="text-sm text-white/50" style={{ fontWeight: 500 }}>
              {t('referral.partner.underReview', { defaultValue: 'Заявка на рассмотрении' })}
            </span>
          </div>
          <p className="text-xs text-white/30" style={{ lineHeight: 1.6 }}>
            {t('referral.partner.underReviewDesc', {
              defaultValue: 'Мы рассмотрим вашу заявку в ближайшее время.',
            })}
          </p>
          {partnerStatus?.latest_application?.created_at && (
            <p className="mt-2 text-xs text-white/20">
              {t('referral.partner.submittedAt', {
                date: formatDate(partnerStatus.latest_application.created_at, i18n.language),
                defaultValue: `Отправлено ${formatDate(
                  partnerStatus.latest_application.created_at,
                  i18n.language,
                )}`,
              })}
            </p>
          )}
        </GlassCard>
      )}

      {partnerSectionVisible && partnerStatusValue === 'rejected' && (
        <GlassCard className="mb-4 border-red-500/20 p-6">
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-400/60" />
            <span className="text-sm text-white/50" style={{ fontWeight: 500 }}>
              {t('referral.partner.rejected', { defaultValue: 'Заявка отклонена' })}
            </span>
          </div>
          {partnerStatus?.latest_application?.admin_comment && (
            <p className="mb-4 text-xs text-white/35" style={{ lineHeight: 1.6 }}>
              {partnerStatus.latest_application.admin_comment}
            </p>
          )}
          <Link
            to="/referral/partner/apply"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/[0.05]"
          >
            {t('referral.partner.reapplyButton', { defaultValue: 'Подать снова' })}{' '}
            <ChevronRight size={14} />
          </Link>
        </GlassCard>
      )}

      {partnerSectionVisible && partnerStatusValue === 'approved' && (
        <GlassCard className="mb-4 border-green-500/20 p-6">
          <div className="mb-2 flex items-center gap-2">
            <Handshake size={16} className="text-green-400/60" />
            <span className="text-sm text-white/50" style={{ fontWeight: 500 }}>
              {t('referral.partner.partnerStatus', { defaultValue: 'Статус партнёра' })}
            </span>
            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] text-green-400/70">
              {t('referral.partner.active', { defaultValue: 'Активен' })}
            </span>
          </div>
          <p className="text-xs text-white/30" style={{ lineHeight: 1.6 }}>
            {t('referral.partner.commissionInfo', {
              percent: partnerStatus?.commission_percent ?? 0,
              defaultValue: `Ваша комиссия: ${partnerStatus?.commission_percent ?? 0}%`,
            })}
          </p>
        </GlassCard>
      )}

      {/* Partner campaigns (approved only) */}
      {partnerSectionVisible &&
        isPartner &&
        partnerStatus?.campaigns &&
        partnerStatus.campaigns.length > 0 && (
          <GlassCard className="mb-4 p-6">
            <p
              className="mb-4 text-xs text-white/40"
              style={{ fontWeight: 500, letterSpacing: '0.05em' }}
            >
              {t('referral.partner.yourCampaigns', {
                defaultValue: 'ВАШИ КАМПАНИИ',
              }).toUpperCase()}
            </p>
            <div className="space-y-4">
              {partnerStatus.campaigns.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white/70" style={{ fontWeight: 500 }}>
                        {c.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-white/25">{c.start_parameter}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm text-green-400/60" style={{ fontWeight: 500 }}>
                        {formatWithCurrency(c.earnings_kopeks / 100)}
                      </p>
                      <p className="text-[11px] text-white/25">
                        {c.referrals_count}/{c.registrations_count}
                      </p>
                    </div>
                  </div>
                  {(c.deep_link || c.web_link) && (
                    <div className="space-y-2">
                      {c.deep_link && (
                        <CopyField
                          label={t('referral.partner.deepLink', {
                            defaultValue: 'Deep-link',
                          })}
                          value={c.deep_link}
                          shareText={shareText}
                        />
                      )}
                      {c.web_link && (
                        <CopyField
                          label={t('referral.partner.webLink', { defaultValue: 'Web-link' })}
                          value={c.web_link}
                          shareText={shareText}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        )}

      {/* Withdrawal section (approved partners only) */}
      {partnerSectionVisible && isPartner && withdrawalBalance && (
        <GlassCard className="mb-4 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Wallet size={16} className="text-white/25" />
            <span className="text-sm text-white/40" style={{ fontWeight: 500 }}>
              {t('referral.withdrawal.title', { defaultValue: 'Вывод средств' })}
            </span>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 md:col-span-1">
              <p className="text-xs text-white/30">
                {t('referral.withdrawal.available', { defaultValue: 'Доступно' })}
              </p>
              <p
                className="mt-1 text-green-400/70"
                style={{ fontSize: '1.25rem', fontWeight: 600 }}
              >
                {formatWithCurrency(withdrawalBalance.available_total / 100)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-xs text-white/30">
                {t('referral.withdrawal.totalEarned', { defaultValue: 'Всего заработано' })}
              </p>
              <p className="mt-1 text-sm text-white/60" style={{ fontWeight: 500 }}>
                {formatWithCurrency(withdrawalBalance.total_earned / 100)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-xs text-white/30">
                {t('referral.withdrawal.withdrawn', { defaultValue: 'Выведено' })}
              </p>
              <p className="mt-1 text-sm text-white/60" style={{ fontWeight: 500 }}>
                {formatWithCurrency(withdrawalBalance.withdrawn / 100)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-xs text-white/30">
                {t('referral.withdrawal.spent', { defaultValue: 'Потрачено' })}
              </p>
              <p className="mt-1 text-sm text-white/60" style={{ fontWeight: 500 }}>
                {formatWithCurrency(withdrawalBalance.referral_spent / 100)}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-xs text-white/30">
                {t('referral.withdrawal.pending', { defaultValue: 'В обработке' })}
              </p>
              <p className="mt-1 text-sm text-yellow-400/70" style={{ fontWeight: 500 }}>
                {formatWithCurrency(withdrawalBalance.pending / 100)}
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/referral/withdrawal/request')}
            disabled={!withdrawalBalance.can_request}
            className="rounded-full bg-white px-6 py-2.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontWeight: 500 }}
          >
            {t('referral.withdrawal.requestButton', { defaultValue: 'Запросить вывод' })}
          </button>
          {!withdrawalBalance.can_request && withdrawalBalance.cannot_request_reason ? (
            <p className="mt-2 text-xs text-white/30">{withdrawalBalance.cannot_request_reason}</p>
          ) : (
            withdrawalBalance.min_amount_kopeks > 0 && (
              <p className="mt-2 text-xs text-white/30">
                {t('referral.withdrawal.minAmount', {
                  amount: formatWithCurrency(withdrawalBalance.min_amount_kopeks / 100),
                  defaultValue: `Минимальная сумма вывода: ${formatWithCurrency(
                    withdrawalBalance.min_amount_kopeks / 100,
                  )}`,
                })}
              </p>
            )
          )}
        </GlassCard>
      )}

      {/* Withdrawal history (approved partners only) */}
      {partnerSectionVisible && isPartner && (
        <GlassCard className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={15} className="text-white/25" />
            <span className="text-sm text-white/40" style={{ fontWeight: 500 }}>
              {t('referral.withdrawal.history', { defaultValue: 'История вывода' })}
            </span>
          </div>
          {withdrawalHistory?.items && withdrawalHistory.items.length > 0 ? (
            withdrawalHistory.items.map((w) => (
              <div
                key={w.id}
                className="flex items-start justify-between gap-3 border-b border-white/[0.04] py-2.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/60" style={{ fontWeight: 500 }}>
                      {formatWithCurrency(w.amount_rubles)}
                    </span>
                    <span
                      className={`text-xs ${withdrawalStatusColor[w.status] || 'text-white/30'}`}
                    >
                      {t(`referral.withdrawal.status.${w.status}`, { defaultValue: w.status })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/20">
                    {formatDate(w.created_at, i18n.language)}
                    {w.payment_details && (
                      <span className="ml-1">
                        •{' '}
                        {w.payment_details.length > 40
                          ? `${w.payment_details.slice(0, 40)}…`
                          : w.payment_details}
                      </span>
                    )}
                  </p>
                  {w.admin_comment && (
                    <p className="mt-1 text-xs text-white/30">{w.admin_comment}</p>
                  )}
                </div>
                {w.status === 'pending' && (
                  <button
                    onClick={() => cancelWithdrawalMutation.mutate(w.id)}
                    disabled={cancelWithdrawalMutation.isPending}
                    className="shrink-0 text-xs text-red-400/70 transition-colors hover:text-red-400 disabled:opacity-50"
                  >
                    {t('common.cancel', { defaultValue: 'Отменить' })}
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-white/30">
              {t('referral.withdrawal.noHistory', { defaultValue: 'Пока нет выводов' })}
            </p>
          )}
        </GlassCard>
      )}
    </motion.div>
  );
}
