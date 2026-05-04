import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'Одна подписка — сколько устройств?',
    a: 'Одна подписка ВЕРНО VPN работает до 30 устройств в максимальном тарифе, и до 5 устройств в базовом. Телефон, ноутбук, компьютер, планшет, телевизор — подключайте всё, чем реально пользуетесь, в рамках одного тарифа.',
  },
  {
    q: 'С YouTube и Telegram работает?',
    a: 'Да, работает. ВЕРНО VPN подходит для YouTube, Telegram, TikTok и обычного повседневного интернета.',
  },
  {
    q: 'Что вы делаете с моими данными?',
    a: 'Ничего лишнего. Мы не храним логи и не ведём скрытый сбор данных. Ваш трафик шифруется, а активность в сети остаётся приватной.',
  },
  {
    q: 'Что будет через 3 дня?',
    a: 'Бесплатный период закончится, и доступ отключится автоматически. Без карты, без автопродления, без списаний. Захотите продолжить — просто выберете тариф и продлите доступ.',
  },
  {
    q: 'На чём работает ВЕРНО VPN?',
    a: 'ВЕРНО VPN использует VLESS. Это быстрый и стабильный протокол для повседневного использования.',
  },
  {
    q: 'Что вообще делает VPN?',
    a: 'VPN пропускает ваш интернет-трафик через защищённый сервер. Это скрывает ваш реальный IP и делает соединение более закрытым для посторонних.',
  },
  {
    q: 'Можно ли спокойно пользоваться VPN в России?',
    a: 'Да. ВЕРНО VPN безопасен в использовании в России. Мы не ведём логи, не сохраняем ваши данные, а трафик шифруется и маскируется.',
  },
  {
    q: 'Где подключить подписку?',
    a: 'Подключить ВЕРНО VPN можно прямо на сайте или через Telegram-бота. Выбирайте тот способ, который удобнее вам.',
  },
  {
    q: 'Как получить выше скорость и ниже пинг?',
    a: 'Самый простой способ — выбрать сервер, который находится ближе к вам. Чем лучше ваш интернет и чем удачнее выбран сервер, тем выше скорость и ниже задержка.',
  },
  {
    q: 'Что, если VPN не заработает?',
    a: 'Если ВЕРНО VPN не работает в вашем регионе, вы можете подать заявку на возврат. Мы вернём полную сумму в течение 7 дней с момента обращения.',
  },
];

function FAQItem({
  item,
  isOpen,
  onToggle,
}: {
  item: (typeof faqs)[0];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button
        onClick={onToggle}
        className="group flex w-full items-center justify-between py-5 text-left"
      >
        <span
          className={`pr-4 text-sm transition-colors ${
            isOpen ? 'text-white/80' : 'text-white/50 group-hover:text-white/70'
          }`}
        >
          {item.q}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-white/20 transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="pb-5 pr-8 text-white/30" style={{ fontSize: '0.88rem', lineHeight: 1.7 }}>
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section id="faq" className="relative bg-black py-24 md:py-32">
      <div className="mx-auto max-w-2xl px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-14 text-center text-white"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Частые вопросы
        </motion.h2>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2 backdrop-blur-xl sm:p-4">
          {faqs.map((item, i) => (
            <FAQItem
              key={i}
              item={item}
              isOpen={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
