import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { promoApi, type ActiveDiscount } from '@/api/promo';

export interface PromoDiscountResult {
  /** Final price to charge in kopeks (after applying the active promo offer). */
  price: number;
  /** Original (pre-discount) price in kopeks, if any. Falls back to the
   *  caller-provided `existingOriginalPrice` (promo-group discount) and adds
   *  the active offer's discount on top. `null` when nothing is discounted. */
  original: number | null;
  /** Combined discount percent (promo group + active offer). `null` when no
   *  discount applies. Rounded for display. */
  percent: number | null;
  /** True if any of the discount comes from the user's promo group. */
  isPromoGroup: boolean;
}

/**
 * Fetches the user's currently-active promo discount (one activated in the
 * Telegram bot via "Получить" button) and returns a stable helper that
 * applies it to any tariff/period price coming back from the purchase-options
 * endpoint.
 *
 * The purchase-options endpoint already factors in promo-group prices (loyalty
 * tier, persistent group), but it does NOT factor in the time-limited promo
 * offers that a user manually claims in the bot. That delta is what this hook
 * applies on top, exactly matching the behavior of the legacy
 * SubscriptionPurchase page.
 */
export function useActivePromoDiscount() {
  const { data: activeDiscount } = useQuery<ActiveDiscount>({
    queryKey: ['active-discount'],
    queryFn: promoApi.getActiveDiscount,
    staleTime: 30_000,
  });

  const applyPromoDiscount = useCallback(
    (priceKopeks: number, existingOriginalPrice?: number | null): PromoDiscountResult => {
      const hasExisting = (existingOriginalPrice ?? 0) > priceKopeks;
      const hasPromo = !!activeDiscount?.is_active && !!activeDiscount.discount_percent;

      if (!hasExisting && !hasPromo) {
        return { price: priceKopeks, original: null, percent: null, isPromoGroup: false };
      }

      let finalPrice = priceKopeks;
      if (hasPromo) {
        finalPrice = Math.round(priceKopeks * (1 - (activeDiscount?.discount_percent ?? 0) / 100));
      }

      if (hasExisting && existingOriginalPrice) {
        const combinedPercent = hasPromo
          ? Math.round((1 - finalPrice / existingOriginalPrice) * 100)
          : Math.round((1 - priceKopeks / existingOriginalPrice) * 100);
        return {
          price: finalPrice,
          original: existingOriginalPrice,
          percent: combinedPercent,
          isPromoGroup: true,
        };
      }

      return {
        price: finalPrice,
        original: priceKopeks,
        percent: activeDiscount?.discount_percent ?? null,
        isPromoGroup: false,
      };
    },
    [activeDiscount],
  );

  return {
    activeDiscount: activeDiscount ?? null,
    hasActiveDiscount: !!activeDiscount?.is_active && !!activeDiscount.discount_percent,
    applyPromoDiscount,
  };
}
