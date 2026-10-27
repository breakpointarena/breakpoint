"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { getWalletBalance } from "@/lib/wallet/server";
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
import { calculateSharedPlayShares } from "@/lib/bookings/sharedPlay";
import { redeemHourPassesForBooking } from "@/lib/subscriptions/redeemHourPasses";
import { isHourPackEligibleForDevice } from "@/lib/subscriptions/hourPass";
import { resolveHappyHour } from "@/lib/payments/happyHour";
import { formatDbTime } from "@/lib/utils/timeSlots";
import {
  calculateMembershipDiscount,
  resolveActiveMembership
} from "@/lib/subscriptions/discount";
import {
  resolveCheckoutTime,
  MAX_BACKDATED_START_HOURS,
  MAX_PLANNED_SESSION_HOURS,
  PROVISIONAL_SESSION_HOURS,
  formatPlayedDuration,
  priceSession,
  resolveBackdatedStart,
  resolvePlannedSession,
  sessionClaimWindow,
  toClockTime,
  toSlotDate
} from "@/lib/bookings/walkInSession";
import { arenaDate, arenaToday } from "@/lib/utils/dates";
import {
  effectivePaidAt,
  mergeBookingRows,
  revenueWindowStart,
} from "@/lib/reports/revenueWindow";
import { needsAttention } from "@/lib/bookings/attention";
import {
  CUSTOMER_NAME_MIN_CHARS,
  CUSTOMER_SUGGESTION_LIMIT,
  CUSTOMER_SUGGESTION_MIN_DIGITS,
  nameQuery,
  phoneDigits,
  type CustomerSuggestion
} from "@/lib/customers/suggestions";
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
        customer_id,
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
        hour_pass_discount,
        status,
        payment_status,
        created_at,
        checked_in_at,
        completed_at,
        lock_expires_at,
        billed_on_actual_time,
        shared_play_enabled,
        walk_in_pending_start_time,
        walk_in_pending_end_time,
        walk_in_planned_end,
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
          participant_id,
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
  const hourPassDiscount = Number(booking.hour_pass_discount || 0);
  const amountPaid = Number(booking.amount_paid || 0);

  const correctTotal = roundToTwo(
    deviceSubtotal + foodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount - hourPassDiscount
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

/** Fetches play periods only for the shared-play bookings in the current list. */
async function attachSharedPlayPeriods(bookings: any[]) {
  const sharedBookingIds = bookings
    .filter((booking) => booking.shared_play_enabled)
    .map((booking) => booking.id);
  if (sharedBookingIds.length === 0) return bookings;

  const { data: participants, error } = await supabaseAdmin
    .from("shared_play_participants")
    .select("id, booking_id, name, customer_id, customer:customers(id, name, phone, email), shared_play_periods(id, started_at, ended_at)")
    .in("booking_id", sharedBookingIds);
  if (error) throw error;

  const participantsByBooking = new Map<string, any[]>();
  for (const participant of participants || []) {
    const current = participantsByBooking.get(participant.booking_id) || [];
    current.push(participant);
    participantsByBooking.set(participant.booking_id, current);
  }

  return bookings.map((booking) => ({
    ...booking,
    shared_play_participants: participantsByBooking.get(booking.id) || []
  }));
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

    const bookingsWithPlayPeriods = await attachSharedPlayPeriods(inRange);
    const bookingsWithBalance = bookingsWithPlayPeriods.map(withComputedTotals);

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
    const bookingsWithPlayPeriods = await attachSharedPlayPeriods(data || []);
    const priced = bookingsWithPlayPeriods.map(withComputedTotals);
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
          participant_id,
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

    if (data.shared_play_enabled || data.status === "checked_in") {
      const { data: participants, error: participantError } = await supabaseAdmin
        .from("shared_play_participants")
        .select("id, name, customer_id, customer:customers(id, name, phone, email), billed_amount, checked_out_at, settled_amount, wallet_amount, shared_play_periods(id, started_at, ended_at, amount)")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (participantError) throw participantError;
      data.shared_play_participants = participants || [];
    } else {
      data.shared_play_participants = [];
    }

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
    const hourPassDiscount = Number(data.hour_pass_discount || 0);
    const amountPaid = Number(data.amount_paid || 0);

    const correctTotal = roundToTwo(
      deviceSubtotal + foodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount - hourPassDiscount
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
    await saveSharedPlayShares(bookingId, new Date(now));

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

/** Save participant names and timestamp the people currently at the board. */
export async function setSharedPlayParticipants(
  bookingId: string,
  enabled: boolean,
  rosterNames: string[],
  activeNames: string[],
  rosterCustomers: Array<{ customerId: string; name: string }> = [],
  /** Optional arena-clock time for a participant who sat in earlier this shift. */
  sitInClock: string | null = null,
  /** Optional arena-clock time for a participant who sat out earlier this shift. */
  sitOutClock: string | null = null
) {
  await requireStaff();
  try {
    if (sitInClock) {
      const started = resolveBackdatedStart(sitInClock);
      if (!started.ok) return { success: false, error: started.error };
    }
    if (sitOutClock) {
      const ended = resolveBackdatedStart(sitOutClock);
      if (!ended.ok) return { success: false, error: ended.error };
    }

    const normalize = (names: string[]) => [...new Map(
      names.map((name) => [name.trim().toLocaleLowerCase(), name.trim()])
    ).values()].filter(Boolean);
    const roster = normalize(rosterNames);
    const active = normalize(activeNames);
    const customerLinks = [...new Map(
      rosterCustomers.map((customer) => [
        customer.name.trim().toLocaleLowerCase(),
        { customerId: customer.customerId, name: customer.name.trim() }
      ])
    ).values()];
    if (customerLinks.some((customer) =>
      !customer.customerId ||
      !roster.some((name) => name.toLocaleLowerCase() === customer.name.toLocaleLowerCase())
    )) {
      return { success: false, error: "Each selected customer must be on the participant list." };
    }

    if (customerLinks.length > 0) {
      const { data: customers, error: customersError } = await supabaseAdmin
        .from("customers")
        .select("id, name")
        .in("id", customerLinks.map((customer) => customer.customerId));
      if (customersError) throw customersError;
      const customersById = new Map<string, string>();
      for (const customer of (customers || []) as Array<{ id: string; name: string }>) {
        customersById.set(customer.id, customer.name);
      }
      if (customerLinks.some((link) =>
        customersById.get(link.customerId)?.trim().toLocaleLowerCase() !== link.name.toLocaleLowerCase()
      )) {
        return { success: false, error: "A selected customer profile could not be verified." };
      }
    }

    const { data: existingParticipants, error: existingParticipantsError } = await supabaseAdmin
      .from("shared_play_participants")
      .select("name, checked_out_at")
      .eq("booking_id", bookingId);
    if (existingParticipantsError) throw existingParticipantsError;
    const checkedOutNames = new Set((existingParticipants || [])
      .filter((row: any) => row.checked_out_at)
      .map((row: any) => String(row.name).trim().toLocaleLowerCase()));
    if (active.some((name) => checkedOutNames.has(name.toLocaleLowerCase()))) {
      return { success: false, error: "A checked-out participant cannot rejoin this session." };
    }

    const { error } = await supabaseAdmin.rpc("set_shared_play_participants", {
      p_booking_id: bookingId,
      p_enabled: enabled,
      p_roster_names: roster,
      p_active_names: active,
      p_sit_in_clock: sitInClock,
      p_sit_out_clock: sitOutClock
    });
    if (error) throw error;

    for (const customer of customerLinks) {
      const { data: participant, error: participantError } = await supabaseAdmin
        .from("shared_play_participants")
        .select("id, customer_id")
        .eq("booking_id", bookingId)
        .eq("name", customer.name)
        .maybeSingle();
      if (participantError) throw participantError;
      if (!participant) throw new Error("Could not find the newly added customer participant.");
      if (participant.customer_id && participant.customer_id !== customer.customerId) {
        throw new Error(`${customer.name} is already linked to a different customer account.`);
      }
      if (!participant.customer_id) {
        const { error: linkError } = await supabaseAdmin
          .from("shared_play_participants")
          .update({ customer_id: customer.customerId })
          .eq("id", participant.id)
          .eq("booking_id", bookingId);
        if (linkError) throw linkError;
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Update shared play participants error:", err);
    return { success: false, error: err.message };
  }
}

async function sharedPlayParticipantCheckoutQuote(
  bookingId: string,
  participantId: string,
  checkoutAt = new Date()
) {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, status, shared_play_enabled, device_subtotal, subscription_discount, promo_discount, happy_hour_discount, booking_device_slots(hourly_rate, included_players, extra_player_charge), shared_play_participants(id, name, customer_id, checked_out_at, shared_play_periods(id, participant_id, started_at, ended_at))")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking || booking.status !== "checked_in" || !booking.shared_play_enabled) {
    throw new Error("This shared-play booking is no longer active.");
  }

  const participant = (booking.shared_play_participants || []).find((row: any) => row.id === participantId);
  if (!participant) throw new Error("Participant not found in this booking.");
  if (participant.checked_out_at) throw new Error("This participant has already checked out.");
  const slot = booking.booking_device_slots?.[0];
  if (!slot) throw new Error("The booking has no active board.");

  const now = checkoutAt;
  const periods = (booking.shared_play_participants || []).flatMap((row: any) =>
    (row.shared_play_periods || []).map((period: any) => ({
      ...period,
      participant_id: row.id,
      ended_at: period.participant_id === participantId && !period.ended_at
        ? now.toISOString()
        : period.ended_at
    }))
  );
  const calculation = calculateSharedPlayShares(
    periods,
    Number(slot.hourly_rate || 0),
    Number(slot.extra_player_charge || 0),
    Number(slot.included_players || 1),
    null,
    now
  );
  const rawDeviceShare = calculation.shares.find((share) => share.participantId === participantId)?.amount || 0;
  const participantPlayedMs = periods
    .filter((period: any) => period.participant_id === participantId)
    .reduce((total: number, period: any) => total + Math.max(
      0,
      new Date(period.ended_at || now).getTime() - new Date(period.started_at).getTime()
    ), 0);
  const grossDeviceTotal = roundToTwo(calculation.shares.reduce((sum, share) => sum + share.amount, 0));
  const totalDiscount = Math.min(
    grossDeviceTotal,
    Number(booking.subscription_discount || 0) + Number(booking.promo_discount || 0) + Number(booking.happy_hour_discount || 0)
  );
  const deviceRatio = grossDeviceTotal > 0 ? Math.max(0, grossDeviceTotal - totalDiscount) / grossDeviceTotal : 1;
  const deviceAmount = roundToTwo(rawDeviceShare * deviceRatio);

  const { data: foodItems, error: foodError } = await supabaseAdmin
    .from("booking_food_items")
    .select("id, item_name, quantity, line_total")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: true });
  if (foodError) throw foodError;
  const foodAmount = roundToTwo((foodItems || []).reduce((sum: number, item: any) => sum + Number(item.line_total || 0), 0));

  let walletBalance = 0;
  if (participant.customer_id) {
    const wallet = await getWalletBalance(participant.customer_id);
    walletBalance = Math.max(0, Number(wallet.balance || 0));
  }

  return {
    participantId,
    participantName: participant.name,
    customerId: participant.customer_id,
    checkoutAt: now.toISOString(),
    playedMinutes: Math.floor(participantPlayedMs / 60_000),
    deviceAmount,
    foodAmount,
    totalAmount: roundToTwo(deviceAmount + foodAmount),
    walletBalance,
    foodItems: foodItems || []
  };
}

export async function getSharedPlayParticipantCheckoutQuote(bookingId: string, participantId: string) {
  await requireStaff();
  try {
    return { success: true as const, quote: await sharedPlayParticipantCheckoutQuote(bookingId, participantId) };
  } catch (error: any) {
    console.error("Shared-play participant checkout quote error:", error);
    return { success: false as const, error: error.message || "Could not calculate this participant's bill." };
  }
}

export async function getSharedPlayCheckoutAllQuotes(bookingId: string) {
  await requireStaff();
  try {
    const { data: participants, error } = await supabaseAdmin
      .from("shared_play_participants")
      .select("id, checked_out_at")
      .eq("booking_id", bookingId)
      .is("checked_out_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    if (!participants?.length) throw new Error("There are no participants left to check out.");

    const checkoutAt = new Date();
    const quotes = await Promise.all(participants.map((participant: { id: string }) =>
      sharedPlayParticipantCheckoutQuote(bookingId, participant.id, checkoutAt)
    ));
    return { success: true as const, quotes };
  } catch (error: any) {
    console.error("Shared-play checkout-all quote error:", error);
    return { success: false as const, error: error.message || "Could not calculate the participants' bills." };
  }
}

export async function checkOutAllSharedPlayParticipants(input: {
  bookingId: string;
  useWalletFor: string[];
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  idempotencyKey: string;
}) {
  await requireStaff();
  const settledParticipants: string[] = [];
  try {
    if (!input.idempotencyKey || input.idempotencyKey.length < 12) {
      throw new Error("Checkout request expired. Reopen checkout all.");
    }
    if (!Array.isArray(input.useWalletFor)) {
      throw new Error("Choose a valid wallet selection.");
    }

    const { data: participants, error } = await supabaseAdmin
      .from("shared_play_participants")
      .select("id, checked_out_at")
      .eq("booking_id", input.bookingId)
      .is("checked_out_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    if (!participants?.length) throw new Error("There are no participants left to check out.");

    // Calculate everyone against the same instant so nobody is charged for the
    // few seconds it takes to process the rest of the group.
    const checkoutAt = new Date();
    const quotes = await Promise.all(participants.map((participant: { id: string }) =>
      sharedPlayParticipantCheckoutQuote(input.bookingId, participant.id, checkoutAt)
    ));

    let cashRemaining = roundToTwo(Number(input.cashAmount));
    let upiRemaining = roundToTwo(Number(input.upiAmount));
    let cardRemaining = roundToTwo(Number(input.cardAmount));
    if (![cashRemaining, upiRemaining, cardRemaining].every(Number.isFinite) || cashRemaining < 0 || upiRemaining < 0 || cardRemaining < 0) {
      throw new Error("Enter valid cash, UPI, and card amounts.");
    }
    const totalExternalDue = roundToTwo(quotes.reduce((sum, quote) => {
      const wallet = input.useWalletFor.includes(quote.participantId)
        ? Math.min(quote.totalAmount, quote.walletBalance)
        : 0;
      return sum + roundToTwo(quote.totalAmount - wallet);
    }, 0));
    if (roundToTwo(cashRemaining + upiRemaining + cardRemaining) !== totalExternalDue) {
      throw new Error(`Cash, UPI, and card must add up to the remaining amount of ₹${totalExternalDue.toFixed(2)}.`);
    }

    for (const quote of quotes) {
      const useWallet = input.useWalletFor.includes(quote.participantId);
      const walletAmount = useWallet ? Math.min(quote.totalAmount, quote.walletBalance) : 0;
      const externalAmount = roundToTwo(quote.totalAmount - walletAmount);
      const cashAmount = roundToTwo(Math.min(cashRemaining, externalAmount));
      cashRemaining = roundToTwo(cashRemaining - cashAmount);
      const upiAmount = roundToTwo(Math.min(upiRemaining, externalAmount - cashAmount));
      upiRemaining = roundToTwo(upiRemaining - upiAmount);
      const cardAmount = roundToTwo(externalAmount - cashAmount - upiAmount);
      if (cardAmount > cardRemaining + 0.005) throw new Error("The payment split could not be allocated.");
      cardRemaining = roundToTwo(cardRemaining - cardAmount);
      const { error: settleError } = await supabaseAdmin.rpc("wallet_settle_shared_play_participant", {
        p_booking_id: input.bookingId,
        p_participant_id: quote.participantId,
        p_charge_amount: quote.totalAmount,
        p_cash_amount: cashAmount,
        p_card_amount: cardAmount,
        p_upi_amount: upiAmount,
        p_use_wallet: useWallet,
        p_checkout_at: checkoutAt.toISOString(),
        p_idempotency_key: `${input.idempotencyKey}:${quote.participantId}`
      });
      if (settleError) throw settleError;
      settledParticipants.push(quote.participantName);
    }

    return { success: true as const, settledParticipants };
  } catch (error: any) {
    console.error("Shared-play checkout-all error:", error);
    return {
      success: false as const,
      error: error.message || "Could not check out all participants.",
      settledParticipants
    };
  }
}

export async function linkSharedPlayParticipantToCustomer(bookingId: string, participantId: string, customerId: string) {
  await requireStaff();
  try {
    const { data: participant, error: participantError } = await supabaseAdmin
      .from("shared_play_participants")
      .select("id, checked_out_at")
      .eq("id", participantId)
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) throw new Error("Participant not found in this booking.");
    if (participant.checked_out_at) throw new Error("A participant who has checked out cannot be relinked.");

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("Customer account not found.");

    const { data: duplicate, error: duplicateError } = await supabaseAdmin
      .from("shared_play_participants")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("customer_id", customerId)
      .neq("id", participantId)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new Error("That customer is already linked to another participant in this booking.");

    const { error: updateError } = await supabaseAdmin
      .from("shared_play_participants")
      .update({ customer_id: customerId })
      .eq("id", participantId)
      .eq("booking_id", bookingId);
    if (updateError) throw updateError;
    return { success: true as const, customerName: customer.name };
  } catch (error: any) {
    console.error("Link shared-play participant customer error:", error);
    return { success: false as const, error: error.message || "Could not link the customer account." };
  }
}

export async function checkOutSharedPlayParticipant(input: {
  bookingId: string;
  participantId: string;
  useWallet: boolean;
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  idempotencyKey: string;
}) {
  await requireStaff();
  try {
    if (!input.idempotencyKey || input.idempotencyKey.length < 12) {
      throw new Error("Checkout request expired. Reopen the participant checkout.");
    }
    const quote = await sharedPlayParticipantCheckoutQuote(input.bookingId, input.participantId);
    const walletAmount = input.useWallet ? Math.min(quote.totalAmount, quote.walletBalance) : 0;
    const externalAmount = roundToTwo(quote.totalAmount - walletAmount);
    const cashAmount = roundToTwo(Number(input.cashAmount));
    const upiAmount = roundToTwo(Number(input.upiAmount));
    const cardAmount = roundToTwo(Number(input.cardAmount));
    if (![cashAmount, upiAmount, cardAmount].every(Number.isFinite) || cashAmount < 0 || upiAmount < 0 || cardAmount < 0) {
      throw new Error("Enter valid cash, UPI, and card amounts.");
    }
    if (roundToTwo(cashAmount + upiAmount + cardAmount) !== externalAmount) {
      throw new Error(`Cash, UPI, and card must add up to the remaining amount of ₹${externalAmount.toFixed(2)}.`);
    }
    const { data, error } = await supabaseAdmin.rpc("wallet_settle_shared_play_participant", {
      p_booking_id: input.bookingId,
      p_participant_id: input.participantId,
      p_charge_amount: quote.totalAmount,
      p_cash_amount: cashAmount,
      p_card_amount: cardAmount,
      p_upi_amount: upiAmount,
      p_use_wallet: input.useWallet,
      p_checkout_at: quote.checkoutAt,
      p_idempotency_key: input.idempotencyKey
    });
    if (error) throw error;
    return { success: true as const, quote, payment: data };
  } catch (error: any) {
    console.error("Shared-play participant checkout error:", error);
    return { success: false as const, error: error.message || "Could not check out this participant." };
  }
}

export async function getCustomersForSharedPlay() {
  await requireStaff();
  try {
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone, email")
      .order("name", { ascending: true });
    if (error) throw error;
    return { success: true as const, customers: data || [] };
  } catch (err: any) {
    console.error("Get shared-play customers error:", err);
    return {
      success: false as const,
      error: err.message || "Could not load customer profiles.",
      customers: [],
    };
  }
}

export async function linkSharedPlayParticipantToHourPack(
  bookingId: string,
  participantId: string,
  customerId: string
): Promise<
  | { success: true; customerName: string; hoursRemaining: number }
  | { success: false; error: string }
> {
  await requireStaff();
  try {
    if (!customerId) return { success: false, error: "Select a customer account." };

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("walk_in_device_type_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return { success: false, error: "Booking not found." };

    let bookingDeviceTypeId = booking.walk_in_device_type_id as string | null;
    if (!bookingDeviceTypeId) {
      const { data: slot, error: slotError } = await supabaseAdmin
        .from("booking_device_slots")
        .select("device_id")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (slotError) throw slotError;
      if (slot?.device_id) {
        const { data: device, error: deviceError } = await supabaseAdmin
          .from("devices")
          .select("device_type_id")
          .eq("id", slot.device_id)
          .maybeSingle();
        if (deviceError) throw deviceError;
        bookingDeviceTypeId = device?.device_type_id ?? null;
      }
    }
    if (!bookingDeviceTypeId) {
      return { success: false, error: "Could not determine this booking's play category." };
    }

    const { data: participant, error: participantError } = await supabaseAdmin
      .from("shared_play_participants")
      .select("id")
      .eq("id", participantId)
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return { success: false, error: "That player is not on this booking." };

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, name")
      .eq("id", customerId)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) return { success: false, error: "The selected customer account was not found." };

    const { data: pass, error: passError } = await supabaseAdmin
      .from("subscriptions")
      .select("hours_remaining_minutes, end_date, plan:subscription_plans!inner(name, plan_type, device_type_id)")
      .eq("customer_id", customer.id)
      .eq("status", "active")
      .lte("start_date", arenaToday())
      .gte("end_date", arenaToday())
      .gt("hours_remaining_minutes", 0)
      .order("end_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (passError) throw passError;
    const eligiblePass = (pass || []).find((candidate: any) =>
      candidate.plan?.plan_type === "hour_pack" &&
      isHourPackEligibleForDevice(
        candidate.plan.device_type_id ?? null,
        bookingDeviceTypeId
      )
    );
    if (!eligiblePass) {
      return {
        success: false,
        error: "No active hour pack with time remaining matches this play category."
      };
    }

    const { error: linkError } = await supabaseAdmin
      .from("shared_play_participants")
      .update({ customer_id: customer.id })
      .eq("id", participantId)
      .eq("booking_id", bookingId);
    if (linkError) throw linkError;

    return {
      success: true,
      customerName: customer.name,
      hoursRemaining: Number(eligiblePass.hours_remaining_minutes || 0) / 60,
    };
  } catch (err: any) {
    console.error("Link shared-play player to hour pack error:", err);
    return { success: false, error: err.message || "Could not link this player's hour pack." };
  }
}

export async function getHourPackCustomersForSharedPlay(bookingId: string) {
  await requireStaff();
  try {
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("walk_in_device_type_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return { success: false as const, error: "Booking not found.", customers: [] };

    let bookingDeviceTypeId = booking.walk_in_device_type_id as string | null;
    if (!bookingDeviceTypeId) {
      const { data: slot, error: slotError } = await supabaseAdmin
        .from("booking_device_slots")
        .select("device_id")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (slotError) throw slotError;
      if (slot?.device_id) {
        const { data: device, error: deviceError } = await supabaseAdmin
          .from("devices")
          .select("device_type_id")
          .eq("id", slot.device_id)
          .maybeSingle();
        if (deviceError) throw deviceError;
        bookingDeviceTypeId = device?.device_type_id ?? null;
      }
    }
    if (!bookingDeviceTypeId) {
      return {
        success: false as const,
        error: "Could not determine this booking's play category.",
        customers: [],
      };
    }

    type ActiveHourPackSubscription = {
      customer_id: string | null;
      subscription_plan_id: string | null;
      hours_remaining_minutes: number | null;
      end_date: string;
    };
    type HourPackPlan = {
      id: string;
      name: string;
      device_type_id: string | null;
      is_active: boolean;
      device_type: { display_name: string } | null;
    };
    type CustomerAccount = { id: string; name: string; phone: string; email: string | null };

    const { data: plans, error: plansError } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, name, device_type_id, is_active, device_type:device_types(display_name)")
      .eq("plan_type", "hour_pack");
    if (plansError) throw plansError;
    if (!plans?.length) return { success: true as const, customers: [] };
    const hourPackPlans = (plans as HourPackPlan[]).filter((plan) =>
      plan.device_type_id === bookingDeviceTypeId ||
      (plan.device_type_id === null && !plan.is_active)
    );
    if (hourPackPlans.length === 0) return { success: true as const, customers: [] };
    const planById = new Map(hourPackPlans.map((plan) => [plan.id, plan]));
    const planIds = hourPackPlans.map((plan) => plan.id);

    const today = arenaToday();
    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from("subscriptions")
      .select("customer_id, subscription_plan_id, hours_remaining_minutes, end_date")
      .eq("status", "active")
      .lte("start_date", today)
      .gte("end_date", today)
      .gt("hours_remaining_minutes", 0)
      .in("subscription_plan_id", planIds);
    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) return { success: true as const, customers: [] };
    const activeSubscriptions = subscriptions as ActiveHourPackSubscription[];

    const eligibleSubscriptions = activeSubscriptions
      .filter((subscription) =>
        subscription.customer_id && planById.has(subscription.subscription_plan_id || "")
      )
      .sort((a, b) => a.end_date.localeCompare(b.end_date));
    const customerIds = [...new Set(
      eligibleSubscriptions.map((subscription) => subscription.customer_id!)
    )];
    if (customerIds.length === 0) return { success: true as const, customers: [] };

    const { data: customers, error: customersError } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone, email")
      .in("id", customerIds)
      .order("name", { ascending: true });
    if (customersError) throw customersError;
    const customerAccounts = (customers || []) as CustomerAccount[];

    const subscriptionByCustomer = new Map<string, (typeof eligibleSubscriptions)[number]>();
    for (const subscription of eligibleSubscriptions) {
      if (subscription.customer_id && !subscriptionByCustomer.has(subscription.customer_id)) {
        subscriptionByCustomer.set(subscription.customer_id, subscription);
      }
    }

    return {
      success: true as const,
      customers: customerAccounts.flatMap((customer) => {
        const subscription = subscriptionByCustomer.get(customer.id);
        const plan = subscription ? planById.get(subscription.subscription_plan_id || "") : null;
        return subscription && plan ? [{
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          remaining_minutes: Number(subscription.hours_remaining_minutes || 0),
          pack_name: plan.name,
          device_type_name: plan.device_type?.display_name ?? null,
          end_date: subscription.end_date,
        }] : [];
      }),
    };
  } catch (err: any) {
    console.error("Get shared-play hour-pack customers error:", err);
    return {
      success: false as const,
      error: err.message || "Could not load customers with active hour packs.",
      customers: [],
    };
  }
}

/** Apply interval extra-player charges and save the per-person split at checkout. */
async function saveSharedPlayShares(bookingId: string, endedAt: Date) {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("customer_phone, customer_name, checked_in_at, shared_play_enabled, device_subtotal, food_subtotal, subscription_discount, promo_discount, happy_hour_discount, hour_pass_discount, total_amount, amount_paid, payment_status, booking_device_slots(id, hourly_rate, player_count, included_players, extra_player_charge, duration_hours, slot_total, extra_players_total)")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) return;

  const slot = booking.booking_device_slots?.[0];
  if (!slot) return;
  const { data: participants, error: participantsError } = await supabaseAdmin
    .from("shared_play_participants")
    .select("id, name, customer_id, checked_out_at")
    .eq("booking_id", bookingId);
  if (participantsError) throw participantsError;
  let playerRows = participants || [];
  if (
    playerRows.length === 0 &&
    !booking.shared_play_enabled &&
    Number(slot.player_count || 1) === 1 &&
    booking.checked_in_at
  ) {
    const { data: player, error: insertPlayerError } = await supabaseAdmin
      .from("shared_play_participants")
      .insert({
        booking_id: bookingId,
        name: String(booking.customer_name || "Player 1").trim() || "Player 1"
      })
      .select("id, name, customer_id")
      .single();
    if (insertPlayerError) throw insertPlayerError;
    playerRows = [player];
  }
  const participantIds = playerRows.map((row: any) => row.id);
  if (participantIds.length === 0) return;

  const { data: periodRows, error: periodsError } = await supabaseAdmin
    .from("shared_play_periods")
    .select("id, participant_id, started_at, ended_at")
    .in("participant_id", participantIds);
  if (periodsError) throw periodsError;
  let periods = periodRows || [];
  if (
    periods.length === 0 &&
    !booking.shared_play_enabled &&
    Number(slot.player_count || 1) === 1 &&
    booking.checked_in_at &&
    new Date(booking.checked_in_at) < endedAt
  ) {
    const { data: period, error: insertPeriodError } = await supabaseAdmin
      .from("shared_play_periods")
      .insert({
        participant_id: playerRows[0].id,
        started_at: booking.checked_in_at,
        ended_at: endedAt.toISOString()
      })
      .select("id, participant_id, started_at, ended_at")
      .single();
    if (insertPeriodError) throw insertPeriodError;
    periods = [period];
  }

  const bookedPlayer = playerRows.find(
    (row: any) => row.name.trim().toLowerCase() === String(booking.customer_name || "Player 1").trim().toLowerCase()
  );
  if (bookedPlayer && !bookedPlayer.customer_id && booking.customer_phone) {
    const normalizedPhone = String(booking.customer_phone).replace(/\D/g, "").slice(-10);
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("phone", normalizedPhone)
      .maybeSingle();
    if (customerError) throw customerError;
    if (customer) {
      const { error: linkError } = await supabaseAdmin
        .from("shared_play_participants")
        .update({ customer_id: customer.id })
        .eq("id", bookedPlayer.id)
        .eq("booking_id", bookingId);
      if (linkError) throw linkError;
      bookedPlayer.customer_id = customer.id;
    }
  }

  const deviceSubtotal = Number(booking.device_subtotal || 0);
  const otherDiscounts = Math.min(
    deviceSubtotal,
    Number(booking.subscription_discount || 0) +
      Number(booking.promo_discount || 0) +
      Number(booking.happy_hour_discount || 0)
  );
  const shareableRatio = deviceSubtotal > 0
    ? Math.max(0, deviceSubtotal - otherDiscounts) / deviceSubtotal
    : 0;
  let hourPassDiscount = 0;

  if (!booking.shared_play_enabled) {
    if (Number(slot.player_count || 1) === 1 && bookedPlayer?.customer_id) {
      const playedMs = (periods || [])
        .filter((period: any) => period.participant_id === bookedPlayer.id)
        .reduce((total: number, period: any) => {
          const startedAt = new Date(period.started_at).getTime();
          const periodEnd = period.ended_at ? new Date(period.ended_at).getTime() : endedAt.getTime();
          return total + Math.max(0, periodEnd - startedAt);
        }, 0);
      const redeemed = await redeemHourPassesForBooking(bookingId, [{
        participantId: bookedPlayer.id,
        customerId: bookedPlayer.customer_id,
        playedMinutes: Math.ceil(playedMs / 60_000),
        playerShare: deviceSubtotal,
        shareableAmount: deviceSubtotal * shareableRatio,
      }]);
      hourPassDiscount = redeemed.get(bookedPlayer.id)?.amountCovered || 0;
      const totalAmount = Math.max(0, roundToTwo(
        deviceSubtotal + Number(booking.food_subtotal || 0) -
          otherDiscounts - hourPassDiscount
      ));
      const { error: bookingUpdateError } = await supabaseAdmin
        .from("bookings")
        .update({
          hour_pass_discount: hourPassDiscount,
          total_amount: totalAmount,
          payment_status: settlementStatus({
            amountPaid: Number(booking.amount_paid || 0),
            total: totalAmount
          }),
          updated_at: new Date().toISOString()
        })
        .eq("id", bookingId);
      if (bookingUpdateError) throw bookingUpdateError;
      const { error: playerUpdateError } = await supabaseAdmin
        .from("shared_play_participants")
        .update({ billed_amount: Math.max(0, deviceSubtotal - hourPassDiscount) })
        .eq("id", bookedPlayer.id);
      if (playerUpdateError) throw playerUpdateError;
    }
    return;
  }

  const calculation = calculateSharedPlayShares(
    periods || [],
    Number(slot.hourly_rate || 0),
    Number(slot.extra_player_charge || 0),
    Number(slot.included_players || 1),
    null,
    endedAt
  );

  const { error: slotUpdateError } = await supabaseAdmin
    .from("booking_device_slots")
    .update({
      slot_total: calculation.deviceCharges,
      extra_players_total: calculation.extraPlayersTotal,
      duration_hours: roundToTwo(calculation.trackedHours)
    })
    .eq("id", slot.id);
  if (slotUpdateError) throw slotUpdateError;

  const sharedDeviceSubtotal = roundToTwo(calculation.deviceCharges + calculation.extraPlayersTotal);
  const sharedShareableRatio = sharedDeviceSubtotal > 0
    ? Math.max(0, sharedDeviceSubtotal - Math.min(sharedDeviceSubtotal, otherDiscounts)) / sharedDeviceSubtotal
    : 0;
  const byParticipant = new Map(calculation.shares.map(share => [share.participantId, share.amount]));
  const passPlayers = playerRows.flatMap((participant: any) => {
    if (!participant.customer_id) return [];
    const playerPeriods = (periods || []).filter(
      (period: any) => period.participant_id === participant.id
    );
    const playedMs = playerPeriods.reduce((total: number, period: any) => {
      const startedAt = new Date(period.started_at).getTime();
      const periodEnd = period.ended_at ? new Date(period.ended_at).getTime() : endedAt.getTime();
      return total + Math.max(0, periodEnd - startedAt);
    }, 0);
    const share = byParticipant.get(participant.id) || 0;
    return [{
      participantId: participant.id,
      customerId: participant.customer_id,
      playedMinutes: Math.ceil(playedMs / 60_000),
      playerShare: share,
      shareableAmount: share * sharedShareableRatio,
    }];
  });
  const redeemed = await redeemHourPassesForBooking(bookingId, passPlayers);
  hourPassDiscount = roundToTwo(
    [...redeemed.values()].reduce((total, use) => total + use.amountCovered, 0)
  );
  const totalDiscount = otherDiscounts + hourPassDiscount;
  const totalAmount = Math.max(0, roundToTwo(
    sharedDeviceSubtotal + Number(booking.food_subtotal || 0) - totalDiscount
  ));
  const { error: bookingUpdateError } = await supabaseAdmin
    .from("bookings")
    .update({
      device_subtotal: sharedDeviceSubtotal,
      hour_pass_discount: hourPassDiscount,
      total_amount: totalAmount,
      payment_status: settlementStatus({
        amountPaid: Number(booking.amount_paid || 0),
        total: totalAmount
      }),
      updated_at: new Date().toISOString()
    })
    .eq("id", bookingId);
  if (bookingUpdateError) throw bookingUpdateError;

  const { data: extraLines, error: extraLinesError } = await supabaseAdmin
    .from("booking_line_items")
    .select("id, line_total, is_paid")
    .eq("booking_id", bookingId)
    .eq("item_type", "extra_players")
    .order("display_order", { ascending: true });
  if (extraLinesError) throw extraLinesError;
  if (calculation.extraPlayersTotal > 0) {
    const lineItem = {
      description: "Shared play extra-player charges",
      quantity: 1,
      unit_price: calculation.extraPlayersTotal,
      line_total: calculation.extraPlayersTotal,
      is_paid: false
    };
    if (extraLines?.length) {
      const originalLine = extraLines[0] as any;
      const { error } = await supabaseAdmin.from("booking_line_items").update({
        ...lineItem,
        is_paid: Number(originalLine.line_total) === calculation.extraPlayersTotal
          ? originalLine.is_paid
          : false
      }).eq("id", originalLine.id);
      if (error) throw error;
      if (extraLines.length > 1) {
        const { error: deleteError } = await supabaseAdmin
          .from("booking_line_items")
          .delete()
          .in("id", extraLines.slice(1).map((row: any) => row.id));
        if (deleteError) throw deleteError;
      }
    } else {
      const { error } = await supabaseAdmin.from("booking_line_items").insert({
        booking_id: bookingId,
        item_type: "extra_players",
        ...lineItem,
        added_by: "admin",
        display_order: 2
      });
      if (error) throw error;
    }
  } else if (extraLines?.length) {
    const { error } = await supabaseAdmin
      .from("booking_line_items")
      .delete()
      .in("id", extraLines.map((row: any) => row.id));
    if (error) throw error;
  }

  for (const share of calculation.shares) {
    const player = playerRows.find((row: any) => row.id === share.participantId);
    if (player?.checked_out_at) continue;
    const { error } = await supabaseAdmin
      .from("shared_play_participants")
      .update({
        billed_amount: Math.max(0, roundToTwo(
          share.amount * sharedShareableRatio - (redeemed.get(share.participantId)?.amountCovered || 0)
        ))
      })
      .eq("id", share.participantId);
    if (error) throw error;
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

    // Read bookings paid inside the revenue window. A booking can be created
    // earlier and paid today, so created_at is not the date revenue belongs to.
    const today = arenaToday();
    const revenueWindow = revenueWindowStart(today);
    const revenueColumns = `
      id,
      amount_paid,
      wallet_amount,
      payment_status,
      status,
      created_at,
      updated_at,
      payment_groups(paid_at)
    `;
    const [
      { data: touchedInWindow, error: touchedError },
      { data: settledInWindow, error: settledError },
      { data: onlineWalletSales, error: onlineWalletError },
      { data: adminWalletSales, error: adminWalletError },
    ] = await Promise.all([
      supabaseAdmin
        .from("bookings")
        .select(revenueColumns)
        .in("payment_status", ["paid", "partial"])
        .neq("status", "cancelled")
        .gte("updated_at", revenueWindow),
      supabaseAdmin
        .from("bookings")
        .select(`
          id,
          amount_paid,
          wallet_amount,
          payment_status,
          status,
          created_at,
          updated_at,
          payment_groups!inner(paid_at)
        `)
        .in("payment_status", ["paid", "partial"])
        .neq("status", "cancelled")
        .gte("payment_groups.paid_at", revenueWindow),
      supabaseAdmin
        .from("payment_orders")
        .select("amount, paid_at")
        .eq("purpose", "wallet_top_up")
        .eq("status", "fulfilled")
        .gte("paid_at", revenueWindow)
        .not("paid_at", "is", null),
      supabaseAdmin
        .from("wallet_transactions")
        .select("paid_amount, created_at")
        .eq("source", "admin_wallet_sale")
        .eq("kind", "top_up")
        .eq("direction", "credit")
        .gte("created_at", revenueWindow),
    ]);

    if (touchedError) throw touchedError;
    if (settledError) throw settledError;
    if (onlineWalletError) throw onlineWalletError;
    if (adminWalletError) throw adminWalletError;

    const paidBookings = mergeBookingRows(
      touchedInWindow as { id: string }[] | null,
      settledInWindow as { id: string }[] | null
    );
    const bookingRevenueToday = (paidBookings as any[]).reduce((sum, booking) => {
      const paidAt = effectivePaidAt(booking);
      if (!paidAt || arenaDate(new Date(paidAt)) !== today) return sum;
      return sum + Math.max(0, Number(booking.amount_paid || 0) - Number(booking.wallet_amount || 0));
    }, 0);
    const walletRevenueToday = [
      ...(onlineWalletSales || []).map((sale: any) => ({ amount: sale.amount, timestamp: sale.paid_at })),
      ...(adminWalletSales || []).map((sale: any) => ({ amount: sale.paid_amount, timestamp: sale.created_at })),
    ].reduce((sum, sale) => {
      if (!sale.timestamp || arenaDate(new Date(sale.timestamp)) !== today) return sum;
      return sum + Number(sale.amount || 0);
    }, 0);
    const todayRevenue = bookingRevenueToday + walletRevenueToday;

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
    participantId?: string | null;
  }>
) {
  await requireStaff();

  try {
    // Keep the server guard in step with the UI: checked-out bookings remain
    // editable until fully paid, while cancelled and settled bookings are closed.
    const { data: subject, error: subjectError } = await supabaseAdmin
      .from("bookings")
      .select("status, payment_status, amount_paid, total_amount, billed_on_actual_time, completed_at, shared_play_enabled")
      .eq("id", bookingId)
      .maybeSingle();

    if (subjectError) throw subjectError;
    if (!subject) return { success: false, error: "Booking not found." };
    const subjectPaymentStatus = derivePaymentStatus(
      Number(subject.total_amount || 0),
      Number(subject.amount_paid || 0),
      subject.payment_status,
      subject.billed_on_actual_time === true && !subject.completed_at
    );
    if (
      subject.status === "cancelled" ||
      (subjectPaymentStatus === "paid" && !(subject.shared_play_enabled && subject.status === "checked_in")) ||
      subjectPaymentStatus === "refunded"
    ) {
      return {
        success: false,
        error: subject.status === "cancelled"
          ? "This booking is cancelled. Food can no longer be added."
          : "This booking is fully settled. Food can no longer be added."
      };
    }

    if (items.some((item) => item.participantId)) {
      const participantIds = [...new Set(items.map((item) => item.participantId).filter(Boolean))] as string[];
      const { data: participants, error: participantsError } = await supabaseAdmin
        .from("shared_play_participants")
        .select("id, checked_out_at")
        .eq("booking_id", bookingId)
        .in("id", participantIds);
      if (participantsError) throw participantsError;
      if (participants?.length !== participantIds.length) throw new Error("Food must be assigned to someone in this booking.");
      if (participants.some((participant: any) => participant.checked_out_at)) {
        throw new Error("Food cannot be added to a participant who has checked out.");
      }
    }
    if (items.some((item) => !item.participantId)) {
      const { data: bookingKind, error: bookingKindError } = await supabaseAdmin
        .from("bookings")
        .select("shared_play_enabled")
        .eq("id", bookingId)
        .single();
      if (bookingKindError) throw bookingKindError;
      if (bookingKind.shared_play_enabled) {
        return { success: false, error: "Assign each shared-play food item to a participant." };
      }
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
      participant_id: item.participantId || null,
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
      food_item_id: foodItems?.[index]?.id || null,
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
        "status, payment_status, total_amount, device_subtotal, subscription_discount, promo_discount, happy_hour_discount, hour_pass_discount, amount_paid, billed_on_actual_time, completed_at"
      )
      .eq("id", bookingId)
      .single();

    if (bookingError) throw bookingError;

    const bookingPaymentStatus = derivePaymentStatus(
      Number(booking.total_amount || 0),
      Number(booking.amount_paid || 0),
      booking.payment_status,
      booking.billed_on_actual_time === true && !booking.completed_at
    );
    if (
      booking.status === "cancelled" ||
      bookingPaymentStatus === "paid" ||
      bookingPaymentStatus === "refunded"
    ) {
      return {
        success: false,
        error: booking.status === "cancelled"
          ? "This booking is cancelled. Food can no longer be changed."
          : "This booking is fully settled. Food can no longer be changed."
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
    const hourPassDiscount = Number(booking.hour_pass_discount || 0);
    const amountPaid = Number(booking.amount_paid || 0);

    const newTotal =
      deviceSubtotal + newFoodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount - hourPassDiscount;

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
  customerDob: string | null;
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
        p_dob: payload.customerDob || null
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
        customer_dob: payload.customerDob || null,
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

/**
 * Customers whose number starts with what has been typed so far.
 *
 * The counterpart to `lookupWalkInCustomer`, which needs all ten digits and an
 * exact hit. This is what stops a returning customer being registered twice
 * because one digit was misheard: the desk sees the name against the number
 * before it commits to it, and picks the row rather than retyping it.
 *
 * Staff-gated like the exact lookup, and for the same reason - there is no OTP
 * for somebody standing at the counter. It returns a name and a number and
 * nothing else: enough to tell two matches apart, and no reason for a half-typed
 * prefix to hand back dates of birth and email addresses.
 */
/**
 * The same suggestions, found by name instead of by number.
 *
 * Staff know regulars by name long before they know their number, and the
 * customer standing at the counter will say "Sreejith" before they recite ten
 * digits. Without this the desk either asks for a number it does not need or
 * types a fresh profile for somebody already in the book - the duplicate the
 * phone suggestions exist to prevent, arriving through the other door.
 *
 * Matches anywhere in the name, not just the front. Half these rows are two
 * words ("Santu pramanik", "kumar export") and the half a person remembers is
 * as often the second as the first, so a prefix-only search would answer
 * "nobody" to a name that is plainly there.
 */
export async function searchWalkInCustomersByName(name: string) {
  await requireStaff();

  try {
    const query = nameQuery(name);

    // Same floor as the phone search, for the same reason: two letters match a
    // large arbitrary slice of the phone book, which is worse than no list at
    // all because the desk would read it.
    if (query.length < CUSTOMER_NAME_MIN_CHARS) {
      return { success: true, customers: [] as CustomerSuggestion[] };
    }

    // `nameQuery` has already taken the wildcards out, so the only thing these
    // per-cent signs can mean is "anywhere in the name".
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone")
      .ilike("name", `%${query}%`)
      .order("name", { ascending: true })
      .limit(CUSTOMER_SUGGESTION_LIMIT);

    if (error) throw error;

    return { success: true, customers: (data || []) as CustomerSuggestion[] };
  } catch (err: any) {
    console.error("Walk-in customer name suggestion error:", err);
    // A failed suggestion is not a failed booking, exactly as above: the desk
    // falls back to the number, which is the path that existed before this did.
    return { success: false, error: err.message, customers: [] as CustomerSuggestion[] };
  }
}

export async function searchWalkInCustomers(phone: string) {
  await requireStaff();

  try {
    const digits = phoneDigits(phone);

    // Below the floor this answers "nothing", not "everybody". A prefix that
    // short matches an arbitrary handful of a phone book thousands long, and a
    // list like that is worse than none because staff would read it.
    if (digits.length < CUSTOMER_SUGGESTION_MIN_DIGITS) {
      return { success: true, customers: [] as CustomerSuggestion[] };
    }

    // A prefix, because the number is being typed left to right. `digits` is
    // stripped to digits, so there is no wildcard left in it to escape.
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone")
      .like("phone", `${digits}%`)
      .order("phone", { ascending: true })
      .limit(CUSTOMER_SUGGESTION_LIMIT);

    if (error) throw error;

    return { success: true, customers: (data || []) as CustomerSuggestion[] };
  } catch (err: any) {
    console.error("Walk-in customer suggestion error:", err);
    // A failed suggestion is not a failed booking. The desk types the number and
    // presses Verify exactly as it did before this existed.
    return { success: false, error: err.message, customers: [] as CustomerSuggestion[] };
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
export async function getWalkInDeviceAvailability(
  deviceTypeId: string,
  /**
   * The times the desk has entered, so this asks about the window the booking
   * will actually claim rather than about a five-hour block from now.
   *
   * Omitted - a device type picked before anybody has typed a time - falls back
   * to exactly that block, which is what check-in claims when nothing is said.
   */
  window?: { startedClock?: string | null; plannedEndClock?: string | null }
): Promise<{
  success: boolean;
  error?: string;
  availability: WalkInDeviceAvailability | null;
}> {
  await requireStaff();

  try {
    if (!deviceTypeId) {
      return { success: false, error: "No device type given.", availability: null };
    }

    // The same arithmetic `checkin_walkin_session` does, so a station this calls
    // busy is a station the claim would have refused. A planned end shortens the
    // block; a backdated start moves it earlier, and past midnight it moves the
    // date with it.
    const claim = sessionClaimWindow(window ?? {});

    const free = await countAvailableDevicesForRange(deviceTypeId, claim.slotDate, {
      start: claim.start,
      end: claim.end
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
  customerDob: string | null;
  deviceTypeId: string;
  deviceTypeName: string;
  playerCount: number;
  /**
   * 24-hour `HH:MM` the customer started playing, for a walk-in that was already
   * under way before the desk typed it in. Null - the ordinary case - creates the
   * booking waiting for check-in, with no time and no station, as before.
   */
  startedClock?: string | null;
  /**
   * 24-hour `HH:MM` the customer expects to finish, when they have said. The
   * station is held for that window instead of the five-hour placeholder, and
   * the session keeps running: nothing here is billed, because the bill is still
   * worked out at checkout from the time actually played.
   *
   * Only meaningful alongside `startedClock`, which is the only path on this
   * form that checks the customer in.
   */
  plannedEndClock?: string | null;
}) {
  await requireStaff();

  // Read before anything is written. A time the desk has to go back and correct
  // should not leave an empty booking behind for somebody to cancel.
  if (payload.plannedEndClock) {
    /**
     * A planned end with no start would be a promise about a session that has
     * not begun. The booking would sit waiting for check-in, and by the time
     * somebody pressed the button the time typed here could be hours past.
     */
    if (!payload.startedClock) {
      return {
        success: false,
        error: "A planned end needs a start time, so the session begins as it is saved."
      };
    }

    const planned = resolvePlannedSession(payload.startedClock, payload.plannedEndClock);
    if (!planned.ok) return { success: false, error: planned.error };
  } else if (payload.startedClock) {
    const resolved = resolveBackdatedStart(payload.startedClock);
    if (!resolved.ok) return { success: false, error: resolved.error };
  }

  try {
    const { data: customerId, error: customerError } = await supabaseAdmin
      .rpc("get_or_create_customer", {
        p_phone: payload.customerPhone,
        p_name: payload.customerName,
        p_email: payload.customerEmail || null,
        p_dob: payload.customerDob || null
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
        customer_dob: payload.customerDob || null,
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
        walk_in_pending_start_time: payload.startedClock || null,
        walk_in_pending_end_time: payload.startedClock ? payload.plannedEndClock || null : null,
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
    let heldUntil: string | null = null;

    if (payload.startedClock) {
      const checkIn = await checkInWalkInSession(
        booking.id,
        payload.startedClock,
        payload.plannedEndClock
      );
      if (checkIn.success) {
        checkedIn = true;
        stationNumber = checkIn.stationNumber ?? null;
        checkedInAt = checkIn.checkedInAt ?? null;
        heldUntil = checkIn.heldUntil ?? null;
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
      checkInError,
      heldUntil
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
  startedClock?: string | null,
  /**
   * 24-hour `HH:MM` the customer expects to finish. Omitted or null holds the
   * station for `PROVISIONAL_SESSION_HOURS`, which is what every existing caller
   * wants. It decides how long the station is claimed for and nothing else - the
   * bill still comes from checkout.
   */
  plannedEndClock?: string | null
) {
  await requireStaff();

  try {
    const { data: booking, error: readError } = await supabaseAdmin
      .from("bookings")
      .select(
        `status, checked_in_at, billed_on_actual_time,
         walk_in_device_type_id, walk_in_device_type_name, walk_in_player_count,
         walk_in_pending_start_time, walk_in_pending_end_time`
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

    // Postgres TIME values arrive from Supabase with seconds (HH:MM:SS),
    // while the arena time parsers intentionally accept the UI's HH:MM value.
    const asClock = (value: string | null | undefined) => value ? value.slice(0, 5) : null;
    const requestedStart = asClock(startedClock || booking.walk_in_pending_start_time || null);
    const requestedEnd = asClock(plannedEndClock || booking.walk_in_pending_end_time || null);
    let startedFrom: string | null = null;
    let plannedEnd: string | null = null;
    if (requestedEnd) {
      const planned = resolvePlannedSession(requestedStart, requestedEnd);
      if (!planned.ok) return { success: false, error: planned.error };
      if (requestedStart) startedFrom = planned.session.start.clock;
      plannedEnd = planned.session.end.clock;
    } else if (requestedStart) {
      const resolved = resolveBackdatedStart(requestedStart);
      if (!resolved.ok) return { success: false, error: resolved.error };
      startedFrom = resolved.start.clock;
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
      p_max_backdate_hours: MAX_BACKDATED_START_HOURS,
      p_planned_end: plannedEnd,
      p_max_session_hours: MAX_PLANNED_SESSION_HOURS
    });

    if (error) throw error;

    const started = (data as Array<{
      started_at: string;
      device_id: string;
      station_number: string;
      held_until: string;
    }>) || [];

    if (started.length === 0) {
      return {
        success: false,
        error:
          `Every ${booking.walk_in_device_type_name || "station"} is in use right now. ` +
          `Free one up or move this customer to another device type.`
      };
    }

    const { error: clearPendingTimeError } = await supabaseAdmin
      .from("bookings")
      .update({ walk_in_pending_start_time: null, walk_in_pending_end_time: null })
      .eq("id", bookingId)
      .eq("status", "checked_in");
    if (clearPendingTimeError) throw clearPendingTimeError;

    return {
      success: true,
      checkedInAt: started[0].started_at,
      stationNumber: started[0].station_number,
      heldUntil: started[0].held_until
    };
  } catch (err: any) {
    console.error("Check-in walk-in session error:", err);
    return { success: false, error: err.message };
  }
}

/** Correct the device on an active walk-in without ending its session. */
export async function changeCheckedInWalkInDevice(bookingId: string, deviceTypeId: string) {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin.rpc("change_checked_in_walkin_device_v1", {
      p_booking_id: bookingId,
      p_device_type_id: deviceTypeId,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) return { success: false, error: "Could not move the session to that device." };

    return {
      success: true,
      stationNumber: result.station_number,
      deviceTypeName: result.device_type_name,
    };
  } catch (err: any) {
    console.error("Change checked-in walk-in device error:", err);
    const message = String(err?.message || "Could not change the session device.");
    return {
      success: false,
      error: message.includes("No station of this device type is free")
        ? "No station of that device type is free for this session. The current device was left unchanged."
        : message,
    };
  }
}

/** Correct the recorded start time on an active walk-in session. */
export async function changeCheckedInWalkInStartTime(bookingId: string, startedClock: string) {
  await requireStaff();

  const resolved = resolveBackdatedStart(startedClock);
  if (!resolved.ok) return { success: false, error: resolved.error };

  try {
    const { data, error } = await supabaseAdmin.rpc("change_checked_in_walkin_start_v1", {
      p_booking_id: bookingId,
      p_started_clock: resolved.start.clock,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) return { success: false, error: "Could not update the session start time." };

    return { success: true, checkedInAt: result.checked_in_at };
  } catch (err: any) {
    console.error("Change checked-in walk-in start time error:", err);
    return {
      success: false,
      error: String(err?.message || "Could not update the session start time."),
    };
  }
}

/**
 * Change when a live walk-in is expected to finish, or take the plan off.
 *
 * Customers change their minds - they order food, they win a frame, they stay
 * another hour - and until this existed the only way to alter the hold was to
 * check them out. It matters because of what the planned end now does: the
 * station goes back on sale the moment the stated finish passes, so a customer
 * who said "nine" and meant "ten" would spend an hour looking free while sitting
 * at it.
 *
 * The check that makes this safe is in SQL, not here. Between the plan being set
 * and being extended, the hours it freed may already have been sold, so
 * `set_walkin_planned_end` re-tests the new window against the station under the
 * same advisory lock `assign_device_slot` takes. What is checked up here is only
 * the shape of the reading, so the desk gets a sentence rather than a Postgres
 * exception.
 */
export async function setWalkInPlannedEnd(
  bookingId: string,
  /** 24-hour `HH:MM` the customer now expects to finish, or null to remove it. */
  plannedEndClock: string | null
) {
  await requireStaff();

  if (plannedEndClock) {
    // Read against now rather than against the session's start, which this has
    // not loaded: a changed finish can only ever point forwards, so "now" is the
    // right floor for it. SQL applies the stricter test - within
    // MAX_PLANNED_SESSION_HOURS of the *start* - once it has the row.
    const planned = resolvePlannedSession(null, plannedEndClock);
    if (!planned.ok) return { success: false, error: planned.error };
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("set_walkin_planned_end", {
      p_booking_id: bookingId,
      p_planned_end: plannedEndClock,
      p_max_session_hours: MAX_PLANNED_SESSION_HOURS,
      p_provisional_hours: PROVISIONAL_SESSION_HOURS
    });

    if (error) throw error;

    const changed = (data as Array<{ held_until: string; station_number: string }>) || [];

    if (changed.length === 0) {
      return {
        success: false,
        error: "That booking is not a session in progress, so it has nothing to hold."
      };
    }

    return {
      success: true,
      heldUntil: changed[0].held_until,
      stationNumber: changed[0].station_number
    };
  } catch (err: any) {
    console.error("Set walk-in planned end error:", err);
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
 *
 * A planned end on the booking changes nothing here. It was a statement of when
 * the customer expected to leave, written onto the slot row so the floor knew
 * what to expect; what they are billed for is the time between these two
 * timestamps, whether they left early or sat on past it.
 */
export async function checkOutWalkInSession(
  bookingId: string,
  /**
   * When the customer actually left, on the arena's clock.
   *
   * Omitted, the database clock decides exactly as it always did - so the
   * ordinary checkout is unchanged and this argument is only ever the answer to
   * "they left earlier than this".
   *
   * Sent as a date and a clock rather than an instant on purpose: the browser
   * would otherwise be converting to UTC with its own idea of the offset, and a
   * desk on a laptop whose zone is wrong would silently bill the wrong window.
   * The conversion happens in SQL, against a named zone.
   */
  statedEnd?: { date: string; clock: string }
) {
  await requireStaff();

  try {
    if (statedEnd) {
      // Checked here as well as in the database, because this is a public
      // endpoint and `statedEnd` is whatever the caller sent. The database
      // repeats it; neither copy is the only one.
      const { data: session } = await supabaseAdmin
        .from("bookings")
        .select("checked_in_at")
        .eq("id", bookingId)
        .maybeSingle();

      const resolved = resolveCheckoutTime(
        { date: statedEnd.date, clock: statedEnd.clock, checkedInAt: session?.checked_in_at }
      );
      if (!resolved.ok) return { success: false, error: resolved.error };
    }

    const { data, error } = await supabaseAdmin.rpc("checkout_walkin_session", {
      p_booking_id: bookingId,
      p_completed_date: statedEnd?.date ?? null,
      p_completed_clock: statedEnd?.clock ?? null
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
        .select("status, billed_on_actual_time, completed_at")
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
        if (booking.billed_on_actual_time && booking.completed_at) {
          await saveSharedPlayShares(bookingId, new Date(booking.completed_at));
          const { data: completedBooking, error: completedError } = await supabaseAdmin
            .from("bookings")
            .select("device_subtotal, total_amount, hour_pass_discount")
            .eq("id", bookingId)
            .single();
          if (completedError) throw completedError;
          return {
            success: true,
            deviceSubtotal: Number(completedBooking.device_subtotal || 0),
            totalAmount: Number(completedBooking.total_amount || 0),
            hourPassDiscount: Number(completedBooking.hour_pass_discount || 0),
          };
        }
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
    let extraPlayersTotal = pricing.extraPlayersTotal;
    let deviceSubtotal = pricing.deviceSubtotal;

    // Food already on the booking stays; only the device side is priced here.
    const { data: current, error: currentError } = await supabaseAdmin
      .from("bookings")
      .select(
        "customer_phone, food_subtotal, promo_discount, walk_in_device_type_id, walk_in_device_type_name, shared_play_enabled"
      )
      .eq("id", bookingId)
      .single();

    if (currentError) throw currentError;

    let sharedPlayCalculation: ReturnType<typeof calculateSharedPlayShares> | null = null;
    let billedPricing = pricing;
    if (current.shared_play_enabled) {
      const { data: participants, error: participantsError } = await supabaseAdmin
        .from("shared_play_participants")
        .select("id")
        .eq("booking_id", bookingId);
      if (participantsError) throw participantsError;
      const participantIds = (participants || []).map((participant: { id: string }) => participant.id);
      if (participantIds.length === 0) {
        throw new Error("Shared play is enabled but the booking has no participants.");
      }

      const { data: periods, error: periodsError } = await supabaseAdmin
        .from("shared_play_periods")
        .select("id, participant_id, started_at, ended_at")
        .in("participant_id", participantIds);
      if (periodsError) throw periodsError;

      sharedPlayCalculation = calculateSharedPlayShares(
        periods || [],
        Number(slot.hourly_rate || 0),
        Number(slot.extra_player_charge || 0),
        Number(slot.included_players || 1),
        null,
        endedAt
      );
      extraPlayersTotal = sharedPlayCalculation.extraPlayersTotal;
      const sharedPlayDeviceCharges = sharedPlayCalculation.deviceCharges;
      deviceSubtotal = roundToTwo(sharedPlayDeviceCharges + extraPlayersTotal);
      billedPricing = {
        ...pricing,
        playedMinutes: Math.ceil(sharedPlayCalculation.trackedHours * 60),
        durationHours: sharedPlayCalculation.trackedHours,
        deviceCharges: sharedPlayDeviceCharges,
        extraPlayersTotal,
        deviceSubtotal
      };

      for (const share of sharedPlayCalculation.shares) {
        const { error: shareError } = await supabaseAdmin
          .from("shared_play_participants")
          .update({ billed_amount: share.amount })
          .eq("id", share.participantId);
        if (shareError) throw shareError;
      }
    }

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
        slot_total: billedPricing.deviceCharges,
        extra_players_total: extraPlayersTotal
      })
      .eq("id", slot.id);

    if (slotUpdateError) throw slotUpdateError;

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
    const discountable = deviceSubtotal;

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
      roundToTwo(deviceSubtotal + foodSubtotal - totalDiscount)
    );

    const { error: bookingUpdateError } = await supabaseAdmin
      .from("bookings")
      .update({
        device_subtotal: deviceSubtotal,
        subscription_discount: subscriptionDiscount,
        happy_hour_discount: happyHour.discount,
        hour_pass_discount: 0,
        total_amount: totalAmount,
        updated_at: new Date().toISOString()
      })
      .eq("id", bookingId);

    if (bookingUpdateError) throw bookingUpdateError;

    await rewriteSessionLineItems(
      bookingId,
      billedPricing,
      Number(slot.hourly_rate || 0),
      {
        subscriptionDiscount,
        subscriptionPercentage: membership.discountPercentage,
        happyHour
      },
      sharedPlayCalculation !== null
    );
    await saveSharedPlayShares(bookingId, endedAt);

    const { data: finalBooking, error: finalBookingError } = await supabaseAdmin
      .from("bookings")
      .select("hour_pass_discount, total_amount")
      .eq("id", bookingId)
      .single();
    if (finalBookingError) throw finalBookingError;

    return {
      success: true,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      playedMinutes: pricing.playedMinutes,
      durationLabel: formatPlayedDuration(pricing.playedMinutes),
      deviceSubtotal,
      subscriptionDiscount,
      happyHourDiscount: happyHour.discount,
      happyHourRuleName: happyHour.ruleName,
      totalAmount: Number(finalBooking.total_amount || totalAmount),
      hourPassDiscount: Number(finalBooking.hour_pass_discount || 0)
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
  },
  sharedPlay = false
) {
  await supabaseAdmin
    .from("booking_line_items")
    .delete()
    .eq("booking_id", bookingId)
    .in("item_type", ["device", "extra_players", "subscription_discount", "happy_hour_discount", "hour_pass_discount"]);

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

  if (sharedPlay && pricing.extraPlayersTotal > 0) {
    lineItems.push({
      booking_id: bookingId,
      item_type: "extra_players",
      description: "Shared play extra-player charges",
      quantity: 1,
      unit_price: pricing.extraPlayersTotal,
      line_total: pricing.extraPlayersTotal,
      added_by: "admin",
      is_paid: false,
      display_order: 2
    });
  } else if (!sharedPlay && pricing.extraPlayersCount > 0) {
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
      .select("*, bookings!inner(id, status, payment_status, total_amount, amount_paid, device_subtotal, food_subtotal, subscription_discount, promo_discount, happy_hour_discount, hour_pass_discount, billed_on_actual_time, completed_at)")
      .eq("id", slotId)
      .single();

    if (slotError || !slot) throw slotError || new Error("Slot not found");

    const bookingPaymentStatus = derivePaymentStatus(
      Number(slot.bookings.total_amount || 0),
      Number(slot.bookings.amount_paid || 0),
      slot.bookings.payment_status,
      slot.bookings.billed_on_actual_time === true && !slot.bookings.completed_at
    );
    if (
      slot.bookings.status === "cancelled" ||
      bookingPaymentStatus === "paid" ||
      bookingPaymentStatus === "refunded"
    ) {
      return {
        success: false,
        error: slot.bookings.status === "cancelled"
          ? "This booking is cancelled. Player count can no longer be changed."
          : "This booking is fully settled. Player count can no longer be changed."
      };
    }

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
    const hourPassDiscount = Number(slot.bookings.hour_pass_discount || 0);

    // Recalculate total: (device + food) - all discounts
    const newTotalAmount = newDeviceSubtotal + foodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount - hourPassDiscount;

    const { error: updateBookingError } = await supabaseAdmin
      .from("bookings")
      .update({
        device_subtotal: newDeviceSubtotal,
        total_amount: newTotalAmount,
        payment_status: settlementStatus({
          amountPaid: Number(slot.bookings.amount_paid || 0),
          total: newTotalAmount
        }),
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
    await saveSharedPlayShares(bookingId, new Date(now));

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
        customer_id,
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
        hour_pass_discount,
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

    let walletBalance = 0;
    if (data.customer_id) {
      const { data: wallet, error: walletError } = await supabaseAdmin
        .from("customer_wallet_balances")
        .select("balance,reserved_balance")
        .eq("customer_id", data.customer_id)
        .maybeSingle();
      if (walletError) throw walletError;
      walletBalance = Math.max(0, Number(wallet?.balance || 0) - Number(wallet?.reserved_balance || 0));
    }

    // Calculate correct total_amount (don't trust stored value)
    const deviceSubtotal = Number(data.device_subtotal || 0);
    const foodSubtotal = Number(data.food_subtotal || 0);
    const subscriptionDiscount = Number(data.subscription_discount || 0);
    const promoDiscount = Number(data.promo_discount || 0);
    const happyHourDiscount = Number(data.happy_hour_discount || 0);
    const hourPassDiscount = Number(data.hour_pass_discount || 0);
    const amountPaid = Number(data.amount_paid || 0);

    const correctTotal = Math.max(
      0,
      roundToTwo(
        deviceSubtotal + foodSubtotal - subscriptionDiscount - promoDiscount - happyHourDiscount - hourPassDiscount
      )
    );

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
        wallet_balance: walletBalance,
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
    walletAmount?: number;
    idempotencyKey?: string;
  }
) {
  await requireStaff();

  try {
    const walletAmount = Number(paymentSplit.walletAmount || 0);
    const totalSplit = paymentSplit.cashAmount + paymentSplit.cardAmount + paymentSplit.upiAmount + walletAmount;
    if ([paymentSplit.cashAmount, paymentSplit.cardAmount, paymentSplit.upiAmount, walletAmount].some((amount) => !Number.isFinite(amount) || amount < 0)) {
      throw new Error("Payment amounts must be non-negative numbers");
    }
    if (walletAmount > 0 && !paymentSplit.idempotencyKey) throw new Error("Wallet payment request expired. Reopen the payment dialog.");

    const { error } = await supabaseAdmin.rpc("wallet_apply_booking_payment", {
      p_booking_id: bookingId,
      p_cash_amount: paymentSplit.cashAmount,
      p_card_amount: paymentSplit.cardAmount,
      p_upi_amount: paymentSplit.upiAmount,
      p_wallet_amount: walletAmount,
      p_idempotency_key: paymentSplit.idempotencyKey || crypto.randomUUID()
    });
    if (error) throw error;

    return {
      success: true,
      message: "Booking marked as paid",
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
        hour_pass_discount: 0,
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
