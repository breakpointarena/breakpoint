"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { formatDbTime } from "@/lib/utils/timeSlots";
import { requireStaff } from "@/lib/auth/require-admin";
import { arenaToday, arenaDateOffset, arenaClockTime } from "@/lib/utils/dates";
import {
  MAX_LIVE_SESSION_HOURS,
  effectiveDeviceStatus,
  getOccupancyByDevice,
  getOccupiedDeviceIds,
} from "@/lib/devices/occupancy";
import {
  effectivePaidAt,
  mergeBookingRows,
  revenueWindowStart,
} from "@/lib/reports/revenueWindow";

/**
 * Everything the dashboard needs on load, in one call.
 *
 * This was four server actions fired together from the client. They ran
 * concurrently, so the queries were not the problem - the auth check was. Every
 * server action is its own HTTP request, and each one calls `requireStaff()`,
 * which is a network round trip to the Supabase auth server before a single row
 * is read. `resolveRole` is memoised with React `cache()`, but that memo is
 * per-request, so four requests meant four auth round trips that could not
 * overlap with anything.
 *
 * Against the production database those round trips measured 270ms-1.4s each.
 * The queries themselves are sub-millisecond - the heaviest one plans and
 * executes in 0.17ms - so essentially all of this page's load time was spent
 * waiting on the network, most of it re-proving the same operator was staff.
 *
 * One action means one auth check and one browser round trip. The queries below
 * still go out together, and two of them are no longer duplicated: the full
 * paid-bookings set was previously fetched once for today's revenue and again
 * for the week's, and today's slots were fetched three separate times.
 */
