export type DeviceType = 'PS5' | 'Standard Snooker' | 'Medium Snooker' | 'American Snooker';
export type DeviceStatus = 'available' | 'occupied' | 'maintenance' | 'inactive';

/**
 * The statuses an admin can actually set on a device.
 *
 * `occupied` is missing on purpose: it is derived from whether a booking is
 * checked in on the station, so setting it by hand did nothing except make the
 * form look like it had. Taking a station off the floor is `maintenance` or
 * `inactive`; putting someone on it is a check-in.
 */
export const MANUAL_DEVICE_STATUSES = ['available', 'maintenance', 'inactive'] as const;

export interface Device {
  id: string;
  type: DeviceType;
  station_number: string;
  specs?: string;
  status: DeviceStatus;
  hourly_rate: number;
  image_url?: string,
  created_at: string;
  updated_at: string;
}

