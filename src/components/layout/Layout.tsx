import { AppShell } from './AppShell';
import { CabinetShell, DevStateProvider } from './CabinetShell';

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Main layout component that wraps all pages.
 *
 * Two implementations available:
 * - `CabinetShell` (NEW, default): минималистичный shell, портирован из VernoVPN.
 *   Включает временную DEV-панель для проверки вёрстки (уберём после полной интеграции).
 * - `AppShell` (LEGACY): прежний shell с боковой навигацией, командной палитрой,
 *   брендингом, WS-уведомлениями и т.д. Сохранён нетронутым для отката.
 *
 * Переключение через env: `VITE_USE_NEW_SHELL=false` → откат на старый AppShell.
 * По умолчанию используется новый shell.
 */
const useNewShell = import.meta.env.VITE_USE_NEW_SHELL !== 'false';

export default function Layout({ children }: LayoutProps) {
  if (useNewShell) {
    return (
      <DevStateProvider>
        <CabinetShell>{children}</CabinetShell>
      </DevStateProvider>
    );
  }
  return <AppShell>{children}</AppShell>;
}