export async function getDashboardData() {
  await requireStaff();

  try {
    const today = arenaToday();
    const now = new Date();
    const sevenDaysAgo = arenaDateOffset(-7);

    // How far back a session can have started and still be somebody who is
    // really here. Past this a `checked_in` row is a checkout that never
    // happened, which is what `never_checked_out` is for - not a person playing.
    const liveSince = new Date(
      now.getTime() - MAX_LIVE_SESSION_HOURS * 60 * 60 * 1000
    ).toISOString();

    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    // Arena clock, because that is what `slot_start_time` holds. `toTimeString()`
    // reads the host's, so on Vercel this compared UTC against IST and the
    // "next 2 hours" window pointed 5.5 hours into the arena's past.
    const currentTime = arenaClockTime(now);
    const twoHoursTime = arenaClockTime(twoHoursLater);

    /**
     * How far back the two reads below ask for rows.
     *
     * Deliberately wider than the seven days the figures report on - see
     * REVENUE_WINDOW_SLACK_DAYS. The loop further down is still what decides
     * what counts, so the extra days can only be filtered out, never added.
     */
    const revenueWindow = revenueWindowStart(sevenDaysAgo);

    const [
      { data: todaySlots, error: slotsError },
      { data: touchedInWindow, error: paymentsError },
      { data: settledInWindow, error: settledError },
      { data: devices, error: devicesError },
      occupancy,
      { data: recentBookings, error: recentError },
      { data: foodOrders, error: foodError },
    ] = await Promise.all([
      /**
       * Today's slots, once, with no status filter.
       *
       * Serves four of the figures below. The filter is deliberately left off
       * here and applied per-figure in JS: peak hour has always counted every
       * slot on the day regardless of booking status, and pushing a status
       * filter into SQL to share the query would quietly change that number.
       */
      supabaseAdmin
        .from("booking_device_slots")
        .select(`
          id,
          slot_total,
          slot_date,
          slot_start_time,
          slot_end_time,
          device_type,
          device_station_number,
          player_count,
          bookings!inner(
            id,
            booking_number,
            customer_name,
            status,
            total_amount,
            device_subtotal,
            food_subtotal,
            cash_amount,
            card_amount,
            upi_amount,
            online_amount
          )
        `)
        .eq("slot_date", today),



      /**
       * Everything settled or part-settled inside the window, in two reads.
       *
       * This was one unbounded query: every settled booking the arena has ever
       * taken, fetched on every dashboard load so the loop below could discard
       * all but the last seven days of it.
       *
       * It cannot be bounded on `created_at`, because a booking is not always
       * settled on the day it is made - one raised last month and paid this
       * morning belongs in this week's figure. The date that decides is
       * `effectivePaidAt`, and for a booking paid through a payment group that
       * date is on `payment_groups`, not on the booking at all. No single
       * PostgREST filter spans both tables, so each route in is read on its own
       * and the two are merged.
       *
       * (a) touched inside the window - covers every booking with no payment
       *     group, which today is all of them, and any whose group is still
       *     pending.
       */
      supabaseAdmin
        .from("bookings")
        .select(`
          id,
          amount_paid,
          payment_status,
          created_at,
          updated_at,
          payment_groups(paid_at)
        `)
        .in("payment_status", ["paid", "partial"])
        .neq("status", "cancelled")
        .gte("updated_at", revenueWindow),

      /**
       * (b) settled inside the window by a payment group, however long ago the
       *     booking row itself was last touched. `!inner` is what lets the
       *     filter reach the joined table; without it the condition is ignored
       *     and this would read the whole table back.
       */
      supabaseAdmin
        .from("bookings")
        .select(`
          id,
          amount_paid,
          payment_status,
          created_at,
          updated_at,
          payment_groups!inner(paid_at)
        `)
        .in("payment_status", ["paid", "partial"])
        .neq("status", "cancelled")
        .gte("payment_groups.paid_at", revenueWindow),

      // Device availability. Every device, not just the ones stored as
      // "available" - a station in use still has that stored value, so the
      // occupied ones have to be subtracted here rather than filtered in SQL.
      supabaseAdmin
        .from("devices")
        .select("id, status"),

      getOccupancyByDevice(),

      supabaseAdmin
        .from("bookings")
        .select(`
          id,
          booking_number,
          customer_name,
          customer_phone,
          total_amount,
          status,
          payment_status,
          created_at,
          booking_device_slots(
            slot_date,
            slot_start_time,
            device_type,
            device_station_number
          )
        `)
        .order("created_at", { ascending: false })
        .limit(8),

      supabaseAdmin
        .from("booking_food_items")
        .select(`
          id,
          created_at,
          bookings!inner(status)
        `)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`),
    ]);

    if (slotsError) throw slotsError;
    if (devicesError) throw devicesError;
    if (recentError) throw recentError;

    const slots = (todaySlots || []) as any[];
    const bookedToday = slots.filter((slot) =>
      ["confirmed", "checked_in", "completed"].includes(slot.bookings?.status)
    );

    const upcomingBookings = slots.filter(
      (slot) =>
        slot.bookings?.status === "confirmed" &&
        slot.slot_start_time >= currentTime &&
        slot.slot_start_time <= twoHoursTime
    );

    const schedule = slots
      .filter((slot) => ["confirmed", "checked_in"].includes(slot.bookings?.status))
      .sort((a, b) => String(a.slot_start_time).localeCompare(String(b.slot_start_time)));

    /**
     * The two reads folded into one set.
     *
     * Merged on the row id rather than concatenated: a booking that was both
     * settled and touched inside the window comes back from both queries, and
     * counting it twice would inflate the takings.
     */
    const paidBookings = mergeBookingRows(
      touchedInWindow as { id: string }[] | null,
      settledInWindow as { id: string }[] | null
    );

    // One pass over the paid set for both windows; `paid_at` falls back the same
    // way it always has, so a booking with no payment group still counts.
    let todaysRevenue = 0;
    let thisWeekRevenue = 0;

    /**
     * Either read failing zeroes both figures, which is what a single failing
     * query did before. Reporting the half that succeeded would be worse than
     * reporting nothing: an understated takings figure reads as real.
     */
    if (!paymentsError && !settledError) {
      for (const booking of paidBookings as any[]) {
        const paidAt = effectivePaidAt(booking);
        if (!paidAt) continue;

        const day = paidAt.split("T")[0];
        const amount = Number(booking.amount_paid || 0);

        if (day === today) todaysRevenue += amount;
        if (day >= sevenDaysAgo) thisWeekRevenue += amount;
      }
    }

    /**
     * Active sessions - people at stations, playing.
     *
     * Derived from the occupancy map rather than counted off `bookings`, because
     * a station is what makes this a session. A food-only order has no slot, and
     * nothing stops staff pressing Check In on one: production is currently
     * holding two such rows, and counted off `bookings` alone a takeaway Coke
     * read as somebody playing on an empty floor.
     *
     * Distinct booking, not distinct device - one group on two stations is one
     * session. The Available Devices tile beside it is what counts stations, and
     * both now come from the same query, so the two halves of the same floor
     * cannot disagree.
     */
    const occupiedDeviceIds = new Set(occupancy.keys());
    const activeSessions = new Set(
      Array.from((occupancy as Map<string, { bookingId: string }>).values()).map((s) => s.bookingId)
    ).size;

    const availableDevices = (devices || []).filter(
      (device: { id: string; status: string | null }) =>
        effectiveDeviceStatus(device.status, occupiedDeviceIds.has(device.id)) === "available"
    ).length;

    // Peak hour over every slot on the day, matching the previous behaviour.
    const hourCounts: Record<string, number> = {};
    for (const slot of slots) {
      if (!slot.slot_start_time) continue;
      const hour = String(slot.slot_start_time).split(":")[0];
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    // `as const` so callers narrow on `result.success` - without the literal
    // type both branches infer `success: boolean` and every field reads as
    // possibly-undefined at the call site.
    return {
      success: true as const,
      stats: {
        activeSessions,
        todaysRevenue,
        todaysBookings: bookedToday.length,
        upcomingBookings: upcomingBookings.length,
        availableDevices,
      },
      quickStats: {
        thisWeekRevenue,
        todaysFoodOrders: foodError ? 0 : foodOrders?.length || 0,
        peakHour: peakHour ? formatDbTime(`${peakHour[0]}:00`) : "N/A",
        peakHourBookings: peakHour ? peakHour[1] : 0,
      },
      recentBookings: recentBookings || [],
      schedule,
    };
  } catch (err: any) {
    console.error("Get dashboard data error:", err);
    return { success: false as const, error: err.message };
  }
}

export async function getQuickStats() {
  await requireStaff();

  try {
    const today = arenaToday();
    const now = new Date();
    const sevenDaysAgo = arenaDateOffset(-7);

    // Same reasoning as getDashboardStats: independent queries, so they go out
    // together instead of paying three round trips in series.
    const [
      { data: weekBookings, error: weekError },
      { data: foodOrders, error: foodError },
      { data: allSlots, error: slotsError },
    ] = await Promise.all([
      // This week's revenue - only count amount paid
      supabaseAdmin
        .from("bookings")
        .select("amount_paid, payment_status, created_at, updated_at, payment_groups(paid_at)")
        .in("payment_status", ["paid", "partial"])
        .neq("status", "cancelled"),

      // Today's food orders
      supabaseAdmin
        .from("booking_food_items")
        .select(`
          id,
          created_at,
          bookings!inner(status)
        `)
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`),

      // Peak hour analysis
      supabaseAdmin
        .from("booking_device_slots")
        .select("slot_start_time")
        .eq("slot_date", today),
    ]);

    if (weekError) throw weekError;
    if (foodError) throw foodError;
    if (slotsError) throw slotsError;

    // Filter by payment date (paid_at) being within last 7 days
    const thisWeekRevenue = (weekBookings || [])
      .filter((b: any) => {
        const paidAt = b.payment_groups?.paid_at || b.updated_at || b.created_at;
        if (!paidAt) return false;
        return paidAt.split('T')[0] >= sevenDaysAgo;
      })
      .reduce((sum: number, b: any) => sum + Number(b.amount_paid || 0), 0);

    const hourCounts: Record<string, number> = {};
    (allSlots || []).forEach((slot: any) => {
      const hour = slot.slot_start_time.split(':')[0];
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      success: true,
      stats: {
        thisWeekRevenue,
        todaysFoodOrders: foodOrders?.length || 0,
        peakHour: peakHour ? formatDbTime(`${peakHour[0]}:00`) : "N/A",
        peakHourBookings: peakHour ? peakHour[1] : 0
      }
    };
  } catch (err: any) {
    console.error("Get quick stats error:", err);
    return { success: false, error: err.message };
  }
}

