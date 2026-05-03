import { motion } from 'framer-motion';
import { Globe, Gauge, Lock, ShieldCheck, Smartphone, RefreshCcw } from 'lucide-react';
import { GlassCard } from './GlassCard';

const benefits = [
  {
    icon: Globe,
    title: 'Доступ там, где он нужен',
    desc: 'Подключайтесь и пользуйтесь нужными сервисами из любой точки мира.',
  },
  {
    icon: Gauge,
    title: 'Скорость до 10 Гбит/с',
    desc: 'Быстрое и стабильное соединение для видео, мессенджеров и обычного интернета.',
  },
  {
    icon: Lock,
    title: 'Надёжное шифрование трафика',
    desc: 'Ваши данные защищены современным шифрованием на каждом этапе соединения.',
  },
  {
    icon: ShieldCheck,
    title: 'Без логов и скрытого сбора данных',
    desc: 'Мы не храним логи и не собираем данные за вашей спиной.',
  },
  {
    icon: Smartphone,
    title: 'До 30 устройств в одной подписке',
    desc: 'Один тариф для телефона, ноутбука, компьютера и других совместимых устройств.',
  },
  {
    icon: RefreshCcw,
    title: 'Не работает — вернём деньги',
    desc: 'Если VPN не работает в вашем регионе, вы можете получить полный возврат.',
  },
];

export function Benefits() {
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
          Почему ВЕРНО VPN
        </motion.h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b, i) => (
            <motion.div
              key={b.title}
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
                  {b.title}
                </h3>
                <p className="text-white/35" style={{ fontSize: '0.88rem', lineHeight: 1.65 }}>
                  {b.desc}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
