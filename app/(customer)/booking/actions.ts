"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { requireVerifiedPhone } from "@/lib/auth/customer-session";
import { BOOKING_WINDOW_ERROR, arenaToday, isBookingDateStringWithinWindow } from "@/lib/utils/dates";
import { timeToMinutes } from "@/lib/payments/availability";
import { fetchDeviceTypeOccupancy } from "@/lib/bookings/deviceTypeOccupancy";
import { availableStartMinutes, type DeviceTypeOccupancy } from "@/lib/bookings/slotAvailability";
import { formatMinutesTo12Hour } from "@/lib/utils/timeSlots";
import { createSlotHold, releaseSlotHoldRow } from "@/lib/bookings/slotHold";
import { getOccupiedDeviceIds } from "@/lib/devices/occupancy";
import { headers } from "next/headers";

export interface AddonSelection {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface DatabaseBookingRow {
  status: string;
  lock_expires_at: string | null;
  booking_device_slots: Array<{
    slot_date: string;
    slot_start_time: string;
    slot_end_time: string;
  }>;
}

// NEW: Get device types with availability counts (customer sees types, not individual devices)
export async function getDeviceTypesWithAvailability() {
  try {
    // Get all active device types
    const { data: deviceTypes, error: typesError } = await supabaseAdmin
      .from("device_types")
      .select(`
        id,
        name,
        display_name,
        regular_hourly_rate,
        included_players,
        max_players,
        extra_player_charge,
        description,
        display_order
      `)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (typesError) throw typesError;

    // `devices.status` is only ever what an admin last typed into the device
    // form - nothing in the booking flow writes to it, so counting it alone
    // reported every station free while people were playing on them. A device
    // is only really available if it is also not currently occupied.
    const occupied = await getOccupiedDeviceIds();

    // For each device type, count available devices
    const typesWithCounts = await Promise.all(
      (deviceTypes || []).map(async (type: any) => {
        const { data: devices, error: devError } = await supabaseAdmin
          .from("devices")
          .select("id , image_url")
          .eq("device_type_id", type.id)
          .eq("status", "available");

        const freeDevices = (devices || []).filter((device: any) => !occupied.has(device.id));

        return {
          ...type,
          available_devices_count: devError ? 0 : freeDevices.length,
          image_url: (devices && devices.length > 0) ? devices[0].image_url : null
        };
      })
    );

    return { success: true, deviceTypes: typesWithCounts };
  } catch (err: any) {
    return { success: false, error: err.message, deviceTypes: [] };
  }
}

// DEPRECATED: Old function that returns individual devices (kept for backwards compatibility)
export async function getLiveDevicesFromInventory() {
  try {
    const { data, error } = await supabaseAdmin
      .from("devices")
      .select(`
        id,
        station_number,
        status,
        specs,
        image_url,
        device_type:device_types(
          id,
          name,
          display_name,
          regular_hourly_rate,
          included_players,
          max_players,
          extra_player_charge
        )
      `)
      .neq("status", "inactive")
      .order("station_number", { ascending: true });

    if (error) throw error;
    return { success: true, devices: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message, devices: [] };
  }
}

// NEW: Check availability by device TYPE (not specific device)
export async function checkAvailabilityByDeviceType(
  dateString: string,
  deviceTypeId: string
) {
  try {
    // Slots are only offered inside the rolling booking window
    if (!isBookingDateStringWithinWindow(dateString)) {
      return {
        success: false,
        error: BOOKING_WINDOW_ERROR,
        unavailableSlots: [],
        slotAvailability: {}
      };
    }

    // Step 1: Get total available devices of this type
    const { count: totalDevices, error: devicesError } = await supabaseAdmin
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("device_type_id", deviceTypeId)
      .eq("status", "available");

    if (devicesError) throw devicesError;

    const totalAvailable = totalDevices || 0;

    if (totalAvailable === 0) {
      return {
        success: true,
        unavailableSlots: [],
        slotAvailability: {}
      };
    }

    // Step 2: Get all bookings for this device type on this date
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from("booking_device_slots")
      .select(`
        slot_start_time,
        slot_end_time,
        device:devices!inner(device_type_id),
        bookings!inner(status, lock_expires_at)
      `)
      .eq("device.device_type_id", deviceTypeId)
      .eq("slot_date", dateString)
      .in("bookings.status", ["locked", "confirmed", "checked_in"]);

    if (bookingsError) throw bookingsError;

    const rightNow = new Date().toISOString();

    // Step 3: Count bookings per time slot
    const slotCounts: Record<string, number> = {};

    (bookings || []).forEach((booking: any) => {
      const bookingRecord = booking.bookings;

      // Skip expired locks
      if (bookingRecord.status === "locked" && bookingRecord.lock_expires_at) {
        if (new Date(bookingRecord.lock_expires_at) <= new Date(rightNow)) {
          return;
        }
      }

      // Convert to 12h format for slot label (with leading zeros to match frontend)
      const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        // Add leading zero for single-digit hours
        const hour12Str = hour12.toString().padStart(2, '0');
        return `${hour12Str}:${minutes} ${ampm}`;
      };

      const startFormatted = formatTime(booking.slot_start_time);
      const endFormatted = formatTime(booking.slot_end_time);
      const slotLabel = `${startFormatted} - ${endFormatted}`;

      slotCounts[slotLabel] = (slotCounts[slotLabel] || 0) + 1;
    });

    // Step 4: Build availability for ALL time slots (not just booked ones)
    const unavailableSlots: string[] = [];
    const slotAvailability: Record<string, { available: number; total: number }> = {};

    // All possible time slots in the system (matching frontend format exactly)
    const allTimeSlots = [
      "10:00 AM - 11:00 AM",
      "11:00 AM - 12:00 PM",
      "01:30 PM - 02:30 PM",
      "02:30 PM - 03:30 PM",
      "04:30 PM - 05:30 PM",
      "07:00 PM - 08:00 PM",
      "08:30 PM - 09:30 PM"
    ];

    allTimeSlots.forEach((slotLabel) => {
      const bookedCount = slotCounts[slotLabel] || 0;
      const available = totalAvailable - bookedCount;

      slotAvailability[slotLabel] = {
        available: Math.max(0, available),
        total: totalAvailable
      };

      if (available <= 0) {
        unavailableSlots.push(slotLabel);
      }
    });

    return {
      success: true,
      unavailableSlots,
      slotAvailability,
      totalDevices: totalAvailable
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      unavailableSlots: [],
      slotAvailability: {}
    };
  }
}

