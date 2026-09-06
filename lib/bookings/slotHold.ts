import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase/server'
import { slotRowCoversWindow, type RequestedWindow } from './holdWindow'
import { deviceCharge, extraPlayersCharge } from '@/lib/payments/money'

/**
 * Pre-payment slot holds.
 *
 * A hold is a real `bookings` row in `status = 'locked'` with a `lock_expires_at`
 * deadline and a station claimed through `assign_device_slot`. It exists so the
 * station is off the market from the moment a customer picks it, rather than from
 * the moment their payment settles - which is what let two customers pay for the
 * same PS5 and left the slower one to be refunded.
 *
 * Everything that reads availability already understands this shape: both the
 * assignment function and every availability query treat a live lock as occupying
 * the station and a lapsed one as free. Nothing here needs those readers to change.
 */

/**
 * How long a customer gets to finish paying. Matches the countdown in the UI.
 *
 * Five minutes is comfortably enough to verify a number and pay, and it halves
 * how long a station stays out of circulation when a hold is abandoned - or
 * taken in bad faith. Both are the same problem seen from different ends.
 */
export const HOLD_DURATION_MS = 5 * 60 * 1000

/**
 * How many live holds one client may have at once.
 *
 * A customer needs one. Two leaves room for a stale hold that has not been
 * released yet - switching device type releases the previous hold, but a dropped
 * connection mid-switch can leave it behind - without letting a single caller
 * work through the whole floor.
 */
export const MAX_ACTIVE_HOLDS_PER_CLIENT = 2

export interface SlotHold {
  bookingId: string
  holdToken: string
  /** Epoch milliseconds, so the browser can run its countdown off the real deadline. */
  expiresAt: number
  deviceId: string
  stationNumber: string
}

export interface HoldRow {
  id: string
  status: string
  lock_expires_at: string | null
  hold_token: string | null
  booking_device_slots: Array<{
    id: string
    device_id: string
    slot_date: string
    slot_start_time: string
    slot_end_time: string
  }>
}

export type CreateHoldResult =
  | { success: true; hold: SlotHold }
  | { success: false; error: string }

/** The message a customer sees when someone else got there first. */
export const SLOT_TAKEN_ERROR =
  'That slot has just been taken. Please choose a different time.'

/**
 * Shown when one caller is already holding as many slots as we allow.
 *
 * Worded for the customer who has genuinely left a slot held on another tab,
 * because that is who will actually read it - it says nothing about limits or
 * how the cap works.
 */
export const HOLD_LIMIT_ERROR =
  'You already have a slot on hold. Finish or cancel that booking before starting another.'

/**
 * Best-effort tidy-up of holds whose time ran out.
 *
 * Correctness never depends on this: every availability check compares
 * `lock_expires_at` directly, so a lapsed hold is already invisible. It just stops
 * abandoned rows sitting in `locked` forever. Failures are logged, not raised - a
 * sweep that did not run is not a reason to refuse a booking.
 */
async function sweepLapsedHolds(): Promise<void> {
  const { error } = await supabaseAdmin.rpc('expire_locked_bookings')
  if (error) console.error('Failed to sweep lapsed slot holds:', error)
}

/**
 * Claims a station for the requested window and returns the hold.
 *
 * The pricing snapshot written onto the slot row comes from `device_types`, never
 * from the browser: at this point the hold only needs to reserve the right station
 * for the right window, and fulfilment overwrites these columns from the server
 * quote before any money is taken.
 */
