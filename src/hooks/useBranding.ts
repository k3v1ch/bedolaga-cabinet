import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTelegramSDK, setCachedFullscreenEnabled } from '@/hooks/useTelegramSDK';
import {
  brandingApi,
  getCachedBranding,
  setCachedBranding,
  preloadLogo,
  isLogoPreloaded,
} from '@/api/branding';
import { setFavicon, letterFaviconDataUri, roundedFaviconDataUri } from '@/utils/favicon';

const FALLBACK_NAME = import.meta.env.VITE_APP_NAME || 'Cabinet';
const FALLBACK_LOGO = import.meta.env.VITE_APP_LOGO || 'V';

export function useBranding() {
  const { isTelegramWebApp, requestFullscreen, isMobile } = useTelegramSDK();

  // Branding data. We keep the query enabled unconditionally — the endpoint
  // is public and we need the brand name/logo on landing/login pages too,
  // otherwise the document.title stays as the index.html fallback ("ВЕРНО
  // VPN") for unauthenticated visitors instead of the real configured name.
  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: async () => {
      const data = await brandingApi.getBranding();
      setCachedBranding(data);
      await preloadLogo(data);
      return data;
    },
    initialData: getCachedBranding() ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: 60000,
  });

  const appName = branding ? branding.name : FALLBACK_NAME;
  const logoLetter = branding?.logo_letter || FALLBACK_LOGO;
  const hasCustomLogo = branding?.has_custom_logo || false;
  const logoUrl = branding ? brandingApi.getLogoUrl(branding) : null;

  // Set document title eagerly. `appName` already has a synchronous fallback
  // (cached branding or VITE_APP_NAME), so this fires on the first render —
  // no "Loading..." flash even before the network call resolves.
  useEffect(() => {
    if (appName) document.title = appName;
  }, [appName]);

  // Update favicon — custom logo (rounded like the header tile) when available,
  // else a brand-letter monogram so the tab always carries an icon.
  useEffect(() => {
    if (!logoUrl) {
      setFavicon(letterFaviconDataUri(logoLetter));
      return;
    }
    let cancelled = false;
    roundedFaviconDataUri(logoUrl).then((rounded) => {
      if (!cancelled) setFavicon(rounded || logoUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl, logoLetter]);

  // Fullscreen setting from server
  const { data: fullscreenSetting } = useQuery({
    queryKey: ['fullscreen-enabled'],
    queryFn: brandingApi.getFullscreenEnabled,
    staleTime: 60000,
  });

  const fullscreenRequestedRef = useRef(false);

  useEffect(() => {
    if (!fullscreenSetting || !isTelegramWebApp) return;
    setCachedFullscreenEnabled(fullscreenSetting.enabled);
    if (fullscreenSetting.enabled && isMobile && !fullscreenRequestedRef.current) {
      fullscreenRequestedRef.current = true;
      requestFullscreen();
    }
  }, [fullscreenSetting, isTelegramWebApp, requestFullscreen, isMobile]);

  return {
    appName,
    logoLetter,
    hasCustomLogo,
    logoUrl,
    isLogoPreloaded,
  };
}
