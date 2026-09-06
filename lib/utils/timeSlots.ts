// Time slot utilities for flexible booking system (24-hour operation)

import { deviceCharge } from "@/lib/payments/money";

export const BUSINESS_START_HOUR = 0; // 12:00 AM (Midnight)
export const BUSINESS_END_HOUR = 23; // 11:59 PM
export const MIN_DURATION_MINUTES = 30;
export const MAX_DURATION_HOURS = 5;

/**
 * Generate all possible start times in 30-minute intervals
 * 24-hour operation (12:00 AM to 11:30 PM)
 */
export function generateStartTimes(): string[] {
  const times: string[] = [];

  for (let hour = 0; hour < 24; hour++) {
    for (let minute of [0, 30]) {
      const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      times.push(formatTo12Hour(time24));
    }
  }

  return times;
}

/**
 * Filter start times to only show future slots for today
 * If selected date is today, remove past time slots
 *
 * Reads the host clock deliberately: both callers are `"use client"` pages, so
 * the host is the customer's own browser and "now" means their now. Calling this
 * from a server action would compare UTC against the arena's slot times and hide
 * the wrong half of the day - use `arenaClockTime` if that is ever needed.
 */
export function filterPastTimeSlots(allTimes: string[], selectedDate: Date): string[] {
  const today = new Date();
  const isToday = selectedDate.toDateString() === today.toDateString();

  if (!isToday) {
    // Future date - all times are available
    return allTimes;
  }

  // Today - filter out past times
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes(); // arena-clock-ok

  return allTimes.filter(time12 => {
    const time24 = formatTo24Hour(time12);
    const [hour, minute] = time24.split(':').map(Number);
    const timeMinutes = hour * 60 + minute;

    // Only include times that are at least 30 minutes in the future
    return timeMinutes > currentMinutes + 30;
  });
}

/**
 * Generate duration options (30 min to 5 hours in 30-min increments)
 */
