/**
 * What cancelling a booking has to give back.
 *
 * Every path that puts food on a booking takes the stock at the same moment -
 * the customer's own order (`app/(customer)/food/actions.ts`), the paid-order
 * fulfilment in `lib/payments/fulfil.ts`, and an admin's "Add Food". So a
 * booking called off before anybody sat down is holding stock that nothing will
 * ever be made from, and the fridge count has to be told.
 *
 * Kept here, away from the server action, because it is the one part of
 * cancelling that is pure arithmetic and can therefore be tested: see
 * `scripts/verify-cancellation-restock.ts`.
 */

export interface CancellableFoodItem {
  id: string
  menu_item_id: string | null
  quantity: number | null
  status?: string | null
}

export interface StockRestoration {
  menuItemId: string
  quantity: number
}

/**
 * How much of each menu item to put back.
 *
 * Two rows of the same item on one booking are added together rather than sent
 * as two calls: `increment_menu_item_quantity` is one round trip either way, and
 * one call per item means the count crosses zero once, so the trigger that puts
 * a sold-out item back on the menu fires on a total rather than on a fragment.
 *
 * Skipped: rows already cancelled (their stock went back when they were), rows
 * whose menu item has since been deleted (`menu_item_id` is nullable and there
 * is nothing left to credit), and quantities that are missing or nonsense.
 */
export function stockToRestore(items: CancellableFoodItem[]): StockRestoration[] {
  const totals = new Map<string, number>()

  for (const item of items) {
    if (item.status === 'cancelled') continue
    if (!item.menu_item_id) continue

    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    totals.set(item.menu_item_id, (totals.get(item.menu_item_id) || 0) + quantity)
  }

  return [...totals].map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
}

/** The rows to mark `cancelled` - everything not already in that state. */
export function foodItemsToCancel(items: CancellableFoodItem[]): string[] {
  return items.filter((item) => item.status !== 'cancelled').map((item) => item.id)
}
