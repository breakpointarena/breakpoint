/**
 * Whether a booking is in a state that can legitimately be checked out.
 *
 * Kept pure and away from the server action so the rules can be asserted directly
 * (see scripts/verify-checkout-guard.ts) - the database lookup that feeds it is
 * exercised by the admin flows, not here.
 */

export type CheckoutDecision =
  | { ok: true; from: "checked_in" | "confirmed" }
  | { ok: false; error: string };

export interface CheckoutSubject {
  status: string;
  /** Food-only orders have no station to take, so they never check in. */
  hasDeviceSlots: boolean;
  /**
   * A walk-in session, whose bill is not known until the clock stops. Completing
   * one through this path would mark it finished at whatever price it happened to
   * be carrying, which for a session in progress is nothing at all.
   */
  billedOnActualTime?: boolean;
}

/**
 * A device session cannot end before it starts: `checked_in` is what records that
 * the customer actually took the station, and reporting reads `completed_at` as
 * the end of a session that happened. Completing straight from `confirmed` - which
 * the "Checkout & Billing" dialog allowed, since it only ever checked payment -
 * books revenue against a session nobody attended and leaves `checked_in_at` null
 * forever. A booking whose customer never arrived belongs in `cancelled`.
 */
export function decideCheckout({
  status,
  hasDeviceSlots,
  billedOnActualTime
}: CheckoutSubject): CheckoutDecision {
  if (status === "completed") {
    return { ok: false, error: "This booking has already been checked out." };
  }

  if (billedOnActualTime) {
    return {
      ok: false,
      error:
        "This is an open-ended walk-in session. Use Check Out on the session so the bill is calculated from the time played."
    };
  }

  /**
   * A device booking has to have been checked in; a food-only order can be
   * settled from either state.
   *
   * `confirmed` alone used to be the rule for food-only, which trapped the
   * order the moment anybody pressed Check In: nothing stops staff doing that on
   * a food row, the status moved to `checked_in`, and from there it matched
   * neither branch - so the order could not be checked out and could not be
   * closed, with the message claiming a checked-in booking cannot be checked
   * out. There is no session to have ended when there is no station, so both
   * states are perfectly billable.
   */
  const acceptable: string[] = hasDeviceSlots
    ? ["checked_in"]
    : ["confirmed", "checked_in"];

  if (!acceptable.includes(status)) {
    return {
      ok: false,
      error:
        status === "confirmed"
          ? "This booking was never checked in. Check the customer in first, or cancel the booking if they never arrived."
          : `A ${status.replace(/_/g, " ")} booking cannot be checked out.`
    };
  }

  return { ok: true, from: status as "checked_in" | "confirmed" };
}
