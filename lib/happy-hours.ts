/**
 * Happy Hours Utility Functions
 * Handles validation and calculation of happy hour discounts
 */

export interface HappyHourRule {
  id: string;
  name: string;
  discount: number; // Percentage (0-100)
  devices: string; // Comma-separated device names
  schedule: string; // Day schedule (e.g., "Mon-Fri", "Weekends", "Everyday")
  time_range: string; // Time range (e.g., "10:00 AM - 05:00 PM")
  status: 'LIVE' | 'PAUSED' | 'SCHEDULED';
  created_at: string;
  updated_at: string;
}

/**
 * Parse time string to minutes since midnight
 */
export function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 0;

  let [, hours, minutes, period] = match;
  let hour = parseInt(hours);
  const min = parseInt(minutes);

  if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;

  return hour * 60 + min;
}

/**
 * Parse time range string (e.g., "10:00 AM - 05:00 PM")
 */
export function parseTimeRange(timeRange: string): { start: number; end: number } | null {
  const parts = timeRange.split('-').map(s => s.trim());
  if (parts.length !== 2) return null;

  return {
    start: parseTimeToMinutes(parts[0]),
    end: parseTimeToMinutes(parts[1])
  };
}

/**
 * Check if entire booking slot is within happy hour time range
 * Both start and end times must be within the happy hour window
 */
export function isSlotWithinTimeRange(
  slotStartTime: string,
  slotEndTime: string,
  happyHourTimeRange: string
): boolean {
  const slotStart = parseTimeToMinutes(slotStartTime);
  const slotEnd = parseTimeToMinutes(slotEndTime);

  const range = parseTimeRange(happyHourTimeRange);
  if (!range) return false;

  // If slot crosses midnight (end < start), it cannot be within a same-day happy hour range
  if (slotEnd < slotStart) {
    return false;
  }

  // Strict validation: entire slot must be within happy hour range
  return slotStart >= range.start && slotEnd <= range.end;
}

/**
 * Parse schedule string and check if date matches
 */
export function isDayInSchedule(date: Date, schedule: string): boolean {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const scheduleLower = schedule.toLowerCase();

  // Check for "Everyday" or "Daily"
  if (scheduleLower.includes('everyday') || scheduleLower.includes('daily')) {
    return true;
  }

  // Check for "Weekends"
  if (scheduleLower.includes('weekend')) {
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  }

  // Check for "Weekdays"
  if (scheduleLower.includes('weekday')) {
    return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
  }

  // Check for day ranges like "Mon-Fri"
  const rangeMatch = scheduleLower.match(/(mon|tue|wed|thu|fri|sat|sun)\s*-\s*(mon|tue|wed|thu|fri|sat|sun)/);
  if (rangeMatch) {
    const shortNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const startIdx = shortNames.indexOf(rangeMatch[1]);
    const endIdx = shortNames.indexOf(rangeMatch[2]);

    if (startIdx !== -1 && endIdx !== -1) {
      if (startIdx <= endIdx) {
        return dayOfWeek >= startIdx && dayOfWeek <= endIdx;
      } else {
        // Wrap around (e.g., Fri-Mon)
        return dayOfWeek >= startIdx || dayOfWeek <= endIdx;
      }
    }
  }

  // Check for specific day names (full or short)
  const currentDayFull = dayNames[dayOfWeek].toLowerCase();
  const currentDayShort = dayNamesShort[dayOfWeek].toLowerCase();

  return scheduleLower.includes(currentDayFull) || scheduleLower.includes(currentDayShort);
}

/**
 * Check if device type matches happy hour devices list
 */
export function isDeviceEligible(deviceType: string, happyHourDevices: string): boolean {
  if (!deviceType || !happyHourDevices) return false;

  const deviceTypeLower = deviceType.toLowerCase();
  const devicesLower = happyHourDevices.toLowerCase();

  // Check if "all" is specified
  if (devicesLower.includes('all')) return true;

  // Split by comma and check partial matches
  const devicesList = devicesLower.split(',').map(d => d.trim());

  return devicesList.some(device =>
    deviceTypeLower.includes(device) || device.includes(deviceTypeLower)
  );
}

/**
 * Find applicable happy hour rule for a booking
 */
export function findApplicableHappyHour(
  rules: HappyHourRule[],
  deviceType: string,
  bookingDate: Date,
  slotStartTime: string,
  slotEndTime: string
): HappyHourRule | null {
  // Only consider LIVE rules
  const liveRules = rules.filter(rule => rule.status === 'LIVE');

  // Find matching rules
  const matchingRules = liveRules.filter(rule => {
    const deviceMatch = isDeviceEligible(deviceType, rule.devices);
    const dayMatch = isDayInSchedule(bookingDate, rule.schedule);
    const timeMatch = isSlotWithinTimeRange(slotStartTime, slotEndTime, rule.time_range);

    return deviceMatch && dayMatch && timeMatch;
  });

  // Return rule with highest discount
  if (matchingRules.length === 0) return null;

  return matchingRules.reduce((highest, current) =>
    current.discount > highest.discount ? current : highest
  );
}

/**
 * Calculate happy hour discount amount
 */
export function calculateHappyHourDiscount(
  baseAmount: number,
  discountPercentage: number
): number {
  return Math.round((baseAmount * discountPercentage / 100) * 100) / 100;
}

/**
 * Format happy hour info for display
 */
export function formatHappyHourInfo(rule: HappyHourRule): string {
  return `${rule.name} - ${rule.discount}% OFF`;
}
