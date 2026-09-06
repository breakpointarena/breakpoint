/**
 * Rounds to whole paise.
 *
 * Lives on its own so pricing helpers that feed into a quote can share it without
 * importing the quote module back (which would be a cycle).
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Rounds to whole rupees.
 *
 * The arena bills in whole rupees - every price the customer is shown ends in
 * `.00`. A half-hour duration is what makes that a decision rather than a
 * formality: ₹79 an hour over 1.5 hours is ₹118.50, and something has to choose
 * which side of the rupee that lands on. Half goes up, in the customer's
 * disfavour by at most fifty paise, because the alternative is quoting a price no
 * till can take.
 */
export function roundRupees(value: number): number {
  return Math.round(value + Number.EPSILON)
}

/**
 * What the station itself costs for the session.
 */
export function deviceCharge(hourlyRate: number, durationHours: number): number {
  return roundRupees(hourlyRate * durationHours)
}

/**
 * What the extra players cost for the session.
 *
 * Each player's share is rounded before they are added up, which is the whole
 * point of this function existing. Rounding the total instead - which is what the
 * booking screens used to do - produced a bill that would not add up: at 1.5 hours
 * one extra player at ₹79/h rounded to ₹119, but two rounded to ₹237, so the
 * second player appeared to cost ₹118 while the first cost ₹119. Same defect at
 * 2.5, 3.5 and 4.5 hours, and at every duration ending in a half hour.
 *
 * Per-player rounding means the line always reads as `count × unit`, and the unit
 * is the number the customer was shown when they added the first one.
 */
export function extraPlayersCharge(
  extraPlayersCount: number,
  extraPlayerChargePerHour: number,
  durationHours: number
): number {
  if (extraPlayersCount <= 0) return 0
  return extraPlayersCount * perExtraPlayerCharge(extraPlayerChargePerHour, durationHours)
}

/** One extra player's share of the session, in whole rupees. */
export function perExtraPlayerCharge(
  extraPlayerChargePerHour: number,
  durationHours: number
): number {
  return roundRupees(extraPlayerChargePerHour * durationHours)
}
