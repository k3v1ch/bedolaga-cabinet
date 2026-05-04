import { motion } from 'framer-motion';
import { Monitor, Apple, Smartphone, Terminal, Tv } from 'lucide-react';
import { GlassCard } from './GlassCard';

const platforms = [
  { name: 'Windows', Icon: Monitor },
  { name: 'macOS', Icon: Apple },
  { name: 'Linux', Icon: Terminal },
  { name: 'iOS', Icon: Smartphone },
  { name: 'Android', Icon: Smartphone },
  { name: 'TV', Icon: Tv },
];

export function Devices() {
  return (
    <section className="relative bg-black py-24 md:py-32">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-4 text-white"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Одна подписка — все ваши устройства
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mx-auto mb-4 max-w-xl text-white/35"
          style={{ fontSize: '0.95rem', lineHeight: 1.6 }}
        >
          Подключайте смартфон, ноутбук, компьютер и другие совместимые устройства в одном тарифе.
          Быстро, безопасно и без лишней сложности.
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mb-14 text-sm text-white/20"
        >
          ВЕРНО VPN поддерживает все платформы, на которые можно установить Happ или V2RayTun.
        </motion.p>

        <div className="mx-auto grid max-w-2xl grid-cols-3 gap-4 sm:grid-cols-3 md:grid-cols-6">
          {platforms.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <GlassCard hover className="flex flex-col items-center gap-3 px-4 py-7">
                <p.Icon size={24} className="text-white/40" strokeWidth={1.5} />
                <span className="text-sm text-white/40">{p.name}</span>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
