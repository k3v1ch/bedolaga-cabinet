import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';
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
        <span className="leading-none">{currentLang.flag}</span>
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
                <span className="text-sm leading-none">{lang.flag}</span>
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
