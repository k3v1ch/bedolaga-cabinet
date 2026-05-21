import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { Benefits } from '@/components/landing/Benefits';
import { Pricing } from '@/components/landing/Pricing';
import { Devices } from '@/components/landing/Devices';
import { QuickConnect } from '@/components/landing/QuickConnect';
import { FAQ } from '@/components/landing/FAQ';
import { Footer } from '@/components/landing/Footer';

export default function CabinetLanding() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-black" style={{ fontFamily: 'Inter, sans-serif' }}>
      <Header />
      <Hero />
      <Benefits />
      <Pricing />
      <Devices />
      <QuickConnect />
      <FAQ />

      <section className="bg-black py-24 text-center md:py-32">
        <div className="mx-auto max-w-2xl px-6">
          <h2
            className="mb-4 text-white"
            style={{
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            {t('landing.cta.title')}
          </h2>
          <p className="mb-8 text-sm text-white/35">{t('landing.cta.subtitle')}</p>
          <Link
            to="/login"
            className="inline-block rounded-full bg-white px-8 py-4 text-black transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-white/15 active:scale-95"
            style={{ fontSize: '0.95rem', fontWeight: 500 }}
          >
            {t('landing.cta.button')}
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
