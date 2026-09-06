"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { annotateRemovableFoodItems } from "@/lib/bookings/foodItems";
import {
  foodItemsToCancel,
  stockToRestore,
  type CancellableFoodItem
} from "@/lib/bookings/cancellation";
import { decideCheckout, type CheckoutDecision } from "@/lib/bookings/checkoutGuard";
import { extraPlayersCharge, perExtraPlayerCharge } from "@/lib/payments/money";
import { settlementStatus } from "@/lib/payments/paymentStatus";
import { roundToTwo } from "@/lib/currency";
import { resolveHappyHour } from "@/lib/payments/happyHour";
import { formatDbTime } from "@/lib/utils/timeSlots";
import {
  calculateMembershipDiscount,
  resolveActiveMembership
} from "@/lib/subscriptions/discount";
import {
  MAX_BACKDATED_START_HOURS,
  PROVISIONAL_SESSION_HOURS,
  formatPlayedDuration,
  priceSession,
  resolveBackdatedStart,
  toClockTime,
  toSlotDate
} from "@/lib/bookings/walkInSession";
import { arenaDate, arenaToday } from "@/lib/utils/dates";
import { needsAttention } from "@/lib/bookings/attention";
import { requireStaff } from "@/lib/auth/require-admin";
import {
  countAvailableDevicesForRange,
  timeToMinutes
} from "@/lib/payments/availability";
import { getOccupancyByDevice } from "@/lib/devices/occupancy";

/** Rupee tolerance for float comparisons on money. */
const MONEY_EPSILON = 0.01

/**
 * Payment status derived from the figures actually being displayed.
 *
 * These reads already recompute `total_amount` and `balance_due` from the
 * component columns rather than trusting the stored total, but they used to hand
 * back the *stored* `payment_status` alongside them - so a booking that was paid
 * online and later had food added showed a positive balance next to a green
 * "Paid" badge, because nothing had rewritten the status column. Deriving it
 * from the same numbers keeps the badge and the balance telling one story.
 *
 * `refunded` and `failed` are passed through untouched: neither is recoverable
 * from amounts, and both are terminal.
 */
function derivePaymentStatus(
  correctTotal: number,
  amountPaid: number,
  storedStatus: string | null | undefined,
  /**
   * A walk-in session that has not been checked out yet. Its total is zero
   * because the bill has not been worked out, not because there is nothing to
   * pay - and "nothing to collect" below would otherwise stamp it Paid the moment
   * it was created, which is the one thing it certainly is not.
   */
  awaitingBill = false
): string {
  if (storedStatus === "refunded" || storedStatus === "failed") {
    return storedStatus;
  }

  if (awaitingBill) return amountPaid > MONEY_EPSILON ? "partial" : "pending";

  // Nothing to collect - a free or fully discounted booking is settled.
  if (correctTotal <= MONEY_EPSILON) return "paid";

  if (amountPaid >= correctTotal - MONEY_EPSILON) return "paid";
  if (amountPaid > MONEY_EPSILON) return "partial";

  return "pending";
}

export interface BookingFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  searchQuery?: string;
  deviceType?: string;
}

export interface TimelineBooking {
  id: string;
  booking_number: string;
  customer_name: string;
  customer_phone: string;
  device_type: string;
  device_station_number: string;
  device_id: string;
  slot_start_time: string;
  slot_end_time: string;
  slot_date: string;
  status: string;
  total_amount: number;
}

/**
 * The days a booking belongs to on the bookings page: the sessions it reserves.
 * Food-only bookings hold no slot, so they fall back to the day they were
 * raised. Everything is YYYY-MM-DD, which compares correctly as a string.
 */
function getBookingDates(booking: any): string[] {
  const slotDates = (booking?.booking_device_slots || [])
    .map((slot: any) => slot?.slot_date)
    .filter(Boolean);

  if (slotDates.length > 0) return slotDates;

  /**
   * No slot: a food-only order, or a walk-in still waiting to be checked in.
   *
   * `created_at` is a timestamptz, so this has to name the zone to read it in.
   * Slicing the ISO string took the UTC date; `formatLocalDate` then took the
   * *host's*, which is IST on a developer's laptop and UTC on Vercel - the same
   * wrong answer in production, arrived at less obviously. A walk-in raised at
   * half past midnight was filed under yesterday and missing from the Today
   * filter the front desk works from until check-in gave it a slot row.
   *
   * Slot dates never had this problem: `slot_date` is a DATE, already in arena
   * terms.
   */
  return booking?.created_at ? [arenaDate(new Date(booking.created_at))] : [];
}

/**
 * A booking is in range when any of its slots falls inside it. An empty bound
 * means "unbounded" - the All Time filter clears both.
 */
function isBookingInDateRange(
  booking: any,
  dateFrom?: string,
  dateTo?: string
): boolean {
  return getBookingDates(booking).some((date) => {
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    return true;
  });
}

/**
 * The columns every booking list needs.
 *
 * Shared so the attention list and the main list return the same shape - the
 * badges and the detail panel read the same fields either way, and a column
 * added for one list cannot go missing from the other.
 */
const BOOKING_LIST_SELECT = `
        id,
        booking_number,
        customer_name,
        customer_phone,
        customer_email,
        customer_dob,
        total_amount,
        amount_paid,
        cash_amount,
        card_amount,
        upi_amount,
        online_amount,
        razorpay_payment_id,
        device_subtotal,
        food_subtotal,
        subscription_discount,
        promo_discount,
        happy_hour_discount,
        status,
        payment_status,
        created_at,
        checked_in_at,
        completed_at,
        lock_expires_at,
        billed_on_actual_time,
        walk_in_device_type_name,
        walk_in_player_count,
        booking_device_slots(
          id,
          slot_date,
          slot_start_time,
          slot_end_time,
          device_type,
          device_station_number,
          duration_hours,
          hourly_rate,
          slot_total,
          player_count,
          included_players,
          extra_player_charge,
          extra_players_total
        ),
        booking_food_items(
          id,
          item_name,
          quantity,
          unit_price,
          line_total,
          status
        )
      `;

/**
 * Recomputes a booking's total and balance from its parts.
 *
 * The stored `total_amount` is not trusted: discounts and food are written by
 * several different paths, and a stale total shown next to a live balance is how
 * a customer gets asked for the wrong money. Shared so every list prices a
 * booking the same way - the attention list in particular decides whether
 * something is unpaid from this, and it must agree with the figure on screen.
 */
function withComputedTotals(booking: any) {
  const deviceSubtotal = Number(booking.device_subtotal || 0);
  const foodSubtotal = Number(booking.food_subtotal || 0);
  const subscriptionDiscount = Number(booking.subscription_discount || 0);
  const promoDiscount = Number(booking.promo_discount || 0);
  const happyHourDiscount = Number(booking.happy_hour_discount || 0);
  const amountPaid = Number(booking.amount_paid || 0);

  const correctTotal = roundToTwo(
    deviceSubtotal + foodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount
  );
  const balanceDue = roundToTwo(correctTotal - amountPaid);

  return {
    ...booking,
    total_amount: correctTotal,
    balance_due: balanceDue,
    payment_status: derivePaymentStatus(
      correctTotal,
      amountPaid,
      booking.payment_status,
      booking.billed_on_actual_time === true && !booking.completed_at
    )
  };
}

