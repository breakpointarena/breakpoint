/**
 * Where a booking stands against its bill.
 *
 * Kept pure and away from the server actions so the rule can be asserted
 * directly (see `scripts/verify-payment-status.ts`) rather than only observed by
 * adding food to a booking and squinting at a report.
 *
 * The rule itself is not subtle. What made it worth having in one place is that
 * it was written out by hand in `addFoodToBooking` and `removeFoodItemFromBooking`
 * on the admin side and simply left out of the customer's "add food to my
 * booking" - so a customer who ordered food against a slot they had already paid
 * for left the booking marked `paid` while owing for the food. Every report then
 * did the wrong arithmetic on the back of that one word: `getRevenueReports`
 * leaves `paid` bookings out of what the arena is owed, and splits device from
 * food revenue proportionally for anything not marked `partial` - so an unpaid
 * ₹150 of food was reported as ₹94 of food revenue collected.
 */

export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface Settlement {
  /** What has actually been received, across every tender. */
  amountPaid: number;
  /** The bill as it now stands: device + food - discounts. */
  total: number;
}

/**
 * `paid` once the money covers the bill, `partial` while some of it has arrived,
 * `pending` when none has.
 *
 * Note which way the comparison runs: `>=`, not `===`. A booking that was paid in
 * full and then had something *removed* from it is settled, not overpaid into
 * some fourth state - and a total of zero, which is where a walk-in sits until it
 * is checked out, is covered by a payment of zero.
 */
export function settlementStatus({ amountPaid, total }: Settlement): PaymentStatus {
  const paid = Number(amountPaid) || 0;
  const bill = Number(total) || 0;

  if (paid >= bill) return 'paid';
  if (paid > 0) return 'partial';
  return 'pending';
}

/**
 * What is still owed. Never negative: money taken above the bill is a refund
 * question, not an outstanding balance.
 */
export function outstandingAmount({ amountPaid, total }: Settlement): number {
  return Math.max(0, (Number(total) || 0) - (Number(amountPaid) || 0));
}

/**
 * Whether a row is somebody's bill, and so belongs in a count of who has paid.
 *
 * Two kinds of row in `bookings` are not, and counting them is what made the
 * Payment Status panel on the reports page read fourteen pending against three
 * genuinely unpaid bookings:
 *
 * - An abandoned slot hold. A customer who opens the picker and backs out leaves
 *   a row that `release_slot_hold` moves to `expired`, and `expire_locked_bookings`
 *   sweeps the rest the same way. It has no customer, no money and nothing owed.
 *   `locked` is a hold still in progress, and is no more of a bill than that.
 * - A walk-in still on the floor. It is priced when the clock stops, and carries
 *   a total of zero until then; nothing is outstanding on a session nobody has
 *   billed yet.
 *
 * Cancelled bookings are excluded by the queries themselves, before this.
 */
export interface BillableSubject {
  status?: string | null;
  total?: number | string | null;
}

export function isBillableBooking({ status, total }: BillableSubject): boolean {
  const state = String(status ?? '').toLowerCase();
  if (state === 'expired' || state === 'locked' || state === 'cancelled') return false;

  return (Number(total) || 0) > 0;
}
