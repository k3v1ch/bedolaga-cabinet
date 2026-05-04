import { motion } from 'framer-motion';
import { UserPlus, Download, Wifi } from 'lucide-react';
import { GlassCard } from './GlassCard';

const steps = [
  {
    icon: UserPlus,
    num: '01',
    title: 'Зарегистрируйтесь',
    desc: 'Через Email, Telegram',
  },
  {
    icon: Download,
    num: '02',
    title: 'Установите приложение',
    desc: 'Для всех устройств',
  },
  {
    icon: Wifi,
    num: '03',
    title: 'Подключайтесь',
    desc: 'Вы — прекрасны, интернет — свободный',
  },
];

export function QuickConnect() {
  return (
    <section className="relative bg-black py-24 md:py-32">
      <div className="mx-auto max-w-5xl px-6">
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
          Быстрое подключение за пару минут
        </motion.h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <GlassCard className="relative h-full overflow-hidden p-7">
                <span
                  className="absolute right-6 top-5 text-white/[0.06]"
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '3.5rem',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {step.num}
                </span>
                <step.icon
                  size={24}
                  className="relative z-10 mb-5 text-white/30"
                  strokeWidth={1.5}
                />
                <h3
                  className="relative z-10 mb-2 text-white"
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.05rem', fontWeight: 500 }}
                >
                  {step.title}
                </h3>
                <p
                  className="relative z-10 text-white/35"
                  style={{ fontSize: '0.88rem', lineHeight: 1.6 }}
                >
                  {step.desc}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