export async function getAllBookings(filters?: BookingFilters) {
  await requireStaff();

  try {
    let query = supabaseAdmin
      .from("bookings")
      .select(BOOKING_LIST_SELECT)
      .order("created_at", { ascending: false });

    // Apply filters
    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    } else {
      // A customer part-way through the slot picker holds a real `locked` booking
      // row with no name, no phone and no money on it, and an abandoned one lands
      // in `expired`. Neither is a booking any member of staff can act on, so they
      // stay out of the list unless somebody asks for that status by name.
      query = query.not("status", "in", "(locked,expired,draft)");
    }

    if (filters?.searchQuery) {
      query = query.or(
        `customer_name.ilike.%${filters.searchQuery}%,customer_phone.ilike.%${filters.searchQuery}%,booking_number.ilike.%${filters.searchQuery}%`
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    // Bookings are filtered on the session they reserve, not on when the row
    // was created: "today" here means today's slots, whenever they were booked.
    const inRange = (filters?.dateFrom || filters?.dateTo)
      ? (data || []).filter((booking: any) =>
          isBookingInDateRange(booking, filters.dateFrom, filters.dateTo)
        )
      : (data || []);

    const bookingsWithBalance = inRange.map(withComputedTotals);

    return { success: true, bookings: bookingsWithBalance };
  } catch (err: any) {
    console.error("Get bookings error:", err);
    return { success: false, error: err.message, bookings: [] };
  }
}

/**
 * Every booking that stopped part-way through, whatever day it happened on.
 *
 * Deliberately ignores the page's date range. The whole reason this list exists
 * is the bookings nobody noticed - production had eighteen sessions checked in
 * and never checked out, the oldest fifty-one days old, and a list scoped to
 * "today" would show none of them. Scoping this to a date range would rebuild
 * the blind spot it is meant to remove.
 *
 * `cancelled` is excluded by the status filter rather than relying on
 * `bookingAttention` to drop it: a cancelled booking is a decision somebody
 * already made, not an loose end.
 */
export async function getAttentionBookings() {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_LIST_SELECT)
      .in("status", ["confirmed", "checked_in", "completed"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Totals first: whether a booking counts as unpaid is decided from the
    // recomputed balance, not the stored one.
    const priced = (data || []).map(withComputedTotals);
    const flagged = priced.filter((booking: any) => needsAttention(booking));

    return { success: true, bookings: flagged };
  } catch (err: any) {
    console.error("Get attention bookings error:", err);
    return { success: false, error: err.message, bookings: [] };
  }
}

export async function getBookingDetails(bookingId: string) {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(`
        *,
        booking_device_slots(
          id,
          device_id,
          slot_date,
          slot_start_time,
          slot_end_time,
          device_type,
          device_station_number,
          duration_hours,
          hourly_rate,
          slot_total,
          player_count,
          included_players,
          extra_player_charge,
          extra_players_total,
          devices(
            id,
            station_number,
            status,
            specs,
            image_url,
            device_type:device_types(
              id,
              name,
              display_name
            )
          )
        ),
        booking_food_items(
          id,
          menu_item_id,
          item_name,
          item_category,
          quantity,
          unit_price,
          line_total,
          status,
          created_at
        )
      `)
      .eq("id", bookingId)
      .single();

    if (error) throw error;

    // Also fetch line items to check what's unpaid
    const { data: lineItems, error: lineItemsError } = await supabaseAdmin
      .from("booking_line_items")
      .select("*")
      .eq("booking_id", bookingId)
      .order("display_order", { ascending: true });

    if (lineItemsError) {
      console.warn("Failed to fetch line items:", lineItemsError);
    }

    // Calculate unpaid items
    const unpaidItems = lineItems?.filter((item: any) => !item.is_paid) || [];

    // Calculate correct total_amount (don't trust stored value)
    const deviceSubtotal = Number(data.device_subtotal || 0);
    const foodSubtotal = Number(data.food_subtotal || 0);
    const subscriptionDiscount = Number(data.subscription_discount || 0);
    const promoDiscount = Number(data.promo_discount || 0);
    const happyHourDiscount = Number(data.happy_hour_discount || 0);
    const amountPaid = Number(data.amount_paid || 0);

    const correctTotal = roundToTwo(
      deviceSubtotal + foodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount
    );
    const balanceDue = roundToTwo(correctTotal - amountPaid);

    return {
      success: true,
      booking: {
        ...data,
        total_amount: correctTotal, // Override with calculated value
        // Flags the food an admin added and nobody has paid for yet, which is
        // the only food the UI may offer to remove.
        booking_food_items: annotateRemovableFoodItems(data.booking_food_items, lineItems || []),
        line_items: lineItems || [],
        unpaid_items: unpaidItems,
        balance_due: balanceDue,
        payment_status: derivePaymentStatus(
          correctTotal,
          amountPaid,
          data.payment_status,
          data.billed_on_actual_time === true && !data.completed_at
        )
      }
    };
  } catch (err: any) {
    console.error("Get booking details error:", err);
    return { success: false, error: err.message, booking: null };
  }
}

export async function updateBookingStatus(bookingId: string, newStatus: string) {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", bookingId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, booking: data };
  } catch (err: any) {
    console.error("Update booking status error:", err);
    return { success: false, error: err.message };
  }
}

export async function checkInBooking(bookingId: string) {
  await requireStaff();

  try {
    const now = new Date().toISOString();

    // A walk-in session has no station until check-in claims one, so it must go
    // through checkInWalkInSession. Flipping the status here would start a clock
    // on a customer sitting at no machine at all.
    const { data: subject, error: subjectError } = await supabaseAdmin
      .from("bookings")
      .select("status, billed_on_actual_time")
      .eq("id", bookingId)
      .maybeSingle();

    if (subjectError) throw subjectError;
    if (!subject) return { success: false, error: "Booking not found." };
    if (subject.billed_on_actual_time) {
      return {
        success: false,
        error: "This is an open-ended walk-in session. Use Check In on the session instead."
      };
    }
    if (subject.status === "checked_in") {
      return { success: false, error: "This customer is already checked in." };
    }
    if (subject.status !== "confirmed") {
      return {
        success: false,
        error: `A ${String(subject.status).replace(/_/g, " ")} booking cannot be checked in.`
      };
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "checked_in",
        checked_in_at: now,
        updated_at: now
      })
      .eq("id", bookingId)
      .eq("status", "confirmed")
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { success: false, error: "This booking changed while you were working on it. Refresh and try again." };
    }

    return { success: true, booking: data };
  } catch (err: any) {
    console.error("Check-in booking error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Call off a booking nobody has turned up for.
 *
 * Deliberately the narrowest of the status changes: only a `confirmed` booking
 * with an empty `checked_in_at` can be cancelled. Once somebody is at a station
 * the session is a thing that happened - it has a start time, it may have food
 * on it, and it is owed for - so the way out of it is checkout, not cancellation.
 * A `completed` booking is the same story with the ending already written.
 *
 * The slot row is left where it is. Availability only counts
 * `locked`/`confirmed`/`checked_in` bookings, so the station is free the moment
 * the status flips, and `assign_device_slot` clears the leftover row itself
 * when the next booking claims that exact station and time.
 *
 * Food is the part that does not look after itself. Every path that adds food
 * to a booking takes the stock as it does so, so a booking called off before
 * anybody sat down is holding items nothing will be made from: the rows are
 * marked `cancelled` and the counts go back on the shelf.
 */
export async function cancelBooking(bookingId: string, reason?: string) {
  await requireStaff();

  try {
    const now = new Date().toISOString();

    const { data: subject, error: subjectError } = await supabaseAdmin
      .from("bookings")
      .select("status, checked_in_at, completed_at, booking_number, amount_paid, notes")
      .eq("id", bookingId)
      .maybeSingle();

    if (subjectError) throw subjectError;
    if (!subject) return { success: false, error: "Booking not found." };

    if (subject.status === "cancelled") {
      return { success: false, error: "This booking is already cancelled." };
    }
    // Checked in is tested on the timestamp as well as the status: a session
    // checked out into `completed` still carries the time somebody played.
    if (subject.status === "checked_in" || subject.checked_in_at) {
      return {
        success: false,
        error: "This customer has already checked in. Check them out instead of cancelling."
      };
    }
    if (subject.status === "completed" || subject.completed_at) {
      return { success: false, error: "A completed booking cannot be cancelled." };
    }
    if (subject.status !== "confirmed") {
      return {
        success: false,
        error: `A ${String(subject.status).replace(/_/g, " ")} booking cannot be cancelled.`
      };
    }

    // Why it was called off is the one thing the row cannot be asked later, so
    // it goes on the booking rather than nowhere.
    const trimmedReason = reason?.trim();
    const notes = trimmedReason
      ? [subject.notes, `Cancelled: ${trimmedReason}`].filter(Boolean).join("\n")
      : subject.notes;

    // The status is re-tested in the update so two people cancelling and
    // checking in at the same moment cannot both win.
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "cancelled",
        notes,
        updated_at: now
      })
      .eq("id", bookingId)
      .eq("status", "confirmed")
      .is("checked_in_at", null)
      .is("completed_at", null)
      .select("id, booking_number, amount_paid")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return {
        success: false,
        error: "This booking changed while you were working on it. Refresh and try again."
      };
    }

    // Food comes back after the status has flipped, not before: if this fails
    // the booking is still cancelled and the stock is merely wrong, which is a
    // count somebody can correct - the other order round would leave a booking
    // live with its food already credited back.
    const { data: foodRows, error: foodError } = await supabaseAdmin
      .from("booking_food_items")
      .select("id, menu_item_id, quantity, status")
      .eq("booking_id", bookingId);

    if (foodError) {
      console.error("Could not read food items while cancelling:", foodError);
    }

    const foodItems = (foodRows || []) as CancellableFoodItem[];
    const idsToCancel = foodItemsToCancel(foodItems);
    let restoredItems = 0;

    if (idsToCancel.length > 0) {
      const { error: markError } = await supabaseAdmin
        .from("booking_food_items")
        .update({ status: "cancelled" })
        .in("id", idsToCancel);

      if (markError) {
        console.error("Could not mark food items cancelled:", markError);
      }

      for (const { menuItemId, quantity } of stockToRestore(foodItems)) {
        const { error: stockError } = await supabaseAdmin.rpc("increment_menu_item_quantity", {
          item_id: menuItemId,
          increment_by: quantity
        });

        // Logged rather than thrown, the same way removeFoodItemFromBooking
        // treats it: the cancellation has happened and cannot be undone here.
        if (stockError) {
          console.error("Failed to restore menu item stock on cancellation:", stockError);
        } else {
          restoredItems += quantity;
        }
      }
    }

    return {
      success: true,
      booking: data,
      bookingNumber: data.booking_number as string,
      // Cancelled bookings are excluded from every revenue report, so anything
      // already collected has to be refunded by hand - the caller says so.
      amountPaid: Number(data.amount_paid || 0),
      /** Food portions put back on the shelf, for the message staff read. */
      restoredItems
    };
  } catch (err: any) {
    console.error("Cancel booking error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Record that the money taken on a cancelled booking has been handed back.
 *
 * The refund itself happens off-screen - cash out of the till, or a reversal
 * through the payment provider - so this does not move any money. It records
 * that somebody did, which is what clears the "Refund due" flag from the row
 * and stops the next person doing it again.
 *
 * `amount_paid` is deliberately left where it is. It is the record of what was
 * collected, and zeroing it would erase the only evidence that a refund was
 * ever owed.
 */
export async function markBookingRefunded(bookingId: string) {
  await requireStaff();

  try {
    const { data: subject, error: subjectError } = await supabaseAdmin
      .from("bookings")
      .select("status, payment_status, amount_paid, booking_number")
      .eq("id", bookingId)
      .maybeSingle();

    if (subjectError) throw subjectError;
    if (!subject) return { success: false, error: "Booking not found." };

    // Only a cancelled booking can be owed a refund here. Money back on a
    // booking that went ahead is a different thing entirely - a discount, or a
    // billing correction - and marking it refunded would take it out of the
    // takings while the session it paid for still stands.
    if (String(subject.status).toLowerCase() !== "cancelled") {
      return {
        success: false,
        error: "Only a cancelled booking can be marked refunded."
      };
    }

    if (subject.payment_status === "refunded") {
      return { success: false, error: "This booking is already marked refunded." };
    }

    const collected = Number(subject.amount_paid || 0);
    if (collected <= 0) {
      return { success: false, error: "Nothing was collected on this booking." };
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "refunded",
        updated_at: new Date().toISOString()
      })
      .eq("id", bookingId)
      .eq("status", "cancelled")
      .select("id, booking_number, amount_paid")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return {
        success: false,
        error: "This booking changed while you were working on it. Refresh and try again."
      };
    }

    return {
      success: true,
      bookingNumber: data.booking_number as string,
      refundedAmount: Number(data.amount_paid || 0)
    };
  } catch (err: any) {
    console.error("Mark booking refunded error:", err);
    return { success: false, error: err.message };
  }
}

