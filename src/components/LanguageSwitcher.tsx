import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect, type ReactElement } from 'react';
import { infoApi, type LanguageInfo } from '@/api/info';
import { useAuthStore } from '@/store/auth';
import { loadLanguage } from '@/i18n';

const DEFAULT_LANGUAGES: LanguageInfo[] = [
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'fa', name: 'فارسی', flag: '🇮🇷' },
];

// Only these UI languages are supported in the cabinet. Backend may report extras
// (e.g. uk) which we filter out so the switcher stays in sync with i18n bundles.
const SUPPORTED_CODES = new Set(DEFAULT_LANGUAGES.map((l) => l.code));

// ── Flag icons (SVG) ───────────────────────────────────────────────────────
// Inlined so we don't depend on platform emoji rendering (which is patchy on
// Windows desktop Telegram and some Linux browsers — flags fall back to "RU"
// text or two-letter codes). Each flag is drawn in a 24×16 box and clipped to
// rounded-corners by the parent <span>.

function RuFlag() {
  return (
    <svg viewBox="0 0 24 16" aria-hidden="true" className="block h-full w-full">
      <rect width="24" height="16" fill="#ffffff" />
      <rect y="5.33" width="24" height="5.34" fill="#0039A6" />
      <rect y="10.67" width="24" height="5.33" fill="#D52B1E" />
    </svg>
  );
}

function GbFlag() {
  return (
    <svg viewBox="0 0 24 16" aria-hidden="true" className="block h-full w-full">
      <rect width="24" height="16" fill="#012169" />
      {/* White diagonals (St Andrew) */}
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#ffffff" strokeWidth="3.2" />
      {/* Red diagonals (St Patrick), offset */}
      <path
        d="M0 0 L24 16 M24 0 L0 16"
        stroke="#C8102E"
        strokeWidth="1.6"
        clipPath="url(#gb-diag-clip)"
      />
      <defs>
        <clipPath id="gb-diag-clip">
          <polygon points="0,0 12,8 24,0 24,2 14,8 24,14 24,16 12,8 0,16 0,14 10,8 0,2" />
        </clipPath>
      </defs>
      {/* White cross (St George background) */}
      <rect x="10" width="4" height="16" fill="#ffffff" />
      <rect y="6" width="24" height="4" fill="#ffffff" />
      {/* Red cross (St George foreground) */}
      <rect x="10.8" width="2.4" height="16" fill="#C8102E" />
      <rect y="6.8" width="24" height="2.4" fill="#C8102E" />
    </svg>
  );
}

function CnFlag() {
  // Large star at (5.2, 4.4) ~r=2; four small stars (~r=0.7) around it.
  // Simplified: one big star + a small star to the right gives the right read
  // at 12px height while staying simple.
  return (
    <svg viewBox="0 0 24 16" aria-hidden="true" className="block h-full w-full">
      <rect width="24" height="16" fill="#DE2910" />
      <g fill="#FFDE00">
        {/* Big star */}
        <polygon points="5.2,1.6 5.85,3.6 7.95,3.6 6.25,4.85 6.9,6.85 5.2,5.6 3.5,6.85 4.15,4.85 2.45,3.6 4.55,3.6" />
        {/* Small stars */}
        <polygon points="9.6,1.4 9.85,2.05 10.55,2.05 9.95,2.45 10.2,3.1 9.6,2.7 9,3.1 9.25,2.45 8.65,2.05 9.35,2.05" />
        <polygon points="11.2,3.6 11.45,4.25 12.15,4.25 11.55,4.65 11.8,5.3 11.2,4.9 10.6,5.3 10.85,4.65 10.25,4.25 10.95,4.25" />
        <polygon points="11.2,6.4 11.45,7.05 12.15,7.05 11.55,7.45 11.8,8.1 11.2,7.7 10.6,8.1 10.85,7.45 10.25,7.05 10.95,7.05" />
        <polygon points="9.6,8.6 9.85,9.25 10.55,9.25 9.95,9.65 10.2,10.3 9.6,9.9 9,10.3 9.25,9.65 8.65,9.25 9.35,9.25" />
      </g>
    </svg>
  );
}