export async function getTodaysRevenueDetails() {
  await requireStaff();

  try {
    const today = arenaToday();

    /**
     * Same two-read shape as the dashboard tile this list sits behind, and for
     * the same reason: unbounded, it read every settled booking the arena has
     * ever taken so that the filter below could keep one day of it.
     *
     * The column list is built once and shared, so the two reads cannot drift
     * apart - they must return the same shape to be merged.
     */
    const revenueWindow = revenueWindowStart(today);
    const columns = (paymentGroups: string) => `
        id,
        booking_number,
        customer_name,
        customer_phone,
        total_amount,
        amount_paid,
        device_subtotal,
        food_subtotal,
        subscription_discount,
        promo_discount,
        happy_hour_discount,
        cash_amount,
        card_amount,
        upi_amount,
        online_amount,
        status,
        payment_status,
        created_at,
        updated_at,
        booking_device_slots(
          slot_date,
          slot_start_time,
          slot_end_time,
          device_type,
          device_station_number
        ),
        ${paymentGroups}(paid_at)
      `;

    const [
      { data: touchedInWindow, error: touchedError },
      { data: settledInWindow, error: settledError },
    ] = await Promise.all([
      // Touched inside the window - every booking with no payment group.
      supabaseAdmin
        .from("bookings")
        .select(columns("payment_groups"))
        .in("payment_status", ["paid", "partial"])
        .neq("status", "cancelled")
        .gte("updated_at", revenueWindow),

      // Settled inside the window by a payment group, whenever the booking row
      // itself was last touched. `!inner` is what lets the filter reach it.
      supabaseAdmin
        .from("bookings")
        .select(columns("payment_groups!inner"))
        .in("payment_status", ["paid", "partial"])
        .neq("status", "cancelled")
        .gte("payment_groups.paid_at", revenueWindow),
    ]);

    if (touchedError) throw touchedError;
    if (settledError) throw settledError;

    // Merged on the row id: a booking both settled and touched inside the
    // window comes back from both reads, and this list must not show it twice.
    const data = mergeBookingRows(
      touchedInWindow as { id: string }[] | null,
      settledInWindow as { id: string }[] | null
    );

    // Filter by payment date being today (using paid_at, updated_at, or created_at)
    const filteredBookings = (data || []).filter((booking: any) => {
      const paidAt = effectivePaidAt(booking);
      if (!paidAt) return false;
      return paidAt.split('T')[0] === today;
    });

    return { success: true, bookings: filteredBookings };
  } catch (err: any) {
    console.error("Get today's revenue details error:", err);
    return { success: false, error: err.message, bookings: [] };
  }
}

