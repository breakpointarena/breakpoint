import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  isWithinInterval,
} from 'date-fns'

/**
 * Rolling booking window: slots can only be booked from today through the next
 * six days (7 days inclusive). Calendars, availability lookups and server-side
 * validation all derive their bounds from here.
 */
export const BOOKING_WINDOW_DAYS = 7

export const BOOKING_WINDOW_ERROR = `Bookings are only open for the next ${BOOKING_WINDOW_DAYS} days.`

export interface BookingWindow {
  /** Today at 00:00 local time - the first bookable day. */
  start: Date
  /** Today + 6 days at 00:00 local time - the last bookable day. */
  end: Date
}

/** Midnight of the given date, in the local timezone. */
export function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * The bookable date range. `addDays` rolls over month and year boundaries, so
 * Aug 29 yields Aug 29 - Sep 4 and Dec 29 yields Dec 29 - Jan 4.
 */
export function getBookingWindow(reference: Date = new Date()): BookingWindow {
  const start = startOfLocalDay(reference)
  return { start, end: addDays(start, BOOKING_WINDOW_DAYS - 1) }
}

/** True when `date` falls on one of the bookable days. */
export function isDateWithinBookingWindow(
  date: Date,
  window: BookingWindow = getBookingWindow()
): boolean {
  const day = startOfLocalDay(date)
  return day >= window.start && day <= window.end
}

/** True when both dates fall on the same local calendar day. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Milliseconds until the local day flips, plus a second of slack so a timer
 * scheduled with it never fires a hair before midnight. Used to roll the date
 * selector over for a page that is left open overnight.
 */
export function msUntilNextLocalMidnight(reference: Date = new Date()): number {
  const nextMidnight = addDays(startOfLocalDay(reference), 1)
  return nextMidnight.getTime() - reference.getTime() + 1000
}

/**
 * The bookable days as a list, today first - what the 7-day date selector
 * renders. Month and year rollovers are handled by `addDays`.
 */
export function getBookingWindowDates(reference: Date = new Date()): Date[] {
  const start = startOfLocalDay(reference)
  return Array.from({ length: BOOKING_WINDOW_DAYS }, (_, index) => addDays(start, index))
}

/** Parses a YYYY-MM-DD string as a local calendar date, or null if invalid. */
export function parseLocalDate(dateString: string): Date | null {
  const match =
    typeof dateString === 'string' ? dateString.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/) : null
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  // Rejects impossible dates that JS would roll over (e.g. 2026-02-31).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }

  return date
}

/**
 * Validates a report date range. Both bounds are YYYY-MM-DD, and an empty
 * string means "unbounded" - the All Time filter clears both.
 *
 * The only rule is that the range reads forwards: From Date on or before To
 * Date. Future dates are allowed on both ends, because presets such as "This
 * Month" run to the end of the month and a range that overshoots today simply
 * includes everything recorded so far.
 *
 * Returns the message to show the user, or null when the range is usable.
 */
export function validateReportDateRange(dateFrom: string, dateTo: string): string | null {
  const from = dateFrom ? parseLocalDate(dateFrom) : null
  const to = dateTo ? parseLocalDate(dateTo) : null

  if (dateFrom && !from) return 'From Date is not a valid date.'
  if (dateTo && !to) return 'To Date is not a valid date.'

  if (from && to && from > to) return 'From Date cannot be after To Date.'

  return null
}

/**
 * Server-side guard for a YYYY-MM-DD booking date.
 *
 * `toleranceDays` absorbs the offset between the browser's calendar day and the
 * server's: a request sent at 01:00 IST reaches a UTC server that is still on
 * the previous day, so the legitimate 7th day would otherwise be rejected.
 */
export function isBookingDateStringWithinWindow(
  dateString: string,
  toleranceDays = 1
): boolean {
  const date = parseLocalDate(dateString)
  if (!date) return false

  const offset = differenceInCalendarDays(date, new Date())
  return offset >= -toleranceDays && offset <= BOOKING_WINDOW_DAYS - 1 + toleranceDays
}

export function formatSlotTime(date: Date): string {
  return format(date, 'h:mm a')
}

export function formatBookingDate(date: Date): string {
  return format(date, 'MMM dd, yyyy')
}

export function isSlotAvailable(slotStart: Date, slotEnd: Date, bookings: any[]): boolean {
  return !bookings.some((booking) => {
    const bookingStart = new Date(booking.slot_start)
    const bookingEnd = new Date(booking.slot_end)
    return (
      isWithinInterval(slotStart, { start: bookingStart, end: bookingEnd }) ||
      isWithinInterval(slotEnd, { start: bookingStart, end: bookingEnd }) ||
      (isBefore(slotStart, bookingStart) && isAfter(slotEnd, bookingEnd))
    )
  })
}

export function addSlotLockMinutes(minutes: number): Date {
  return addMinutes(new Date(), minutes)
}

export function getAdvanceBookingDate(days: number): Date {
  return addDays(new Date(), days)
}

