import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  TrendingUp,
  Users,
  Bot,
  Shield,
  DollarSign,
  FileText,
  CheckCircle,
  X,
} from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { partnerApi, type PartnerApplicationRequest } from '@/api/partners';

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

function FormInput({
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/70 outline-none transition-all placeholder:text-white/20 focus:border-white/20"
    />
  );
}

export default function CabinetPartnerApply() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<'idle' | 'success'>('idle');
  const [form, setForm] = useState({
    company: '',
    channel: '',
    contact: '',
    site: '',
    desc: '',
    referrals: '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateField = (field: keyof typeof form, val: string) =>
    setForm((f) => ({ ...f, [field]: val }));

  // Guard: redirect if already approved or pending
  const { data: partnerStatus } = useQuery({
    queryKey: ['partner-status'],
    queryFn: partnerApi.getStatus,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (
      partnerStatus?.partner_status === 'approved' ||
      partnerStatus?.partner_status === 'pending'
    ) {
      navigate('/referral', { replace: true });
    }
  }, [partnerStatus, navigate]);

  const applyMutation = useMutation({
    mutationFn: partnerApi.apply,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-status'] });
      setFormState('success');
      setSubmitError(null);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setSubmitError(
        err.response?.data?.detail ||
          t('referral.partner.applyError', { defaultValue: 'Не удалось отправить заявку' }),
      );
    },
  });

  const handleSubmit = () => {
    setSubmitError(null);
    const descParts: string[] = [];
    if (form.contact.trim()) {
      descParts.push(
        `${t('referral.partner.contactLabel', { defaultValue: 'Контакт' })}: ${form.contact.trim()}`,
      );
    }
    if (form.desc.trim()) descParts.push(form.desc.trim());
    const description = descParts.join('\n');

    const payload: PartnerApplicationRequest = {};
    if (form.company.trim()) payload.company_name = form.company.trim();
    if (form.channel.trim()) payload.telegram_channel = form.channel.trim();
    if (form.site.trim()) payload.website_url = form.site.trim();
    if (description) payload.description = description;
    if (form.referrals.trim()) {
      const n = Number(form.referrals.replace(/\D/g, ''));
      if (!Number.isNaN(n) && n > 0) payload.expected_monthly_referrals = n;
    }
    applyMutation.mutate(payload);
  };

  const closeForm = () => {
    if (formState === 'success') {
      setShowForm(false);
      navigate('/referral');
      return;
    }
    setShowForm(false);
    setSubmitError(null);
  };

  const benefits = [
    {
      icon: TrendingUp,
      title: t('referral.partner.benefit.commissionTitle', {
        defaultValue: 'Повышенная комиссия',
      }),
      desc: t('referral.partner.benefit.commissionDesc', {
        defaultValue: 'Больший процент от каждого привлечённого клиента',
      }),
    },
    {
      icon: DollarSign,
      title: t('referral.partner.benefit.withdrawTitle', { defaultValue: 'Вывод заработка' }),
      desc: t('referral.partner.benefit.withdrawDesc', {
        defaultValue: 'Реальные выплаты на карту или криптовалюту',
      }),
    },
    {
      icon: Users,
      title: t('referral.partner.benefit.recurringTitle', {
        defaultValue: 'Реферальный доход от клиентов',
      }),
      desc: t('referral.partner.benefit.recurringDesc', {
        defaultValue: 'Процент от каждого продления ваших рефералов',
      }),
    },
    {
      icon: Bot,
      title: t('referral.partner.benefit.botTitle', { defaultValue: 'Свой VPN-бот в Telegram' }),
      desc: t('referral.partner.benefit.botDesc', {
        defaultValue: 'Собственный бот на инфраструктуре',
      }),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <button
        onClick={() => navigate('/referral')}
        className="mb-6 flex items-center gap-1.5 text-sm text-white/30 transition-colors hover:text-white/50"
      >
        <ArrowLeft size={14} />{' '}
        {t('referral.partner.back', { defaultValue: 'Назад к реферальной программе' })}
      </button>

      <h1
        className="mb-3 text-white"
        style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em' }}
      >
        {t('referral.partner.title', { defaultValue: 'Партнёрская программа' })}
      </h1>
      <p className="mb-8 text-sm text-white/35" style={{ lineHeight: 1.65 }}>
        {t('referral.partner.intro', {
          defaultValue:
            'Следующий уровень участия — для тех, кто готов продвигать продукт активнее и зарабатывать больше.',
        })}
      </p>

      {/* Benefits */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {benefits.map((b) => (
          <GlassCard key={b.title} className="p-5">
            <b.icon size={18} strokeWidth={1.5} className="mb-3 text-white/25" />
            <h3 className="mb-1 text-sm text-white/70" style={{ fontWeight: 500 }}>
              {b.title}
            </h3>
            <p className="text-xs text-white/25" style={{ lineHeight: 1.55 }}>
              {b.desc}
            </p>
          </GlassCard>
        ))}
      </div>

      {/* Requirements */}
      <GlassCard className="mb-6 p-6">
        <div className="mb-3 flex items-center gap-2">
          <FileText size={15} className="text-white/25" />
          <p className="text-xs text-white/40" style={{ fontWeight: 500, letterSpacing: '0.05em' }}>
            {t('referral.partner.requirementsTitle', {
              defaultValue: 'ТРЕБОВАНИЯ К КОНТЕНТУ',
            }).toUpperCase()}
          </p>
        </div>
        <div className="space-y-2 text-sm text-white/35" style={{ lineHeight: 1.65 }}>
          <p>
            •{' '}
            {t('referral.partner.req.honest', {
              defaultValue: 'Честное продвижение без спама и обмана',
            })}
          </p>
          <p>
            •{' '}
            {t('referral.partner.req.info', {
              defaultValue: 'Актуальная информация о продукте',
            })}
          </p>
          <p>
            •{' '}
            {t('referral.partner.req.rules', {
              defaultValue: 'Соблюдение правил площадок размещения',
            })}
          </p>
          <p>
            •{' '}
            {t('referral.partner.req.methods', {
              defaultValue: 'Не использовать запрещённые методы продвижения',
            })}
          </p>
        </div>
      </GlassCard>

      {/* Revenue */}
      <GlassCard className="mb-6 p-6">
        <div className="mb-3 flex items-center gap-2">
          <Shield size={15} className="text-white/25" />
          <p className="text-xs text-white/40" style={{ fontWeight: 500, letterSpacing: '0.05em' }}>
            {t('referral.partner.payoutsTitle', { defaultValue: 'СТРУКТУРА ВЫПЛАТ' }).toUpperCase()}
          </p>
        </div>
        <p className="mb-3 text-sm text-white/30" style={{ lineHeight: 1.65 }}>
          {t('referral.partner.payoutsDesc', {
            defaultValue:
              'Конкретные условия обсуждаются индивидуально после одобрения заявки. Базовая комиссия выше стандартной реферальной программы.',
          })}
        </p>
        <p className="text-xs text-white/20">
          {t('referral.partner.payoutsNote', {
            defaultValue: 'Выплаты: ежемесячно, минимальный порог вывода обсуждается',
          })}
        </p>
      </GlassCard>

      {/* CTA */}
      <div className="py-4 text-center">
        <button
          onClick={() => {
            setShowForm(true);
            setFormState('idle');
            setSubmitError(null);
          }}
          className="rounded-full bg-white px-8 py-4 text-black transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-white/15 active:scale-95"
          style={{ fontSize: '0.95rem', fontWeight: 500 }}
        >
          {t('referral.partner.submitApplication', {
            defaultValue: 'Подать заявку на партнёрство',
          })}
        </button>
        <p className="mt-3 text-xs text-white/20">
          {t('referral.partner.ctaNote', {
            defaultValue: 'После подачи заявки мы свяжемся с вами для обсуждения условий',
          })}
        </p>
      </div>

      {/* Application popup */}
      <AnimatePresence>
        {showForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
            onClick={closeForm}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0A0A0A]/95 p-6 shadow-2xl shadow-black/50 backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {formState === 'idle' ? (
                <>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="text-sm text-white" style={{ fontWeight: 600 }}>
                      {t('referral.partner.applyTitle', {
                        defaultValue: 'Заявка на партнёрство',
                      })}
                    </h3>
                    <button
                      onClick={closeForm}
                      className="text-white/25 transition-colors hover:text-white/50"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mb-4 space-y-3">
                    <FormInput
                      placeholder={t('referral.partner.fields.companyName', {
                        defaultValue: 'Название вашего бренда',
                      })}
                      value={form.company}
                      onChange={(v) => updateField('company', v)}
                    />
                    <FormInput
                      placeholder={t('referral.partner.fields.telegramChannel', {
                        defaultValue: 'Ссылка на профиль бренда',
                      })}
                      value={form.channel}
                      onChange={(v) => updateField('channel', v)}
                    />
                    <FormInput
                      placeholder={t('referral.partner.fields.contact', {
                        defaultValue: 'Юзернейм для связи в Telegram',
                      })}
                      value={form.contact}
                      onChange={(v) => updateField('contact', v)}
                    />
                    <FormInput
                      placeholder={t('referral.partner.fields.websiteUrl', {
                        defaultValue: 'Ссылка на сайт бренда',
                      })}
                      value={form.site}
                      onChange={(v) => updateField('site', v)}
                      type="url"
                    />
                    <textarea
                      placeholder={t('referral.partner.fields.description', {
                        defaultValue: 'Расскажите о вашей аудитории и планах продвижения',
                      })}
                      value={form.desc}
                      onChange={(e) => updateField('desc', e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white/70 outline-none transition-all placeholder:text-white/20 focus:border-white/20"
                    />
                    <FormInput
                      placeholder={t('referral.partner.fields.expectedReferrals', {
                        defaultValue: 'Примерное количество рефералов в месяц',
                      })}
                      value={form.referrals}
                      onChange={(v) => updateField('referrals', v.replace(/\D/g, ''))}
                      type="text"
                    />
                  </div>
                  <p className="mb-4 text-[11px] text-white/15">
                    {t('referral.partner.fieldsHint', {
                      defaultValue: 'Если какое-то поле неактуально — оставьте пустым',
                    })}
                  </p>

                  {submitError && (
                    <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                      {submitError}
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={applyMutation.isPending}
                    className="w-full rounded-full bg-white py-3.5 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-60"
                    style={{ fontWeight: 500 }}
                  >
                    {applyMutation.isPending
                      ? t('referral.partner.applying', { defaultValue: 'Отправляем…' })
                      : t('referral.partner.send', { defaultValue: 'Отправить заявку' })}
                  </button>
                </>
              ) : (
                <div className="py-6 text-center">
                  <CheckCircle size={32} className="mx-auto mb-3 text-green-400/60" />
                  <h3 className="mb-2 text-sm text-white" style={{ fontWeight: 600 }}>
                    {t('referral.partner.successTitle', { defaultValue: 'Заявка отправлена' })}
                  </h3>
                  <p className="mb-5 text-xs text-white/30" style={{ lineHeight: 1.6 }}>
                    {t('referral.partner.successDesc', {
                      defaultValue:
                        'Спасибо за интерес к партнёрской программе. Мы рассмотрим вашу заявку и свяжемся с вами в ближайшее время.',
                    })}
                  </p>
                  <button
                    onClick={closeForm}
                    className="rounded-full bg-white px-6 py-3 text-sm text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                    style={{ fontWeight: 500 }}
                  >
                    {t('common.close', { defaultValue: 'Закрыть' })}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