export async function getActiveSessionsDetails() {
  await requireStaff();

  try {
    // The same window the tile counts. Without it this list reached back over
    // every forgotten checkout ever recorded, so the tile could read 1 while the
    // modal it opens listed nine.
    const liveSince = new Date(
      Date.now() - MAX_LIVE_SESSION_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabaseAdmin
      .from("booking_device_slots")
      .select(`
        id,
        slot_start_time,
        slot_end_time,
        slot_date,
        device_type,
        device_station_number,
        player_count,
        bookings!inner(
          id,
          booking_number,
          customer_name,
          customer_phone,
          status,
          checked_in_at
        )
      `)
      .eq("bookings.status", "checked_in")
      .gte("bookings.checked_in_at", liveSince)
      .order("slot_start_time", { ascending: true });

    if (error) throw error;

    return { success: true, sessions: data || [] };
  } catch (err: any) {
    console.error("Get active sessions details error:", err);
    return { success: false, error: err.message, sessions: [] };
  }
}

export async function getUpcomingBookingsDetails() {
  await requireStaff();

  try {
    const today = arenaToday();
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    // Arena clock, because that is what `slot_start_time` holds. `toTimeString()`
    // reads the host's, so on Vercel this compared UTC against IST and the
    // "next 2 hours" window pointed 5.5 hours into the arena's past.
    const currentTime = arenaClockTime(now);
    const twoHoursTime = arenaClockTime(twoHoursLater);

    const { data, error } = await supabaseAdmin
      .from("booking_device_slots")
      .select(`
        id,
        slot_date,
        slot_start_time,
        slot_end_time,
        device_type,
        device_station_number,
        player_count,
        bookings!inner(
          id,
          booking_number,
          customer_name,
          customer_phone,
          status
        )
      `)
      .eq("slot_date", today)
      .gte("slot_start_time", currentTime)
      .lte("slot_start_time", twoHoursTime)
      .eq("bookings.status", "confirmed")
      .order("slot_start_time", { ascending: true });

    if (error) throw error;

    return { success: true, bookings: data || [] };
  } catch (err: any) {
    console.error("Get upcoming bookings details error:", err);
    return { success: false, error: err.message, bookings: [] };
  }
}

export async function getAvailableDevicesDetails() {
  await requireStaff();

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
          regular_hourly_rate
        )
      `)
      .order("status", { ascending: false }) // Show available first
      .order("station_number", { ascending: true });

    if (error) throw error;

    // The modal splits these into available and occupied, so it needs the status
    // the floor is actually in rather than the one stored on the row.
    const occupied = await getOccupiedDeviceIds();

    // Transform the data to flatten device_type
    const devices = (data || []).map((device: any) => ({
      id: device.id,
      station_number: device.station_number,
      status: effectiveDeviceStatus(device.status, occupied.has(device.id)),
      hourly_rate: device.device_type?.regular_hourly_rate || 0,
      specs: device.specs,
      image_url: device.image_url,
      device_type: device.device_type?.display_name || device.device_type?.name || 'Unknown'
    }));

    return { success: true, devices };
  } catch (err: any) {
    console.error("Get available devices details error:", err);
    return { success: false, error: err.message, devices: [] };
  }
}
