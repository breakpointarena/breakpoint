/**
 * How a cancelled booking is treated by the reports.
 *
 * Two rules, and they pull in opposite directions:
 *
 *  - A cancelled booking is not trade. It earns nothing, nobody owes anything on
 *    it, and no revenue figure, average or payment-status count may include it.
 *  - Money may already have been taken on it. That money is real, it left the
 *    takings when the booking was called off, and a report that simply drops the
 *    row says nothing about where it went - a refund nobody has made looks
 *    exactly like one they have.
 *
 * So the rows are separated rather than filtered away, and what was collected on
 * them is reported on its own.
 */

export interface CancellableRow {
  status?: string | null
  payment_status?: string | null
  amount_paid?: number | string | null
}

export function isCancelled(row: CancellableRow): boolean {
  return String(row.status ?? '').toLowerCase() === 'cancelled'
}

/** The rows the revenue figures are measured over, and the ones they are not. */
export function partitionCancelled<T extends CancellableRow>(
  rows: T[]
): { active: T[]; cancelled: T[] } {
  const active: T[] = []
  const cancelled: T[] = []

  for (const row of rows) {
    if (isCancelled(row)) cancelled.push(row)
    else active.push(row)
  }

  return { active, cancelled }
}

/**
 * What was taken on bookings that were later called off.
 *
 * The arena's refund exposure for the period: money held for sessions nobody
 * played. Reported beside the takings rather than inside them.
 */
export function collectedOnCancelled(cancelled: CancellableRow[]): number {
  const total = cancelled.reduce((sum, row) => {
    const paid = Number(row.amount_paid ?? 0)
    return Number.isFinite(paid) && paid > 0 ? sum + paid : sum
  }, 0)

  return Math.round(total * 100) / 100
}

/**
 * Of the money taken on cancelled bookings, how much is still owed back.
 *
 * A refund marked on the booking is a job finished; what is left is the
 * arena's actual exposure, and the number worth putting in front of whoever
 * balances the till.
 */
export function refundPosition(cancelled: CancellableRow[]): {
  collected: number
  refunded: number
  awaitingRefund: number
} {
  const refundedRows = cancelled.filter(
    row => String(row.payment_status ?? '').toLowerCase() === 'refunded'
  )
  const outstandingRows = cancelled.filter(
    row => String(row.payment_status ?? '').toLowerCase() !== 'refunded'
  )

  return {
    collected: collectedOnCancelled(cancelled),
    refunded: collectedOnCancelled(refundedRows),
    awaitingRefund: collectedOnCancelled(outstandingRows),
  }
}
