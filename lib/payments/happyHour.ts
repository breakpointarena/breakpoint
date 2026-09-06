import { supabaseAdmin } from '@/lib/supabase/server'
import { findApplicableHappyHour, type HappyHourRule } from '@/lib/happy-hours'
import { round2 } from './money'

export interface ResolvedHappyHour {
  ruleId: string | null
  ruleName: string | null
  discount: number
}

const NO_HAPPY_HOUR: ResolvedHappyHour = { ruleId: null, ruleName: null, discount: 0 }

/**
 * The best happy hour a booking window qualifies for, and what it is worth.
 *
 * Lifted out of the quote so a walk-in session can be priced by exactly the same
 * rule it would have been priced by if the customer had booked the same hours
 * online. The matching itself is untouched and stays strict: `isSlotWithinTimeRange`
 * requires the *whole* window to sit inside the rule's hours, and refuses any
 * window that crosses midnight. A session that overruns its happy hour therefore
 * loses the discount outright, which is the same thing that happens to a fixed
 * booking that does not fit - no partial credit, because the rule has never
 * offered any.
 */
export async function resolveHappyHour(
  deviceTypeDisplayName: string,
  deviceTypeName: string,
  bookingDate: Date,
  slotStart12: string,
  slotEnd12: string,
  discountableBase: number
): Promise<ResolvedHappyHour> {
  const { data, error } = await supabaseAdmin
    .from('happy_hour_rules')
    .select('*')
    .eq('status', 'LIVE')

  // Happy hours are optional - a missing table or query failure must not block payment.
  if (error || !data || data.length === 0) return NO_HAPPY_HOUR

  const rules = data as HappyHourRule[]

  // The booking screens match on display_name; fall back to the internal name.
  const rule =
    findApplicableHappyHour(rules, deviceTypeDisplayName, bookingDate, slotStart12, slotEnd12) ||
    findApplicableHappyHour(rules, deviceTypeName, bookingDate, slotStart12, slotEnd12)

  if (!rule) return NO_HAPPY_HOUR

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    discount: round2((discountableBase * Number(rule.discount)) / 100),
  }
}