// DEPRECATED: Old function that checks specific device (kept for backwards compatibility)
export async function fetchLiveActiveBookings(dateString: string, deviceId: string) {
  try {
    // Query booking_device_slots table directly for occupied slots
    const { data, error } = await supabaseAdmin
      .from("booking_device_slots")
      .select(`
        slot_date,
        slot_start_time,
        slot_end_time,
        bookings!inner(status, lock_expires_at)
      `)
      .eq("device_id", deviceId)
      .eq("slot_date", dateString)
      .in("bookings.status", ["locked", "confirmed", "checked_in"]);

    if (error) throw error;

    const rightNow = new Date().toISOString();

    // Filter out expired locks and build slot labels
    const occupiedSlots = (data || [])
      .filter((slot: any) => {
        const booking = slot.bookings;
        // If locked but expired, don't count as occupied
        if (booking.status === "locked" && booking.lock_expires_at) {
          return new Date(booking.lock_expires_at) > new Date(rightNow);
        }
        // Confirmed and checked_in are always occupied
        return true;
      })
      .map((slot: any) => {
        // Convert 24h time to 12h format to match slot labels
        const formatTime = (time: string) => {
          const [hours, minutes] = time.split(':');
          const hour = parseInt(hours);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
          return `${hour12}:${minutes} ${ampm}`;
        };

        const startFormatted = formatTime(slot.slot_start_time);
        const endFormatted = formatTime(slot.slot_end_time);
        return `${startFormatted} - ${endFormatted}`;
      });

    return { success: true, occupiedSlots };
  } catch (err: any) {
    return { success: false, error: err.message, occupiedSlots: [] };
  }
}

/**
 * Takes the station off the market for ten minutes, before the customer has paid.
 *
 * This used to be a read: it counted stations, counted active bookings in
 * application code, and returned `bookingId: "temp"` having written nothing. Two
 * customers picking the same PS5 a second apart both passed, both paid, and
 * whoever's payment settled second was refunded by fulfilment - the only place a
 * station was ever really claimed.
 *
 * Now the claim happens here, in `assign_device_slot`: one transaction, behind an
 * advisory lock on (device type, date), comparing full time ranges. The loser of
 * the race is told the slot is gone while they are still on the slot picker,
 * which is the whole point - nobody reaches Razorpay for a station they cannot have.
 *
 * The returned `expiresAt` is the row's real `lock_expires_at`, so the countdown
 * in the banner is the deadline the database will actually enforce.
 */
