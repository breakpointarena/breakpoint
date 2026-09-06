'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDbTime, formatTo24Hour } from '@/lib/utils/timeSlots'

/**
 * A time of day, entered the way the arena says it: 06:30 PM, not 18:30.
 *
 * `<input type="time">` looks like it settles this and does not - it renders in
 * whatever format the *browser's* locale prefers, so the same form reads as a
 * 24-hour field on one machine and a 12-hour one on the next, with no way to ask
 * for one or the other. On the machines at this arena it came out as 24-hour,
 * and staff were entering railway time into a screen that displays, stores and
 * prices everything else in AM/PM.
 *
 * Three plain selects instead: hour, minute, and the half of the day. Nothing to
 * mistype, no locale involved, and the same reading on every machine.
 *
 * The value handed to the form is still 24-hour `HH:MM`, written into a hidden
 * input under `name`, because that is what every caller already expects to read
 * back out of `FormData`.
 */

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1)

/** Five-minute steps: enough for a promotion, short enough to stay a list. */
const MINUTE_STEP = 5
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP)

type Meridiem = 'AM' | 'PM'

type Parts = { hour: number; minute: number; meridiem: Meridiem }

/**
 * "18:30" -> { hour: 6, minute: 30, meridiem: 'PM' }.
 *
 * Exported with `toTime24` so the pair can be asserted directly - see
 * `npm run test:timefield`. Noon and midnight are where a 12-hour clock goes
 * wrong, and getting one of them backwards would move a happy hour twelve hours
 * without changing anything anybody can see on the form.
 */
export function toParts(time24: string | undefined): Parts | null {
  const match = /^(\d{1,2}):([0-5]\d)/.exec((time24 ?? '').trim())
  if (!match) return null

  const hours = Number(match[1])
  if (hours > 23) return null

  return {
    hour: hours % 12 === 0 ? 12 : hours % 12,
    minute: Number(match[2]),
    meridiem: hours >= 12 ? 'PM' : 'AM',
  }
}

/** The inverse, via the same conversion the rest of the app uses. */
export function toTime24({ hour, minute, meridiem }: Parts): string {
  return formatTo24Hour(`${hour}:${String(minute).padStart(2, '0')} ${meridiem}`)
}

interface TimeOfDayFieldProps {
  /** Form field name. The hidden input under it carries 24-hour `HH:MM`. */
  name: string
  /** 24-hour `HH:MM`, as stored. Empty starts the field blank. */
  defaultValue?: string
  required?: boolean
  /** Announced to screen readers, which cannot see the label beside the row. */
  label: string
  onChange?: (time24: string) => void
}

const SELECT_CLASS =
  'h-10 rounded-md border border-[#27272a] bg-[var(--surface)] px-2 text-sm text-white ' +
  'outline-none cursor-pointer transition-colors focus:border-primary focus:ring-1 focus:ring-primary'

export function TimeOfDayField({
  name,
  defaultValue,
  required,
  label,
  onChange,
}: TimeOfDayFieldProps) {
  const [parts, setParts] = useState<Parts | null>(() => toParts(defaultValue))

  // The edit modal mounts before it has the rule to edit, so the starting value
  // arrives after the first render.
  useEffect(() => {
    setParts(toParts(defaultValue))
  }, [defaultValue])

  const value = parts ? toTime24(parts) : ''

  useEffect(() => {
    onChange?.(value)
    // Only the value matters here; a caller passing a fresh closure each render
    // must not re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  /**
   * A rule saved at 06:47 PM has a minute the step does not offer. Dropping it
   * silently would move somebody's promotion by two minutes the next time anyone
   * opened it to change the discount, so the odd value is kept as an option for
   * as long as it is the one selected.
   */
  const minuteOptions = useMemo(() => {
    if (parts && !MINUTES.includes(parts.minute)) {
      return [...MINUTES, parts.minute].sort((a, b) => a - b)
    }
    return MINUTES
  }, [parts])

  const update = (change: Partial<Parts>) => {
    // Nothing chosen yet: start from a whole hour in the morning rather than
    // leaving the field half-filled and unsubmittable.
    const base: Parts = parts ?? { hour: 12, minute: 0, meridiem: 'AM' }
    setParts({ ...base, ...change })
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label={`${label} hour`}
        className={SELECT_CLASS}
        required={required}
        value={parts?.hour ?? ''}
        onChange={(event) => update({ hour: Number(event.target.value) })}
      >
        <option value="" disabled>
          --
        </option>
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {String(hour).padStart(2, '0')}
          </option>
        ))}
      </select>

      <span className="text-sm font-black text-muted-content">:</span>

      <select
        aria-label={`${label} minute`}
        className={SELECT_CLASS}
        required={required}
        value={parts?.minute ?? ''}
        onChange={(event) => update({ minute: Number(event.target.value) })}
      >
        <option value="" disabled>
          --
        </option>
        {minuteOptions.map((minute) => (
          <option key={minute} value={minute}>
            {String(minute).padStart(2, '0')}
          </option>
        ))}
      </select>

      <select
        aria-label={`${label} AM or PM`}
        className={SELECT_CLASS}
        required={required}
        value={parts?.meridiem ?? ''}
        onChange={(event) => update({ meridiem: event.target.value as Meridiem })}
      >
        <option value="" disabled>
          --
        </option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>

      {/*
        What the form actually submits.

        Constraint validation deliberately sits on the three selects rather than
        here: a hidden input is barred from it entirely, and faking it with an
        off-screen one gives the browser a control it cannot focus to complain
        about, which is how a form ends up refusing to submit and saying nothing.
        Each select starts on a disabled placeholder, so `required` on each is
        both true and reportable - and `useRequiredFields` sees it through the
        same `checkValidity()` it uses for everything else.
      */}
      <input type="hidden" name={name} value={value} />
    </div>
  )
}

/** "18:30" -> "06:30 PM", for the summary line under the field. */
export function describeTimeOfDay(time24: string): string {
  return formatDbTime(time24, '--:-- --')
}
