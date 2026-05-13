import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Globe, Gauge, Lock, ShieldCheck, Smartphone, RefreshCcw } from 'lucide-react';
import { GlassCard } from './GlassCard';

const ICONS = [
  { key: 'access', icon: Globe },
  { key: 'speed', icon: Gauge },
  { key: 'encryption', icon: Lock },
  { key: 'noLogs', icon: ShieldCheck },
  { key: 'devices', icon: Smartphone },
  { key: 'refund', icon: RefreshCcw },
];

export function Benefits() {
  const { t } = useTranslation();
  return (
    <section id="benefits" className="relative bg-black py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center text-white"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          {t('landing.benefits.title')}
        </motion.h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ICONS.map((b, i) => (
            <motion.div
              key={b.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.07 }}
            >
              <GlassCard hover className="h-full p-7">
                <b.icon size={22} className="mb-5 text-white/25" strokeWidth={1.5} />
                <h3
                  className="mb-2 text-white"
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.05rem', fontWeight: 500 }}
                >
                  {t(`landing.benefits.items.${b.key}.title`)}
                </h3>
                <p className="text-white/35" style={{ fontSize: '0.88rem', lineHeight: 1.65 }}>
                  {t(`landing.benefits.items.${b.key}.desc`)}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
