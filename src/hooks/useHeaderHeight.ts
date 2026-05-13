import { useTelegramSDK } from '@/hooks/useTelegramSDK';
import { UI } from '@/config/constants';

/**
 * Computes the app header height in pixels, accounting for
 * Telegram MiniApp safe area insets in fullscreen mode.
 *
 * Desktop: 56px (h-14). Mobile: 64px (h-16) + safe area + TG header when fullscreen.
 * bottomSafeArea: TG SDK bottom inset (home indicator etc.), 0 outside TG.
 */
export function useHeaderHeight(): {
  mobile: number;
  desktop: number;
  bottomSafeArea: number;
  isMobileFullscreen: boolean;
} {
  const {
    isTelegramWebApp,
    isFullscreen,
    safeAreaInset,
    contentSafeAreaInset,
    platform,
    isMobile,
  } = useTelegramSDK();
  const isMobileFullscreen = isFullscreen && isMobile;
  const isMobileTelegram = isMobile && isTelegramWebApp;

  const telegramHeaderHeight =
    platform === 'android' ? UI.TELEGRAM_HEADER_ANDROID_PX : UI.TELEGRAM_HEADER_IOS_PX;

  // Top inset reported by Telegram (status bar / floating controls overlay).
  // Non-zero in fullscreen and in the swipe-to-expand mini-app mode where the
  // webview extends under the device status bar and TG's floating close button.
  // Always 0 outside Telegram, on desktop, or in the regular bot-menu mode.
  const topInset = isMobileTelegram ? Math.max(safeAreaInset.top, contentSafeAreaInset.top) : 0;

  const mobile = isMobileFullscreen
    ? UI.MOBILE_HEADER_HEIGHT_PX + topInset + telegramHeaderHeight
    : UI.MOBILE_HEADER_HEIGHT_PX + topInset;

  const bottomSafeArea = isMobileFullscreen
    ? Math.max(safeAreaInset.bottom, contentSafeAreaInset.bottom)
    : 0;

  return { mobile, desktop: UI.DESKTOP_HEADER_HEIGHT_PX, bottomSafeArea, isMobileFullscreen };
}
