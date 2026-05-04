import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Share2, ChevronRight, ChevronDown, X, Mail, Lock } from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api/auth';
import { referralApi } from '@/api/referral';
import { brandingApi, type EmailAuthEnabled } from '@/api/branding';
import {
  notificationsApi,
  type NotificationSettings,
  type NotificationSettingsUpdate,
} from '@/api/notifications';
import { isValidEmail } from '@/utils/validation';
import { UI } from '@/config/constants';

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
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const share = () => {
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

function Toggle({
  label,
  desc,
  checked,
  onChange,
  disabled,
  children,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-white/[0.04] py-3 last:border-0">
      <div className="flex items-start justify-between">
        <div className="pr-4">
          <p className="text-sm text-white/55" style={{ fontWeight: 500 }}>
            {label}
          </p>
          <p className="mt-0.5 text-xs text-white/25">{desc}</p>
        </div>
        <button
          onClick={() => !disabled && onChange(!checked)}
          disabled={disabled}
          className={`relative shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            checked ? 'bg-white/20' : 'bg-white/[0.08]'
          }`}
          style={{ height: 22, width: 40 }}
        >
          <span
            className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all ${
              checked ? 'left-[19px]' : 'left-[2px]'
            }`}
            style={{ opacity: checked ? 1 : 0.4 }}
          />
        </button>
      </div>
      {checked && children && <div className="ml-0 mt-2.5">{children}</div>}
    </div>
  );
}

function SmallSelect<T extends string | number>({
  label,
  options,
  value,
  onChange,
  formatLabel,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  formatLabel?: (v: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const fmt = (v: T) => (formatLabel ? formatLabel(v) : String(v));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="shrink-0 text-white/25">{label}</span>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex h-[30px] min-w-[64px] items-center justify-between gap-1 rounded-lg border border-white/[0.08] bg-white/[0.06] px-3 text-white/50 transition-colors hover:bg-white/[0.08]"
        >
          {fmt(value)}{' '}
          <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-10 mt-1 min-w-[64px] rounded-lg border border-white/[0.08] bg-[#181818]/95 py-1 shadow-xl backdrop-blur-2xl">
            {options.map((o) => (
              <button
                key={String(o)}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${
                  value === o
                    ? 'bg-white/[0.06] text-white/70'
                    : 'text-white/35 hover:bg-white/[0.04]'
                }`}
              >
                {fmt(o)}
              </button>
            ))}
          </div>
        )}
      </div>
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
        className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0A0A0A]/95 p-6 shadow-2xl shadow-black/50 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>
  );
}

type EmailPopupStep = 'none' | 'email' | 'code' | 'success';
type PwdPopupStep = 'none' | 'confirm' | 'success';

