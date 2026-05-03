import type { ColorGradientStyle } from '@/utils/colorParser';

interface ThemeIconProps {
  getSvgHtml: (key: string | undefined) => string;
  svgIconKey?: string;
  gradientStyle: ColorGradientStyle;
  isMobile: boolean;
  variant?: 'legacy' | 'verno';
}

export function ThemeIcon({
  getSvgHtml,
  svgIconKey,
  gradientStyle,
  isMobile,
  variant,
}: ThemeIconProps) {
  const svgHtml = getSvgHtml(svgIconKey);
  if (!svgHtml) return null;
  const size = isMobile ? 36 : 44;
  const iconSize = isMobile ? 18 : 22;
  const isVerno = variant === 'verno';

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={
        isVerno
          ? {
              width: size,
              height: size,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }
          : {
              width: size,
              height: size,
              background: gradientStyle.background,
              border: gradientStyle.border,
              boxShadow: gradientStyle.boxShadow,
            }
      }
    >
      <div
        style={{
          width: iconSize,
          height: iconSize,
          color: isVerno ? 'rgba(255,255,255,0.55)' : undefined,
        }}
        className="[&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    </div>
  );
}
