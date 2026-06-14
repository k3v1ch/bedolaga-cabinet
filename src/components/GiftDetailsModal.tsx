// KELDARI-UI: модалка с деталями подарка (по клику на карточку).
// Показывает: тариф, срок, устройства, стоимость, когда куплен, и — если подарок
// активирован — кто и когда его активировал. Чисто информационная (копирование
// ссылок живёт на самой карточке и доступно только для НЕактивированных подарков).

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Gift } from 'lucide-react';

import type { SentGift } from '@/api/gift';
import { formatPrice } from '@/utils/format';

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function GiftDetailsModal({ gift, onClose }: { gift: SentGift; onClose: () => void }) {
  const { t } = useTranslation();

  const isActivated = gift.status === 'delivered';
  const isAvailable = gift.status === 'paid' || gift.status === 'pending_activation';
  const statusLabel = isActivated
    ? t('giftDetails.activated', 'Активирован')
    : isAvailable
      ? t('giftDetails.available', 'Ждёт активации')
      : gift.status;

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between gap-3 py-1.5">
      <span className="text-white/35">{label}</span>
      <span className="text-right text-white/70">{value}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0A0A0A]/95 p-7 shadow-2xl shadow-black/50 backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06]">
              <Gift size={16} className="text-white/60" />
            </div>
            <div>
              <p className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                {gift.tariff_name || '—'}
              </p>
              <span
                className={`text-[12px] ${isActivated ? 'text-white/40' : 'text-green-400/70'}`}
              >
                {statusLabel}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-[14px]">
          <Row
            label={t('giftDetails.duration', 'Срок')}
            value={t('subscriptionPage.giftDurationDays', { days: gift.period_days })}
          />
          <Row
            label={t('giftDetails.devices', 'Устройств')}
            value={
              gift.device_limit
                ? t('subscriptionPage.giftDevicesUpTo', { count: gift.device_limit })
                : '∞'
            }
          />
          <Row label={t('giftDetails.price', 'Стоимость')} value={formatPrice(gift.amount_kopeks)} />
          <Row label={t('giftDetails.purchasedAt', 'Куплен')} value={fmtDateTime(gift.created_at)} />
          {isActivated && (
            <>
              <Row
                label={t('giftDetails.activatedBy', 'Кто активировал')}
                value={gift.activated_by_username || '—'}
              />
              <Row
                label={t('giftDetails.activatedAt', 'Когда активирован')}
                value={fmtDateTime(gift.activated_at)}
              />
            </>
          )}
          {gift.gift_message && (
            <div className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] italic text-white/55">
              «{gift.gift_message}»
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
