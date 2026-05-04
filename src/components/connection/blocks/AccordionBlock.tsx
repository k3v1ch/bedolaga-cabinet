import { useState } from 'react';
import { getColorGradient } from '@/utils/colorParser';
import { ThemeIcon } from './ThemeIcon';
import type { BlockRendererProps } from './types';

export function AccordionBlock({
  blocks,
  isMobile,
  isLight,
  variant,
  getLocalizedText,
  getSvgHtml,
  renderBlockButtons,
}: BlockRendererProps) {
  const isVerno = variant === 'verno';
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const visibleBlocks = blocks.filter(
    (b) => getLocalizedText(b.title) || getLocalizedText(b.description) || b.buttons?.length,
  );

  if (!visibleBlocks.length) return null;

  return (
    <div className="space-y-2">
      {visibleBlocks.map((block, index) => {
        const gradientStyle = getColorGradient(block.svgIconColor || 'cyan', isLight);
        const isOpen = openIndex === index;

        return (
          <div
            key={index}
            className={`overflow-hidden rounded-2xl border transition-colors ${
              isVerno
                ? isOpen
                  ? 'border-white/[0.18] bg-white/[0.04]'
                  : 'border-white/[0.06] bg-white/[0.02]'
                : isLight
                  ? isOpen
                    ? 'border-accent-500/30 bg-white/80 shadow-sm'
                    : 'border-dark-700/60 bg-white/60'
                  : isOpen
                    ? 'border-accent-500/30 bg-dark-800/50'
                    : 'border-dark-700/50 bg-dark-800/50'
            }`}
          >
            {/* Control */}
            <button
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <ThemeIcon
                getSvgHtml={getSvgHtml}
                svgIconKey={block.svgIconKey}
                gradientStyle={gradientStyle}
                isMobile={isMobile}
                variant={variant}
              />
              <span
                className={`min-w-0 flex-1 truncate ${
                  isVerno ? 'text-white' : 'font-semibold text-dark-100'
                }`}
                style={isVerno ? { fontWeight: 500 } : undefined}
              >
                {getLocalizedText(block.title)}
              </span>
              <svg
                className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 ${
                  isVerno ? 'text-white/35' : 'text-dark-400'
                } ${isOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {/* Panel */}
            <div
              className={`overflow-hidden transition-all duration-200 ${
                isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-4 pb-4">
                <p
                  className={`whitespace-pre-line text-sm ${
                    isVerno ? 'text-white/35' : 'leading-relaxed text-dark-400'
                  }`}
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
