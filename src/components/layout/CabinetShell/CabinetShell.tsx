import { type ReactNode, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Home, CreditCard, Wallet, Headphones, User, Users, Shield } from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { balanceApi } from '@/api/balance';
import { ticketNotificationsApi } from '@/api/ticketNotifications';
import { useBranding } from '@/hooks/useBranding';
import { useCurrency } from '@/hooks/useCurrency';
import { useTelegramSDK } from '@/hooks/useTelegramSDK';
import { UI } from '@/config/constants';
import { cn } from '@/lib/utils';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import { PromptDialogHost } from '@/components/PromptDialogHost';

import { useDevState } from './DevStateContext';

// CabinetShell mobile header is `py-3` + a single line of text — measures ~52px.
// Desktop subnav adds another 52px below it, hence the historical pt-[108px] (≈ 56+52).
const CABINET_HEADER_HEIGHT_PX = 52;
const CABINET_SUBNAV_HEIGHT_PX = 56;

type TabDef = {
  path: string;
  labelKey: string;
  fallback: string;
  icon: typeof Home;
  hasNotificationDot?: boolean;
};

const TABS: TabDef[] = [
  { path: '/', labelKey: 'nav.dashboard', fallback: 'Главная', icon: Home },
  { path: '/subscriptions', labelKey: 'nav.subscription', fallback: 'Подписка', icon: CreditCard },
  { path: '/balance', labelKey: 'nav.balance', fallback: 'Баланс', icon: Wallet },
  {
    path: '/support',
    labelKey: 'nav.support',
    fallback: 'Поддержка',
    icon: Headphones,
    hasNotificationDot: true,
  },
  { path: '/profile', labelKey: 'nav.profile', fallback: 'Профиль', icon: User },
  { path: '/referral', labelKey: 'nav.referral', fallback: 'Реферальная', icon: Users },
];

interface CabinetShellProps {
  children: ReactNode;
}

