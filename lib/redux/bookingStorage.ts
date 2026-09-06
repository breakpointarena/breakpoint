import type { BookingState } from './slices/bookingSlice'

/**
 * Survives a reload but not the tab, which matches the life of a slot hold.
 *
 * The whole booking slice is kept here because there is nothing on the server to
 * read it back from: `initializeSoftLockReservation` returns a hardcoded
 * `bookingId: "temp"` and a client-side `expiresAt`, so no booking row - and no
 * `lock_expires_at` - exists until payment. A refresh mid-flow therefore used to
 * drop the device type, the slot and the pricing, which is what sent the customer
 * back to device selection the moment they opened the slot picker again.
 */
const BOOKING_SNAPSHOT_KEY = 'bp:booking'

/** `hydrated` describes this tab, not the booking, so it is never persisted. */
type PersistedBooking = Omit<BookingState, 'hydrated'>

/**
 * The fields `releaseSlotHold` clears. A snapshot whose hold has already lapsed
 * keeps the device type - the customer is still mid-flow - but loses the slot, so
 * the restored state can never resurrect a reservation that no longer exists.
 */
const HOLD_FIELDS = {
  slotLockExpiry: null,
  selectedSlot: null,
  slotStartTime: null,
  slotEndTime: null,
} satisfies Partial<BookingState>

export function readBookingSnapshot(): Partial<BookingState> | null {
  if (typeof window === 'undefined') return null

  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(BOOKING_SNAPSHOT_KEY)
  } catch {
    return null // Storage blocked (private mode, hardened settings) - flow still works, just not across reloads.
  }
  if (!raw) return null

  let parsed: PersistedBooking | null = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearBookingSnapshot()
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    clearBookingSnapshot()
    return null
  }

  // An absolute deadline, so a reload resumes the countdown where it was rather
  // than restarting it. Anything already past is dropped, not shown at 00:00.
  if (parsed.slotLockExpiry && parsed.slotLockExpiry <= Date.now()) {
    return { ...parsed, ...HOLD_FIELDS }
  }

  return parsed
}

export function writeBookingSnapshot(booking: BookingState): void {
  if (typeof window === 'undefined') return
  const { hydrated, ...persisted } = booking
  try {
    sessionStorage.setItem(BOOKING_SNAPSHOT_KEY, JSON.stringify(persisted))
  } catch {
    /* Nothing to do: persistence is a convenience, not part of the booking. */
  }
}

export function clearBookingSnapshot(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(BOOKING_SNAPSHOT_KEY)
  } catch {
    /* See above. */
  }
}