function IrFlag() {
  return (
    <svg viewBox="0 0 24 16" aria-hidden="true" className="block h-full w-full">
      <rect width="24" height="5.34" fill="#239F40" />
      <rect y="5.34" width="24" height="5.33" fill="#ffffff" />
      <rect y="10.67" width="24" height="5.33" fill="#DA0000" />
      {/* Simplified central emblem (subtle, readable at small sizes) */}
      <circle cx="12" cy="8" r="1.2" fill="#DA0000" />
    </svg>
  );
}

function FlagIcon({ code, className = '' }: { code: string; className?: string }) {
  const wrapper = `inline-block overflow-hidden rounded-[2px] ring-1 ring-black/20 ${className}`;
  const map: Record<string, ReactElement> = {
    ru: <RuFlag />,
    en: <GbFlag />,
    zh: <CnFlag />,
    fa: <IrFlag />,
  };
  const svg = map[code];
  if (!svg) return null;
  return <span className={wrapper}>{svg}</span>;
}

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [isOpen, setIsOpen] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageInfo[]>(DEFAULT_LANGUAGES);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Skip backend fetch on public pages — it requires auth and a 401 here
    // would trigger a global redirect to /login.
    if (!isAuthenticated) return;
    const fetchLanguages = async () => {
      try {
        const data = await infoApi.getLanguages();
        const merged: LanguageInfo[] = [...DEFAULT_LANGUAGES];
        if (data?.languages?.length) {
          for (const lang of data.languages) {
            if (!SUPPORTED_CODES.has(lang.code)) continue;
            const idx = merged.findIndex((l) => l.code === lang.code);
            if (idx >= 0) merged[idx] = lang;
          }
        }
        setAvailableLanguages(merged);
      } catch {
        // Keep default list if backend endpoint is unavailable
      }
    };
    fetchLanguages();
  }, [isAuthenticated]);

  const activeCode = i18n.language?.split('-')[0] || 'ru';
  const currentLang =
    availableLanguages.find((l) => l.code === activeCode) ||
    availableLanguages[0] ||
    DEFAULT_LANGUAGES[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeLanguage = async (code: string) => {
    setIsOpen(false);
    // Preload the bundle BEFORE switching so the first render after the change
    // already has translations — otherwise users see raw keys/fallback until
    // the dynamic import resolves and forces a manual reload.
    await loadLanguage(code);
    await i18n.changeLanguage(code);
    document.documentElement.dir = code === 'fa' ? 'rtl' : 'ltr';
    // Persist preference only when authenticated. On public pages (landing/login)
    // a 401 from this endpoint would bounce the user to /login.
    if (isAuthenticated) {
      infoApi.updateUserLanguage(code).catch(() => undefined);
    }
  };

  useEffect(() => {
    document.documentElement.dir = i18n.language === 'fa' ? 'rtl' : 'ltr';
  }, [i18n.language]);

  if (availableLanguages.length <= 1) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef} style={{ fontFamily: 'Inter, sans-serif' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
          isOpen
            ? 'border-white/20 bg-white/[0.08] text-white/80'
            : 'border-white/[0.08] bg-white/[0.05] text-white/60 hover:border-white/15 hover:bg-white/[0.08] hover:text-white/80'
        }`}
        aria-label="Change language"
        aria-expanded={isOpen}
      >
        <FlagIcon code={currentLang.code} className="h-3 w-4" />
        <span className="font-medium tracking-wide">{currentLang.code.toUpperCase()}</span>
        <svg
          className={`h-3 w-3 text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-44 animate-fade-in overflow-hidden rounded-2xl border border-white/[0.08] bg-black/90 p-1 shadow-xl shadow-black/40 backdrop-blur-2xl">
          {availableLanguages.map((lang) => {
            const active = lang.code === activeCode;
            return (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition-colors ${
                  active
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/55 hover:bg-white/[0.04] hover:text-white/80'
                }`}
              >
                <FlagIcon code={lang.code} className="h-3.5 w-5" />
                <span className="flex-1 text-left">{lang.name}</span>
                {active && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: '#059E52' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
