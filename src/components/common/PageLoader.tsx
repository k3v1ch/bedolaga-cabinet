interface PageLoaderProps {
  variant?: 'dark' | 'light';
}

/**
 * Minimal full-screen loader that mirrors the pre-React HTML preloader:
 * black background, gently pulsing brand wordmark — no rotating geometry,
 * which avoids subpixel color fringes on certain displays.
 */
export default function PageLoader({ variant = 'dark' }: PageLoaderProps) {
  const isLight = variant === 'light';
  const baseColor = isLight ? '#000000' : '#ffffff';
  const accentColor = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';

  return (
    <div
      className={`flex min-h-screen items-center justify-center ${
        isLight ? 'bg-white/0' : 'bg-black'
      }`}
      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      <span
        style={{
          letterSpacing: '0.16em',
          fontSize: '0.95rem',
          fontWeight: 600,
          color: baseColor,
        }}
      >
        ВЕРНО <span style={{ color: accentColor, fontWeight: 500 }}>VPN</span>
      </span>
    </div>
  );
}