/** Look up what `decideCheckout` needs, then apply it. */
async function resolveCheckoutStatus(bookingId: string): Promise<CheckoutDecision> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("status, billed_on_actual_time, booking_device_slots(id)")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, error: "Booking not found." };

  return decideCheckout({
    status: data.status,
    hasDeviceSlots: (data.booking_device_slots || []).length > 0,
    billedOnActualTime: data.billed_on_actual_time === true
  });
}

export async function checkOutBooking(bookingId: string) {
  await requireStaff();

  try {
    const allowed = await resolveCheckoutStatus(bookingId);
    if (!allowed.ok) return { success: false, error: allowed.error };

    const now = new Date().toISOString();

    // Re-asserting the status in the WHERE clause closes the gap between the read
    // above and this write, so two staff checking the same booking out at once
    // cannot both stamp `completed_at`.
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now
      })
      .eq("id", bookingId)
      .eq("status", allowed.from)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { success: false, error: "This booking changed while you were working on it. Refresh and try again." };
    }

    return { success: true, booking: data };
  } catch (err: any) {
    console.error("Check-out booking error:", err);
    return { success: false, error: err.message };
  }
}

export async function getBookingStats(
  filters?: Pick<BookingFilters, "dateFrom" | "dateTo">
) {
  await requireStaff();

  try {
    // Get counts by status. The slot dates come along so the counts can be
    // scoped to the same range as the list they sit above.
    // Pre-payment holds and the abandoned ones that lapse into `expired` are not
    // bookings; counting them would inflate every tile above the list.
    const { data: allStatuses, error: statusError } = await supabaseAdmin
      .from("bookings")
      .select("status, created_at, booking_device_slots(slot_date)")
      .not("status", "in", "(locked,expired,draft)");

    if (statusError) throw statusError;

    const statusCounts = (filters?.dateFrom || filters?.dateTo)
      ? (allStatuses || []).filter((booking: any) =>
          isBookingInDateRange(booking, filters.dateFrom, filters.dateTo)
        )
      : (allStatuses || []);

    // Calculate today's revenue
    const today = arenaToday();
    const { data: todayBookings, error: revenueError } = await supabaseAdmin
      .from("bookings")
      .select("total_amount")
      .gte("created_at", today)
      .in("status", ["confirmed", "checked_in", "completed"]);

    if (revenueError) throw revenueError;

    const todayRevenue = (todayBookings || []).reduce(
      (sum: number, b: any) => sum + Number(b.total_amount || 0),
      0
    );

    // Group by status
    const grouped = (statusCounts || []).reduce((acc: any, item: any) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    return {
      success: true,
      stats: {
        total: statusCounts?.length || 0,
        confirmed: grouped.confirmed || 0,
        checked_in: grouped.checked_in || 0,
        completed: grouped.completed || 0,
        cancelled: grouped.cancelled || 0,
        locked: grouped.locked || 0,
        todayRevenue
      }
    };
  } catch (err: any) {
    console.error("Get booking stats error:", err);
    return { success: false, error: err.message, stats: null };
  }
}

export async function addFoodToBooking(
  bookingId: string,
  items: Array<{
    menuItemId: string;
    itemName: string;
    itemCategory: string;
    quantity: number;
    unitPrice: number;
  }>
) {
  await requireStaff();

  try {
    // The booking has to be one food can still be served against. Hiding the
    // button is not the same as refusing the call: the grid went on offering
    // Add Food on a cancelled food-only order, and nothing here said no.
    const { data: subject, error: subjectError } = await supabaseAdmin
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .maybeSingle();

    if (subjectError) throw subjectError;
    if (!subject) return { success: false, error: "Booking not found." };
    if (subject.status === "cancelled" || subject.status === "completed") {
      return {
        success: false,
        error: `This booking is ${subject.status}. Food can no longer be added.`
      };
    }

    // VALIDATION: Check stock availability before adding
    const itemIds = items.map(item => item.menuItemId);
    const { data: menuItems, error: menuError } = await supabaseAdmin
      .from("menu_items")
      .select("id, name, quantity, status")
      .in("id", itemIds);

    if (menuError) throw menuError;

    // Validate each item
    const unavailableItems: string[] = [];
    const insufficientStock: string[] = [];

    for (const orderItem of items) {
      const menuItem = menuItems?.find((m: any) => m.id === orderItem.menuItemId);

      if (!menuItem) {
        unavailableItems.push(orderItem.itemName);
        continue;
      }

      if (menuItem.status !== "available") {
        unavailableItems.push(menuItem.name);
        continue;
      }

      if (menuItem.quantity < orderItem.quantity) {
        insufficientStock.push(
          `${menuItem.name} (Available: ${menuItem.quantity}, Requested: ${orderItem.quantity})`
        );
      }
    }

    // If validation fails, return error
    if (unavailableItems.length > 0 || insufficientStock.length > 0) {
      let errorMessage = "Cannot add food items:\n";
      if (unavailableItems.length > 0) {
        errorMessage += `Unavailable: ${unavailableItems.join(", ")}\n`;
      }
      if (insufficientStock.length > 0) {
        errorMessage += `Insufficient stock: ${insufficientStock.join(", ")}`;
      }
      return { success: false, error: errorMessage };
    }

    // Calculate new food subtotal
    const foodLineItems = items.map((item) => ({
      booking_id: bookingId,
      menu_item_id: item.menuItemId,
      item_name: item.itemName,
      item_category: item.itemCategory,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.unitPrice * item.quantity,
      status: "pending"
    }));

    const { data: foodItems, error: foodError } = await supabaseAdmin
      .from("booking_food_items")
      .insert(foodLineItems)
      .select();

    if (foodError) throw foodError;

    /**
     * The insert above already fired `sync_booking_food_subtotal`, which sums the
     * booking's food rows and rewrites `food_subtotal` and `total_amount` as
     * `device + food - discounts`. So these figures already include what was just
     * added, and the job here is to read them, not to work them out again.
     *
     * Adding the new items on top of this read is exactly what went wrong: ₹100 of
     * food landed on the bill as ₹200, and a walk-in - whose device charge is zero
     * until checkout - showed a total made entirely of food counted twice.
     *
     * Note what is *not* in the sum: player count. Food is billed per item, at
     * menu price, however many people are at the table.
     */
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("food_subtotal, total_amount, amount_paid")
      .eq("id", bookingId)
      .single();

    if (bookingError) throw bookingError;

    const newFoodSubtotal = Number(booking.food_subtotal || 0);
    const newTotal = Number(booking.total_amount || 0);
    const amountPaid = Number(booking.amount_paid || 0);

    // Get current display_order for line items
    const { data: existingLineItems } = await supabaseAdmin
      .from("booking_line_items")
      .select("display_order")
      .eq("booking_id", bookingId)
      .order("display_order", { ascending: false })
      .limit(1);

    const startingOrder = (existingLineItems?.[0]?.display_order || 0) + 1;

    // Create line items for the food (for audit trail)
    const bookingLineItems = items.map((item, index) => ({
      booking_id: bookingId,
      item_type: 'food',
      description: item.itemName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.unitPrice * item.quantity,
      reference_id: item.menuItemId,
      reference_type: 'menu_item',
      added_by: 'admin',
      is_paid: false, // Food added by admin is unpaid
      display_order: startingOrder + index
    }));

    const { error: lineItemsError } = await supabaseAdmin
      .from("booking_line_items")
      .insert(bookingLineItems);

    if (lineItemsError) throw lineItemsError;

    // Device paid, food unpaid, is exactly what `partial` is for.
    const newPaymentStatus = settlementStatus({ amountPaid, total: newTotal });

    // Only the payment status is this function's to set - the money columns belong
    // to the trigger, and writing them here is what double-counted the food.
    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: newPaymentStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", bookingId);

    if (updateError) throw updateError;

    // Decrement inventory for each item
    for (const item of items) {
      const { data: success, error: inventoryError } = await supabaseAdmin.rpc(
        "decrement_menu_item_quantity",
        {
          item_id: item.menuItemId,
          decrement_by: item.quantity,
        }
      );

      if (inventoryError || !success) {
        console.error("Inventory update error:", inventoryError || "Insufficient stock");
        // Log for monitoring but don't fail the order
        // (validation already happened above)
      }
    }

    return { success: true, foodItems, newTotal };
  } catch (err: any) {
    console.error("Add food to booking error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Remove a food item an admin added to an existing booking - the undo for a
 * mistaken "Add Food". Reverses everything addFoodToBooking() did: the food
 * row, its billing line item, the booking totals and the stock it took.
 */
export async function removeFoodItemFromBooking(bookingId: string, foodItemId: string) {
  await requireStaff();

  try {
    // Scoped to the booking, so an id belonging to another booking cannot be removed
    const { data: foodItem, error: foodItemError } = await supabaseAdmin
      .from("booking_food_items")
      .select("id, booking_id, menu_item_id, item_name, quantity, line_total")
      .eq("id", foodItemId)
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (foodItemError) throw foodItemError;
    if (!foodItem) {
      return { success: false, error: "That food item is no longer on this booking." };
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        "status, device_subtotal, subscription_discount, promo_discount, happy_hour_discount, amount_paid"
      )
      .eq("id", bookingId)
      .single();

    if (bookingError) throw bookingError;

    if (booking.status === "cancelled" || booking.status === "completed") {
      return {
        success: false,
        error: `This booking is ${booking.status}. Food can no longer be changed.`
      };
    }

    // Find the line item this food row was billed through. menu_item_id is
    // nullable (the menu item may have been deleted since), so fall back to the
    // stored name in that case.
    let lineItemQuery = supabaseAdmin
      .from("booking_line_items")
      .select("id, item_type, added_by, is_paid, quantity, reference_id, description")
      .eq("booking_id", bookingId)
      .eq("item_type", "food")
      .eq("added_by", "admin")
      .eq("is_paid", false)
      .eq("quantity", foodItem.quantity)
      .order("display_order", { ascending: false });

    lineItemQuery = foodItem.menu_item_id
      ? lineItemQuery.eq("reference_id", foodItem.menu_item_id)
      : lineItemQuery.is("reference_id", null).eq("description", foodItem.item_name);

    const { data: lineItems, error: lineItemError } = await lineItemQuery;

    if (lineItemError) throw lineItemError;

    const lineItem = (lineItems || [])[0];

    if (!lineItem) {
      return {
        success: false,
        error: `${foodItem.item_name} has already been paid for. Refund it instead of removing it.`
      };
    }

    // Delete the food row first: it is what the operator sees, and the totals
    // below are recomputed from what is actually left, so a failure after this
    // point still leaves the booking charging the right amount.
    const { error: deleteFoodError } = await supabaseAdmin
      .from("booking_food_items")
      .delete()
      .eq("id", foodItem.id)
      .eq("booking_id", bookingId);

    if (deleteFoodError) throw deleteFoodError;

    const { error: deleteLineItemError } = await supabaseAdmin
      .from("booking_line_items")
      .delete()
      .eq("id", lineItem.id);

    if (deleteLineItemError) {
      // The charge is already off the booking; a stale audit row is worth
      // logging but not worth failing the removal over.
      console.error("Failed to delete booking line item:", deleteLineItemError);
    }

    // Recompute from the rows that remain rather than subtracting from the
    // stored value, so the totals cannot drift.
    const { data: remainingFood, error: remainingError } = await supabaseAdmin
      .from("booking_food_items")
      .select("line_total")
      .eq("booking_id", bookingId);

    if (remainingError) throw remainingError;

    const newFoodSubtotal = (remainingFood || []).reduce(
      (sum: number, item: any) => sum + Number(item.line_total || 0),
      0
    );

    const deviceSubtotal = Number(booking.device_subtotal || 0);
    const subscriptionDiscount = Number(booking.subscription_discount || 0);
    const promoDiscount = Number(booking.promo_discount || 0);
    const happyHourDiscount = Number(booking.happy_hour_discount || 0);
    const amountPaid = Number(booking.amount_paid || 0);

    const newTotal =
      deviceSubtotal + newFoodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount;

    // Same rule as addFoodToBooking, so removing the last unpaid item settles
    // a booking that was only "partial" because of it.
    const newPaymentStatus = settlementStatus({ amountPaid, total: newTotal });

    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        food_subtotal: newFoodSubtotal,
        total_amount: newTotal,
        payment_status: newPaymentStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", bookingId);

    if (updateError) throw updateError;

    // Give the stock back. addFoodToBooking() is the only path that decremented
    // it, and the line item check above guarantees we came from there.
    if (foodItem.menu_item_id) {
      const { error: inventoryError } = await supabaseAdmin.rpc("increment_menu_item_quantity", {
        item_id: foodItem.menu_item_id,
        increment_by: foodItem.quantity
      });

      if (inventoryError) {
        console.error("Failed to restore menu item stock:", inventoryError);
      }
    }

    return { success: true, newTotal, newFoodSubtotal, removedItemName: foodItem.item_name };
  } catch (err: any) {
    console.error("Remove food item from booking error:", err);
    return { success: false, error: err.message };
  }
}

export async function createWalkInBooking(payload: {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerDob: string;
  deviceTypeId: string;
  deviceTypeName: string;
  selectedDate: string;
  selectedSlot: string;
  slotStartTime: string;
  slotEndTime: string;
  durationHours: number;
  hourlyRate: number;
  playerCount: number;
  includedPlayers: number;
  extraPlayerCharge: number;
  subtotal: number;
  total: number;
  subscriptionDiscount?: number;
  happyHourDiscount?: number;
  happyHourRuleId?: string | null;
}) {
  await requireStaff();

  try {
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

    const startTime = formatTime(payload.slotStartTime);
    const endTime = formatTime(payload.slotEndTime);

    // Step 1: Get or create customer
    const { data: customerId, error: customerError } = await supabaseAdmin
      .rpc("get_or_create_customer", {
        p_phone: payload.customerPhone,
        p_name: payload.customerName,
        p_email: payload.customerEmail || null,
        p_dob: payload.customerDob
      });

    if (customerError) throw customerError;

    // Step 2: Generate booking number
    const { data: bookingNumber, error: bookingNumberError } = await supabaseAdmin
      .rpc("generate_booking_number");

    if (bookingNumberError) throw bookingNumberError;

    const extraPlayersCount = Math.max(0, payload.playerCount - payload.includedPlayers);
    const extraPlayersTotal = extraPlayersCharge(
      extraPlayersCount,
      payload.extraPlayerCharge,
      payload.durationHours
    );
    const deviceCharges = payload.subtotal; // Base station rate calculated by duration
    const deviceSubtotal = deviceCharges + extraPlayersTotal;
    const subscriptionDiscount = payload.subscriptionDiscount || 0;
    const happyHourDiscount = payload.happyHourDiscount || 0;
    const totalAmount = deviceSubtotal - subscriptionDiscount - happyHourDiscount;

    /**
     * An advance booking is for later, so it is never checked in on creation.
     *
     * This used to auto-check-in anything dated today, on the reasoning that a
     * walk-in is someone already standing at the counter. That reasoning belonged
     * to a form that only took walk-ins; a customer at the counter now goes
     * through `createWalkInSession`. What is left here is the advance path, where
     * "today" says nothing about whether the customer has arrived - a slot booked
     * at 10am for 8pm was being marked as playing from 10am, which put a session
     * nobody was at into the dashboard's active count, and left staff unable to
     * check the customer in when they actually turned up.
     */
    const now = new Date().toISOString();

    // Step 3: Create booking
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        booking_number: bookingNumber,
        customer_id: customerId,
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone,
        customer_email: payload.customerEmail,
        customer_dob: payload.customerDob,
        device_subtotal: deviceSubtotal,
        food_subtotal: 0,
        subscription_discount: subscriptionDiscount,
        happy_hour_discount: happyHourDiscount,
        total_amount: totalAmount,
        status: "confirmed",
        checked_in_at: null,
        payment_status: "pending",
        booking_source: "walk-in",
        lock_expires_at: null
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // Step 4: Claim a station and write the slot
    // Station selection and the insert happen inside one locked transaction,
    // the same path a customer booking takes. Picking the station here instead
    // meant an exact-start-time check, which cannot see a 10:00-12:00 booking
    // when asked about 11:00-12:00 and so hands out a station already in use.
    const { data: assignment, error: slotError } = await supabaseAdmin.rpc(
      "assign_device_slot",
      {
        p_booking_id: booking.id,
        p_device_type_id: payload.deviceTypeId,
        p_slot_date: payload.selectedDate,
        p_slot_start_time: startTime,
        p_slot_end_time: endTime,
        p_duration_hours: payload.durationHours,
        p_hourly_rate: payload.hourlyRate,
        p_slot_total: payload.subtotal,
        p_device_type: payload.deviceTypeName,
        p_player_count: payload.playerCount,
        p_included_players: payload.includedPlayers,
        p_extra_player_charge: payload.extraPlayerCharge,
        p_extra_players_total: extraPlayersTotal
      }
    );

    if (slotError) {
      // Rollback booking if slot creation fails
      await supabaseAdmin.from("bookings").delete().eq("id", booking.id);
      throw slotError;
    }

    // Zero rows back means every station of this type is busy for the window
    if (!assignment || (assignment as any[]).length === 0) {
      await supabaseAdmin.from("bookings").delete().eq("id", booking.id);
      return {
        success: false,
        error: "No station of this type is free for the selected time. Pick another time or device."
      };
    }

    // Step 5: Create booking line items for audit trail & receipt presentation
    const lineItems: any[] = [];
    let displayOrder = 1;

    // 6.1: Device charge line item
    lineItems.push({
      booking_id: booking.id,
      item_type: 'device',
      description: `Device Booking (${payload.durationHours}h × ₹${payload.hourlyRate})`,
      quantity: payload.durationHours,
      unit_price: payload.hourlyRate,
      line_total: deviceCharges,
      added_by: 'admin',
      is_paid: false, // Walk-in starts as pending payment
      display_order: displayOrder++
    });

    // 6.2: Extra players line item (if applicable)
    if (extraPlayersCount > 0) {
      lineItems.push({
        booking_id: booking.id,
        item_type: 'extra_players',
        description: `Extra Players (${extraPlayersCount} × ₹${perExtraPlayerCharge(
          payload.extraPlayerCharge,
          payload.durationHours
        )})`,
        quantity: extraPlayersCount,
        unit_price: perExtraPlayerCharge(payload.extraPlayerCharge, payload.durationHours),
        line_total: extraPlayersTotal,
        added_by: 'admin',
        is_paid: false,
        display_order: displayOrder++
      });
    }

    // 6.3: Subscription discount line item (if applicable)
    if (subscriptionDiscount > 0) {
      lineItems.push({
        booking_id: booking.id,
        item_type: 'subscription_discount',
        description: 'Subscription Discount',
        quantity: 1,
        unit_price: -subscriptionDiscount,
        line_total: -subscriptionDiscount,
        added_by: 'admin',
        is_paid: false,
        display_order: displayOrder++
      });
    }

    // 6.4: Happy Hour discount line item (if applicable)
    if (happyHourDiscount > 0) {
      lineItems.push({
        booking_id: booking.id,
        item_type: 'happy_hour_discount',
        description: 'Happy Hour Discount',
        quantity: 1,
        unit_price: -happyHourDiscount,
        line_total: -happyHourDiscount,
        reference_type: payload.happyHourRuleId ? 'happy_hour' : null,
        reference_id: payload.happyHourRuleId || null,
        added_by: 'admin',
        is_paid: false,
        display_order: displayOrder++
      });
    }

    const { error: lineItemsError } = await supabaseAdmin
      .from("booking_line_items")
      .insert(lineItems);

    if (lineItemsError) {
      // Rollback booking and slots if line items insertion fails
      await supabaseAdmin.from("booking_device_slots").delete().eq("booking_id", booking.id);
      await supabaseAdmin.from("bookings").delete().eq("id", booking.id);
      throw lineItemsError;
    }

    return { success: true, bookingId: booking.id, bookingNumber, checkedIn: false };
  } catch (err: any) {
    console.error("Create walk-in booking error:", err);
    return { success: false, error: err.message };
  }
}

// ================================================
// WALK-IN SESSIONS (billed on actual playing time)
// ================================================

/**
 * The customer behind a phone number, for the walk-in desk.
 *
 * The desk used to call the customer-facing `checkCustomerExists`, which now
 * sits behind `requireVerifiedPhone` - proof that *this browser* owns the
 * number, established by an OTP the customer types on their own phone. Staff
 * have no such proof for somebody standing at the counter, so that call came
 * back `exists: false` for everyone and every returning customer was greeted as
 * new and asked to register again.
 *
 * The booking itself was never filed wrong: `get_or_create_customer` matches on
 * phone, so the row landed against the existing customer regardless. That is
 * exactly why this was easy to miss - the same customer kept accumulating
 * bookings correctly while being told, every visit, that they were new.
 *
 * Staff authorisation is the right gate for a counter lookup, so this asks for
 * that instead of for the customer's OTP.
 */
export async function lookupWalkInCustomer(phone: string) {
  await requireStaff();

  try {
    // Customers are stored as the bare ten digits, so a pasted "+91 " or spaced
    // number would otherwise miss somebody plainly standing there.
    const normalised = String(phone || "").replace(/\D/g, "").slice(-10);

    if (normalised.length !== 10) {
      return {
        success: false,
        error: "Enter a valid 10-digit mobile number.",
        exists: false,
        customer: null,
        subscription: null
      };
    }

    const { data: customer, error } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone, email, date_of_birth, active_subscription_id")
      .eq("phone", normalised)
      .maybeSingle();

    if (error) throw error;

    if (!customer) {
      return { success: true, exists: false, customer: null, subscription: null };
    }

    // Same shape the walk-in screens already read off `checkCustomerExists`, so
    // they can swap to this without changing how they render a membership.
    let subscription = null;

    if (customer.active_subscription_id) {
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("id, end_date, subscription_plan:subscription_plans(id, name, discount_percentage)")
        .eq("id", customer.active_subscription_id)
        .eq("status", "active")
        .gte("end_date", arenaToday())
        .maybeSingle();

      const plan = (sub as any)?.subscription_plan;

      if (sub && plan) {
        subscription = {
          id: sub.id,
          plan_id: plan.id,
          plan_name: plan.name,
          discount_percentage: Number(plan.discount_percentage || 0),
          end_date: sub.end_date
        };
      }
    }

    return { success: true, exists: true, customer, subscription };
  } catch (err: any) {
    console.error("Walk-in customer lookup error:", err);
    return {
      success: false,
      error: err.message,
      exists: false,
      customer: null,
      subscription: null
    };
  }
}

export interface WalkInDeviceAvailability {
  /** Stations of this type on the floor and not in maintenance. */
  total: number;
  /** Free for a session starting now, by the same rule check-in will apply. */
  free: number;
  /** Who is sitting at the busy ones, so the warning can name them. */
  inUse: Array<{
    stationNumber: string | null;
    customerName: string | null;
    bookingNumber: string | null;
    since: string | null;
  }>;
}

/**
 * Whether this device type has a station free right now.
 *
 * Creating a walk-in deliberately does not reserve anything (see
 * `createWalkInSession`), so this cannot and does not block the booking - a
 * customer can perfectly well be booked in to wait for a station. What it does
 * is let the desk say so at the counter instead of discovering it at check-in,
 * with the customer already sitting there expecting to play.
 *
 * Counted by `countAvailableDevicesForRange`, which is the read-only mirror of
 * the `assign_device_slot` claim that check-in actually runs - so the warning
 * agrees with what will happen rather than approximating it. The window is the
 * same provisional block check-in would ask for, which means a station booked in
 * advance for later this evening is correctly counted as not free.
 */
export async function getWalkInDeviceAvailability(deviceTypeId: string): Promise<{
  success: boolean;
  error?: string;
  availability: WalkInDeviceAvailability | null;
}> {
  await requireStaff();

  try {
    if (!deviceTypeId) {
      return { success: false, error: "No device type given.", availability: null };
    }

    const now = new Date();
    const slotDate = toSlotDate(now);
    const startMinutes = timeToMinutes(toClockTime(now));

    const free = await countAvailableDevicesForRange(deviceTypeId, slotDate, {
      start: startMinutes,
      end: startMinutes + PROVISIONAL_SESSION_HOURS * 60
    });

    const { data: devices, error: devicesError } = await supabaseAdmin
      .from("devices")
      .select("id, station_number")
      .eq("device_type_id", deviceTypeId)
      .eq("status", "available");

    if (devicesError) throw devicesError;

    const stations = (devices || []) as Array<{ id: string; station_number: string | null }>;
    const occupancy = await getOccupancyByDevice();

    const inUse: WalkInDeviceAvailability["inUse"] = [];

    for (const station of stations) {
      const live = occupancy.get(station.id);
      if (!live) continue;

      inUse.push({
        stationNumber: station.station_number ?? null,
        customerName: live.customerName,
        bookingNumber: live.bookingNumber,
        since: live.since
      });
    }

    return {
      success: true,
      availability: { total: stations.length, free, inUse }
    };
  } catch (err: any) {
    console.error("Walk-in availability error:", err);
    // The desk should not be blocked from booking because this read failed, so
    // the caller treats a failure as "unknown" and lets the booking through.
    return { success: false, error: err.message, availability: null };
  }
}

/**
 * Books a customer in at the counter without starting their clock.
 *
 * Nothing about the session is decided here: no start time, no duration, no
 * station and no money. The row exists to say somebody is waiting, which is why
 * it goes in as `confirmed` with `checked_in_at` null - the dashboard counts
 * `checked_in` as an active session, so a customer who has not sat down yet must
 * not be in that state.
 *
 * A station is deliberately not reserved. The machine is allocated when the
 * customer actually arrives, so a walk-in that is created and never turns up
 * costs the floor nothing. The trade-off is that creating the booking does not
 * guarantee a station: if the floor fills up before they arrive, check-in is what
 * fails, and it says so.
 */
export async function createWalkInSession(payload: {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerDob: string;
  deviceTypeId: string;
  deviceTypeName: string;
  playerCount: number;
  /**
   * 24-hour `HH:MM` the customer started playing, for a walk-in that was already
   * under way before the desk typed it in. Null - the ordinary case - creates the
   * booking waiting for check-in, with no time and no station, as before.
   */
  startedClock?: string | null;
}) {
  await requireStaff();

  // Read before anything is written. A time the desk has to go back and correct
  // should not leave an empty booking behind for somebody to cancel.
  if (payload.startedClock) {
    const resolved = resolveBackdatedStart(payload.startedClock);
    if (!resolved.ok) return { success: false, error: resolved.error };
  }

  try {
    const { data: customerId, error: customerError } = await supabaseAdmin
      .rpc("get_or_create_customer", {
        p_phone: payload.customerPhone,
        p_name: payload.customerName,
        p_email: payload.customerEmail || null,
        p_dob: payload.customerDob
      });

    if (customerError) throw customerError;

    const { data: bookingNumber, error: bookingNumberError } = await supabaseAdmin
      .rpc("generate_booking_number");

    if (bookingNumberError) throw bookingNumberError;

    // Everything priced is left at zero: the bill is worked out at checkout from
    // the time actually played, and a number written here would only be a guess
    // that some screen might show as though it meant something.
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        booking_number: bookingNumber,
        customer_id: customerId,
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone,
        customer_email: payload.customerEmail,
        customer_dob: payload.customerDob,
        device_subtotal: 0,
        food_subtotal: 0,
        subscription_discount: 0,
        happy_hour_discount: 0,
        total_amount: 0,
        status: "confirmed",
        checked_in_at: null,
        payment_status: "pending",
        booking_source: "walk-in",
        billed_on_actual_time: true,
        walk_in_device_type_id: payload.deviceTypeId,
        walk_in_device_type_name: payload.deviceTypeName,
        walk_in_player_count: payload.playerCount,
        lock_expires_at: null
      })
      .select("id, booking_number")
      .single();

    if (bookingError) throw bookingError;

    /**
     * A start time was given, so this customer is already playing - check them in
     * here rather than leaving a session that is running on the floor and waiting
     * on the screen.
     *
     * A refused check-in is not a refused booking. The row that exists is exactly
     * the waiting walk-in this form would have made anyway, so the desk is told
     * what went wrong - almost always that no station of that type is free - and
     * can press Check In from the list once one is. Throwing here would lose the
     * customer's details over a full floor.
     */
    let checkedIn = false;
    let checkInError: string | null = null;
    let stationNumber: string | null = null;
    let checkedInAt: string | null = null;

    if (payload.startedClock) {
      const checkIn = await checkInWalkInSession(booking.id, payload.startedClock);
      if (checkIn.success) {
        checkedIn = true;
        stationNumber = checkIn.stationNumber ?? null;
        checkedInAt = checkIn.checkedInAt ?? null;
      } else {
        checkInError = checkIn.error ?? null;
      }
    }

    return {
      success: true,
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      checkedIn,
      checkedInAt,
      stationNumber,
      checkInError
    };
  } catch (err: any) {
    console.error("Create walk-in session error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * The customer has arrived: claim a station and start the clock.
 *
 * Both halves happen inside `checkin_walkin_session`, so the timestamp comes from
 * the database rather than from whichever machine the front desk is standing at,
 * and two people pressing the button at once cannot start two sessions. Zero rows
 * back means either the booking was not waiting or the floor is full; the two are
 * told apart afterwards so the message says which.
 *
 * `startedClock` is the exception to the database clock, and the only one: a
 * customer who has been playing since before the desk got round to typing them
 * in. Given, the session is billed from that reading instead of from now. The
 * reading is still resolved to an instant down in SQL - what is checked here is
 * only that it is a time of day within reach, so the desk gets a sentence back
 * rather than a Postgres exception.
 */
export async function checkInWalkInSession(
  bookingId: string,
  /** 24-hour `HH:MM` play actually started at. Omitted or null means now. */
  startedClock?: string | null
) {
  await requireStaff();

  let startedFrom: string | null = null;
  if (startedClock) {
    const resolved = resolveBackdatedStart(startedClock);
    if (!resolved.ok) return { success: false, error: resolved.error };
    startedFrom = resolved.start.clock;
  }

  try {
    const { data: booking, error: readError } = await supabaseAdmin
      .from("bookings")
      .select(
        `status, checked_in_at, billed_on_actual_time,
         walk_in_device_type_id, walk_in_device_type_name, walk_in_player_count`
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (readError) throw readError;
    if (!booking) return { success: false, error: "Booking not found." };
    if (!booking.billed_on_actual_time) {
      return { success: false, error: "This booking is not an open-ended walk-in session." };
    }
    if (booking.status === "checked_in") {
      return { success: false, error: "This customer is already checked in." };
    }
    if (booking.status !== "confirmed") {
      return {
        success: false,
        error: `A ${String(booking.status).replace(/_/g, " ")} booking cannot be checked in.`
      };
    }

    const { data: deviceType, error: deviceTypeError } = await supabaseAdmin
      .from("device_types")
      .select("id, display_name, name, regular_hourly_rate, included_players, extra_player_charge")
      .eq("id", booking.walk_in_device_type_id)
      .maybeSingle();

    if (deviceTypeError) throw deviceTypeError;
    if (!deviceType) return { success: false, error: "That device type no longer exists." };

    const { data, error } = await supabaseAdmin.rpc("checkin_walkin_session", {
      p_booking_id: bookingId,
      p_device_type_id: deviceType.id,
      p_device_type: booking.walk_in_device_type_name || deviceType.display_name,
      p_hourly_rate: Number(deviceType.regular_hourly_rate || 0),
      p_player_count: booking.walk_in_player_count || 1,
      p_included_players: Number(deviceType.included_players || 1),
      p_extra_player_charge: Number(deviceType.extra_player_charge || 0),
      p_provisional_hours: PROVISIONAL_SESSION_HOURS,
      p_started_clock: startedFrom,
      p_max_backdate_hours: MAX_BACKDATED_START_HOURS
    });

    if (error) throw error;

    const started = (data as Array<{
      started_at: string;
      device_id: string;
      station_number: string;
    }>) || [];

    if (started.length === 0) {
      return {
        success: false,
        error:
          `Every ${booking.walk_in_device_type_name || "station"} is in use right now. ` +
          `Free one up or move this customer to another device type.`
      };
    }

    return {
      success: true,
      checkedInAt: started[0].started_at,
      stationNumber: started[0].station_number
    };
  } catch (err: any) {
    console.error("Check-in walk-in session error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * The customer is leaving: stop the clock and work out what they owe.
 *
 * The two timestamps come back from `checkout_walkin_session`, which is also what
 * refuses a session that never started or has already ended. Everything after
 * that is bookkeeping against those two numbers: the slot row is rewritten from
 * the placeholder window claimed at check-in to the window actually played, and
 * the price is computed with the same helpers the customer flow uses, so an hour
 * costs the same whoever booked it.
 */
export async function checkOutWalkInSession(bookingId: string) {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin.rpc("checkout_walkin_session", {
      p_booking_id: bookingId
    });

    if (error) throw error;

    const ended = (data as Array<{
      started_at: string;
      ended_at: string;
      played_minutes: number;
    }>) || [];

    if (ended.length === 0) {
      // The RPC refuses anything that is not a session in progress; say which.
      const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("status, billed_on_actual_time")
        .eq("id", bookingId)
        .maybeSingle();

      if (!booking) return { success: false, error: "Booking not found." };
      if (!booking.billed_on_actual_time) {
        return { success: false, error: "This booking is not an open-ended walk-in session." };
      }
      if (booking.status === "confirmed") {
        return {
          success: false,
          error: "This customer has not checked in yet, so there is no session to close."
        };
      }
      if (booking.status === "completed") {
        return { success: false, error: "This session has already been checked out." };
      }
      return {
        success: false,
        error: `A ${String(booking.status).replace(/_/g, " ")} booking cannot be checked out.`
      };
    }

    const session = ended[0];
    const startedAt = new Date(session.started_at);
    const endedAt = new Date(session.ended_at);

    const { data: slot, error: slotError } = await supabaseAdmin
      .from("booking_device_slots")
      .select("id, hourly_rate, player_count, included_players, extra_player_charge")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (slotError) throw slotError;
    if (!slot) {
      return {
        success: false,
        error: "This session has no station on it, so it cannot be priced. Contact support."
      };
    }

    const pricing = priceSession({
      playedMinutes: session.played_minutes,
      hourlyRate: Number(slot.hourly_rate || 0),
      playerCount: Number(slot.player_count || 1),
      includedPlayers: Number(slot.included_players || 1),
      extraPlayerCharge: Number(slot.extra_player_charge || 0)
    });

    // The window actually played replaces the placeholder claimed at check-in, so
    // availability, the timeline and the utilisation reports all describe the
    // session that happened rather than the one that was provisionally held.
    const { error: slotUpdateError } = await supabaseAdmin
      .from("booking_device_slots")
      .update({
        slot_date: toSlotDate(startedAt),
        slot_start_time: toClockTime(startedAt),
        slot_end_time: toClockTime(endedAt),
        duration_hours: pricing.durationHours,
        slot_total: pricing.deviceCharges,
        extra_players_total: pricing.extraPlayersTotal
      })
      .eq("id", slot.id);

    if (slotUpdateError) throw slotUpdateError;

    // Food already on the booking stays; only the device side is priced here.
    const { data: current, error: currentError } = await supabaseAdmin
      .from("bookings")
      .select(
        "customer_phone, food_subtotal, promo_discount, walk_in_device_type_id, walk_in_device_type_name"
      )
      .eq("id", bookingId)
      .single();

    if (currentError) throw currentError;

    // Happy hour rules name devices either way round, so the matcher is given the
    // display name and the internal one - the same pair the online quote passes.
    const { data: sessionDeviceType } = await supabaseAdmin
      .from("device_types")
      .select("name, display_name")
      .eq("id", current.walk_in_device_type_id)
      .maybeSingle();

    // Both discounts are resolved now, against the hours actually played, using
    // the same helpers the online quote uses. Neither could be worked out when the
    // walk-in was created: there was no amount to take a percentage of, and no
    // window to test against a happy hour.
    const discountable = pricing.deviceSubtotal;

    const membership = await resolveActiveMembership(current.customer_phone || "");
    const subscriptionDiscount = calculateMembershipDiscount(
      discountable,
      membership.discountPercentage
    );

    // Matched on the real window. `isSlotWithinTimeRange` is strict - the whole
    // session has to sit inside the rule's hours - so a customer who plays past
    // the end of a happy hour loses it, exactly as an online booking of those same
    // hours would have.
    const happyHour = await resolveHappyHour(
      sessionDeviceType?.display_name || current.walk_in_device_type_name || "",
      sessionDeviceType?.name || current.walk_in_device_type_name || "",
      startedAt,
      formatDbTime(toClockTime(startedAt)),
      formatDbTime(toClockTime(endedAt)),
      discountable
    );

    const foodSubtotal = Number(current.food_subtotal || 0);
    const promoDiscount = Number(current.promo_discount || 0);

    // Discounts can never exceed the charges they apply to - the same cap the
    // online quote applies, and the reason a stacked pair cannot make play free.
    const totalDiscount = Math.min(
      roundToTwo(subscriptionDiscount + happyHour.discount + promoDiscount),
      discountable
    );

    const totalAmount = Math.max(
      0,
      roundToTwo(pricing.deviceSubtotal + foodSubtotal - totalDiscount)
    );

    const { error: bookingUpdateError } = await supabaseAdmin
      .from("bookings")
      .update({
        device_subtotal: pricing.deviceSubtotal,
        subscription_discount: subscriptionDiscount,
        happy_hour_discount: happyHour.discount,
        total_amount: totalAmount,
        updated_at: new Date().toISOString()
      })
      .eq("id", bookingId);

    if (bookingUpdateError) throw bookingUpdateError;

    await rewriteSessionLineItems(bookingId, pricing, Number(slot.hourly_rate || 0), {
      subscriptionDiscount,
      subscriptionPercentage: membership.discountPercentage,
      happyHour
    });

    return {
      success: true,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      playedMinutes: pricing.playedMinutes,
      durationLabel: formatPlayedDuration(pricing.playedMinutes),
      deviceSubtotal: pricing.deviceSubtotal,
      subscriptionDiscount,
      happyHourDiscount: happyHour.discount,
      happyHourRuleName: happyHour.ruleName,
      totalAmount
    };
  } catch (err: any) {
    console.error("Check-out walk-in session error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Replaces the device and discount lines on a session with ones describing what
 * was actually played and what it earned.
 *
 * Food added during the session is left alone: it is billed at menu price and has
 * nothing to do with how long the customer sat at the machine.
 */
async function rewriteSessionLineItems(
  bookingId: string,
  pricing: ReturnType<typeof priceSession>,
  hourlyRate: number,
  discounts: {
    subscriptionDiscount: number;
    subscriptionPercentage: number;
    happyHour: { ruleId: string | null; ruleName: string | null; discount: number };
  }
) {
  await supabaseAdmin
    .from("booking_line_items")
    .delete()
    .eq("booking_id", bookingId)
    .in("item_type", ["device", "extra_players", "subscription_discount", "happy_hour_discount"]);

  const lineItems: any[] = [
    {
      booking_id: bookingId,
      item_type: "device",
      description: `Actual Play (${formatPlayedDuration(pricing.playedMinutes)} × ₹${hourlyRate}/hr)`,
      quantity: pricing.durationHours,
      unit_price: hourlyRate,
      line_total: pricing.deviceCharges,
      added_by: "admin",
      is_paid: false,
      display_order: 1
    }
  ];

  if (pricing.extraPlayersCount > 0) {
    lineItems.push({
      booking_id: bookingId,
      item_type: "extra_players",
      description: `Extra Players (${pricing.extraPlayersCount} × ₹${pricing.perExtraPlayer})`,
      quantity: pricing.extraPlayersCount,
      unit_price: pricing.perExtraPlayer,
      line_total: pricing.extraPlayersTotal,
      added_by: "admin",
      is_paid: false,
      display_order: 2
    });
  }

  if (discounts.subscriptionDiscount > 0) {
    lineItems.push({
      booking_id: bookingId,
      item_type: "subscription_discount",
      description: `Subscription Discount (${discounts.subscriptionPercentage}%)`,
      quantity: 1,
      unit_price: -discounts.subscriptionDiscount,
      line_total: -discounts.subscriptionDiscount,
      added_by: "admin",
      is_paid: false,
      display_order: 3
    });
  }

  if (discounts.happyHour.discount > 0) {
    lineItems.push({
      booking_id: bookingId,
      item_type: "happy_hour_discount",
      description: discounts.happyHour.ruleName
        ? `Happy Hour Discount (${discounts.happyHour.ruleName})`
        : "Happy Hour Discount",
      quantity: 1,
      unit_price: -discounts.happyHour.discount,
      line_total: -discounts.happyHour.discount,
      reference_type: discounts.happyHour.ruleId ? "happy_hour" : null,
      reference_id: discounts.happyHour.ruleId,
      added_by: "admin",
      is_paid: false,
      display_order: 4
    });
  }

  const { error } = await supabaseAdmin.from("booking_line_items").insert(lineItems);
  if (error) console.error("Failed to rewrite session line items:", error);
}

/**
 * Update player count for a booking slot
 */
export async function updatePlayerCount(slotId: string, newPlayerCount: number, maxPlayers: number) {
  await requireStaff();

  try {
    // Validate player count
    if (newPlayerCount < 1) {
      return { success: false, error: "Player count must be at least 1" };
    }

    if (newPlayerCount > maxPlayers) {
      return { success: false, error: `Player count cannot exceed ${maxPlayers}` };
    }

    // Get current slot details and booking info
    const { data: slot, error: slotError } = await supabaseAdmin
      .from("booking_device_slots")
      .select("*, bookings!inner(id, device_subtotal, food_subtotal, subscription_discount, promo_discount, happy_hour_discount, billed_on_actual_time, completed_at)")
      .eq("id", slotId)
      .single();

    if (slotError || !slot) throw slotError || new Error("Slot not found");

    /**
     * A session in progress has no bill to adjust.
     *
     * Its `duration_hours` is the provisional block claimed at check-in, not
     * anything the customer has played, so pricing extra players against it would
     * write a total nobody owes - and checkout recomputes the whole bill from the
     * real duration anyway. Record who is playing and leave the money alone.
     */
    const isLiveSession =
      slot.bookings.billed_on_actual_time === true && !slot.bookings.completed_at;

    if (isLiveSession) {
      const { error: playerCountError } = await supabaseAdmin
        .from("booking_device_slots")
        .update({ player_count: newPlayerCount })
        .eq("id", slotId);

      if (playerCountError) throw playerCountError;

      return {
        success: true,
        message: `Player count updated to ${newPlayerCount}. The bill is calculated at checkout.`,
        newPlayerCount,
        difference: 0
      };
    }

    const includedPlayers = slot.included_players || 1;
    const extraPlayerCharge = slot.extra_player_charge || 0;
    const durationHours = slot.duration_hours || 1;
    const oldPlayerCount = slot.player_count || includedPlayers;

    // Each player's share is rounded before they are added up, so adding a player
    // at the counter costs the same as the one before it.
    const newExtraPlayers = Math.max(0, newPlayerCount - includedPlayers);
    const newExtraPlayersTotal = extraPlayersCharge(newExtraPlayers, extraPlayerCharge, durationHours);

    const oldExtraPlayers = Math.max(0, oldPlayerCount - includedPlayers);
    const oldExtraPlayersTotal = extraPlayersCharge(oldExtraPlayers, extraPlayerCharge, durationHours);

    // Calculate difference in total
    const difference = newExtraPlayersTotal - oldExtraPlayersTotal;

    // Update slot
    const { error: updateSlotError } = await supabaseAdmin
      .from("booking_device_slots")
      .update({
        player_count: newPlayerCount,
        extra_players_total: newExtraPlayersTotal
      })
      .eq("id", slotId);

    if (updateSlotError) throw updateSlotError;

    // Recalculate booking amounts properly
    const newDeviceSubtotal = Number(slot.bookings.device_subtotal) + difference;
    const foodSubtotal = Number(slot.bookings.food_subtotal || 0);
    const subscriptionDiscount = Number(slot.bookings.subscription_discount || 0);
    const promoDiscount = Number(slot.bookings.promo_discount || 0);
    const happyHourDiscount = Number(slot.bookings.happy_hour_discount || 0);

    // Recalculate total: (device + food) - all discounts
    const newTotalAmount = newDeviceSubtotal + foodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount;

    const { error: updateBookingError } = await supabaseAdmin
      .from("bookings")
      .update({
        device_subtotal: newDeviceSubtotal,
        total_amount: newTotalAmount,
        updated_at: new Date().toISOString()
      })
      .eq("id", slot.bookings.id);

    if (updateBookingError) throw updateBookingError;

    return {
      success: true,
      message: `Player count updated to ${newPlayerCount}`,
      newTotal: newTotalAmount
    };
  } catch (err: any) {
    console.error("Update player count error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Get bookings for timeline view - specific date
 */
export async function getTimelineBookings(date: string): Promise<{ success: boolean; bookings: TimelineBooking[]; error?: string }> {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin
      .from("booking_device_slots")
      .select(`
        id,
        device_id,
        slot_date,
        slot_start_time,
        slot_end_time,
        device_type,
        device_station_number,
        bookings!inner(
          id,
          booking_number,
          customer_name,
          customer_phone,
          status,
          total_amount
        )
      `)
      .eq("slot_date", date)
      .in("bookings.status", ["confirmed", "checked_in", "completed", "locked"])
      .order("slot_start_time", { ascending: true });

    if (error) throw error;

    const timelineBookings: TimelineBooking[] = (data || []).map((slot: any) => ({
      id: slot.bookings.id,
      booking_number: slot.bookings.booking_number,
      customer_name: slot.bookings.customer_name,
      customer_phone: slot.bookings.customer_phone,
      device_type: slot.device_type,
      device_station_number: slot.device_station_number,
      device_id: slot.device_id,
      slot_start_time: slot.slot_start_time,
      slot_end_time: slot.slot_end_time,
      slot_date: slot.slot_date,
      status: slot.bookings.status,
      total_amount: slot.bookings.total_amount
    }));

    return { success: true, bookings: timelineBookings };
  } catch (err: any) {
    console.error("Get timeline bookings error:", err);
    return { success: false, error: err.message, bookings: [] };
  }
}

/** The billing dialog's checkout. Same completion, so the same rules apply. */
export async function closeBooking(bookingId: string) {
  await requireStaff();

  try {
    const allowed = await resolveCheckoutStatus(bookingId);
    if (!allowed.ok) return { success: false, error: allowed.error };

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now
      })
      .eq("id", bookingId)
      .eq("status", allowed.from)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { success: false, error: "This booking changed while you were working on it. Refresh and try again." };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Close booking error:", err);
    return { success: false, error: err.message };
  }
}

export async function getBookingBillingDetails(bookingId: string) {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(`
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
        payment_status,
        status,
        completed_at,
        billed_on_actual_time,
        booking_device_slots(
          id,
          duration_hours,
          hourly_rate,
          player_count,
          included_players,
          extra_player_charge,
          extra_players_total
        ),
        booking_food_items(
          id,
          item_name,
          quantity,
          unit_price,
          line_total
        )
      `)
      .eq("id", bookingId)
      .single();

    if (error) throw error;

    // Fetch line items to check what's unpaid
    const { data: lineItems, error: lineItemsError } = await supabaseAdmin
      .from("booking_line_items")
      .select("*")
      .eq("booking_id", bookingId)
      .order("display_order", { ascending: true });

    if (lineItemsError) throw lineItemsError;

    // Calculate correct total_amount (don't trust stored value)
    const deviceSubtotal = Number(data.device_subtotal || 0);
    const foodSubtotal = Number(data.food_subtotal || 0);
    const subscriptionDiscount = Number(data.subscription_discount || 0);
    const promoDiscount = Number(data.promo_discount || 0);
    const happyHourDiscount = Number(data.happy_hour_discount || 0);
    const amountPaid = Number(data.amount_paid || 0);

    const correctTotal = deviceSubtotal + foodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount;

    // Calculate unpaid amount
    const unpaidItems = lineItems?.filter((item: any) => !item.is_paid) || [];
    const unpaidAmount = roundToTwo(
      unpaidItems.reduce((sum: number, item: any) => sum + Number(item.line_total), 0)
    );
    const balanceDue = roundToTwo(correctTotal - amountPaid);

    return {
      success: true,
      booking: {
        ...data,
        total_amount: correctTotal, // Override with calculated value
        line_items: lineItems,
        unpaid_items: unpaidItems,
        unpaid_amount: unpaidAmount,
        balance_due: balanceDue,
        payment_status: derivePaymentStatus(
          correctTotal,
          amountPaid,
          data.payment_status,
          data.billed_on_actual_time === true && !data.completed_at
        )
      }
    };
  } catch (err: any) {
    console.error("Get billing details error:", err);
    return { success: false, error: err.message, booking: null };
  }
}

// ============================================
// MARK PAYMENT AS PAID
// ============================================

export async function markBookingAsPaid(
  bookingId: string,
  paymentSplit: {
    cashAmount: number;
    cardAmount: number;
    upiAmount: number;
  }
) {
  await requireStaff();

  try {
    // Get booking details including current payment status
    const { data: booking, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select(
        "total_amount, amount_paid, cash_amount, card_amount, upi_amount, online_amount, booking_number, billed_on_actual_time, completed_at"
      )
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) throw new Error("Booking not found");

    // A session in progress has a total of zero because the bill has not been
    // worked out yet. Settling it would take a zero payment and stamp the row
    // `paid` - and the reports read that column directly, so the session would be
    // counted as a completed sale for nothing. The bill exists after checkout.
    if (booking.billed_on_actual_time && !booking.completed_at) {
      return {
        success: false,
        error: "This session is still in progress. Check the customer out first so the bill can be calculated."
      };
    }

    // Calculate balance due
    const currentAmountPaid = Number(booking.amount_paid || 0);
    const balanceDue = roundToTwo(Number(booking.total_amount) - currentAmountPaid);

    // Validate that split amounts equal balance due (not total, since there might be partial payment)
    const totalSplit = paymentSplit.cashAmount + paymentSplit.cardAmount + paymentSplit.upiAmount;
    if (Math.abs(totalSplit - balanceDue) > 0.01) {
      throw new Error(`Payment split (₹${totalSplit}) does not match balance due (₹${balanceDue})`);
    }

    // Add the new payment to existing split amounts.
    // online_amount is carried through untouched: a customer who part-paid via
    // Razorpay and settles the rest at the counter must keep that record, and
    // check_payment_split asserts cash + card + upi + online = amount_paid.
    const newCashAmount = Number(booking.cash_amount || 0) + paymentSplit.cashAmount;
    const newCardAmount = Number(booking.card_amount || 0) + paymentSplit.cardAmount;
    const newUpiAmount = Number(booking.upi_amount || 0) + paymentSplit.upiAmount;
    const onlineAmount = Number(booking.online_amount || 0);
    const newAmountPaid = currentAmountPaid + totalSplit;

    // Determine if fully paid or still partial
    const newPaymentStatus = Math.abs(newAmountPaid - booking.total_amount) < 0.01 ? "paid" : "partial";

    // Update booking payment status with accumulated split amounts
    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: newPaymentStatus,
        amount_paid: newAmountPaid,
        cash_amount: newCashAmount,
        card_amount: newCardAmount,
        upi_amount: newUpiAmount,
        online_amount: onlineAmount,
        // payment_method will be set automatically by trigger
      })
      .eq("id", bookingId);

    if (updateError) throw updateError;

    // Mark all line items as paid
    const { error: lineItemsError } = await supabaseAdmin
      .from("booking_line_items")
      .update({ is_paid: true })
      .eq("booking_id", bookingId);

    if (lineItemsError) {
      console.error("Failed to update line items:", lineItemsError);
      throw new Error("Failed to update line items payment status");
    }

    // Update food items status from 'pending' to 'preparing' since they're now paid
    // This allows kitchen staff to start preparing paid orders
    const { error: foodItemsError } = await supabaseAdmin
      .from("booking_food_items")
      .update({ status: "preparing" })
      .eq("booking_id", bookingId)
      .eq("status", "pending"); // Only update pending items (not already preparing/ready/served)

    if (foodItemsError) {
      console.error("Failed to update food items status:", foodItemsError);
      // Don't throw - food status is non-critical, payment is already marked
      // This allows the transaction to succeed even if food status update fails
    }

    return {
      success: true,
      message: `Booking ${booking.booking_number} marked as paid`,
    };
  } catch (error: any) {
    console.error("Error marking booking as paid:", error);
    return { success: false, error: error.message };
  }
}

// ============================================
// FOOD-ONLY WALK-IN BOOKING
// ============================================

export async function createFoodOnlyWalkInBooking(payload: {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerDob: string | null;
  customerId: string | null;
  foodItems: { menuItemId: string; quantity: number; notes: string }[];
  totalAmount: number;
}) {
  await requireStaff();

  try {
    // Step 1: Get or create customer
    let customerId = payload.customerId;

    if (!customerId) {
      const { data: newCustomerId, error: customerError } = await supabaseAdmin
        .rpc("get_or_create_customer", {
          p_phone: payload.customerPhone,
          p_name: payload.customerName,
          p_email: payload.customerEmail || null,
          p_dob: payload.customerDob
        });

      if (customerError) throw customerError;
      customerId = newCustomerId;
    }

    // Step 2: Generate booking number
    const bookingNumber = `BP-${arenaToday().replace(/-/g, "")}-${Date.now().toString().slice(-3)}`;

    // Step 3: Create booking record (food-only, no device)
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .insert({
        booking_number: bookingNumber,
        customer_id: customerId,
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone,
        customer_email: payload.customerEmail,
        booking_source: "walk-in",
        device_subtotal: 0, // No device booking
        food_subtotal: payload.totalAmount,
        subscription_discount: 0,
        promo_discount: 0,
        happy_hour_discount: 0,
        total_amount: payload.totalAmount,
        /**
         * Raised unpaid, like every other order.
         *
         * This used to assume a walk-in "pays immediately" and stamp the whole
         * total as cash received the instant the order was typed in. Nothing had
         * been collected at that point - the counter takes the money when the
         * food is handed over - so the order showed as settled before anyone paid,
         * the desk had no outstanding balance to work from, and the revenue
         * report's cash figure counted takings the till had never seen.
         *
         * Staff settle it through the same payment flow as any booking, which is
         * also what records how it was actually paid rather than guessing cash.
         */
        amount_paid: 0,
        cash_amount: 0,
        card_amount: 0,
        upi_amount: 0,
        payment_status: "pending",
        status: "confirmed"
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // Step 4: Get menu item details and create food items
    const { data: menuItems, error: menuError } = await supabaseAdmin
      .from("menu_items")
      .select("*")
      .in("id", payload.foodItems.map(item => item.menuItemId));

    if (menuError) throw menuError;

    const foodItemsToInsert = payload.foodItems.map(item => {
      const menuItem = menuItems?.find((mi: any) => mi.id === item.menuItemId);
      return {
        booking_id: booking.id,
        menu_item_id: item.menuItemId,
        item_name: menuItem?.name || "Unknown",
        item_category: menuItem?.category || "Other",
        quantity: item.quantity,
        unit_price: menuItem?.price || 0,
        line_total: (menuItem?.price || 0) * item.quantity,
        special_instructions: item.notes || null,
        status: "preparing" // Start preparing immediately for walk-in
      };
    });

    const { error: foodInsertError } = await supabaseAdmin
      .from("booking_food_items")
      .insert(foodItemsToInsert);

    if (foodInsertError) throw foodInsertError;

    // Step 5: Create line items for billing
    const lineItems: any[] = [];
    let displayOrder = 1;

    // Add food line items
    foodItemsToInsert.forEach(item => {
      lineItems.push({
        booking_id: booking.id,
        item_type: "food",
        description: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        reference_type: "menu_item",
        reference_id: item.menu_item_id,
        added_by: "customer",
        is_paid: true,
        display_order: displayOrder++
      });
    });

    const { error: lineItemsError } = await supabaseAdmin
      .from("booking_line_items")
      .insert(lineItems);

    if (lineItemsError) throw lineItemsError;

    return {
      success: true,
      bookingId: booking.id,
      bookingNumber: booking.booking_number
    };
  } catch (error: any) {
    console.error("Error creating food-only walk-in booking:", error);
    return { success: false, error: error.message };
  }
}
