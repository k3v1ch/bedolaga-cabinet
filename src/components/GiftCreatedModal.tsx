// KELDARI-UI: модалка-подтверждение после покупки подарка.
// Вместо тоста показывает отдельное всплывающее окно со ссылкой на подарок,
// чтобы пользователь сразу скопировал её и отправил другу. В стиле кабинета
// (стекло, Inter, белая pill-кнопка).

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Gift } from 'lucide-react';

import { giftSiteLink } from '@/utils/giftLinks';
import { copyToClipboard } from '@/utils/clipboard';
import { cn } from '@/lib/utils';
import { CheckIcon, CopyIcon } from '@/components/icons';

export function GiftCreatedModal({ token, onClose }: { token: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const link = giftSiteLink(token);

  const handleCopy = async () => {
    try {
      await copyToClipboard(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
      style={{ fontFamily: 'Inter, sans-serif' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0A0A0A]/95 p-7 shadow-2xl shadow-black/50 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/[0.06]"
            aria-label={t('common.close', 'Закрыть')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
            <Gift size={26} strokeWidth={1.5} className="text-white/85" />
          </div>
          <h2 className="text-xl text-white" style={{ fontWeight: 700 }}>
            {t('gift.createdToastTitle', 'Подарок создан 🎁')}
          </h2>
          <p className="text-[14px] text-white/45">
            {t(
              'gift.createdModalDesc',
              'Перешлите ссылку другу — он сам активирует подарок в Telegram или по почте.',
            )}
          </p>
        </div>

        <div className="mt-5 select-all truncate rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-center text-[13px] text-white/60">
          {link}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] text-black transition-all hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]',
            copied && 'bg-green-500/20 text-green-400 hover:shadow-none',
          )}
          style={{ fontWeight: 500 }}
        >
          {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          {copied
            ? t('common.copied', 'Скопировано!')
            : t('gift.copyGiftLink', 'Скопировать ссылку на подарок')}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-full px-6 py-2.5 text-[14px] text-white/45 transition-colors hover:text-white/70"
        >
          {t('common.done', 'Готово')}
        </button>
      </motion.div>
    </div>
  );
}
