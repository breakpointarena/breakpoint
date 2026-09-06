/**
 * Reports bookings whose stored money does not add up.
 *
 * Four things have to agree on every booking, and each of them has been written
 * by a different piece of code at some point:
 *
 *   1. `payment_status` against `amount_paid` and `total_amount`. This is the one
 *      that broke: food ordered against an already-paid slot grew the bill and
 *      left the booking saying `paid`, which kept it out of the outstanding
 *      figure on the reports page and sent its revenue split down the wrong
 *      branch.
 *   2. `total_amount` against `device_subtotal + food_subtotal - discounts`.
 *   3. `food_subtotal` against the food rows it is supposed to be the sum of.
 *   4. A `booking_line_items` row for every food item, which is the breakdown the
 *      bill and the reports are built from.
 *
 * Read-only by default, so it is safe against production - and a booking listed
 * here is a row to look at, not necessarily one to correct: a refund or a
 * hand-edit can put a booking legitimately out of step.
 *
 * Run: npm run check:amounts
 *      npm run check:amounts -- --fix
 *
 * `--fix` repairs only what is derivable from the booking's own figures - the
 * payment status, and a missing food line item rebuilt from the food row it
 * should have described. It never touches an amount. Anything that would need a
 * decision about money is left listed and untouched.
 */

import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import {
  isBillableBooking,
  outstandingAmount,
  settlementStatus,
} from '../lib/payments/paymentStatus'

if (!existsSync('.env.local')) {
  console.error('\n  .env.local is missing. Run `npm run check:env` first.\n')
  process.exit(1)
}

