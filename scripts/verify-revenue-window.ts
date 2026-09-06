/**
 * The bounded revenue window returns exactly what the unbounded read did.
 *
 *   npm run test:revenue-window
 *
 * The dashboard's revenue figures used to come from a query with no date bound
 * at all: every settled booking the arena had ever taken, fetched on every load
 * so a loop could keep the last seven days of it. Bounding that read is not as
 * simple as filtering on `created_at`, because a booking raised last month and
 * settled this morning belongs in this week's takings - and if it was settled
 * through a payment group, the date that says so is on a different table.
 *
 * So the read is now two queries merged on the row id, and the risk this file
 * exists to rule out is that the bound quietly drops a booking the reducer would
 * have counted. Money going missing from a dashboard is not a failure anyone
 * notices quickly, so it is checked three ways:
 *
 *   1. The old shape and the new one are both run against the real database and
 *      their totals compared to the paise.
 *   2. The selection rule is checked against fabricated rows covering the cases
 *      the live data does not currently contain - above all a booking paid long
 *      after it was created, through a payment group.
 *   3. The same rule is property-checked over random instants either side of the
 *      window, including the boundary where a UTC date string and an arena date
 *      string disagree.
 */

import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import {
  REVENUE_WINDOW_SLACK_DAYS,
  effectivePaidAt,
  mergeBookingRows,
  revenueWindowStart,
} from '../lib/reports/revenueWindow'
import { arenaToday, arenaDateOffset } from '../lib/utils/dates'

if (!existsSync('.env.local')) {
  console.error('\n  .env.local is missing. Run `npm run check:env` first.\n')
  process.exit(1)
}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
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

let failures = 0
async function check(name: string, run: () => void | Promise<void>) {
  try {
    await run()
    console.log(`  PASS  ${name}`)
  } catch (err: any) {
    failures++
    console.error(`  FAIL  ${name}\n        ${err.message}`)
  }
}

const money = (v: number) => `Rs ${v.toFixed(2)}`

/** The reducer, exactly as the dashboard runs it. */
function reduce(rows: any[], today: string, sevenDaysAgo: string) {
  let todaysRevenue = 0
  let thisWeekRevenue = 0
  for (const booking of rows) {
    const paidAt = effectivePaidAt(booking)
    if (!paidAt) continue
    const day = paidAt.split('T')[0]
    const amount = Number(booking.amount_paid || 0)
    if (day === today) todaysRevenue += amount
    if (day >= sevenDaysAgo) thisWeekRevenue += amount
  }
  return { todaysRevenue, thisWeekRevenue }
}

/**
 * Whether the two bounded reads would return this row - the SQL, expressed in
 * TypeScript so it can be checked against rows the database does not hold.
 */
function wouldFetch(row: any, bound: string): boolean {
  const touched = row.updated_at && row.updated_at >= bound
  const settled = row.payment_groups?.paid_at && row.payment_groups.paid_at >= bound
  return Boolean(touched || settled)
}

const COLUMNS = 'id, amount_paid, payment_status, created_at, updated_at'

