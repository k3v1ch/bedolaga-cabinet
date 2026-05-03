import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { Menu, X } from 'lucide-react';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isLanding = location.pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    if (!isLanding) {
      window.location.href = `/#${id}`;
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'border-b border-white/[0.06] bg-black/70 py-3 backdrop-blur-2xl'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <Link
          to="/"
          className="shrink-0 tracking-wider text-white"
          style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.1rem', fontWeight: 600 }}
        >
          ВЕРНО <span className="text-white/40">VPN</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {isLanding && (
            <>
              <button
                onClick={() => scrollTo('benefits')}
                className="text-sm text-white/50 transition-colors hover:text-white"
              >
                Преимущества
              </button>
              <button
                onClick={() => scrollTo('pricing')}
                className="text-sm text-white/50 transition-colors hover:text-white"
              >
                Цены
              </button>
              <button
                onClick={() => scrollTo('faq')}
                className="text-sm text-white/50 transition-colors hover:text-white"
              >
                FAQ
              </button>
            </>
          )}
          <Link
            to="/login"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.06] hover:text-white"
          >
            Вход
          </Link>
        </nav>

        <button className="text-white/70 md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <div className="mt-3 border-t border-white/[0.06] bg-black/95 backdrop-blur-2xl md:hidden">
          <div className="flex flex-col gap-4 p-6">
            {isLanding && (
              <>
                <button
                  onClick={() => scrollTo('benefits')}
                  className="py-2 text-left text-white/60"
                >
                  Преимущества
                </button>
                <button
                  onClick={() => scrollTo('pricing')}
                  className="py-2 text-left text-white/60"
                >
                  Цены
                </button>
                <button onClick={() => scrollTo('faq')} className="py-2 text-left text-white/60">
                  FAQ
                </button>
              </>
            )}
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="mt-2 rounded-full border border-white/15 px-5 py-3 text-center text-sm text-white/70"
            >
              Вход
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