export async function initializeSoftLockReservation(payload: {
  deviceId: string;  // This is actually deviceTypeId now
  deviceName: string;
  deviceType: string;
  hourlyRate: number;
  date: string;
  slotLabel: string;
  start: string;
  end: string;
  addons: AddonSelection[];
  subtotal: number;
  total: number;
  durationMinutes?: number; // Optional: for flexible bookings
  playerCount?: number;
  /** A hold this customer already has, released before the new one is taken. */
  previousHold?: { bookingId: string; holdToken: string } | null;
}) {
  try {
    // Slots can only be held inside the rolling booking window
    if (!isBookingDateStringWithinWindow(payload.date)) {
      return { success: false, error: BOOKING_WINDOW_ERROR };
    }

    // Convert time format from "10:00 AM" to "10:00:00"
    const formatTime = (timeStr: string) => {
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return timeStr;

      let [, hours, minutes, period] = match;
      let hour = parseInt(hours);

      if (period.toUpperCase() === "PM" && hour !== 12) hour += 12;
      if (period.toUpperCase() === "AM" && hour === 12) hour = 0;

      return `${hour.toString().padStart(2, '0')}:${minutes}:00`;
    };

    const startTime = formatTime(payload.start);
    const endTime = formatTime(payload.end);
    const deviceTypeId = payload.deviceId; // This is actually the device type ID

    // Changing the pick gives the previous station straight back rather than
    // leaving the customer holding two stations for the rest of the countdown.
    if (payload.previousHold) {
      await releaseSlotHoldRow(
        payload.previousHold.bookingId,
        payload.previousHold.holdToken
      );
    }

    const durationMinutes =
      payload.durationMinutes && payload.durationMinutes > 0
        ? payload.durationMinutes
        : Math.max(30, timeToMinutes(endTime) - timeToMinutes(startTime));

    // Behind Vercel the client address arrives in x-forwarded-for; the first
    // entry is the original caller. Absent it the cap simply does not apply -
    // it is a brake on repetition, not an authentication check.
    const headerList = await headers();
    const clientIp =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerList.get("x-real-ip") ||
      null;

    const created = await createSlotHold({
      deviceTypeId,
      clientIp,
      slotDate: payload.date,
      slotStartTime24: startTime,
      slotEndTime24: endTime,
      durationMinutes,
      playerCount: payload.playerCount ?? 1,
    });

    if (!created.success) {
      return { success: false, error: created.error };
    }

    return {
      success: true,
      bookingId: created.hold.bookingId,
      holdToken: created.hold.holdToken,
      expiresAt: created.hold.expiresAt,
      stationNumber: created.hold.stationNumber,
    };
  } catch (err: any) {
    console.error("initializeSoftLockReservation error:", err);
    return { success: false, error: "Could not hold that slot. Please try again." };
  }
}

/**
 * Hands a held station back before the countdown runs out.
 *
 * Called when the customer goes back to pick a different slot or device, and when
 * their countdown reaches zero. Neither is required for correctness - a hold that
 * is never released simply lapses, and every availability check ignores a lapsed
 * one - but releasing promptly is what lets the next customer book the station in
 * the seconds after this one walks away.
 *
 * Deliberately not called when Razorpay is dismissed or a payment fails: the
 * customer is still on the summary screen and will usually retry, and dropping
 * the hold there would offer their slot to somebody else mid-retry.
 */
export async function releaseSlotHold(bookingId: string, holdToken: string) {
  try {
    const released = await releaseSlotHoldRow(bookingId, holdToken);
    return { success: true, released };
  } catch (err: any) {
    console.error("releaseSlotHold error:", err);
    return { success: false, released: false };
  }
}

