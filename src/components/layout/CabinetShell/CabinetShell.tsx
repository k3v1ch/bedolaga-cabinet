import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Home, CreditCard, Wallet, Headphones, User, Gift, Users } from 'lucide-react';

import { useAuthStore } from '@/store/auth';
import { balanceApi } from '@/api/balance';
import { ticketNotificationsApi } from '@/api/ticketNotifications';
import { useBranding } from '@/hooks/useBranding';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';

import { useDevState } from './DevStateContext';

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
  { path: '/gifts', labelKey: 'nav.gifts', fallback: 'Подарки', icon: Gift },
];

interface CabinetShellProps {
  children: ReactNode;
}

export function CabinetShell({ children }: CabinetShellProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const { appName } = useBranding();
  const { formatAmount, currencySymbol } = useCurrency();
  const { devState } = useDevState();

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
      {/* Global header */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.06] bg-black/70 py-3 backdrop-blur-2xl">
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
            <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs text-white/50 sm:inline-block">
              <Wallet size={12} className="-mt-0.5 mr-1.5 inline" />
              {formatAmount(balanceRub)} {currencySymbol}
            </span>
            <button
              onClick={() => logout()}
              className="text-sm text-white/40 transition-colors hover:text-white/60"
            >
              {t('nav.logout', { defaultValue: 'Выход' })}
            </button>
          </div>
        </div>
      </header>

      {/* Desktop subnav */}
      <div className="fixed left-0 right-0 top-[52px] z-40 hidden border-b border-white/[0.04] bg-black/50 backdrop-blur-xl md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-6 py-1">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm transition-all',
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

      {/* Content */}
      <div className="pb-24 pt-[108px] md:pb-12 md:pt-[108px]">
        <div className="mx-auto max-w-3xl px-6">{children}</div>
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
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
    </div>
  );
}

export default CabinetShell;
