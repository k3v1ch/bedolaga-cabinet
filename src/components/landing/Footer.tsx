import { Link } from 'react-router';

export function Footer() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="relative border-t border-white/[0.05] bg-black py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
          <div>
            <p
              className="mb-3 tracking-wider text-white"
              style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.1rem', fontWeight: 600 }}
            >
              ВЕРНО <span className="text-white/40">VPN</span>
            </p>
            <p className="text-sm text-white/25" style={{ lineHeight: 1.7 }}>
              Быстрый и понятный VPN для повседневного интернета. Без логов, без скрытых условий.
            </p>
          </div>

          <div>
            <p className="mb-4 text-sm text-white/40" style={{ fontWeight: 500 }}>
              Навигация
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => scrollTo('benefits')}
                className="text-left text-sm text-white/25 transition-colors hover:text-white/50"
              >
                Преимущества
              </button>
              <button
                onClick={() => scrollTo('pricing')}
                className="text-left text-sm text-white/25 transition-colors hover:text-white/50"
              >
                Цены
              </button>
              <button
                onClick={() => scrollTo('faq')}
                className="text-left text-sm text-white/25 transition-colors hover:text-white/50"
              >
                FAQ
              </button>
              <Link
                to="/login"
                className="text-sm text-white/25 transition-colors hover:text-white/50"
              >
                Вход
              </Link>
            </div>
          </div>

          <div>
            <p className="mb-4 text-sm text-white/40" style={{ fontWeight: 500 }}>
              Информация
            </p>
            <div className="flex flex-col gap-2.5">
              <a href="#" className="text-sm text-white/25 transition-colors hover:text-white/50">
                Политика конфиденциальности
              </a>
              <a href="#" className="text-sm text-white/25 transition-colors hover:text-white/50">
                Пользовательское соглашение
              </a>
              <a href="#" className="text-sm text-white/25 transition-colors hover:text-white/50">
                Условия возврата
              </a>
              <a
                href="https://t.me/VernoVPNbot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/25 transition-colors hover:text-white/50"
              >
                Telegram-бот
              </a>
              <a
                href="https://t.me/VernoVPNsupport"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/25 transition-colors hover:text-white/50"
              >
                Поддержка
              </a>
            </div>
          </div>
        </div>

        <div className="mt-14 border-t border-white/[0.04] pt-6 text-center">
          <p className="text-white/12 text-xs">© 2026 ВЕРНО VPN. Все права защищены.</p>
        </div>
      </div>
    </footer>
  );
}
