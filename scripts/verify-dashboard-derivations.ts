/**
 * The dashboard's four server actions were collapsed into one. This checks the
 * collapse changed no numbers.
 *
 * The queries were never the slow part - the heaviest plans and executes in
 * 0.17ms - so the consolidation was about paying one auth round trip instead of
 * four. But merging four actions meant merging their derivations, and that is
 * where a refactor like this silently moves a figure: today's slots were
 * previously fetched three times with three different filters, and the shared
 * query now has to reproduce all three exactly.
 *
 * Both implementations run over identical fixtures and must agree. The old ones
 * are transcribed from the four actions as they were before the merge.
 *
 * Run: npm run test:dashboard
 */

const TODAY = '2026-08-17'
const SEVEN_DAYS_AGO = '2026-08-10'
const CURRENT_TIME = '18:00:00'
const TWO_HOURS_TIME = '20:00:00'

type Slot = {
  slot_start_time: string
  bookings: { status: string }
}

/** Deliberately includes statuses that count for some figures and not others. */
const SLOTS: Slot[] = [
  { slot_start_time: '09:00:00', bookings: { status: 'completed' } },
  { slot_start_time: '09:30:00', bookings: { status: 'completed' } },
  { slot_start_time: '18:30:00', bookings: { status: 'confirmed' } }, // inside window
  { slot_start_time: '19:45:00', bookings: { status: 'confirmed' } }, // inside window
  { slot_start_time: '20:00:00', bookings: { status: 'confirmed' } }, // boundary, inclusive
  { slot_start_time: '20:30:00', bookings: { status: 'confirmed' } }, // outside window
  { slot_start_time: '17:00:00', bookings: { status: 'confirmed' } }, // before now
  { slot_start_time: '09:00:00', bookings: { status: 'checked_in' } },
  { slot_start_time: '11:00:00', bookings: { status: 'cancelled' } }, // peak hour only
  { slot_start_time: '11:00:00', bookings: { status: 'expired' } },   // peak hour only
]

type Paid = {
  amount_paid: number
  created_at: string
  updated_at?: string | null
  payment_groups?: { paid_at?: string } | null
}

const PAID: Paid[] = [
  { amount_paid: 100, created_at: '2026-08-17T05:00:00Z', payment_groups: { paid_at: '2026-08-17T06:00:00Z' } },
  { amount_paid: 250, created_at: '2026-08-17T09:00:00Z', updated_at: '2026-08-17T09:30:00Z' },
  { amount_paid: 75, created_at: '2026-08-14T09:00:00Z' },                       // in week, not today
  { amount_paid: 500, created_at: '2026-08-01T09:00:00Z' },                      // older than the week
  { amount_paid: 40, created_at: '2026-08-10T09:00:00Z' },                       // exactly the boundary
  { amount_paid: 999, created_at: '2026-08-17T00:00:00Z', payment_groups: null, updated_at: null },
]

// --- old: four separate actions -------------------------------------------

function oldTodaysBookings(slots: Slot[]) {
  // getDashboardStats filtered in SQL: .in("bookings.status", [...])
  return slots.filter((s) => ['confirmed', 'checked_in', 'completed'].includes(s.bookings.status)).length
}

function oldUpcoming(slots: Slot[]) {
  // getDashboardStats: .gte/.lte on slot_start_time, .eq status confirmed
  return slots.filter(
    (s) =>
      s.bookings.status === 'confirmed' &&
      s.slot_start_time >= CURRENT_TIME &&
      s.slot_start_time <= TWO_HOURS_TIME
  ).length
}

function oldSchedule(slots: Slot[]) {
  // getTodaysSchedule: .in status [confirmed, checked_in], ordered by start
  return slots
    .filter((s) => ['confirmed', 'checked_in'].includes(s.bookings.status))
    .sort((a, b) => a.slot_start_time.localeCompare(b.slot_start_time))
    .map((s) => s.slot_start_time)
}

function oldPeakHour(slots: Slot[]) {
  // getQuickStats: no status filter at all - every slot on the day
  const counts: Record<string, number> = {}
  slots.forEach((s) => {
    const hour = s.slot_start_time.split(':')[0]
    counts[hour] = (counts[hour] || 0) + 1
  })
  const peak = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return peak ? { hour: peak[0], count: peak[1] } : null
}

function oldTodaysRevenue(paid: Paid[]) {
  let total = 0
  paid.forEach((b) => {
    const paidAt = b.payment_groups?.paid_at || b.updated_at || b.created_at
    if (paidAt && paidAt.split('T')[0] === TODAY) total += Number(b.amount_paid || 0)
  })
  return total
}

function oldWeekRevenue(paid: Paid[]) {
  return paid
    .filter((b) => {
      const paidAt = b.payment_groups?.paid_at || b.updated_at || b.created_at
      if (!paidAt) return false
      return paidAt.split('T')[0] >= SEVEN_DAYS_AGO
    })
    .reduce((sum, b) => sum + Number(b.amount_paid || 0), 0)
}

// --- new: one action, shared fetches --------------------------------------

function newDerivations(slots: Slot[], paid: Paid[]) {
  const bookedToday = slots.filter((s) =>
    ['confirmed', 'checked_in', 'completed'].includes(s.bookings?.status)
  )

  const upcoming = slots.filter(
    (s) =>
      s.bookings?.status === 'confirmed' &&
      s.slot_start_time >= CURRENT_TIME &&
      s.slot_start_time <= TWO_HOURS_TIME
  )

  const schedule = slots
    .filter((s) => ['confirmed', 'checked_in'].includes(s.bookings?.status))
    .sort((a, b) => String(a.slot_start_time).localeCompare(String(b.slot_start_time)))

  let todaysRevenue = 0
  let thisWeekRevenue = 0
  for (const b of paid) {
    const paidAt = b.payment_groups?.paid_at || b.updated_at || b.created_at
    if (!paidAt) continue
    const day = paidAt.split('T')[0]
    const amount = Number(b.amount_paid || 0)
    if (day === TODAY) todaysRevenue += amount
    if (day >= SEVEN_DAYS_AGO) thisWeekRevenue += amount
  }

  const counts: Record<string, number> = {}
  for (const s of slots) {
    if (!s.slot_start_time) continue
    const hour = String(s.slot_start_time).split(':')[0]
    counts[hour] = (counts[hour] || 0) + 1
  }
  const peak = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]

  return {
    todaysBookings: bookedToday.length,
    upcoming: upcoming.length,
    schedule: schedule.map((s) => s.slot_start_time),
    peakHour: peak ? { hour: peak[0], count: peak[1] } : null,
    todaysRevenue,
    thisWeekRevenue,
  }
}

// --- compare ---------------------------------------------------------------

const before = {
  todaysBookings: oldTodaysBookings(SLOTS),
  upcoming: oldUpcoming(SLOTS),
  schedule: oldSchedule(SLOTS),
  peakHour: oldPeakHour(SLOTS),
  todaysRevenue: oldTodaysRevenue(PAID),
  thisWeekRevenue: oldWeekRevenue(PAID),
}

const after = newDerivations(SLOTS, PAID)

let failures = 0
for (const key of Object.keys(before) as Array<keyof typeof before>) {
  const a = JSON.stringify(before[key])
  const b = JSON.stringify(after[key])
  const pass = a === b
  if (!pass) failures++
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${key.padEnd(16)} ${a}${pass ? '' : `  !=  ${b}`}`)
}

if (failures > 0) {
  console.error(`\n${failures} derivation${failures > 1 ? 's' : ''} changed.\n`)
  process.exit(1)
}

console.log('\nAll dashboard derivations unchanged by the consolidation.\n')
