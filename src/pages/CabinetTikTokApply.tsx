import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Video,
  Eye,
  Send,
  Coins,
  FileText,
  Clock,
  CheckCircle,
  X,
} from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { tiktokApi, type TikTokApplicationRequest } from '@/api/tiktok';

function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
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
      className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[15px] text-white/70 outline-none transition-all placeholder:text-white/20 focus:border-white/20"
    />
  );
}

function supportUrl(username: string): string {
  return `https://t.me/${(username || '@VernoVPNsupport').replace(/^@/, '')}`;
}

export default function CabinetTikTokApply() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<'idle' | 'success'>('idle');
  const [form, setForm] = useState({
    name: '',
    tiktok: '',
    platforms: '',
    audience: '',
    topic: '',
    desc: '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateField = (field: keyof typeof form, val: string) =>
    setForm((f) => ({ ...f, [field]: val }));

  const { data: status } = useQuery({
    queryKey: ['tiktok-status'],
    queryFn: tiktokApi.getStatus,
    enabled: isAuthenticated,
  });

  const applyMutation = useMutation({
    mutationFn: tiktokApi.apply,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiktok-status'] });
      setFormState('success');
      setSubmitError(null);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setSubmitError(
        err.response?.data?.detail ||
          t('tiktok.applyError', { defaultValue: 'Не удалось отправить заявку' }),
      );
    },
  });

  const handleSubmit = () => {
    setSubmitError(null);
    if (!form.tiktok.trim()) {
      setSubmitError(
        t('tiktok.fields.tiktokRequired', { defaultValue: 'Укажите ссылку на TikTok-профиль' }),
      );
      return;
    }
    const payload: TikTokApplicationRequest = { tiktok_url: form.tiktok.trim() };
    if (form.name.trim()) payload.display_name = form.name.trim();
    if (form.platforms.trim()) payload.other_platforms = form.platforms.trim();
    if (form.topic.trim()) payload.content_topic = form.topic.trim();
    if (form.desc.trim()) payload.description = form.desc.trim();
    if (form.audience.trim()) {
      const n = Number(form.audience.replace(/\D/g, ''));
      if (!Number.isNaN(n) && n > 0) payload.audience_size = n;
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

  const tiktokStatus = status?.tiktok_status;
  const isApproved = tiktokStatus === 'approved';
  const isPending = tiktokStatus === 'pending';

  const targetPayouts = [
    { views: '125 000', amount: '725 ₽' },
    { views: '250 000', amount: '1 450 ₽' },
    { views: '500 000', amount: '2 900 ₽' },
    { views: '1 000 000', amount: '5 800 ₽' },
  ];
  const otherPayouts = [
    { views: '125 000', amount: '375 ₽' },
    { views: '250 000', amount: '750 ₽' },
    { views: '500 000', amount: '1 500 ₽' },
    { views: '1 000 000', amount: '3 000 ₽' },
  ];

  const benefits = [
    {
      icon: Eye,
      title: t('tiktok.benefit.viewsTitle', { defaultValue: 'Оплата за просмотры' }),
      desc: t('tiktok.benefit.viewsDesc', {
        defaultValue: 'Вознаграждение по сетке за каждый ролик от 125 000 просмотров',
      }),
    },
    {
      icon: Send,
      title: t('tiktok.benefit.noLinksTitle', { defaultValue: 'Без реф-ссылок' }),
      desc: t('tiktok.benefit.noLinksDesc', {
        defaultValue: 'Не нужно вставлять ссылки в видео — просто снимай контент',
      }),
    },
    {
      icon: Coins,
      title: t('tiktok.benefit.simpleTitle', { defaultValue: 'Простые выплаты' }),
      desc: t('tiktok.benefit.simpleDesc', {
        defaultValue: 'После одобрения присылаешь результаты в поддержку — остальное за нами',
      }),
    },
    {
      icon: Video,
      title: t('tiktok.benefit.platformsTitle', { defaultValue: 'Любая площадка' }),
      desc: t('tiktok.benefit.platformsDesc', {
        defaultValue: 'TikTok, Instagram Reels, YouTube Shorts',
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
        className="mb-6 flex items-center gap-1.5 text-[15px] text-white/30 transition-colors hover:text-white/50"
      >
        <ArrowLeft size={14} /> {t('tiktok.back', { defaultValue: 'Назад' })}
      </button>

      <div className="mb-3 flex items-center gap-2">
        <Video size={22} strokeWidth={1.5} className="text-white/40" />
        <h1
          className="text-white"
          style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.02em' }}
        >
          {t('tiktok.title', { defaultValue: 'TikTok-программа' })}
        </h1>
      </div>
      <p className="mb-8 text-[15px] text-white/35" style={{ lineHeight: 1.65 }}>
        {t('tiktok.intro', {
          defaultValue:
            'Снимайте короткие ролики, продвигайте VPN и получайте вознаграждение за просмотры. После одобрения присылайте результаты в поддержку.',
        })}
      </p>

      {/* Approved state */}
      {isApproved ? (
        <GlassCard className="mb-6 p-7 text-center">
          <CheckCircle size={32} className="mx-auto mb-3 text-green-400/60" />
          <h3 className="mb-2 text-[15px] text-white" style={{ fontWeight: 600 }}>
            {t('tiktok.approvedTitle', { defaultValue: 'Вы участник TikTok-программы' })}
          </h3>
          <p className="mb-3 text-[13px] text-white/30" style={{ lineHeight: 1.6 }}>
            {t('tiktok.approvedDesc', {
              defaultValue: 'Снимайте ролики по условиям и присылайте результаты в поддержку.',
            })}
          </p>
          {status?.total_earned_kopeks != null && status.total_earned_kopeks > 0 && (
            <p className="mb-4 text-[15px] font-medium text-green-400">
              {t('tiktok.earned', { defaultValue: 'Начислено' })}:{' '}
              {(status.total_earned_kopeks / 100).toLocaleString()} ₽
            </p>
          )}
          <a
            href={supportUrl(status?.support_username || '')}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
            style={{ fontWeight: 500 }}
          >
            <Send size={15} /> {t('tiktok.sendResults', { defaultValue: 'Отправить результаты' })}
          </a>
        </GlassCard>
      ) : isPending ? (
        /* Pending state */
        <GlassCard className="mb-6 p-7 text-center">
          <Clock size={32} className="mx-auto mb-3 text-white/40" />
          <h3 className="mb-2 text-[15px] text-white" style={{ fontWeight: 600 }}>
            {t('tiktok.pendingTitle', { defaultValue: 'Заявка на рассмотрении' })}
          </h3>
          <p className="text-[13px] text-white/30" style={{ lineHeight: 1.6 }}>
            {t('tiktok.pendingDesc', {
              defaultValue: 'Мы рассмотрим вашу заявку и сообщим о решении.',
            })}
          </p>
        </GlassCard>
      ) : (
        /* Landing: conditions first, application form behind the CTA */
        <>
          {/* Benefits */}
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {benefits.map((b) => (
              <GlassCard key={b.title} className="p-5">
                <b.icon size={18} strokeWidth={1.5} className="mb-3 text-white/25" />
                <h3 className="mb-1 text-[15px] text-white/70" style={{ fontWeight: 500 }}>
                  {b.title}
                </h3>
                <p className="text-[13px] text-white/25" style={{ lineHeight: 1.55 }}>
                  {b.desc}
                </p>
              </GlassCard>
            ))}
          </div>

          {/* Payout grid */}
          <GlassCard className="mb-6 p-7">
            <div className="mb-4 flex items-center gap-2">
              <Coins size={15} className="text-white/25" />
              <p
                className="text-[13px] text-white/40"
                style={{ fontWeight: 500, letterSpacing: '0.05em' }}
              >
                {t('tiktok.payoutsTitle', { defaultValue: 'СКОЛЬКО МОЖНО ЗАРАБОТАТЬ' }).toUpperCase()}
              </p>
            </div>

            <p className="mb-2 text-[13px] text-white/40">
              🎯{' '}
              {t('tiktok.targetContent', {
                defaultValue: 'Целевой контент (VPN, безопасность, обходы блокировок)',
              })}
            </p>
            <div className="mb-5 space-y-1.5">
              {targetPayouts.map((p) => (
                <div
                  key={p.views}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-[14px]"
                >
                  <span className="text-white/40">
                    {t('tiktok.fromViews', { views: p.views, defaultValue: `от ${p.views} просмотров` })}
                  </span>
                  <span className="text-white/70" style={{ fontWeight: 500 }}>
                    {p.amount}
                  </span>
                </div>
              ))}
            </div>

            <p className="mb-2 text-[13px] text-white/40">
              📹 {t('tiktok.otherContent', { defaultValue: 'Нецелевой контент (другие темы с баннером)' })}
            </p>
            <div className="space-y-1.5">
              {otherPayouts.map((p) => (
                <div
                  key={p.views}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-[14px]"
                >
                  <span className="text-white/40">
                    {t('tiktok.fromViews', { views: p.views, defaultValue: `от ${p.views} просмотров` })}
                  </span>
                  <span className="text-white/70" style={{ fontWeight: 500 }}>
                    {p.amount}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Conditions / rules */}
          <GlassCard className="mb-6 p-7">
            <div className="mb-3 flex items-center gap-2">
              <FileText size={15} className="text-white/25" />
              <p
                className="text-[13px] text-white/40"
                style={{ fontWeight: 500, letterSpacing: '0.05em' }}
              >
                {t('tiktok.rulesTitle', { defaultValue: 'УСЛОВИЯ УЧАСТИЯ' }).toUpperCase()}
              </p>
            </div>
            <div className="space-y-2 text-[15px] text-white/35" style={{ lineHeight: 1.65 }}>
              <p>
                •{' '}
                {t('tiktok.rule.banner', {
                  defaultValue: 'Баннер ВЕРНО VPN виден на протяжении всего видео и не перекрыт',
                })}
              </p>
              <p>
                •{' '}
                {t('tiktok.rule.profile', {
                  defaultValue: 'В профиле — ссылка на сайт vernovpn.ru',
                })}
              </p>
              <p>
                •{' '}
                {t('tiktok.rule.hashtag', {
                  defaultValue: 'В описании ролика — тег #ВЕРНОVPN',
                })}
              </p>
              <p>
                •{' '}
                {t('tiktok.rule.minViews', {
                  defaultValue: 'Учитываются ролики от 125 000 просмотров',
                })}
              </p>
              <p>
                •{' '}
                {t('tiktok.rule.results', {
                  defaultValue: 'После одобрения результаты роликов присылаете в поддержку',
                })}
              </p>
            </div>
          </GlassCard>

          {status?.latest_application?.status === 'rejected' &&
            status?.latest_application?.admin_comment && (
              <GlassCard className="mb-6 border-red-500/20 p-5">
                <p className="text-[13px] text-white/35" style={{ lineHeight: 1.6 }}>
                  {t('tiktok.rejectedNote', { defaultValue: 'Предыдущая заявка отклонена:' })}{' '}
                  {status.latest_application.admin_comment}
                </p>
              </GlassCard>
            )}

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
              {t('tiktok.submitApplication', { defaultValue: 'Подать заявку' })}
            </button>
            <p className="mt-3 text-[13px] text-white/20">
              {t('tiktok.ctaNote', {
                defaultValue: 'После одобрения вы сможете присылать результаты роликов в поддержку',
              })}
            </p>
          </div>
        </>
      )}

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
              className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0A0A0A]/95 p-7 shadow-2xl shadow-black/50 backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {formState === 'idle' ? (
                <>
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      {t('tiktok.applyTitle', { defaultValue: 'Заявка на участие' })}
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
                      placeholder={t('tiktok.fields.name', { defaultValue: 'Имя или ник' })}
                      value={form.name}
                      onChange={(v) => updateField('name', v)}
                    />
                    <FormInput
                      placeholder={t('tiktok.fields.tiktok', {
                        defaultValue: 'Ссылка на TikTok-профиль *',
                      })}
                      value={form.tiktok}
                      onChange={(v) => updateField('tiktok', v)}
                    />
                    <FormInput
                      placeholder={t('tiktok.fields.otherPlatforms', {
                        defaultValue: 'Другие площадки (Instagram, YouTube)',
                      })}
                      value={form.platforms}
                      onChange={(v) => updateField('platforms', v)}
                    />
                    <FormInput
                      placeholder={t('tiktok.fields.audience', {
                        defaultValue: 'Аудитория (подписчиков)',
                      })}
                      value={form.audience}
                      onChange={(v) => updateField('audience', v.replace(/\D/g, ''))}
                    />
                    <FormInput
                      placeholder={t('tiktok.fields.topic', { defaultValue: 'Тематика контента' })}
                      value={form.topic}
                      onChange={(v) => updateField('topic', v)}
                    />
                    <textarea
                      placeholder={t('tiktok.fields.description', {
                        defaultValue: 'Расскажите о себе: контент, опыт, средние просмотры',
                      })}
                      value={form.desc}
                      onChange={(e) => updateField('desc', e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[15px] text-white/70 outline-none transition-all placeholder:text-white/20 focus:border-white/20"
                    />
                  </div>
                  <p className="mb-4 text-[11px] text-white/15">
                    {t('tiktok.fieldsHint', {
                      defaultValue: 'Поля, кроме ссылки на TikTok, можно оставить пустыми',
                    })}
                  </p>

                  {submitError && (
                    <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[13px] text-red-400">
                      {submitError}
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={applyMutation.isPending}
                    className="w-full rounded-full bg-white py-3.5 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97] disabled:opacity-60"
                    style={{ fontWeight: 500 }}
                  >
                    {applyMutation.isPending
                      ? t('tiktok.applying', { defaultValue: 'Отправляем…' })
                      : t('tiktok.send', { defaultValue: 'Отправить заявку' })}
                  </button>
                </>
              ) : (
                <div className="py-6 text-center">
                  <CheckCircle size={32} className="mx-auto mb-3 text-green-400/60" />
                  <h3 className="mb-2 text-[15px] text-white" style={{ fontWeight: 600 }}>
                    {t('tiktok.successTitle', { defaultValue: 'Заявка отправлена' })}
                  </h3>
                  <p className="mb-5 text-[13px] text-white/30" style={{ lineHeight: 1.6 }}>
                    {t('tiktok.successDesc', {
                      defaultValue:
                        'Спасибо! Мы рассмотрим вашу заявку и сообщим о решении. После одобрения вы сможете присылать результаты в поддержку.',
                    })}
                  </p>
                  <button
                    onClick={closeForm}
                    className="rounded-full bg-white px-6 py-3 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
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