export function isWithinGracePeriod(slotStart: Date, graceMinutes: number): boolean {
  const now = new Date()
  const gracePeriodEnd = addMinutes(slotStart, graceMinutes)
  return isAfter(now, slotStart) && isBefore(now, gracePeriodEnd)
}

/**
 * Converts DD-MM-YYYY format to YYYY-MM-DD format for database storage
 * @param dateStr - Date string in DD-MM-YYYY format
 * @returns Date string in YYYY-MM-DD format, or empty string if invalid
 */
export function formatDateForDB(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';

  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return '';

  const [day, month, year] = parts;

  // Validate all parts exist and are numeric
  if (!day || !month || !year) return '';
  if (!/^\d+$/.test(day) || !/^\d+$/.test(month) || !/^\d+$/.test(year)) return '';

  // Validate ranges
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  if (d < 1 || d > 31) return '';
  if (m < 1 || m > 12) return '';
  if (y < 1900 || y > new Date().getFullYear()) return '';

  // Pad with zeros if needed
  const paddedDay = day.padStart(2, '0');
  const paddedMonth = month.padStart(2, '0');

  return `${year}-${paddedMonth}-${paddedDay}`;
}

/**
 * Converts YYYY-MM-DD format to DD-MM-YYYY format for display
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date string in DD-MM-YYYY format, or empty string if invalid
 */
export function formatDateForDisplay(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';

  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return '';

  const [year, month, day] = parts;

  // Validate all parts exist
  if (!year || !month || !day) return '';

  return `${day}-${month}-${year}`;
}

/**
 * Validates a date string in DD-MM-YYYY format
 * @param dateStr - Date string in DD-MM-YYYY format
 * @returns true if valid, false otherwise
 */
