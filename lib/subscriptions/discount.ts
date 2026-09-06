import { supabaseAdmin } from '@/lib/supabase/server'
import { round2 } from '@/lib/payments/money'
import { arenaToday } from '@/lib/utils/dates'

/**
 * The single place a membership discount is resolved and valued.
 *
 * "Membership" and "subscription" are the same thing here - the schema calls it a
 * subscription (`subscriptions` -> `subscription_plans.discount_percentage`), so
 * that name is kept throughout rather than introducing a second vocabulary for
 * one concept.
 *
 * Both the device-booking and the food-order quote call in here, so a customer
 * gets the same percentage off whichever they are buying, and there is only ever
 * one definition of "is this membership actually usable".
 *
 * Server-side only: every caller runs inside a server action and reads through
 * `supabaseAdmin`. Nothing the browser sends is consulted.
 */

export interface ActiveMembership {
  /** The `subscriptions` row that granted the discount, for the audit trail. */
  subscriptionId: string | null
  /** 0 when there is no usable membership. */
  discountPercentage: number
}

export const NO_MEMBERSHIP: ActiveMembership = {
  subscriptionId: null,
  discountPercentage: 0,
}

/**
 * Looks up the caller's membership by phone number and returns its percentage.
 *
 * A membership only counts when all three hold, which is what separates an
 * activated membership from a lapsed or switched-off one:
 *
 *  - the customer record still points at it (`active_subscription_id`), so a
 *    membership that has been replaced or detached stops applying immediately;
 *  - its status is `active` - `expired` and `cancelled` are both excluded, which
 *    covers a membership an admin has switched off by hand; and
 *  - `end_date` has not passed. The column is a DATE and the comparison is made
 *    against today's date, so the membership stays usable for the whole of its
 *    final day rather than dying at midnight UTC.
 *
 * A missing customer, a missing plan or a query failure all resolve to "no
 * membership" rather than throwing: failing to find a discount must never block a
 * purchase, it just means the customer pays the undiscounted price.
 */
export async function resolveActiveMembership(phone: string): Promise<ActiveMembership> {
  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('active_subscription_id')
    .eq('phone', phone)
    .single()

  if (error || !customer?.active_subscription_id) return NO_MEMBERSHIP

  // Arena clock, not the server's: a membership must not lapse (or linger)
  // five and a half hours out of step with the day the customer is having.
  const today = arenaToday()

  const { data: subscription, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, end_date, status, subscription_plan:subscription_plans(discount_percentage)')
    .eq('id', customer.active_subscription_id)
    .eq('status', 'active')
    .gte('end_date', today)
    .single()

  if (subError || !subscription) return NO_MEMBERSHIP

  const percentage = Number(
    (subscription as any).subscription_plan?.discount_percentage || 0
  )

  return {
    subscriptionId: subscription.id,
    discountPercentage: normalisePercentage(percentage),
  }
}

/**
 * A plan percentage outside 0-100 is meaningless: a negative one would add to the
 * bill and one over 100 would pay the customer to order. Clamped rather than
 * rejected so a bad plan row cannot break checkout.
 */
function normalisePercentage(percentage: number): number {
  if (!Number.isFinite(percentage) || percentage <= 0) return 0
  return Math.min(percentage, 100)
}

/** The rupee value of a membership percentage against `base`. Never negative. */
export function calculateMembershipDiscount(base: number, discountPercentage: number): number {
  const safeBase = Number.isFinite(base) && base > 0 ? base : 0
  const percentage = normalisePercentage(Number(discountPercentage))

  if (safeBase === 0 || percentage === 0) return 0

  return round2((safeBase * percentage) / 100)
}