// Next loads .env.local automatically; this script does not, so read it here.
// The `\s*` before the anchor is load-bearing on Windows - see check-env.ts.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (!match) continue
  const [, key, raw] = match
  if (process.env[key] === undefined) {
    process.env[key] = raw.trim().replace(/^["']|["']$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('\n  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const n = (value: any) => Number(value ?? 0) || 0

/** Rupees, to the paise, without pretending 0.1 + 0.2 is exact. */
const differs = (a: number, b: number) => Math.abs(a - b) > 0.01

const money = (value: number) =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const shouldFix = process.argv.includes('--fix')

async function main() {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `id, booking_number, status, payment_status, billed_on_actual_time,
       device_subtotal, food_subtotal, total_amount, amount_paid,
       subscription_discount, promo_discount, happy_hour_discount, created_at,
       booking_food_items(menu_item_id, item_name, quantity, unit_price, line_total),
       booking_line_items(item_type, display_order, reference_id)`
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error(`\n  Could not read bookings: ${error.message}\n`)
    process.exit(1)
  }

  const bookings = (data ?? []) as any[]
  const problems: string[] = []
  const repairs: string[] = []
  let owed = 0

  for (const booking of bookings) {
    // A cancelled booking's figures are history and nobody is chasing them.
    if (booking.status === 'cancelled' || booking.status === 'expired') continue

    const found: string[] = []

    const paid = n(booking.amount_paid)
    const total = n(booking.total_amount)
    const device = n(booking.device_subtotal)
    const food = n(booking.food_subtotal)
    const discounts =
      n(booking.subscription_discount) +
      n(booking.promo_discount) +
      n(booking.happy_hour_discount)

    /**
     * 1. The status against the money.
     *
     * Only where there is a bill to measure against - the same rule the reports
     * page counts by. "Nothing paid of nothing owed" is not evidence of anything.
     */
    const shouldBe = settlementStatus({ amountPaid: paid, total })
    if (
      isBillableBooking({ status: booking.status, total }) &&
      booking.payment_status !== shouldBe
    ) {
      found.push(
        `says ${booking.payment_status}, but ${money(paid)} of ${money(total)} is ${shouldBe}` +
          (shouldBe === 'partial' ? ` (${money(outstandingAmount({ amountPaid: paid, total }))} owed)` : '')
      )

      if (shouldFix) {
        const { error: fixError } = await supabase
          .from('bookings')
          .update({ payment_status: shouldBe, updated_at: new Date().toISOString() })
          .eq('id', booking.id)

        repairs.push(
          fixError
            ? `  ${booking.booking_number}: could not set payment status - ${fixError.message}`
            : `  ${booking.booking_number}: payment status ${booking.payment_status} -> ${shouldBe}`
        )
      }
    }

    // 2. The total against its parts. A walk-in in progress is priced at
    //    checkout, so an empty device subtotal there is not a discrepancy.
    const expectedTotal = device + food - discounts
    if (differs(expectedTotal, total) && !booking.billed_on_actual_time) {
      found.push(
        `total ${money(total)}, but device ${money(device)} + food ${money(food)}` +
          ` - discounts ${money(discounts)} is ${money(expectedTotal)}`
      )
    }

    // 3. The food subtotal against the food.
    const foodRows = booking.booking_food_items ?? []
    const foodLines = foodRows.reduce((sum: number, row: any) => sum + n(row.line_total), 0)
    if (differs(foodLines, food)) {
      found.push(`food_subtotal ${money(food)}, but its food rows come to ${money(foodLines)}`)
    }

    // 4. Every food item accounted for in the breakdown.
    const lineItems = booking.booking_line_items ?? []
    const foodLineItems = lineItems.filter((row: any) => row.item_type === 'food')

    if (foodRows.length > foodLineItems.length) {
      found.push(
        `${foodRows.length} food item(s) but ${foodLineItems.length} food line item(s) - ` +
          `the rest are on the total and in no breakdown of it`
      )

      if (shouldFix) {
        // Rebuilt from the food rows they should have described, which carry
        // every field a line item needs. Only the ones with no line item already
        // naming that menu item, so running this twice adds nothing.
        const described = new Set(foodLineItems.map((row: any) => row.reference_id))
        const missing = foodRows.filter((row: any) => !described.has(row.menu_item_id))

        let order =
          Math.max(0, ...lineItems.map((row: any) => n(row.display_order))) + 1

        const { error: fixError } = await supabase.from('booking_line_items').insert(
          missing.map((row: any, index: number) => ({
            booking_id: booking.id,
            item_type: 'food',
            description: row.item_name,
            quantity: row.quantity,
            unit_price: row.unit_price,
            line_total: row.line_total,
            reference_id: row.menu_item_id,
            reference_type: 'menu_item',
            added_by: 'customer',
            is_paid: paid >= total,
            display_order: order + index,
          }))
        )

        repairs.push(
          fixError
            ? `  ${booking.booking_number}: could not rebuild line items - ${fixError.message}`
            : `  ${booking.booking_number}: rebuilt ${missing.length} food line item(s)`
        )
      }
    }

    if (found.length > 0) {
      problems.push(
        `  ${booking.booking_number}  [${booking.status} / ${booking.payment_status}]\n` +
          found.map((line) => `      - ${line}`).join('\n')
      )
    }

    // From the amounts, on the same rule the reports page now uses - reading
    // `payment_status` here would leave out exactly the bookings whose status has
    // drifted, which are the ones worth knowing about.
    owed += outstandingAmount({ amountPaid: paid, total })
  }

  console.log(`\n  ${bookings.length} booking(s) checked.`)
  console.log(`  Currently outstanding across unpaid and partial: ${money(owed)}`)

  if (problems.length === 0) {
    console.log('\n  Every booking adds up.\n')
    return
  }

  console.error(`\n  ${problems.length} booking(s) do not add up:\n`)
  console.error(problems.join('\n\n'))

  if (repairs.length > 0) {
    console.log(`\n\n  Repaired:\n${repairs.join('\n')}`)
    console.log('\n  Run again without --fix to confirm.\n')
    return
  }

  console.error(
    '\n\n  A booking can be legitimately out of step after a refund or a hand-edit.' +
      '\n  What should not appear here is a booking that simply had food added to it.' +
      '\n  `npm run check:amounts -- --fix` corrects the derivable ones.\n'
  )
  // Set rather than called, so the streams above finish writing first.
  process.exitCode = 1
}

main().catch((err) => {
  console.error('Failed:', err?.message ?? err)
  process.exit(1)
})