export function CabinetShell({ children }: CabinetShellProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const userId = useAuthStore((s) => s.user?.id);
  const checkAdminStatus = useAuthStore((s) => s.checkAdminStatus);
  const logout = useAuthStore((s) => s.logout);

  // Re-verify admin status whenever the authenticated user changes.
  // Prevents stale `isAdmin` after switching accounts in another tab.
  useEffect(() => {
    if (isAuthenticated) {
      void checkAdminStatus();
    }
  }, [isAuthenticated, userId, checkAdminStatus]);
  const { appName } = useBranding();
  const { formatAmount, currencySymbol } = useCurrency();
  const { devState } = useDevState();

  // Telegram safe-area handling.
  // In fullscreen, TG overlays the top of the viewport with a floating Close
  // button + three-dots/dropdown. `contentSafeAreaInset.top` reports the
  // clearance needed under those controls; `safeAreaInset.top` reports OS
  // status-bar clearance. Per Telegram's spec they share an origin (top of the
  // WebView), so we take the larger of the two for fixed-top elements.
  // Same logic for the bottom (home indicator + TG bottom bar).
  const {
    isTelegramWebApp,
    isFullscreen,
    safeAreaInset,
    contentSafeAreaInset,
    isMobile,
    platform,
  } = useTelegramSDK();
  const isMobileTelegram = isMobile && isTelegramWebApp;
  const isMobileFullscreen = isFullscreen && isMobile;

  const topInset = isMobileTelegram ? Math.max(safeAreaInset.top, contentSafeAreaInset.top) : 0;
  // In fullscreen we must also clear TG's floating buttons (Close, …, ⌃).
  // Some TG versions don't include their overlay in contentSafeAreaInset, so
  // we add a constant fallback that matches the AppShell behavior.
  const telegramOverlay = isMobileFullscreen
    ? platform === 'android'
      ? UI.TELEGRAM_HEADER_ANDROID_PX
      : UI.TELEGRAM_HEADER_IOS_PX
    : 0;
  const headerTopPadding = topInset + telegramOverlay;
  const bottomInset = isMobileFullscreen
    ? Math.max(safeAreaInset.bottom, contentSafeAreaInset.bottom)
    : 0;

  const headerStyle = useMemo(
    () => (headerTopPadding > 0 ? { paddingTop: `${headerTopPadding}px` } : undefined),
    [headerTopPadding],
  );

  // Total content offset. Preserves the original 108px (header + subnav on
  // desktop, intentional spacing on mobile) and adds the TG inset on top.
  const baseContentTopPx = CABINET_HEADER_HEIGHT_PX + CABINET_SUBNAV_HEIGHT_PX; // 108
  const contentStyle: React.CSSProperties = {
    paddingTop: `${headerTopPadding + baseContentTopPx}px`,
    paddingBottom: `calc(6rem + ${bottomInset}px)`,
  };

  // The subnav sits right below the global header on desktop.
  const subnavTop = CABINET_HEADER_HEIGHT_PX;

  // Real balance for the header pill
  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
  const balanceRub = balanceData?.balance_rubles ?? 0;

  // Real unread support tickets — drives the green dot on Support tab
  const { data: unreadData } = useQuery({
    queryKey: ['ticket-notifications-count'],
    queryFn: ticketNotificationsApi.getUnreadCount,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const realSupportNotif = (unreadData?.unread_count ?? 0) > 0;
  const supportNotif = realSupportNotif || devState.supportNotification;

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const tabs = TABS.map((tab) => ({
    ...tab,
    label: t(tab.labelKey, { defaultValue: tab.fallback }),
  }));

  return (
    <div className="min-h-screen bg-black" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Global header. Inline padding-top accounts for Telegram Mini App
          safe area + floating UI (Close / ⌃ / …) in fullscreen mode so the
          header content sits below the OS status bar and TG overlay. */}
      <header
        className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.06] bg-black/70 py-3 backdrop-blur-2xl"
        style={headerStyle}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <Link
            to="/"
            className="flex shrink-0 items-center tracking-wider text-white"
            style={{ fontSize: '1.1rem', fontWeight: 600 }}
          >
            <span>
              {appName?.toUpperCase() ?? 'ВЕРНО'} <span className="text-white/40">VPN</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                to="/admin"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors',
                  location.pathname.startsWith('/admin')
                    ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                    : 'border-amber-400/20 bg-amber-400/[0.06] text-amber-300/80 hover:bg-amber-400/10 hover:text-amber-300',
                )}
                title={t('admin.nav.title', { defaultValue: 'Админ-панель' })}
              >
                <Shield size={12} strokeWidth={2} />
                <span className="hidden sm:inline">
                  {t('admin.nav.title', { defaultValue: 'Админ' })}
                </span>
              </Link>
            )}
            <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[13px] text-white/50 sm:inline-block">
              <Wallet size={12} className="-mt-0.5 mr-1.5 inline" />
              {formatAmount(balanceRub)} {currencySymbol}
            </span>
            <LanguageSwitcher />
            <button
              onClick={() => logout()}
              className="text-[15px] text-white/40 transition-colors hover:text-white/60"
            >
              {t('nav.logout', { defaultValue: 'Выход' })}
            </button>
          </div>
        </div>
      </header>

      {/* Desktop subnav */}
      <div
        className="fixed left-0 right-0 z-40 hidden border-b border-white/[0.04] bg-black/50 backdrop-blur-xl md:block"
        style={{ top: `${headerTopPadding + subnavTop}px` }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-6 py-1">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-[15px] transition-all',
                  active
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/35 hover:bg-white/[0.03] hover:text-white/60',
                )}
              >
                <span className="relative inline-flex">
                  <Icon size={15} strokeWidth={1.5} />
                  {tab.hasNotificationDot && supportNotif && (
                    <span
                      className="absolute -right-0.5 -top-0.5 rounded-full"
                      style={{ width: 5, height: 5, backgroundColor: '#059E52' }}
                    />
                  )}
                </span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Content. Top padding accounts for the fixed header + (desktop) subnav
          PLUS Telegram's safe-area / floating-UI clearance. Bottom padding
          leaves room for the mobile bottom nav and the home-indicator safe
          area in fullscreen mode. */}
      <div className="md:pb-12" style={contentStyle}>
        <div className="mx-auto max-w-3xl px-6">{children}</div>
      </div>

      {/* Mobile bottom nav. In TG fullscreen, the env() safe-area variables
          aren't always populated by the WebView, so we apply the SDK-reported
          bottom inset directly. We use max() to also honor the OS env() when
          available outside TG (PWA, browser). */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-black/90 backdrop-blur-2xl md:hidden"
        style={{
          paddingBottom: `max(env(safe-area-inset-bottom, 0px), ${bottomInset}px)`,
        }}
      >
        <div className="flex items-center justify-around py-2">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-all',
                  active ? 'text-white' : 'text-white/30',
                )}
              >
                <span className="relative inline-flex">
                  <Icon size={18} strokeWidth={1.5} />
                  {tab.hasNotificationDot && supportNotif && (
                    <span
                      className="absolute -right-0.5 -top-0.5 rounded-full"
                      style={{ width: 5, height: 5, backgroundColor: '#059E52' }}
                    />
                  )}
                </span>
                <span className="text-[9px]">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Global prompt dialog host for usePrompt() (legacy AppShell has its own). */}
      <PromptDialogHost />
    </div>
  );
}

export default CabinetShell;
