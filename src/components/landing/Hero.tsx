import { motion } from 'framer-motion';
import { Link } from 'react-router';
import { Shield, Clock, Zap, Monitor } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-950 to-black" />
      <div className="absolute left-1/2 top-1/3 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.015] blur-[100px]" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 flex justify-center"
        >
          <span className="inline-block rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm text-white/45 backdrop-blur-xl">
            3 дня бесплатно&nbsp;&bull;&nbsp;без карты&nbsp;&bull;&nbsp;без автопродления
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mx-auto max-w-4xl text-white"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(1.9rem, 5vw, 3.5rem)',
            fontWeight: 600,
            lineHeight: 1.12,
            letterSpacing: '-0.025em',
          }}
        >
          Быстрый VPN для Telegram, YouTube, TikTok и повседневного интернета
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-white/40"
          style={{ fontSize: 'clamp(0.95rem, 1.8vw, 1.1rem)', lineHeight: 1.65 }}
        >
          Подходит для всех устройств — подключение за минуту, скорость до 10 Гбит/с, безлимитный
          трафик и 3 дня бесплатного доступа.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            to="/login"
            className="rounded-full bg-white px-8 py-4 text-black transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-white/15 active:scale-95"
            style={{ fontSize: '0.95rem', fontWeight: 500 }}
          >
            Попробовать бесплатно
          </Link>
          <Link
            to="/login"
            className="rounded-full border border-white/10 bg-white/[0.04] px-8 py-4 text-white/60 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white/80 active:scale-95"
            style={{ fontSize: '0.95rem', fontWeight: 500 }}
          >
            Войти в личный кабинет
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.55 }}
          className="mt-16 flex flex-wrap justify-center gap-3"
        >
          {[
            { icon: Shield, label: 'Приватность' },
            { icon: Clock, label: 'Время работы 24/7' },
            { icon: Zap, label: 'Каналы серверов до 10 Гбит/с' },
            { icon: Monitor, label: 'До 30 устройств' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 backdrop-blur-xl"
            >
              <item.icon size={15} className="shrink-0 text-white/30" strokeWidth={1.5} />
              <span className="whitespace-nowrap text-sm text-white/40">{item.label}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
