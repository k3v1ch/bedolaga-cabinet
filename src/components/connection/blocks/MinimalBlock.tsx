import { getColorGradient } from '@/utils/colorParser';
import { ThemeIcon } from './ThemeIcon';
import type { BlockRendererProps } from './types';

export function MinimalBlock({
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
    <div>
      {visibleBlocks.map((block, index) => {
        const gradientStyle = getColorGradient(block.svgIconColor || 'cyan', isLight);
        const isLast = index === visibleBlocks.length - 1;

        return (
          <div
            key={index}
            className={
              isLast
                ? 'pb-4'
                : `mb-4 border-b pb-4 ${
                    isVerno
                      ? 'border-white/[0.06]'
                      : isLight
                        ? 'border-dark-700/40'
                        : 'border-dark-700/50'
                  }`
            }
          >
            <div className="mb-2 flex items-center gap-3">
              <ThemeIcon
                getSvgHtml={getSvgHtml}
                svgIconKey={block.svgIconKey}
                gradientStyle={gradientStyle}
                isMobile={isMobile}
                variant={variant}
              />
              <span
                className={isVerno ? 'text-white' : 'font-medium text-dark-100'}
                style={isVerno ? { fontWeight: 500 } : undefined}
              >
                {getLocalizedText(block.title)}
              </span>
            </div>
            <p
              className={`whitespace-pre-line text-sm ${
                isVerno ? 'text-white/35' : 'leading-relaxed text-dark-400'
              }`}
              style={isVerno ? { lineHeight: 1.65 } : undefined}
            >
              {getLocalizedText(block.description)}
            </p>
            {renderBlockButtons(block.buttons, 'subtle')}
          </div>
        );
      })}
    </div>
  );
}