export async function createSlotHold(input: {
  deviceTypeId: string
  slotDate: string
  slotStartTime24: string
  slotEndTime24: string
  durationMinutes: number
  playerCount: number
  /** Whoever asked, used only to cap concurrent holds. Null when unattributable. */
  clientIp?: string | null
}): Promise<CreateHoldResult> {
  await sweepLapsedHolds()

  const { data: deviceType, error: deviceTypeError } = await supabaseAdmin
    .from('device_types')
    .select('id, name, display_name, regular_hourly_rate, included_players, max_players, extra_player_charge')
    .eq('id', input.deviceTypeId)
    .eq('is_active', true)
    .maybeSingle()

  if (deviceTypeError) throw deviceTypeError
  if (!deviceType) {
    return { success: false, error: 'That device is no longer available.' }
  }

  const durationHours = input.durationMinutes / 60
  const includedPlayers = Number(deviceType.included_players || 1)
  const maxPlayers = Number(deviceType.max_players || includedPlayers)
  const playerCount = Math.min(
    Math.max(Math.trunc(input.playerCount) || includedPlayers, 1),
    maxPlayers
  )
  const hourlyRate = Number(deviceType.regular_hourly_rate || 0)
  const extraPlayerCharge = Number(deviceType.extra_player_charge || 0)
  const extraPlayersTotal = extraPlayersCharge(
    Math.max(0, playerCount - includedPlayers),
    extraPlayerCharge,
    durationHours
  )

  // Checked before a booking number is burned or a station is claimed. Expired
  // holds are excluded by the timestamp, so nothing needs sweeping first.
  if (input.clientIp) {
    const { count, error: countError } = await supabaseAdmin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'locked')
      .eq('hold_client_ip', input.clientIp)
      .gt('lock_expires_at', new Date().toISOString())

    if (countError) {
      // Fail closed. A hold limit that opens up when the database hiccups is
      // exactly the situation it exists to cover.
      console.error('Could not count active holds:', countError)
      return { success: false, error: HOLD_LIMIT_ERROR }
    }

    if ((count ?? 0) >= MAX_ACTIVE_HOLDS_PER_CLIENT) {
      return { success: false, error: HOLD_LIMIT_ERROR }
    }
  }

  const holdToken = randomUUID()
  const expiresAt = Date.now() + HOLD_DURATION_MS

  const { data: bookingNumber, error: numberError } = await supabaseAdmin.rpc(
    'generate_booking_number'
  )
  if (numberError) throw numberError

  // The hold carries no customer and no money yet - both arrive with the quote.
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .insert({
      booking_number: bookingNumber,
      status: 'locked',
      lock_expires_at: new Date(expiresAt).toISOString(),
      hold_token: holdToken,
      hold_client_ip: input.clientIp || null,
      total_amount: 0,
      // `locked_by` stays null until the booking is paid for: the admin
      // notification poll announces anything stamped 'customer', and a hold is not
      // an order anyone should be told about yet.
    })
    .select('id')
    .single()

  if (bookingError) throw bookingError

  const { data: assignment, error: slotError } = await supabaseAdmin.rpc(
    'assign_device_slot',
    {
      p_booking_id: booking.id,
      p_device_type_id: input.deviceTypeId,
      p_slot_date: input.slotDate,
      p_slot_start_time: input.slotStartTime24,
      p_slot_end_time: input.slotEndTime24,
      p_duration_hours: durationHours,
      p_hourly_rate: hourlyRate,
      p_slot_total: deviceCharge(hourlyRate, durationHours),
      p_device_type: deviceType.display_name || deviceType.name,
      p_player_count: playerCount,
      p_included_players: includedPlayers,
      p_extra_player_charge: extraPlayerCharge,
      p_extra_players_total: extraPlayersTotal,
    }
  )

  if (slotError) {
    await supabaseAdmin.from('bookings').delete().eq('id', booking.id)
    throw slotError
  }

  // Zero rows back means every station of this type is busy for the window -
  // including one another customer is holding right now. This is the moment the
  // race is decided, and it is decided before anybody has paid.
  const claimed = (assignment as Array<{ device_id: string; station_number: string }>) || []
  if (claimed.length === 0) {
    await supabaseAdmin.from('bookings').delete().eq('id', booking.id)
    return { success: false, error: SLOT_TAKEN_ERROR }
  }

  return {
    success: true,
    hold: {
      bookingId: booking.id,
      holdToken,
      expiresAt,
      deviceId: claimed[0].device_id,
      stationNumber: claimed[0].station_number,
    },
  }
}

/**
 * The hold behind a booking id, if it is still live and the token matches.
 *
 * Returns null for anything else - lapsed, released, already converted, or a
 * token that does not belong to this caller - so every caller can treat null as
 * "you do not hold this slot" without inspecting why.
 */
export async function loadLiveHold(
  bookingId: string | null | undefined,
  holdToken: string | null | undefined
): Promise<HoldRow | null> {
  if (!bookingId || !holdToken) return null

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select(
      `id,
       status,
       lock_expires_at,
       hold_token,
       booking_device_slots(id, device_id, slot_date, slot_start_time, slot_end_time)`
    )
    .eq('id', bookingId)
    .eq('status', 'locked')
    .eq('hold_token', holdToken)
    .maybeSingle()

  if (error) {
    console.error('Failed to load slot hold:', error)
    return null
  }

  if (!data) return null

  const expiresAt = data.lock_expires_at ? new Date(data.lock_expires_at).getTime() : 0
  if (!expiresAt || expiresAt <= Date.now()) return null

  return data as unknown as HoldRow
}

/** Whether a live hold covers exactly the window being quoted. */
export function holdMatchesSlot(hold: HoldRow, slot: RequestedWindow): boolean {
  return slotRowCoversWindow(hold.booking_device_slots?.[0], slot)
}

/**
 * Gives the station back.
 *
 * Returns false when there was no live hold to release, which is the normal
 * outcome for a repeat call - a customer who navigates away twice, or a release
 * arriving after the hold already lapsed.
 */
export async function releaseSlotHoldRow(
  bookingId: string | null | undefined,
  holdToken: string | null | undefined
): Promise<boolean> {
  if (!bookingId || !holdToken) return false

  const { data, error } = await supabaseAdmin.rpc('release_slot_hold', {
    p_booking_id: bookingId,
    p_hold_token: holdToken,
  })

  if (error) {
    console.error('Failed to release slot hold:', error)
    return false
  }

  return data === true
}
