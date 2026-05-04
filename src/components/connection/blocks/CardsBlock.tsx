import { getColorGradient } from '@/utils/colorParser';
import { ThemeIcon } from './ThemeIcon';
import type { BlockRendererProps } from './types';

export function CardsBlock({
  blocks,
  isMobile,
  isLight,
  variant,
  getLocalizedText,
  getSvgHtml,
  renderBlockButtons,
}: BlockRendererProps) {
  const isVerno = variant === 'verno';
  const visibleBlocks = blocks.filter(
    (b) => getLocalizedText(b.title) || getLocalizedText(b.description) || b.buttons?.length,
  );

  if (!visibleBlocks.length) return null;

  return (
    <div className="space-y-3">
      {visibleBlocks.map((block, index) => {
        const gradientStyle = getColorGradient(block.svgIconColor || 'cyan', isLight);

        return (
          <div
            key={index}
            className={`rounded-2xl border p-4 sm:p-5 ${
              isVerno
                ? 'border-white/[0.06] bg-white/[0.03]'
                : isLight
                  ? 'border-dark-700/60 bg-white/80 shadow-sm'
                  : 'border-dark-700/50 bg-dark-800/50'
            }`}
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <ThemeIcon
                getSvgHtml={getSvgHtml}
                svgIconKey={block.svgIconKey}
                gradientStyle={gradientStyle}
                isMobile={isMobile}
                variant={variant}
              />
              <div className="min-w-0 flex-1">
                <h3
                  className={isVerno ? 'text-white' : 'font-semibold text-dark-100'}
                  style={isVerno ? { fontWeight: 500, fontSize: '0.95rem' } : undefined}
                >
                  {getLocalizedText(block.title)}
                </h3>
                <p
                  className={
                    isVerno
                      ? 'mt-1 whitespace-pre-line text-sm text-white/35'
                      : 'mt-1 whitespace-pre-line text-sm leading-relaxed text-dark-400'
                  }
                  style={isVerno ? { lineHeight: 1.65 } : undefined}
                >
                  {getLocalizedText(block.description)}
                </p>
                {renderBlockButtons(block.buttons, 'light')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