export async function checkCustomerExists(phone: string) {
  try {
    // Returns name, email and date of birth, so it is a profile read, not a
    // existence check - it has to sit behind proof of the number. All three
    // callers (booking, food checkout, subscription) now verify first.
    const auth = await requireVerifiedPhone(phone);
    if (!auth.ok) {
      return {
        success: false,
        error: auth.error,
        verificationRequired: true,
        exists: false,
        customer: null,
        subscription: null,
      };
    }

    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone, email, date_of_birth, active_subscription_id")
      .eq("phone", phone)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows returned - customer doesn't exist
        return { success: true, exists: false, customer: null, subscription: null };
      }
      throw error;
    }

    // Check if customer has active subscription
    let activeSubscription = null;
    if (data.active_subscription_id) {
      const { data: subData, error: subError } = await supabaseAdmin
        .from("subscriptions")
        .select(`
          id,
          start_date,
          end_date,
          status,
          subscription_plan:subscription_plans(
            id,
            name,
            discount_percentage,
            duration_months
          )
        `)
        .eq("id", data.active_subscription_id)
        .eq("status", "active")
        .gte("end_date", arenaToday())
        .single();

      if (!subError && subData) {
        activeSubscription = {
          id: subData.id,
          plan_id: subData.subscription_plan?.id,
          plan_name: subData.subscription_plan?.name,
          discount_percentage: subData.subscription_plan?.discount_percentage,
          end_date: subData.end_date,
        };
      }
    }

    return { success: true, exists: true, customer: data, subscription: activeSubscription };
  } catch (err: any) {
    return { success: false, error: err.message, exists: false, customer: null, subscription: null };
  }
}

// NOTE: findAvailableDevice() and confirmBooking() were removed when customer
// bookings moved behind Razorpay. Slot assignment now lives in
// lib/payments/availability.ts (overlap-aware) and booking creation in
// lib/payments/fulfil.ts, which only runs after a payment is verified.

/**
 * What is already booked for a device type on a date, for the slot picker to
 * do its own arithmetic with.
 *
 * The picker used to ask `checkFlexibleAvailability` below for a finished list
 * of free start times, and re-ask it every time the customer tried a different
 * duration - a full round trip, and a blanked grid, to recompute something that
 * depends on no data this does not already return. Occupancy is the same for
 * every duration, so one call per date answers all ten.
 */
export async function getSlotOccupancy(
  dateString: string,
  deviceTypeId: string,
  excludeBookingId?: string | null
): Promise<
  | { success: true; occupancy: DeviceTypeOccupancy }
  | { success: false; error: string }
> {
  try {
    // Slots are only offered inside the rolling booking window
    if (!isBookingDateStringWithinWindow(dateString)) {
      return { success: false, error: BOOKING_WINDOW_ERROR };
    }

    return {
      success: true,
      occupancy: await fetchDeviceTypeOccupancy(deviceTypeId, dateString, excludeBookingId)
    };
  } catch (err: any) {
    console.error('[availability] occupancy lookup failed:', err?.message);
    return { success: false, error: err?.message || 'Could not load availability' };
  }
}

/**
 * Free start times for a device type on a date, at one duration.
 *
 * Currently unused, and kept only as the server-side equivalent of what the
 * pickers now do in the browser.
 *
 * Both former callers - the customer picker at `/booking/slots-v2` and the
 * admin walk-in device screen - moved to `getSlotOccupancy` above and run
 * `availableStartMinutes` themselves, so that changing the duration costs no
 * round trip at all. Anything reaching for this should ask whether it wants
 * the occupancy instead.
 */
export async function checkFlexibleAvailability(
  dateString: string,
  deviceTypeId: string,
  durationMinutes: number,
  /**
   * A hold belonging to the customer doing the browsing. Their own reservation
   * would otherwise show up as somebody else's booking, so the slot they are
   * holding would look unavailable to the one person entitled to it.
   */
  excludeBookingId?: string | null
) {
  try {
    if (!isBookingDateStringWithinWindow(dateString)) {
      return { success: false, error: BOOKING_WINDOW_ERROR, availableStartTimes: [] as string[] };
    }

    const occupancy = await fetchDeviceTypeOccupancy(deviceTypeId, dateString, excludeBookingId);

    return {
      success: true,
      availableStartTimes: availableStartMinutes(occupancy, durationMinutes).map(formatMinutesTo12Hour),
      totalDevices: occupancy.totalDevices
    };
  } catch (err: any) {
    console.error('[availability] lookup failed:', err?.message);
    return {
      success: false,
      error: err?.message || 'Could not load availability',
      availableStartTimes: [] as string[]
    };
  }
}