export function generateDurationOptions(): { label: string; value: number; hours: number }[] {
  const options: { label: string; value: number; hours: number }[] = [];

  // 30 min to 5 hours (10 slots)
  for (let halfHours = 1; halfHours <= MAX_DURATION_HOURS * 2; halfHours++) {
    const minutes = halfHours * 30;
    const hours = halfHours / 2;

    let label: string;
    if (halfHours === 1) {
      label = "30 minutes";
    } else if (halfHours % 2 === 0) {
      label = `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      const wholeHours = Math.floor(hours);
      label = `${wholeHours}.5 hours`;
    }

    options.push({ label, value: minutes, hours });
  }

  return options;
}

/**
 * Convert 24-hour time to 12-hour format
 */
export function formatTo12Hour(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hour12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Minutes since midnight -> "01:30 PM".
 *
 * Wraps, so the 1470 that a booking running past midnight produces reads back as
 * 00:30 AM rather than a 24th hour. Availability is computed in minutes on both
 * sides of the wire now, and this is where those numbers become labels.
 */
export function formatMinutesTo12Hour(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return formatTo12Hour(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
}

export function formatDbTime(time24: string | null | undefined, fallback = 'N/A'): string {
  if (!time24) return fallback;

  const match = /^(\d{1,2}):([0-5]\d)/.exec(time24.trim());
  if (!match) return fallback;

  const hours = Number(match[1]);
  if (hours > 23) return fallback;

  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12.toString().padStart(2, '0')}:${match[2]} ${period}`;
}

/**
 * Format a pair of Postgres `time` values as a display range:
 * "14:30:00", "16:00:00" -> "02:30 PM - 04:00 PM".
 */
export function formatDbTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
  fallback = 'N/A'
): string {
  return `${formatDbTime(start, fallback)} - ${formatDbTime(end, fallback)}`;
}

/**
 * Convert 12-hour time to 24-hour format
 */
export function formatTo24Hour(time12: string): string {
  const match = time12.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '00:00';

  let [, hourStr, minuteStr, period] = match;
  let hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);

  if (period.toUpperCase() === 'PM' && hour !== 12) {
    hour += 12;
  } else if (period.toUpperCase() === 'AM' && hour === 12) {
    hour = 0;
  }

  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Calculate end time given start time and duration in minutes
 * Handles overnight bookings (e.g., 11:00 PM + 2 hours = 01:00 AM next day)
 */
export function calculateEndTime(startTime12: string, durationMinutes: number): string {
  const startTime24 = formatTo24Hour(startTime12);
  const [hours, minutes] = startTime24.split(':').map(Number);

  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24; // Wrap around 24 hours
  const endMinutes = totalMinutes % 60;

  const endTime24 = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  return formatTo12Hour(endTime24);
}

/**
 * Does this booking run past midnight?
 *
 * The arena trades round the clock, so a late start with a long duration is a
 * normal booking rather than an error - 9:30 PM for three hours legitimately ends
 * at 1:00 AM. `calculateEndTime` wraps at 24 hours to produce that end time, and
 * the wrap is invisible in the result: "01:00 AM" looks like an hour that has
 * already passed on the chosen date unless something says otherwise. Every screen
 * that shows the end of a booking asks this so it can say "next day".
 */
export function crossesMidnight(startTime12: string, durationMinutes: number): boolean {
  const startTime24 = formatTo24Hour(startTime12);
  const [hours, minutes] = startTime24.split(':').map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;

  return hours * 60 + minutes + durationMinutes >= 24 * 60;
}

/** The calendar date a booking ends on, given the date it starts on. */
export function bookingEndDate(
  startDate: Date,
  startTime12: string,
  durationMinutes: number
): Date {
  const endDate = new Date(startDate);
  if (crossesMidnight(startTime12, durationMinutes)) {
    endDate.setDate(endDate.getDate() + 1);
  }
  return endDate;
}

/**
 * Check if a time range is within business hours (24-hour operation - always true)
 */
export function isWithinBusinessHours(startTime12: string, endTime12: string): boolean {
  // For 24-hour operation, we just need to ensure the booking doesn't exceed 5 hours
  const startTime24 = formatTo24Hour(startTime12);
  const endTime24 = formatTo24Hour(endTime12);

  const [startHour, startMinute] = startTime24.split(':').map(Number);
  const [endHour, endMinute] = endTime24.split(':').map(Number);

  const startMinutes = startHour * 60 + startMinute;
  let endMinutes = endHour * 60 + endMinute;

  // Handle overnight bookings (e.g., 11 PM to 2 AM)
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60; // Add 24 hours
  }

  const duration = endMinutes - startMinutes;
  return duration <= MAX_DURATION_HOURS * 60; // Max 5 hours
}

/**
 * Get maximum available duration for a given start time
 * For 24-hour operation, always return max duration (5 hours)
 */
export function getMaxDurationForStartTime(startTime12: string): number {
  // For 24-hour operation, maximum duration is always 5 hours
  return MAX_DURATION_HOURS * 60; // 300 minutes
}

/**
 * Calculate price based on hourly rate and duration
 */
export function calculatePrice(hourlyRate: number, durationMinutes: number): number {
  // Delegates so the screens and the server quote round identically - a 1.5 hour
  // booking at ₹379/h is ₹568.50 before rounding, and the two must not disagree
  // about which rupee that becomes.
  return deviceCharge(hourlyRate, durationMinutes / 60);
}

/**
 * Check if a time slot is within the selected range starting at `start` with a given duration in minutes
 */
export function isTimeSlotWithinRange(timeSlot: string, start: string, durationMinutes: number): boolean {
  const start24 = formatTo24Hour(start);
  const slot24 = formatTo24Hour(timeSlot);

  const [startHour, startMinute] = start24.split(':').map(Number);
  const [slotHour, slotMinute] = slot24.split(':').map(Number);

  const startMins = startHour * 60 + startMinute;
  const slotMins = slotHour * 60 + slotMinute;

  const endMins = startMins + durationMinutes;

  if (endMins <= 1440) {
    return slotMins >= startMins && slotMins < endMins;
  } else {
    // Spans across midnight, highlight from start time to end of the day
    return slotMins >= startMins;
  }
}

