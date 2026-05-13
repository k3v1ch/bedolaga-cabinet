import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();
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
              {t('landing.footer.tagline')}
            </p>
          </div>

          <div>
            <p className="mb-4 text-sm text-white/40" style={{ fontWeight: 500 }}>
              {t('landing.footer.navigation')}
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => scrollTo('benefits')}
                className="text-left text-sm text-white/25 transition-colors hover:text-white/50"
              >
                {t('landing.nav.benefits')}
              </button>
              <button
                onClick={() => scrollTo('pricing')}
                className="text-left text-sm text-white/25 transition-colors hover:text-white/50"
              >
                {t('landing.nav.pricing')}
              </button>
              <button
                onClick={() => scrollTo('faq')}
                className="text-left text-sm text-white/25 transition-colors hover:text-white/50"
              >
                {t('landing.nav.faq')}
              </button>
              <Link
                to="/login"
                className="text-sm text-white/25 transition-colors hover:text-white/50"
              >
                {t('landing.nav.login')}
              </Link>
            </div>
          </div>

          <div>
            <p className="mb-4 text-sm text-white/40" style={{ fontWeight: 500 }}>
              {t('landing.footer.info')}
            </p>
            <div className="flex flex-col gap-2.5">
              <a href="#" className="text-sm text-white/25 transition-colors hover:text-white/50">
                {t('landing.footer.policy')}
              </a>
              <a href="#" className="text-sm text-white/25 transition-colors hover:text-white/50">
                {t('landing.footer.terms')}
              </a>
              <a href="#" className="text-sm text-white/25 transition-colors hover:text-white/50">
                {t('landing.footer.refund')}
              </a>
              <a
                href="https://t.me/VernoVPNbot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/25 transition-colors hover:text-white/50"
              >
                {t('landing.footer.bot')}
              </a>
              <a
                href="https://t.me/VernoVPNsupport"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/25 transition-colors hover:text-white/50"
              >
                {t('landing.footer.support')}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-14 border-t border-white/[0.04] pt-6 text-center">
          <p className="text-white/12 text-xs">{t('landing.footer.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
