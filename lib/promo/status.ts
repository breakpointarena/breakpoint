import type { PromoCodeRow } from '@/lib/types/promo-code'

/**
 * What a promo code is actually doing right now.
 *
 * `is_active` on its own says only whether an admin has switched the code on -
 * it says nothing about the validity window, so a code whose period has run out
 * still reads as active. Redemption checks both (see `resolvePromoDiscount()` in
 * lib/payments/quote.ts and `validatePromoCode()` in
 * app/(customer)/booking/promo-actions.ts), and this derives the same verdict so
 * the admin list cannot claim a code is usable when checkout would refuse it.
 */
export type PromoStatus = 'live' | 'scheduled' | 'expired' | 'inactive'

export interface PromoStatusPresentation {
  label: string
  /** Badge classes, sharing the shape used across the admin tables. */
  className: string
}

export const PROMO_STATUS_PRESENTATION: Record<PromoStatus, PromoStatusPresentation> = {
  live: {
    label: 'Live',
    className: 'bg-green-500/10 text-green-400 border border-green-500/20',
  },
  scheduled: {
    label: 'Scheduled',
    className: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  },
  expired: {
    label: 'Expired',
    className: 'bg-red-500/10 text-red-400 border border-red-500/20',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-[var(--background)]/80 text-muted-content border border-zinc-800',
  },
}

/**
 * A code switched off by hand reads as inactive whatever its dates say - that is
 * the admin's own decision, and the toggle in the edit modal should match the
 * badge in the list. The time-based states only describe codes left switched on.
 *
 * `now` is injectable so this can be tested without leaning on the wall clock.
 */
export function getPromoStatus(
  promo: Pick<PromoCodeRow, 'is_active' | 'valid_from' | 'valid_until'>,
  now: Date = new Date()
): PromoStatus {
  if (!promo.is_active) return 'inactive'

  // Matches redemption exactly: `now > valid_until` is expired, `now <
  // valid_from` has not started. Loosening either bound here would advertise a
  // code that checkout still turns away. Both stored instants are inclusive -
  // the end of the final day, and the start of the first - so a code shows as
  // live for the whole of its closing day.
  if (now > new Date(promo.valid_until)) return 'expired'
  if (now < new Date(promo.valid_from)) return 'scheduled'

  return 'live'
}
