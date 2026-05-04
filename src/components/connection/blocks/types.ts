import type { RemnawaveBlockClient, RemnawaveButtonClient, LocalizedText } from '@/types';

export interface BlockRendererProps {
  blocks: RemnawaveBlockClient[];
  isMobile: boolean;
  isLight: boolean;
  variant?: 'legacy' | 'verno';
  getLocalizedText: (text: LocalizedText | undefined) => string;
  getSvgHtml: (key: string | undefined) => string;
  renderBlockButtons: (
    buttons: RemnawaveButtonClient[] | undefined,
    variant: 'light' | 'subtle',
  ) => React.ReactNode;
}
