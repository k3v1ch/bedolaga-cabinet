import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Users, Building2, User } from 'lucide-react';

type Term = '1m' | '3m' | '6m';

const TERM_DEFS: { id: Term; badge?: string }[] = [
  { id: '1m' },
  { id: '3m', badge: '−10%' },
  { id: '6m', badge: '−15%' },
];

const PLANS: {
  key: 'regular' | 'family' | 'business';
  icon: typeof User;
  prices: Record<Term, number>;
  hasBadge: boolean;
}[] = [
  {
    key: 'regular',
    icon: User,
    prices: { '1m': 149, '3m': 399, '6m': 759 },
    hasBadge: false,
  },
  {
    key: 'family',
    icon: Users,
    prices: { '1m': 399, '3m': 1099, '6m': 2099 },
    hasBadge: true,
  },
  {
    key: 'business',
    icon: Building2,
    prices: { '1m': 699, '3m': 1890, '6m': 3590 },
    hasBadge: true,
  },
];

export function Pricing() {
  const { t, i18n } = useTranslation();
  const [term, setTerm] = useState<Term>('1m');
  const localeNum = i18n.language || 'ru';

  return (
    <section id="pricing" className="relative bg-black py-24 md:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-3 text-center text-white"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          {t('landing.pricing.title')}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-10 text-center text-sm text-white/35"
        >
          {t('landing.pricing.subtitle')}
        </motion.p>

        <div className="mb-10 flex justify-center">
          <div className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
            {TERM_DEFS.map((td) => (
              <button
                key={td.id}
                onClick={() => setTerm(td.id)}
                className={`relative rounded-full px-5 py-2.5 text-sm transition-all ${
                  term === td.id ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/55'
                }`}
              >
                {t(`landing.pricing.term.${td.id}`)}
                {td.badge && term === td.id && (
                  <span
                    className="absolute -right-1 -top-2.5 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] text-white/70"
                    style={{ fontWeight: 500 }}
                  >
                    {td.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div
                className={`relative flex h-full flex-col rounded-2xl border bg-white/[0.04] p-7 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-white/[0.07] ${
                  plan.hasBadge ? 'border-white/15' : 'border-white/[0.08]'
                }`}
              >
                {plan.hasBadge && (
                  <span
                    className="absolute -top-3 left-7 rounded-full px-4 py-1 text-xs"
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.8)',
                      fontWeight: 500,
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    {t(`landing.pricing.badges.${plan.key}`)}
                  </span>
                )}

                <div className="mb-4 flex items-center gap-2.5">
                  <plan.icon size={18} className="text-white/30" strokeWidth={1.5} />
                  <span className="text-sm text-white/70" style={{ fontWeight: 500 }}>
                    {t(`landing.pricing.plans.${plan.key}`)}
                  </span>
                </div>

                <div className="mb-2 flex items-baseline gap-1">
                  <span
                    className="text-white"
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '2.5rem',
                      fontWeight: 600,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {plan.prices[term].toLocaleString(localeNum)}
                  </span>
                  <span className="ml-1 text-sm text-white/30">
                    ₽ {t(`landing.pricing.suffix.${term}`)}
                  </span>
                </div>

                <p className="mb-1 text-sm text-white/35">
                  {t(`landing.pricing.devices.${plan.key}`)}
                </p>
                <p className="mb-8 text-xs text-white/20">
                  {t(`landing.pricing.extra.${plan.key}`)}
                </p>

                <Link
                  to="/login"
                  className="mt-auto block w-full rounded-full bg-white py-3.5 text-center text-sm text-black transition-all duration-300 hover:shadow-lg hover:shadow-white/10 active:scale-[0.97]"
                  style={{ fontWeight: 500 }}
                >
                  {t('landing.pricing.cta')}
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-white/20">{t('landing.pricing.foot')}</p>
      </div>
    </section>
  );
}