export default function CabinetProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();

  // ── Data ────────────────────────────────────────────────────────────
  const { data: referralInfo } = useQuery({
    queryKey: ['referral-info'],
    queryFn: referralApi.getReferralInfo,
    enabled: isAuthenticated,
  });

  const { data: referralTerms } = useQuery({
    queryKey: ['referral-terms'],
    queryFn: referralApi.getReferralTerms,
    enabled: isAuthenticated,
  });

  const { data: emailAuthConfig } = useQuery<EmailAuthEnabled>({
    queryKey: ['email-auth-enabled'],
    queryFn: brandingApi.getEmailAuthEnabled,
    enabled: isAuthenticated,
    staleTime: 60000,
  });
  const isEmailAuthEnabled = emailAuthConfig?.enabled ?? true;
  const isEmailVerificationEnabled = emailAuthConfig?.verification_enabled ?? true;

  const { data: notificationSettings, isLoading: notificationsLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: notificationsApi.getSettings,
    enabled: isAuthenticated,
  });

  // ── Email change flow ──────────────────────────────────────────────
  const [emailPopup, setEmailPopup] = useState<EmailPopupStep>('none');
  const [emailInput, setEmailInput] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationResendCooldown, setVerificationResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    if (verificationResendCooldown <= 0) return;
    const id = setInterval(() => setVerificationResendCooldown((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(id);
  }, [verificationResendCooldown]);

  const resendVerificationMutation = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => {
      setVerificationResendCooldown(UI.RESEND_COOLDOWN_SEC);
    },
  });

  const requestEmailChangeMutation = useMutation({
    mutationFn: (e: string) => authApi.requestEmailChange(e),
    onSuccess: async (data) => {
      setEmailError(null);
      if (data.expires_in_minutes === 0) {
        setEmailPopup('success');
        const updatedUser = await authApi.getMe();
        setUser(updatedUser);
        queryClient.invalidateQueries({ queryKey: ['user'] });
      } else {
        setEmailPopup('code');
        setResendCooldown(UI.RESEND_COOLDOWN_SEC);
      }
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const detail = err.response?.data?.detail;
      if (detail?.includes('already registered') || detail?.includes('already in use')) {
        setEmailError(
          t('profile.changeEmail.emailAlreadyUsed', {
            defaultValue: 'Этот email уже используется',
          }),
        );
      } else if (detail?.includes('same as current')) {
        setEmailError(
          t('profile.changeEmail.sameEmail', { defaultValue: 'Этот email уже привязан' }),
        );
      } else if (detail?.includes('rate limit') || detail?.includes('too many')) {
        setEmailError(
          t('profile.changeEmail.tooManyRequests', {
            defaultValue: 'Слишком много запросов',
          }),
        );
      } else {
        setEmailError(detail || t('common.error', { defaultValue: 'Ошибка' }));
      }
    },
  });

  const verifyEmailChangeMutation = useMutation({
    mutationFn: (code: string) => authApi.verifyEmailChange(code),
    onSuccess: async () => {
      setEmailError(null);
      setEmailPopup('success');
      const updatedUser = await authApi.getMe();
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const detail = err.response?.data?.detail;
      if (detail?.includes('invalid') || detail?.includes('wrong')) {
        setEmailError(t('profile.changeEmail.invalidCode', { defaultValue: 'Неверный код' }));
      } else if (detail?.includes('expired')) {
        setEmailError(
          t('profile.changeEmail.codeExpired', { defaultValue: 'Срок действия кода истёк' }),
        );
      } else {
        setEmailError(detail || t('common.error', { defaultValue: 'Ошибка' }));
      }
    },
  });

  const resetEmailFlow = () => {
    setEmailPopup('none');
    setEmailInput('');
    setEmailCode('');
    setEmailError(null);
    setResendCooldown(0);
  };

  const handleSubmitEmail = () => {
    setEmailError(null);
    const v = emailInput.trim();
    if (!v) {
      setEmailError(t('profile.emailRequired', { defaultValue: 'Введите email' }));
      return;
    }
    if (!isValidEmail(v)) {
      setEmailError(t('profile.invalidEmail', { defaultValue: 'Некорректный email' }));
      return;
    }
    if (user?.email && v.toLowerCase() === user.email.toLowerCase()) {
      setEmailError(
        t('profile.changeEmail.sameEmail', { defaultValue: 'Этот email уже привязан' }),
      );
      return;
    }
    requestEmailChangeMutation.mutate(v);
  };

  const handleSubmitCode = () => {
    setEmailError(null);
    const c = emailCode.trim();
    if (!c) {
      setEmailError(t('profile.changeEmail.enterCode', { defaultValue: 'Введите код' }));
      return;
    }
    verifyEmailChangeMutation.mutate(c);
  };

  // ── Password reset flow (uses forgot-password endpoint) ─────────────
  const [pwdPopup, setPwdPopup] = useState<PwdPopupStep>('none');
  const [pwdError, setPwdError] = useState<string | null>(null);

  const forgotPasswordMutation = useMutation({
    mutationFn: (email: string) => authApi.forgotPassword(email),
    onSuccess: () => {
      setPwdError(null);
      setPwdPopup('success');
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setPwdError(err.response?.data?.detail || t('common.error', { defaultValue: 'Ошибка' }));
    },
  });

  // ── Notifications ───────────────────────────────────────────────────
  const updateNotificationsMutation = useMutation({
    mutationFn: notificationsApi.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
    },
  });

  const updateNotification = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K],
  ) => {
    const update: NotificationSettingsUpdate = { [key]: value } as NotificationSettingsUpdate;
    updateNotificationsMutation.mutate(update);
  };

  // ── Derived ─────────────────────────────────────────────────────────
  const tgLinked = !!user?.telegram_id;
  const tgUsername = user?.username ? `@${user.username}` : null;
  const emailLinked = !!user?.email;
  const emailConfirmed = !!user?.email_verified;

  const botLink = referralInfo?.bot_referral_link || '';
  const cabinetRefLink =
    referralInfo?.referral_link ||
    (referralInfo?.referral_code
      ? `${window.location.origin}/login?ref=${referralInfo.referral_code}`
      : '');
  const showReferralBlock = referralTerms?.is_enabled && (botLink || cabinetRefLink);

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
        {t('profile.title', { defaultValue: 'Профиль' })}
      </h1>

      {/* Account info */}
      <GlassCard className="mb-4 p-6">
        <p
          className="mb-4 text-xs text-white/40"
          style={{ fontWeight: 500, letterSpacing: '0.05em' }}
        >
          {t('profile.accountInfo', { defaultValue: 'ИНФОРМАЦИЯ ОБ АККАУНТЕ' }).toUpperCase()}
        </p>
        <div className="space-y-3">
          {/* Telegram */}
          <div className="flex items-center justify-between border-b border-white/[0.04] py-2">
            <span className="text-sm text-white/35">Telegram</span>
            {tgLinked ? (
              <span className="text-sm text-white/60">{tgUsername || '—'}</span>
            ) : (
              <button
                onClick={() => navigate('/profile/accounts')}
                className="text-sm text-white/50 underline decoration-white/20 underline-offset-2 transition-colors hover:text-white/70"
              >
                {t('profile.link', { defaultValue: 'Привязать' })}
              </button>
            )}
          </div>

          {/* Telegram ID */}
          <div className="flex items-center justify-between border-b border-white/[0.04] py-2">
            <span className="text-sm text-white/35">Telegram ID</span>
            <span className="font-mono text-sm text-white/60">
              {tgLinked ? user?.telegram_id : '—'}
            </span>
          </div>

          {/* Email */}
          {isEmailAuthEnabled && (
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.04] py-2">
              <span className="pt-0.5 text-sm text-white/35">Email</span>
              {emailLinked ? (
                <div className="flex min-w-0 flex-col items-end gap-1">
                  <span className="max-w-[220px] truncate text-sm text-white/60 sm:max-w-none">
                    {user?.email}
                  </span>
                  {isEmailVerificationEnabled && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        emailConfirmed
                          ? 'bg-green-500/10 text-green-400/70'
                          : 'bg-amber-500/10 text-amber-400/70'
                      }`}
                    >
                      {emailConfirmed
                        ? t('profile.verified', { defaultValue: 'Подтверждён' })
                        : t('profile.notVerified', { defaultValue: 'Не подтверждён' })}
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    {!emailConfirmed && isEmailVerificationEnabled && (
                      <button
                        onClick={() => resendVerificationMutation.mutate()}
                        disabled={
                          verificationResendCooldown > 0 || resendVerificationMutation.isPending
                        }
                        className="text-xs text-white/30 transition-colors hover:text-white/50 disabled:opacity-50"
                      >
                        {verificationResendCooldown > 0
                          ? t('profile.resendIn', {
                              seconds: verificationResendCooldown,
                              defaultValue: `Повторить через ${verificationResendCooldown} сек.`,
                            })
                          : t('profile.resendVerification', {
                              defaultValue: 'Отправить повторно',
                            })}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEmailInput('');
                        setEmailCode('');
                        setEmailError(null);
                        setEmailPopup('email');
                      }}
                      className="text-xs text-white/30 transition-colors hover:text-white/50"
                    >
                      {t('profile.changeEmail.button', { defaultValue: 'Изменить' })}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => navigate('/profile/accounts')}
                  className="text-sm text-white/50 underline decoration-white/20 underline-offset-2 transition-colors hover:text-white/70"
                >
                  {t('profile.linkEmail', { defaultValue: 'Привязать' })}
                </button>
              )}
            </div>
          )}

          {/* Password */}
          {isEmailAuthEnabled && emailLinked && (
            <div className="flex items-center justify-between border-b border-white/[0.04] py-2">
              <span className="text-sm text-white/35">
                {t('profile.password', { defaultValue: 'Пароль' })}
              </span>
              <button
                onClick={() => {
                  setPwdError(null);
                  setPwdPopup('confirm');
                }}
                className="text-xs text-white/30 transition-colors hover:text-white/50"
              >
                {t('profile.changePassword', { defaultValue: 'Сменить пароль' })}
              </button>
            </div>
          )}

          {/* Registration date */}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-white/35">
              {t('profile.registeredAt', { defaultValue: 'Дата регистрации' })}
            </span>
            <span className="text-sm text-white/60">{formatDate(user?.created_at)}</span>
          </div>
        </div>
      </GlassCard>

      {/* Referral block */}
      {showReferralBlock && (
        <GlassCard className="mb-4 p-6">
          <div className="mb-4 flex items-center justify-between">
            <p
              className="text-xs text-white/40"
              style={{ fontWeight: 500, letterSpacing: '0.05em' }}
            >
              {t('profile.referralProgram', {
                defaultValue: 'РЕФЕРАЛЬНАЯ ПРОГРАММА',
              }).toUpperCase()}
            </p>
            <Link
              to="/referral"
              className="flex items-center gap-1 text-xs text-white/30 transition-colors hover:text-white/50"
            >
              {t('profile.more', { defaultValue: 'Подробнее' })} <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {botLink && (
              <CopyField
                label={t('profile.botLink', { defaultValue: 'Ссылка на бота' })}
                value={botLink}
              />
            )}
            {cabinetRefLink && (
              <CopyField
                label={t('profile.cabinetLink', { defaultValue: 'Ссылка на кабинет' })}
                value={cabinetRefLink}
              />
            )}
          </div>
        </GlassCard>
      )}

      {/* Notifications */}
      <GlassCard className="p-6">
        <p
          className="mb-4 text-xs text-white/40"
          style={{ fontWeight: 500, letterSpacing: '0.05em' }}
        >
          {t('profile.notifications.title', {
            defaultValue: 'НАСТРОЙКИ УВЕДОМЛЕНИЙ',
          }).toUpperCase()}
        </p>

        {notificationsLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : notificationSettings ? (
          <>
            <Toggle
              label={t('profile.notifications.subscriptionExpiry', {
                defaultValue: 'Окончание подписки',
              })}
              desc={t('profile.notifications.subscriptionExpiryDesc', {
                defaultValue: 'Уведомлять о скором истечении подписки',
              })}
              checked={notificationSettings.subscription_expiry_enabled}
              onChange={(v) => updateNotification('subscription_expiry_enabled', v)}
              disabled={updateNotificationsMutation.isPending}
            >
              <SmallSelect<number>
                label={t('profile.notifications.daysBeforeExpiry', {
                  defaultValue: 'Дней до окончания',
                })}
                options={[1, 2, 3, 5, 7, 14]}
                value={notificationSettings.subscription_expiry_days}
                onChange={(v) => updateNotification('subscription_expiry_days', v)}
              />
            </Toggle>

            <Toggle
              label={t('profile.notifications.trafficWarning', {
                defaultValue: 'Предупреждение о трафике',
              })}
              desc={t('profile.notifications.trafficWarningDesc', {
                defaultValue: 'Уведомлять при достижении лимита',
              })}
              checked={notificationSettings.traffic_warning_enabled}
              onChange={(v) => updateNotification('traffic_warning_enabled', v)}
              disabled={updateNotificationsMutation.isPending}
            >
              <SmallSelect<number>
                label={t('profile.notifications.atPercent', {
                  defaultValue: 'При использовании',
                })}
                options={[50, 70, 80, 90, 95]}
                value={notificationSettings.traffic_warning_percent}
                onChange={(v) => updateNotification('traffic_warning_percent', v)}
                formatLabel={(v) => `${v}%`}
              />
            </Toggle>

            <Toggle
              label={t('profile.notifications.balanceLow', {
                defaultValue: 'Низкий баланс',
              })}
              desc={t('profile.notifications.balanceLowDesc', {
                defaultValue: 'Уведомлять о низком балансе',
              })}
              checked={notificationSettings.balance_low_enabled}
              onChange={(v) => updateNotification('balance_low_enabled', v)}
              disabled={updateNotificationsMutation.isPending}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="shrink-0 text-white/25">
                  {t('profile.notifications.threshold', { defaultValue: 'Порог' })}
                </span>
                <div className="flex h-[30px] min-w-[64px] items-center overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.06]">
                  <input
                    type="number"
                    value={notificationSettings.balance_low_threshold}
                    onChange={(e) =>
                      updateNotification('balance_low_threshold', Number(e.target.value))
                    }
                    min={0}
                    className="h-full w-14 bg-transparent px-3 text-xs text-white/50 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="pr-3 text-white/25">₽</span>
                </div>
              </div>
            </Toggle>

            <Toggle
              label={t('profile.notifications.news', { defaultValue: 'Новости' })}
              desc={t('profile.notifications.newsDesc', {
                defaultValue: 'Получать новости и обновления сервиса',
              })}
              checked={notificationSettings.news_enabled}
              onChange={(v) => updateNotification('news_enabled', v)}
              disabled={updateNotificationsMutation.isPending}
            />

            <Toggle
              label={t('profile.notifications.promoOffers', {
                defaultValue: 'Промо-предложения',
              })}
              desc={t('profile.notifications.promoOffersDesc', {
                defaultValue: 'Получать специальные предложения и скидки',
              })}
              checked={notificationSettings.promo_offers_enabled}
              onChange={(v) => updateNotification('promo_offers_enabled', v)}
              disabled={updateNotificationsMutation.isPending}
            />
          </>
        ) : (
          <p className="text-sm text-white/30">
            {t('profile.notifications.unavailable', { defaultValue: 'Настройки недоступны' })}
          </p>
        )}
      </GlassCard>

      {/* ── Email popups ─────────────────────────────────────────── */}
      <AnimatePresence>
        {emailPopup === 'email' && (
          <Popup onClose={resetEmailFlow}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm text-white" style={{ fontWeight: 600 }}>
                {t('profile.changeEmail.title', { defaultValue: 'Изменить Email' })}
              </h3>
              <button
                onClick={resetEmailFlow}
                className="text-white/25 transition-colors hover:text-white/50"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-4 text-sm text-white/30" style={{ lineHeight: 1.6 }}>
              {t('profile.changeEmail.description', {
                defaultValue: 'Введите новый адрес. На него будет отправлен код подтверждения.',
              })}
            </p>
            <input
              type="email"
              placeholder="new@email.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmitEmail();
                }
              }}
              className="mb-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.06] px-4 py-3 text-sm text-white/70 outline-none transition-all placeholder:text-white/20 focus:border-white/15"
              autoComplete="email"
            />
            {emailError && <p className="mb-3 text-xs text-red-400/80">{emailError}</p>}
            <button
              onClick={handleSubmitEmail}
              disabled={requestEmailChangeMutation.isPending || !emailInput.trim()}
              className="w-full rounded-full bg-white py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-60"
              style={{ fontWeight: 500 }}
            >
              {requestEmailChangeMutation.isPending
                ? '…'
                : t('profile.changeEmail.sendCode', {
                    defaultValue: 'Отправить подтверждение',
                  })}
            </button>
          </Popup>
        )}

        {emailPopup === 'code' && (
          <Popup onClose={resetEmailFlow}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm text-white" style={{ fontWeight: 600 }}>
                {t('profile.changeEmail.verify', { defaultValue: 'Подтверждение' })}
              </h3>
              <button
                onClick={resetEmailFlow}
                className="text-white/25 transition-colors hover:text-white/50"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-4 text-sm text-white/30" style={{ lineHeight: 1.6 }}>
              {t('profile.changeEmail.codeSentTo', {
                email: emailInput,
                defaultValue: `Код отправлен на ${emailInput}`,
              })}
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmitCode();
                }
              }}
              maxLength={6}
              className="mb-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.06] px-4 py-3 text-center text-2xl tracking-[0.5em] text-white/70 outline-none transition-all placeholder:text-white/20 focus:border-white/15"
              autoComplete="one-time-code"
            />
            {emailError && <p className="mb-3 text-xs text-red-400/80">{emailError}</p>}
            <button
              onClick={handleSubmitCode}
              disabled={verifyEmailChangeMutation.isPending || !emailCode.trim()}
              className="mb-2 w-full rounded-full bg-white py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-60"
              style={{ fontWeight: 500 }}
            >
              {t('profile.changeEmail.verify', { defaultValue: 'Подтвердить' })}
            </button>
            <button
              onClick={() => {
                if (resendCooldown > 0) return;
                requestEmailChangeMutation.mutate(emailInput.trim());
              }}
              disabled={resendCooldown > 0 || requestEmailChangeMutation.isPending}
              className="w-full rounded-full border border-white/10 py-2.5 text-sm text-white/40 transition-colors hover:bg-white/[0.04] disabled:opacity-50"
            >
              {resendCooldown > 0
                ? t('profile.changeEmail.resendIn', {
                    seconds: resendCooldown,
                    defaultValue: `Повторить через ${resendCooldown} сек.`,
                  })
                : t('profile.changeEmail.resendCode', {
                    defaultValue: 'Отправить код повторно',
                  })}
            </button>
          </Popup>
        )}

        {emailPopup === 'success' && (
          <Popup onClose={resetEmailFlow}>
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06]">
                <Mail size={20} className="text-green-400/60" />
              </div>
              <h3 className="mb-2 text-sm text-white" style={{ fontWeight: 600 }}>
                {t('profile.changeEmail.success', { defaultValue: 'Email обновлён' })}
              </h3>
              <p className="mb-5 text-sm text-white/30" style={{ lineHeight: 1.6 }}>
                <span className="text-white/50">{user?.email || emailInput}</span>
              </p>
              <button
                onClick={resetEmailFlow}
                className="rounded-full bg-white px-6 py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                style={{ fontWeight: 500 }}
              >
                {t('common.ok', { defaultValue: 'Понятно' })}
              </button>
            </div>
          </Popup>
        )}

        {/* ── Password popups ──────────────────────────────────────── */}
        {pwdPopup === 'confirm' && (
          <Popup
            onClose={() => {
              setPwdPopup('none');
              setPwdError(null);
            }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm text-white" style={{ fontWeight: 600 }}>
                {t('profile.changePassword', { defaultValue: 'Сменить пароль' })}
              </h3>
              <button
                onClick={() => {
                  setPwdPopup('none');
                  setPwdError(null);
                }}
                className="text-white/25 transition-colors hover:text-white/50"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-4 text-sm text-white/30" style={{ lineHeight: 1.6 }}>
              {t('profile.passwordResetDescription', {
                email: user?.email || '',
                defaultValue: `На адрес ${user?.email || ''} будет отправлена ссылка для сброса пароля.`,
              })}
            </p>
            {pwdError && <p className="mb-3 text-xs text-red-400/80">{pwdError}</p>}
            <button
              onClick={() => {
                if (!user?.email) return;
                forgotPasswordMutation.mutate(user.email);
              }}
              disabled={forgotPasswordMutation.isPending || !user?.email}
              className="w-full rounded-full bg-white py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-60"
              style={{ fontWeight: 500 }}
            >
              {forgotPasswordMutation.isPending
                ? '…'
                : t('profile.sendResetLink', { defaultValue: 'Отправить ссылку' })}
            </button>
          </Popup>
        )}

        {pwdPopup === 'success' && (
          <Popup onClose={() => setPwdPopup('none')}>
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06]">
                <Lock size={20} className="text-green-400/60" />
              </div>
              <h3 className="mb-2 text-sm text-white" style={{ fontWeight: 600 }}>
                {t('profile.passwordResetSent', { defaultValue: 'Письмо отправлено' })}
              </h3>
              <p className="mb-5 text-sm text-white/30" style={{ lineHeight: 1.6 }}>
                {t('profile.passwordResetSentDesc', {
                  defaultValue: 'Перейдите по ссылке из письма, чтобы задать новый пароль.',
                })}
              </p>
              <button
                onClick={() => setPwdPopup('none')}
                className="rounded-full bg-white px-6 py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                style={{ fontWeight: 500 }}
              >
                {t('common.ok', { defaultValue: 'Понятно' })}
              </button>
            </div>
          </Popup>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