async function main() {
  const today = arenaToday()
  const sevenDaysAgo = arenaDateOffset(-7)
  const bound = revenueWindowStart(sevenDaysAgo)

  console.log(`\n  arena today ${today} | week from ${sevenDaysAgo} | db bound ${bound}\n`)

  console.log('The live database, old shape against new')

  // OLD: no date bound at all.
  const { data: oldRows, error: oldErr } = await supabase
    .from('bookings')
    .select(`${COLUMNS}, payment_groups(paid_at)`)
    .in('payment_status', ['paid', 'partial'])
    .neq('status', 'cancelled')
  if (oldErr) throw oldErr

  // NEW: two bounded reads, merged on the row id.
  const [touched, settled] = await Promise.all([
    supabase
      .from('bookings')
      .select(`${COLUMNS}, payment_groups(paid_at)`)
      .in('payment_status', ['paid', 'partial'])
      .neq('status', 'cancelled')
      .gte('updated_at', bound),
    supabase
      .from('bookings')
      .select(`${COLUMNS}, payment_groups!inner(paid_at)`)
      .in('payment_status', ['paid', 'partial'])
      .neq('status', 'cancelled')
      .gte('payment_groups.paid_at', bound),
  ])
  if (touched.error) throw touched.error
  if (settled.error) throw settled.error

  const newRows = mergeBookingRows(
    touched.data as { id: string }[] | null,
    settled.data as { id: string }[] | null
  )

  const before = reduce((oldRows || []) as any[], today, sevenDaysAgo)
  const after = reduce(newRows as any[], today, sevenDaysAgo)

  await check("today's revenue is identical", () => {
    assert.equal(
      after.todaysRevenue.toFixed(2),
      before.todaysRevenue.toFixed(2),
      `was ${money(before.todaysRevenue)}, now ${money(after.todaysRevenue)}`
    )
  })

  await check('seven-day revenue is identical', () => {
    assert.equal(
      after.thisWeekRevenue.toFixed(2),
      before.thisWeekRevenue.toFixed(2),
      `was ${money(before.thisWeekRevenue)}, now ${money(after.thisWeekRevenue)}`
    )
  })

  await check('no row the reducer counts is left unfetched', () => {
    const missed = ((oldRows || []) as any[]).filter((row) => {
      const paidAt = effectivePaidAt(row)
      if (!paidAt) return false
      if (paidAt.split('T')[0] < sevenDaysAgo) return false
      return !wouldFetch(row, bound)
    })
    assert.equal(missed.length, 0, `${missed.length} counted row(s) fall outside the bound`)
  })

  await check('the merge does not double-count an overlapping row', () => {
    const ids = (newRows as any[]).map((r) => r.id)
    assert.equal(new Set(ids).size, ids.length, 'merged set contains a duplicate id')
  })

  console.log('\nCases the live data does not currently contain')

  await check('a booking created long ago but settled today, via a payment group', () => {
    const row = {
      id: 'a',
      amount_paid: 500,
      created_at: '2020-01-01T00:00:00+00:00',
      updated_at: '2020-01-01T00:00:00+00:00',
      payment_groups: { paid_at: `${today}T06:00:00+00:00` },
    }
    assert.equal(effectivePaidAt(row), `${today}T06:00:00+00:00`, 'paid_at must win')
    assert.ok(wouldFetch(row, bound), 'the group read must return it')
    assert.equal(reduce([row], today, sevenDaysAgo).todaysRevenue, 500)
  })

  await check('a booking with no payment group falls back to updated_at', () => {
    const row = {
      id: 'b',
      amount_paid: 250,
      created_at: '2020-01-01T00:00:00+00:00',
      updated_at: `${today}T09:00:00+00:00`,
      payment_groups: null,
    }
    assert.equal(effectivePaidAt(row), `${today}T09:00:00+00:00`)
    assert.ok(wouldFetch(row, bound), 'the updated_at read must return it')
    assert.equal(reduce([row], today, sevenDaysAgo).todaysRevenue, 250)
  })

  await check('a pending group still counts on updated_at rather than vanishing', () => {
    const row = {
      id: 'c',
      amount_paid: 120,
      created_at: '2020-01-01T00:00:00+00:00',
      updated_at: `${today}T08:00:00+00:00`,
      payment_groups: { paid_at: null },
    }
    assert.equal(effectivePaidAt(row), `${today}T08:00:00+00:00`)
    assert.ok(wouldFetch(row, bound), 'must be caught by the updated_at read')
    assert.equal(reduce([row], today, sevenDaysAgo).todaysRevenue, 120)
  })

  await check('a booking settled before the window is fetched but not counted', () => {
    const old = '2020-01-01T00:00:00+00:00'
    const row = { id: 'd', amount_paid: 999, created_at: old, updated_at: old, payment_groups: null }
    assert.equal(reduce([row], today, sevenDaysAgo).thisWeekRevenue, 0)
    assert.ok(!wouldFetch(row, bound), 'and it need not be fetched at all')
  })

  console.log('\nThe boundary, where a UTC date and an arena date disagree')

  await check(`the bound sits ${REVENUE_WINDOW_SLACK_DAYS} whole days before the window`, () => {
    const windowStartUtc = Date.parse(`${sevenDaysAgo}T00:00:00Z`)
    const gap = (windowStartUtc - Date.parse(bound)) / 86400000
    assert.equal(gap, REVENUE_WINDOW_SLACK_DAYS, `gap is ${gap} days`)
    assert.ok(gap * 24 > 5.5, 'must exceed the IST offset')
  })

  await check('every instant on the first counted arena day is inside the bound', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const offset of ['+00:00', '+05:30', '-08:00']) {
        const stamp = `${sevenDaysAgo}T${String(hour).padStart(2, '0')}:00:00${offset}`
        const row = {
          id: 'x',
          amount_paid: 1,
          created_at: stamp,
          updated_at: stamp,
          payment_groups: null,
        }
        if (reduce([row], today, sevenDaysAgo).thisWeekRevenue > 0) {
          assert.ok(wouldFetch(row, bound), `counted but not fetched: ${stamp}`)
        }
      }
    }
  })

  await check('property check: 20000 random instants, nothing counted is ever unfetched', () => {
    const now = Date.now()
    for (let i = 0; i < 20000; i++) {
      const stamp = new Date(now - Math.random() * 30 * 86400000).toISOString()
      const viaGroup = Math.random() < 0.5
      const row: any = {
        id: 'p' + i,
        amount_paid: 1,
        created_at: '2020-01-01T00:00:00+00:00',
        updated_at: viaGroup ? '2020-01-01T00:00:00+00:00' : stamp,
        payment_groups: viaGroup ? { paid_at: stamp } : null,
      }
      if (reduce([row], today, sevenDaysAgo).thisWeekRevenue > 0) {
        assert.ok(wouldFetch(row, bound), `counted but not fetched: ${stamp}`)
      }
    }
  })

  await check('the today window used by the revenue modal is bounded just as safely', () => {
    const todayBound = revenueWindowStart(today)
    const now = Date.now()
    for (let i = 0; i < 20000; i++) {
      const stamp = new Date(now - Math.random() * 10 * 86400000).toISOString()
      const viaGroup = Math.random() < 0.5
      const row: any = {
        id: 't' + i,
        amount_paid: 1,
        created_at: '2020-01-01T00:00:00+00:00',
        updated_at: viaGroup ? '2020-01-01T00:00:00+00:00' : stamp,
        payment_groups: viaGroup ? { paid_at: stamp } : null,
      }
      const paidAt = effectivePaidAt(row)
      if (paidAt && paidAt.split('T')[0] === today) {
        assert.ok(wouldFetch(row, todayBound), 'counted for today but not fetched: ' + stamp)
      }
    }
  })

  console.log('\nHow much less is read')
  const oldCount = (oldRows || []).length
  const newCount = newRows.length
  const saved = oldCount === 0 ? 0 : Math.round(((oldCount - newCount) / oldCount) * 100)
  console.log(`  rows fetched before : ${oldCount}`)
  console.log(`  rows fetched after  : ${newCount}`)
  console.log(`  reduction           : ${saved}%  (grows with history; the old read had no bound)`)
  console.log(`  today's revenue     : ${money(before.todaysRevenue)} -> ${money(after.todaysRevenue)}`)
  console.log(`  seven-day revenue   : ${money(before.thisWeekRevenue)} -> ${money(after.thisWeekRevenue)}`)

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.\n`)
    process.exit(1)
  }
  console.log('\nAll revenue window checks passed.\n')
}

main()
