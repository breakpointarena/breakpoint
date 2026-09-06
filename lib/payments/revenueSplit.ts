/**
 * How much of what a booking was charged, and of what it actually paid, belongs
 * to the devices and how much to the food.
 *
 * Every figure on the reports page is one of these. It used to be worked out
 * three times over - once in each of `getFoodReports`, `getDeviceReports` and
 * `getRevenueReports` - from the same guess:
 *
 *     if (booking.payment_status === 'partial') {
 *       deviceRev = Math.min(amountPaid, deviceAfterDiscount)
 *       foodRev   = Math.max(0, amountPaid - deviceAfterDiscount)
 *     } else {
 *       deviceRev = (deviceAfterDiscount / expectedTotal) * amountPaid
 *       foodRev   = (foodSubtotal / expectedTotal) * amountPaid
 *     }
 *
 * Three things are wrong with that, and all three showed up on real bookings:
 *
 * 1. It asks `payment_status`, a stored word, instead of the amounts sitting
 *    beside it. A booking that had food added to it after being paid for kept
 *    saying `paid`, took the second branch, and had a device-only payment of
 *    ₹249 reported as ₹155 of device revenue and ₹94 of food revenue - for food
 *    nobody had paid for. The amounts were never wrong; only the word was.
 *
 * 2. The proportional branch invents revenue whenever the money and the bill
 *    disagree in either direction. Under-paid, it books food revenue that was
 *    never collected; over-paid, it books device revenue that was never charged.
 *
 * 3. `Math.max(0, device - discounts)` throws away any discount larger than the
 *    device charge instead of passing the rest to the food, so the two halves
 *    stopped adding up to the bill.
 *
 * What replaces it is not a better guess but an actual rule: charges are settled
 * in the order the arena takes the money - the slot first, which is what is paid
 * for online or at the counter up front, then the food, which is settled at the
 * desk. Applied to a fully paid booking it returns exactly the device charge and
 * exactly the food charge, because that is what adding up to the total means.
 * Applied to a partly paid one it says which part is still owed. It never
 * attributes a rupee that was not received, and never twice.
 */

export interface BookingMoney {
  deviceSubtotal?: number | string | null;
  foodSubtotal?: number | string | null;
  subscriptionDiscount?: number | string | null;
  promoDiscount?: number | string | null;
  happyHourDiscount?: number | string | null;
  amountPaid?: number | string | null;
}

export interface RevenueSplit {
  /** What the booking is asking for, after discounts. */
  deviceCharged: number;
  foodCharged: number;
  totalCharged: number;

  /** What has actually been received against each. */
  deviceCollected: number;
  foodCollected: number;
  /** `deviceCollected + foodCollected` - never more than was received. */
  collected: number;

  /** What is still owed against each. */
  deviceOutstanding: number;
  foodOutstanding: number;
  outstanding: number;

  /**
   * Money received beyond everything charged. Reported rather than folded into
   * one of the halves above, because it belongs to neither and quietly adding it
   * to device revenue is how a report starts disagreeing with the till.
   */
  overpaid: number;
}

/** Postgres hands NUMERIC columns back as strings; '90' > '399' compares wrong. */
const amount = (value: number | string | null | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Rupees to the paise. Keeps a proportional share from trailing 0.30000000004. */
const toPaise = (value: number): number => Math.round(value * 100) / 100;

export function revenueSplit(booking: BookingMoney): RevenueSplit {
  const device = Math.max(0, amount(booking.deviceSubtotal));
  const food = Math.max(0, amount(booking.foodSubtotal));

  const discounts =
    amount(booking.subscriptionDiscount) +
    amount(booking.promoDiscount) +
    amount(booking.happyHourDiscount);

  /**
   * Discounts are priced against the device charge - food is never discounted,
   * which `npm run test:pricing` pins down. A discount bigger than the device
   * charge is not something the pricing code should produce, but if one is ever
   * stored the remainder has to come off the food rather than vanish, or these
   * two stop adding up to `total_amount` and every figure built on them is out.
   */
  const deviceCharged = Math.max(0, device - discounts);
  const foodCharged = Math.max(0, food - Math.max(0, discounts - device));
  const totalCharged = toPaise(deviceCharged + foodCharged);

  // A negative amount_paid is not a refund model this codebase has; treat it as
  // nothing received rather than letting it subtract from the day's takings.
  const received = Math.max(0, amount(booking.amountPaid));

  // The slot is settled first, then the food. Ordered, not proportional: this is
  // the order the money is actually taken in.
  const deviceCollected = Math.min(received, deviceCharged);
  const foodCollected = Math.min(received - deviceCollected, foodCharged);

  return {
    deviceCharged: toPaise(deviceCharged),
    foodCharged: toPaise(foodCharged),
    totalCharged,

    deviceCollected: toPaise(deviceCollected),
    foodCollected: toPaise(foodCollected),
    collected: toPaise(deviceCollected + foodCollected),

    deviceOutstanding: toPaise(deviceCharged - deviceCollected),
    foodOutstanding: toPaise(foodCharged - foodCollected),
    outstanding: toPaise(totalCharged - deviceCollected - foodCollected),

    overpaid: toPaise(Math.max(0, received - deviceCollected - foodCollected)),
  };
}

/**
 * What share of the food bill has been paid, for spreading a part-paid food
 * payment across the items it covers.
 *
 * A booking is settled as a whole rather than item by item, so there is no fact
 * of the matter about *which* burger was paid for. This at least keeps the sum
 * of the items equal to the money received rather than to the menu price.
 */
export function foodPaymentRatio(split: RevenueSplit): number {
  if (split.foodCharged <= 0) return 0;
  return Math.min(1, split.foodCollected / split.foodCharged);
}