export function isValidDateDDMMYYYY(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;

  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return false;

  const [day, month, year] = parts;

  // Check if all parts are numeric
  if (!/^\d+$/.test(day) || !/^\d+$/.test(month) || !/^\d+$/.test(year)) return false;

  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  // Basic range validation
  if (d < 1 || d > 31) return false;
  if (m < 1 || m > 12) return false;
  if (y < 1900 || y > new Date().getFullYear()) return false;

  // Check if date is valid (e.g., not Feb 30)
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Accepted date-of-birth window, expressed as a range of birth *years* that
 * rolls forward on its own, so it never needs revisiting.
 *
 * The latest accepted year is always DOB_END_YEARS_AGO years before the current
 * one, and the earliest is DOB_YEAR_SPAN years before that. In 2026 that accepts
 * birth years 1931 through 2021.
 *
 * Also closes a hole in the plain year check used elsewhere
 * (`y > new Date().getFullYear()`), which let a birth date later in the current
 * year through - someone "born" four months from now.
 */
export const DOB_END_YEARS_AGO = 5
export const DOB_YEAR_SPAN = 90

/**
 * Deliberately says nothing about the accepted years - the bounds are not the
 * customer's business, and repeating them in a toast just invites arguing with
 * the form.
 */
export const DOB_ERROR = 'Invalid DOB'

/** The inclusive birth-year bounds currently accepted. */
export function getDobYearRange(reference: Date = new Date()): {
  startYear: number
  endYear: number
} {
  const endYear = reference.getFullYear() - DOB_END_YEARS_AGO
  return { startYear: endYear - DOB_YEAR_SPAN, endYear }
}

/** Both bounds inclusive. */
export function isDobYearInRange(year: number, reference: Date = new Date()): boolean {
  const { startYear, endYear } = getDobYearRange(reference)
  return year >= startYear && year <= endYear
}

/**
 * Full date-of-birth check for DD-MM-YYYY, the format the forms collect: a real
 * calendar date whose year sits inside the accepted range.
 */
export function isValidDob(dateStr: string, reference: Date = new Date()): boolean {
  if (!isValidDateDDMMYYYY(dateStr)) return false

  const year = Number(dateStr.trim().split('-')[2])
  return isDobYearInRange(year, reference)
}

/**
 * Same rule against YYYY-MM-DD - the shape a date of birth arrives in on the
 * server, after the browser has run it through formatDateForDB(). Parsed field
 * by field rather than with `new Date(str)`, which would read it as UTC and can
 * shift the day either side of midnight.
 */
export function isValidStoredDob(dateStr: string, reference: Date = new Date()): boolean {
  const match = (dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const date = new Date(year, month - 1, day)

  // Rejects impossible dates that still match the pattern, e.g. 2000-02-30.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return false
  }

  return isDobYearInRange(year, reference)
}

/**
 * Validates if person is of legal age (18+)
 * @param dateStr - Date string in DD-MM-YYYY format
 * @returns true if 18 or older, false otherwise
 */
export function isLegalAge(dateStr: string): boolean {
  if (!isValidDateDDMMYYYY(dateStr)) return false;

  const [day, month, year] = dateStr.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age >= 18;
}

/**
 * Handles DOB input with auto-formatting (DD-MM-YYYY)
 * @param value - Input value
 * @returns Formatted date string
 */
export function handleDobInput(value: string): string {
  // Remove non-numeric characters
  const numbers = value.replace(/\D/g, "");

  // Format as DD-MM-YYYY
  if (numbers.length <= 2) {
    return numbers;
  } else if (numbers.length <= 4) {
    return `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
  } else {
    return `${numbers.slice(0, 2)}-${numbers.slice(2, 4)}-${numbers.slice(4, 8)}`;
  }
}

/** The clock the arena actually runs on. */
export const ARENA_TIME_ZONE = 'Asia/Kolkata';

/**
 * Today, as the arena reckons it.
 *
 * `new Date().toISOString().split('T')[0]` gives the UTC date, and the servers
 * this runs on are UTC while the arena is UTC+5:30. Between midnight and 05:30
 * IST the two disagree, so anything asking "what happened today" was reading
 * yesterday - and this is a venue whose customers are very much still playing
 * at half past midnight.
 *
 * `formatLocalDate` is not a substitute: it reads the *host's* clock, which is
 * the customer's phone in the browser but UTC on the server. This names the zone
 * rather than hoping the host is in it.
 *
 * en-CA because it formats as YYYY-MM-DD, which is what every date column and
 * comparison here expects.
 */
export function arenaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ARENA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Whole days from one YYYY-MM-DD to another.
 *
 * Both arguments are plain calendar dates - `end_date`, `slot_date`, the result of
 * `arenaToday()` - so this counts days rather than milliseconds and cannot drift
 * with the host's zone. Parsed field by field on purpose: `new Date(str)` reads a
 * bare date as UTC midnight, which lands on the wrong day for anyone reading it
 * from a different offset.
 *
 * Returns null when either side is not a plain calendar date.
 */
export function daysBetweenDates(fromYmd: string, toYmd: string): number | null {
  const parse = (value: string): number | null => {
    const match = (value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };

  const from = parse(fromYmd);
  const to = parse(toYmd);
  if (from === null || to === null) return null;

  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/** `arenaToday` shifted by whole days - negative for the past. */
export function arenaDateOffset(days: number, now: Date = new Date()): string {
  return arenaToday(new Date(now.getTime() + days * 24 * 60 * 60 * 1000));
}

/**
 * The calendar date an instant falls on *at the arena*, as `YYYY-MM-DD`.
 *
 * Same computation as `arenaToday`, named for the job: `arenaToday(someDate)`
 * reads like a mistake at the call site, and a `slot_date` being written from a
 * session that ended two hours ago is not "today" in any useful sense.
 */
export function arenaDate(value: Date): string {
  return arenaToday(value);
}

/**
 * The wall-clock time an instant falls on *at the arena*, as `HH:MM:SS`.
 *
 * `slot_start_time` and `slot_end_time` are `time without time zone` columns
 * holding arena local time - that is what the slot picker offers and what every
 * availability check compares against. Deriving them with `getHours()` reads the
 * *host's* clock instead, which is IST on a laptop in India and UTC on Vercel,
 * so the same session gets filed 5.5 hours apart depending on where the code ran.
 *
 * en-GB with hourCycle h23 because it formats as HH:MM:SS with a real midnight
 * of 00, where en-US would hand back "24:14:50".
 */
export function arenaClockTime(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ARENA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}

/**
 * An instant as a clock reading for somebody to read: `06:05 PM`.
 *
 * The 24-hour output of `arenaClockTime` above is for comparing and storing -
 * it lines up with the `time` columns and sorts correctly - and must stay that
 * way. This is its counterpart for screens, and nothing that compares times
 * should call it.
 *
 * Pinned to `en-IN` and `hour12` rather than left to the viewer's locale. The
 * previous `toLocaleTimeString([], ...)` calls handed the decision to whatever
 * the browser was set to, so the same arena showed "18:00" on one machine and
 * "6:00 pm" on the next. Pinned to the arena's zone for the same reason
 * `arenaClockTime` is: read off the host clock, this is IST on a laptop in India
 * and UTC on Vercel.
 */
export function formatClockTime12h(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: ARENA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .toUpperCase();
}

/**
 * A `YYYY-MM-DD` string moved on by whole months.
 *
 * Works on the string's own components, so no `Date` is ever built from an
 * instant and no host zone gets a say in the answer.
 *
 * Keeps JavaScript's overflow behaviour on purpose: 31 January plus one month
 * is 3 March, not 28 February. That is what `setMonth` was already doing to
 * subscription end dates before this helper existed, and quietly clamping it
 * here would move real renewal dates while claiming to be a timezone fix. Worth
 * revisiting as a deliberate change, not as a side effect of one.
 */
export function addMonthsToDateString(dateString: string, months: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const shifted = new Date(year, month - 1, day);
  shifted.setMonth(shifted.getMonth() + months);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

/**
 * Safely converts a Date object to local YYYY-MM-DD string without timezone shifting
 */
export function formatLocalDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

