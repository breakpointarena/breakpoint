"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  isBillableBooking,
  outstandingAmount,
  settlementStatus,
} from "@/lib/payments/paymentStatus";
import { foodPaymentRatio, revenueSplit, type BookingMoney } from "@/lib/payments/revenueSplit";
import { partitionCancelled, refundPosition } from "@/lib/reports/cancellations";

/** The money columns, named as `revenueSplit` wants them. */
function moneyOf(booking: any): BookingMoney {
  return {
    deviceSubtotal: booking.device_subtotal,
    foodSubtotal: booking.food_subtotal,
    subscriptionDiscount: booking.subscription_discount,
    promoDiscount: booking.promo_discount,
    happyHourDiscount: booking.happy_hour_discount,
    amountPaid: booking.amount_paid,
  };
}

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
}

// Food Reports
export async function getFoodReports(filters?: ReportFilters) {
  await requireAdmin();

  try {
    // Get all bookings with food items - only from PAID bookings or PARTIAL bookings where food is actually paid
    // We need to get the full booking data to calculate how much of the payment went to food
    const { data: allBookings, error } = await supabaseAdmin
      .from("bookings")
      .select(`
        id,
        booking_number,
        customer_name,
        device_subtotal,
        food_subtotal,
        subscription_discount,
        promo_discount,
        happy_hour_discount,
        total_amount,
        amount_paid,
        status,
        payment_status,
        created_at,
        updated_at,
        payment_groups(paid_at),
        booking_food_items(
          id,
          item_name,
          item_category,
          quantity,
          unit_price,
          line_total,
          status,
          created_at
        )
      `)
      .neq("status", "cancelled")
      .in("payment_status", ["paid", "partial"])
      .gt("food_subtotal", 0)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Filter by payment date (use paid_at if available, otherwise use updated_at as fallback)
    let data = allBookings;
    if (filters?.dateFrom || filters?.dateTo) {
      data = (allBookings || []).filter((booking: any) => {
        // Use paid_at from payment_groups, fallback to booking updated_at
        const paidAt = booking.payment_groups?.paid_at || booking.updated_at || booking.created_at;
        if (!paidAt) return false;

        const paidDate = paidAt.split('T')[0];
        if (filters.dateFrom && paidDate < filters.dateFrom) return false;
        if (filters.dateTo && paidDate > filters.dateTo) return false;

        return true;
      });
    }

    // Aggregate by item
    const itemStats: Record<string, {
      itemName: string;
      category: string;
      totalQuantity: number;
      totalRevenue: number;
      orderCount: number;
    }> = {};

    // Aggregate by category
    const categoryStats: Record<string, {
      category: string;
      totalQuantity: number;
      totalRevenue: number;
      itemCount: number;
    }> = {};

    let totalRevenue = 0;
    let totalItemsSold = 0;
    const uniqueBookings = new Set<string>();

    (data || []).forEach((booking: any) => {
      const split = revenueSplit(moneyOf(booking));

      // This report is about food that has earned money. An order still to be
      // settled at the desk is not revenue and does not belong here.
      if (split.foodCollected <= 0) {
        return;
      }

      const ratio = foodPaymentRatio(split);

      const soldItems = (booking.booking_food_items || []).filter(
        (item: any) => String(item.status ?? '').toLowerCase() !== 'cancelled'
      );

      // Every line on this order was called off, so there is no sale to report
      // even though the booking itself went ahead.
      if (soldItems.length === 0) return;

      // Track unique booking for totalOrders count
      uniqueBookings.add(booking.booking_number);

      soldItems.forEach((item: any) => {
        const itemName = item.item_name;
        const category = item.item_category || "Uncategorized";

        // What this item has earned so far. A booking is settled as a whole, so
        // a part-paid order is shared across its items rather than pretending
        // one of them was singled out.
        const itemRevenue = Number(item.line_total) * ratio;

        // Item stats
        if (!itemStats[itemName]) {
          itemStats[itemName] = {
            itemName,
            category,
            totalQuantity: 0,
            totalRevenue: 0,
            orderCount: 0
          };
        }
        itemStats[itemName].totalQuantity += item.quantity;
        itemStats[itemName].totalRevenue += itemRevenue;
        itemStats[itemName].orderCount += 1;

        // Category stats
        if (!categoryStats[category]) {
          categoryStats[category] = {
            category,
            totalQuantity: 0,
            totalRevenue: 0,
            itemCount: 0
          };
        }
        categoryStats[category].totalQuantity += item.quantity;
        categoryStats[category].totalRevenue += itemRevenue;
        categoryStats[category].itemCount = Object.values(itemStats).filter(i => i.category === category).length;

        totalRevenue += itemRevenue;
        totalItemsSold += item.quantity;
      });
    });

    const topItems = Object.values(itemStats)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);

    const categoryBreakdown = Object.values(categoryStats)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Count unique bookings with paid food
    const totalOrders = uniqueBookings.size;

    return {
      success: true,
      summary: {
        totalRevenue,
        totalItemsSold,
        totalOrders,
        averageOrderValue: totalOrders ? totalRevenue / totalOrders : 0
      },
      topItems,
      categoryBreakdown,
      recentOrders: (data || []).slice(0, 20).flatMap((b: any) =>
        (b.booking_food_items || []).map((item: any) => ({
          ...item,
          bookings: {
            booking_number: b.booking_number,
            customer_name: b.customer_name,
            status: b.status,
            payment_status: b.payment_status,
            created_at: b.created_at,
            updated_at: b.updated_at,
            payment_groups: b.payment_groups
          }
        }))
      ).slice(0, 20)
    };
  } catch (err: any) {
    console.error("Get food reports error:", err);
    return { success: false, error: err.message };
  }
}

// Device Reports
export async function getDeviceReports(filters?: ReportFilters) {
  await requireAdmin();

  try {
    // Get all bookings with device revenue from PAID and PARTIAL bookings
    const { data: allData, error } = await supabaseAdmin
      .from("bookings")
      .select(`
        id,
        booking_number,
        customer_name,
        device_subtotal,
        food_subtotal,
        subscription_discount,
        promo_discount,
        happy_hour_discount,
        amount_paid,
        status,
        payment_status,
        created_at,
        updated_at,
        payment_groups(paid_at),
        booking_device_slots(
          id,
          device_type,
          device_station_number,
          slot_date,
          slot_start_time,
          slot_end_time,
          duration_hours,
          hourly_rate,
          slot_total,
          player_count,
          extra_players_total,
          created_at
        )
      `)
      .neq("status", "cancelled")
      .in("payment_status", ["paid", "partial"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Filter by payment date (use paid_at if available, otherwise use updated_at as fallback)
    let data = allData;
    if (filters?.dateFrom || filters?.dateTo) {
      data = (allData || []).filter((booking: any) => {
        // Use paid_at from payment_groups, fallback to booking updated_at
        const paidAt = booking.payment_groups?.paid_at || booking.updated_at || booking.created_at;
        if (!paidAt) return false;

        const paidDate = paidAt.split('T')[0];
        if (filters.dateFrom && paidDate < filters.dateFrom) return false;
        if (filters.dateTo && paidDate > filters.dateTo) return false;

        return true;
      });
    }

    /**
     * Food-only orders are not device bookings.
     *
     * A food order carries no `booking_device_slots`, which the aggregation below
     * read as "a device booking whose slot row is missing" and filed under
     * "Unknown" - so this tab listed the counter's food sales as an unnamed
     * device, and counted each one in `totalBookings`, diluting every
     * per-booking average with orders that never used a station. Food Reports
     * already accounts for them.
     *
     * The test is deliberately two-part rather than just "has slots": a booking
     * carrying device revenue but no slot row is a real device booking with
     * missing data, and belongs here under "Unknown" instead of being quietly
     * dropped out of device revenue.
     */
    const deviceBookings = (data || []).filter((booking: any) => {
      const hasSlots = (booking.booking_device_slots || []).length > 0;
      return hasSlots || Number(booking.device_subtotal || 0) > 0;
    });

    // Aggregate by device type
    const deviceTypeStats: Record<string, {
      deviceType: string;
      totalBookings: number;
      totalRevenue: number;
      totalHours: number;
      averagePlayersPerBooking: number;
      extraPlayerRevenue: number;
    }> = {};

    let totalRevenue = 0;
    let totalBookings = 0;
    let totalHours = 0;
    let totalPlayers = 0;

    // Process each booking
    deviceBookings.forEach((booking: any) => {
      const split = revenueSplit(moneyOf(booking));

      // What the slots on this booking have actually earned.
      const bookingDeviceRevenue = split.deviceCollected;
      const deviceSubtotal = Number(booking.device_subtotal || 0);

      // How much of the device charge has been settled, for the parts of a slot
      // that are reported separately from its revenue.
      const collectedFraction =
        split.deviceCharged > 0 ? split.deviceCollected / split.deviceCharged : 0;

      // Get slots for detailed breakdown by device type
      const slots = booking.booking_device_slots || [];

      if (slots.length > 0) {
        // Has slots - distribute revenue proportionally
        slots.forEach((slot: any) => {
          const deviceType = slot.device_type || "Unknown";
          const slotSubtotal = Number(slot.slot_total) + Number(slot.extra_players_total || 0);

          // Proportional revenue for this slot
          const slotProportion = deviceSubtotal > 0 ? slotSubtotal / deviceSubtotal : 0;
          const slotRevenue = bookingDeviceRevenue * slotProportion;

          if (!deviceTypeStats[deviceType]) {
            deviceTypeStats[deviceType] = {
              deviceType,
              totalBookings: 0,
              totalRevenue: 0,
              totalHours: 0,
              averagePlayersPerBooking: 0,
              extraPlayerRevenue: 0
            };
          }

          deviceTypeStats[deviceType].totalBookings += 1;
          deviceTypeStats[deviceType].totalRevenue += slotRevenue;
          deviceTypeStats[deviceType].totalHours += slot.duration_hours;
          /**
           * Earned, not charged.
           *
           * This used to add the whole `extra_players_total` however much of the
           * booking had been paid for, so a column of collected revenue carried
           * one figure of money that was merely owed - and an unpaid booking
           * could show more extra-player revenue than total revenue.
           */
          deviceTypeStats[deviceType].extraPlayerRevenue +=
            Number(slot.extra_players_total || 0) * collectedFraction;

          totalHours += slot.duration_hours;
          totalPlayers += slot.player_count || 0;
        });
      } else {
        // No slots - add to "Unknown" category
        const deviceType = "Unknown";
        if (!deviceTypeStats[deviceType]) {
          deviceTypeStats[deviceType] = {
            deviceType,
            totalBookings: 0,
            totalRevenue: 0,
            totalHours: 0,
            averagePlayersPerBooking: 0,
            extraPlayerRevenue: 0
          };
        }

        deviceTypeStats[deviceType].totalBookings += 1;
        deviceTypeStats[deviceType].totalRevenue += bookingDeviceRevenue;
      }

      totalRevenue += bookingDeviceRevenue;
      totalBookings += 1;
    });

    // Calculate average players per booking for each device type
    Object.keys(deviceTypeStats).forEach(deviceType => {
      const allSlots = deviceBookings.flatMap((b: any) => b.booking_device_slots || []);
      const deviceSlots = allSlots.filter((s: any) => s.device_type === deviceType);
      const totalPlayersForDevice = deviceSlots.reduce((sum: number, s: any) => sum + (s.player_count || 0), 0);
      deviceTypeStats[deviceType].averagePlayersPerBooking = deviceSlots.length > 0 ? totalPlayersForDevice / deviceSlots.length : 0;
    });

    const deviceBreakdown = Object.values(deviceTypeStats)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Daily utilization (bookings per day)
    const dailyBookings: Record<string, number> = {};
    deviceBookings.forEach((booking: any) => {
      const slots = booking.booking_device_slots || [];
      slots.forEach((slot: any) => {
        const date = slot.slot_date;
        dailyBookings[date] = (dailyBookings[date] || 0) + 1;
      });
    });

    return {
      success: true,
      summary: {
        totalRevenue,
        totalBookings,
        totalHours,
        averageRevenuePerBooking: totalBookings ? totalRevenue / totalBookings : 0,
        averagePlayersPerBooking: totalBookings ? totalPlayers / totalBookings : 0
      },
      deviceBreakdown,
      dailyBookings,
      // The table under the breakdown lists what this tab is about, so it is
      // drawn from the same filtered set - a food order has no station or slot to
      // show in it.
      recentBookings: deviceBookings.slice(0, 20)
    };
  } catch (err: any) {
    console.error("Get device reports error:", err);
    return { success: false, error: err.message };
  }
}

// Revenue Reports
export async function getRevenueReports(filters?: ReportFilters) {
  await requireAdmin();

  try {
    let query = supabaseAdmin
      .from("bookings")
      .select(`
        id,
        booking_number,
        customer_name,
        device_subtotal,
        food_subtotal,
        subscription_discount,
        promo_discount,
        happy_hour_discount,
        total_amount,
        amount_paid,
        cash_amount,
        card_amount,
        upi_amount,
        online_amount,
        payment_status,
        booking_source,
        status,
        created_at,
        updated_at,
        booking_device_slots(slot_date),
        payment_groups(paid_at)
      `)
      // Unpaid bookings are fetched too. They add nothing to revenue - their
      // amount_paid is zero - but the Payment Status panel cannot report what it
      // was never given, and filtering them out here is what made it read "0
      // pending" while money was outstanding.
      //
      // Cancelled ones are fetched for the same reason and separated below. A
      // booking that was paid for and then called off used to be dropped by the
      // database, so the money simply left the report with nothing saying it had
      // gone - and a refund nobody had made looked exactly like one they had.
      ;

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;

    /**
     * The date a booking belongs to in this report.
     *
     * Paid bookings are placed on the day the money arrived, which is what a
     * revenue report is about. An unpaid one has no such day, so it is placed on
     * the day it was raised - the alternative, `updated_at`, moves every time
     * anybody edits the booking.
     */
    const reportDate = (booking: any): string | null => {
      const paidAt =
        booking.payment_status === 'pending'
          ? booking.created_at
          : booking.payment_groups?.paid_at || booking.updated_at || booking.created_at;

      return paidAt ? paidAt.split('T')[0] : null;
    };

    let filteredData = data || [];
    if (filters?.dateFrom || filters?.dateTo) {
      filteredData = (data || []).filter((booking: any) => {
        const date = reportDate(booking);
        if (!date) return false;

        if (filters.dateFrom && date < filters.dateFrom) return false;
        if (filters.dateTo && date > filters.dateTo) return false;

        return true;
      });
    }

    /**
     * Called off, and therefore not trade.
     *
     * Kept out of every revenue figure and every count below - a cancelled
     * booking earns nothing and is owed nothing - but reported on its own, with
     * whatever was collected before it was cancelled. That figure is the arena's
     * refund exposure: money taken for a session nobody played.
     */
    const { active: activeData, cancelled: cancelledData } =
      partitionCancelled(filteredData as any[]);
    const refunds = refundPosition(cancelledData);

    /**
     * Money actually received. Every revenue figure is measured over these, so
     * including unpaid bookings above changes no revenue number and no average -
     * it only lets them be counted.
     *
     * Selected on the money rather than on `payment_status`: a booking carrying a
     * payment belongs in the revenue whatever word is stored beside it.
     */
    const revenueBookings = activeData.filter(
      (booking: any) => Number(booking.amount_paid || 0) > 0
    );

    /**
     * Bookings that are actually somebody's bill.
     *
     * Two kinds of row are not, and both were being counted as "pending":
     *
     * - An abandoned slot hold. A customer who opens the picker and backs out
     *   leaves a row that `release_slot_hold` moves to `expired` with no
     *   customer and no money. Ten of those sat in a database with three
     *   genuinely unpaid bookings, and the panel read fourteen pending.
     * - A walk-in still on the floor, which is priced at checkout and carries a
     *   total of zero until then. Nothing is owed on it yet.
     */
    const billed = activeData.filter((booking: any) =>
      isBillableBooking({ status: booking.status, total: booking.total_amount })
    );

    /**
     * Counted from the amounts, not from the stored word.
     *
     * `payment_status` is what drifts - a booking that had food added to it after
     * being paid for went on saying `paid` - and it drifts in exactly the
     * direction that empties this panel: the partial count was permanently zero
     * while the arena was owed for the food on it.
     */
    let paidBookingCount = 0;
    let partialBookingCount = 0;
    let pendingBookingCount = 0;

    for (const booking of billed) {
      const settled = settlementStatus({
        amountPaid: booking.amount_paid,
        total: booking.total_amount,
      });

      if (settled === 'paid') paidBookingCount++;
      else if (settled === 'partial') partialBookingCount++;
      else pendingBookingCount++;
    }

    /**
     * What the arena is still owed, across partial and unpaid alike.
     *
     * Measured over the same bookings the panel counts, and from the amounts
     * rather than from `payment_status`: skipping anything stored as `paid` left
     * out the ₹150 of food ordered against an already-paid slot, which is the
     * booking that is precisely being owed for.
     */
    const outstanding = billed.reduce(
      (sum: number, b: any) =>
        sum + outstandingAmount({ amountPaid: b.amount_paid, total: b.total_amount }),
      0
    );

    let totalRevenue = 0;
    let deviceRevenue = 0;
    let foodRevenue = 0;
    /** Received beyond anything charged, so it belongs to neither half above. */
    let unallocatedRevenue = 0;

    // Payment method totals
    let totalCash = 0;
    let totalCard = 0;
    let totalUpi = 0;
    let totalOnline = 0;

    // Revenue by source
    const sourceBreakdown: Record<string, {
      source: string;
      totalRevenue: number;
      bookingCount: number;
    }> = {};

    // Daily revenue
    const dailyRevenue: Record<string, {
      date: string;
      deviceRevenue: number;
      foodRevenue: number;
      totalRevenue: number;
    }> = {};

    revenueBookings.forEach((booking: any) => {
      const source = booking.booking_source || "online";

      // Track revenue by payment date, on the same rule the range filter used
      const revenueDate = reportDate(booking) as string;

      // Calculate actual revenue based on what was actually paid (amount_paid)
      // Revenue = what customer actually paid, not the calculated total_amount
      const revenue = Number(booking.amount_paid || 0);

      /**
       * Device against food, from the amounts rather than from `payment_status`.
       *
       * `deviceRev + foodRev` is what was received, to the paise, so this panel
       * and the payment-method totals beside it cannot drift apart. Anything
       * taken beyond what was ever charged stays out of both halves rather than
       * being quietly attributed to one - see `unallocatedRevenue` below.
       */
      const split = revenueSplit(moneyOf(booking));
      const deviceRev = split.deviceCollected;
      const foodRev = split.foodCollected;

      unallocatedRevenue += split.overpaid;

      totalRevenue += revenue;
      deviceRevenue += deviceRev;
      foodRevenue += foodRev;

      // Track payment method amounts
      totalCash += Number(booking.cash_amount || 0);
      totalCard += Number(booking.card_amount || 0);
      totalUpi += Number(booking.upi_amount || 0);
      totalOnline += Number(booking.online_amount || 0);

      // Source breakdown
      if (!sourceBreakdown[source]) {
        sourceBreakdown[source] = {
          source,
          totalRevenue: 0,
          bookingCount: 0
        };
      }
      sourceBreakdown[source].totalRevenue += revenue;
      sourceBreakdown[source].bookingCount += 1;

      // Daily revenue - track by payment date
      if (!dailyRevenue[revenueDate]) {
        dailyRevenue[revenueDate] = {
          date: revenueDate,
          deviceRevenue: 0,
          foodRevenue: 0,
          totalRevenue: 0
        };
      }
      dailyRevenue[revenueDate].deviceRevenue += deviceRev;
      dailyRevenue[revenueDate].foodRevenue += foodRev;
      dailyRevenue[revenueDate].totalRevenue += revenue;
    });

    const sourceBreakdownArray = Object.values(sourceBreakdown)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const dailyRevenueArray = Object.values(dailyRevenue)
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      summary: {
        totalRevenue,
        deviceRevenue,
        foodRevenue,
        // Bookings that produced revenue. Left as it was, on purpose: the
        // Overview tab reads this through getDashboardSummary, and revenue per
        // booking must not be divided by bookings that paid nothing.
        totalBookings: revenueBookings.length,
        paidBookings: paidBookingCount,
        partialBookings: partialBookingCount,
        pendingBookings: pendingBookingCount,
        /**
         * Denominator for the Payment Status bars.
         *
         * The three counts above and nothing else, so the bars always fill to a
         * whole. It used to be every non-cancelled row in range, which included
         * ten abandoned slot holds - so three bars covering fifteen real
         * bookings were drawn as fractions of twenty-six.
         */
        paymentStatusTotal: billed.length,
        /** Still owed across partial and unpaid bookings. */
        outstandingAmount: outstanding,
        /**
         * Bookings called off in this period, and what had been collected on
         * them before they were. Neither figure is part of the revenue above:
         * they say what left it.
         */
        cancelledBookings: cancelledData.length,
        cancelledCollected: refunds.collected,
        /** Already handed back, and therefore closed. */
        cancelledRefunded: refunds.refunded,
        /** Still held for a session nobody played - the figure to act on. */
        cancelledAwaitingRefund: refunds.awaitingRefund,
        /**
         * Money received beyond what any booking was charged. Normally zero;
         * anything here means device + food revenue will not add up to the total,
         * and the booking behind it wants looking at.
         */
        unallocatedRevenue,
        averageRevenuePerBooking: revenueBookings.length ? totalRevenue / revenueBookings.length : 0,
        deviceRevenuePercentage: totalRevenue ? (deviceRevenue / totalRevenue) * 100 : 0,
        // Payment method breakdown
        totalCash,
        totalCard,
        totalUpi,
        totalOnline,
        cashPercentage: totalRevenue ? (totalCash / totalRevenue) * 100 : 0,
        cardPercentage: totalRevenue ? (totalCard / totalRevenue) * 100 : 0,
        upiPercentage: totalRevenue ? (totalUpi / totalRevenue) * 100 : 0,
        onlinePercentage: totalRevenue ? (totalOnline / totalRevenue) * 100 : 0,
        foodRevenuePercentage: totalRevenue ? (foodRevenue / totalRevenue) * 100 : 0
      },
      sourceBreakdown: sourceBreakdownArray,
      dailyRevenue: dailyRevenueArray,
      recentTransactions: activeData.slice(0, 20)
    };
  } catch (err: any) {
    console.error("Get revenue reports error:", err);
    return { success: false, error: err.message };
  }
}

// Dashboard Summary (Overview)
export async function getDashboardSummary(filters?: ReportFilters) {
  await requireAdmin();

  try {
    const [foodResult, deviceResult, revenueResult] = await Promise.all([
      getFoodReports(filters),
      getDeviceReports(filters),
      getRevenueReports(filters)
    ]);

    if (!foodResult.success || !deviceResult.success || !revenueResult.success) {
      throw new Error("Failed to fetch dashboard data");
    }

    return {
      success: true,
      summary: {
        totalRevenue: revenueResult.summary?.totalRevenue || 0,
        deviceRevenue: revenueResult.summary?.deviceRevenue || 0,
        foodRevenue: revenueResult.summary?.foodRevenue || 0,
        totalBookings: revenueResult.summary?.totalBookings || 0,
        totalFoodOrders: foodResult.summary?.totalOrders || 0,
        totalItemsSold: foodResult.summary?.totalItemsSold || 0,
        totalHoursBooked: deviceResult.summary?.totalHours || 0,
        // What was called off, so the overview says why the takings are what
        // they are rather than leaving a gap nobody can account for.
        cancelledBookings: revenueResult.summary?.cancelledBookings || 0,
        cancelledCollected: revenueResult.summary?.cancelledCollected || 0,
        cancelledAwaitingRefund: revenueResult.summary?.cancelledAwaitingRefund || 0
      }
    };
  } catch (err: any) {
    console.error("Get dashboard summary error:", err);
    return { success: false, error: err.message };
  }
}

// ============================================
// EXPENSE MANAGEMENT ACTIONS
// ============================================

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: 'operational' | 'capital';
  created_at: string;
  created_by: string | null;
}

export interface ExpenseFilters {
  dateFrom?: string;
  dateTo?: string;
  category?: 'operational' | 'capital' | 'all';
}

export async function getExpenses(filters?: ExpenseFilters) {
  await requireAdmin();

  try {
    let query = supabaseAdmin
      .from("expenses")
      .select("*")
      .order("date", { ascending: false });

    if (filters?.dateFrom) {
      query = query.gte("date", filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte("date", filters.dateTo);
    }
    if (filters?.category && filters.category !== 'all') {
      query = query.eq("category", filters.category);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, expenses: data };
  } catch (error: any) {
    return { success: false, error: error.message, expenses: [] };
  }
}

export async function addExpense(expense: {
  date: string;
  description: string;
  amount: number;
  category: 'operational' | 'capital';
  created_by?: string;
}) {
  await requireAdmin();

  try {
    const { data, error } = await supabaseAdmin
      .from("expenses")
      .insert({
        date: expense.date,
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        created_by: expense.created_by || null,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, expense: data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateExpense(
  id: string,
  updates: {
    date?: string;
    description?: string;
    amount?: number;
    category?: 'operational' | 'capital';
  }
) {
  await requireAdmin();

  try {
    const { data, error} = await supabaseAdmin
      .from("expenses")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return { success: true, expense: data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteExpense(id: string) {
  await requireAdmin();

  try {
    const { error } = await supabaseAdmin
      .from("expenses")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================
// PROFIT & LOSS CALCULATIONS
// ============================================

export async function getProfitAndLoss(filters: { dateFrom: string; dateTo: string }) {
  await requireAdmin();

  try {
    // Get revenue from PAID and PARTIAL bookings (count only amount_paid)
    const { data: allPaidBookings, error: revenueError } = await supabaseAdmin
      .from("bookings")
      .select(`
        device_subtotal,
        food_subtotal,
        subscription_discount,
        promo_discount,
        happy_hour_discount,
        total_amount,
        amount_paid,
        payment_status,
        created_at,
        updated_at,
        booking_device_slots(slot_date),
        payment_groups(paid_at)
      `)
      .in("payment_status", ["paid", "partial"])
      .neq("status", "cancelled");

    if (revenueError) throw revenueError;

    // Filter by payment date (use paid_at if available, otherwise use updated_at as fallback)
    const paidBookings = (allPaidBookings || []).filter((booking: any) => {
      // Use paid_at from payment_groups, fallback to updated_at, then created_at
      const paidAt = booking.payment_groups?.paid_at || booking.updated_at || booking.created_at;
      if (!paidAt) return false;

      const paidDate = paidAt.split('T')[0];
      return paidDate >= filters.dateFrom && paidDate <= filters.dateTo;
    });

    // Calculate revenue breakdown - use actual amount paid minus discounts
    // Revenue = what we actually receive = amount_paid (which already has discounts deducted)
    let deviceRevenue = 0;
    let foodRevenue = 0;

    paidBookings.forEach((b: any) => {
      const amountPaid = Number(b.amount_paid || 0);
      const deviceSubtotal = Number(b.device_subtotal || 0);
      const foodSubtotal = Number(b.food_subtotal || 0);
      const subscriptionDiscount = Number(b.subscription_discount || 0);
      const promoDiscount = Number(b.promo_discount || 0);
      const happyHourDiscount = Number(b.happy_hour_discount || 0);
      const totalDiscount = subscriptionDiscount + promoDiscount + happyHourDiscount;

      // Discounts apply only to device revenue, not food
      const deviceAfterDiscount = Math.max(0, deviceSubtotal - totalDiscount);

      if (b.payment_status === 'partial') {
        // For partial: amount_paid usually covers device first
        deviceRevenue += Math.min(amountPaid, deviceAfterDiscount);
        foodRevenue += Math.max(0, amountPaid - deviceAfterDiscount);
      } else {
        // Fully paid - split based on actual amount paid proportionally
        const expectedTotal = deviceAfterDiscount + foodSubtotal;
        if (expectedTotal > 0) {
          deviceRevenue += (deviceAfterDiscount / expectedTotal) * amountPaid;
          foodRevenue += (foodSubtotal / expectedTotal) * amountPaid;
        } else {
          deviceRevenue += amountPaid;
          foodRevenue += 0;
        }
      }
    });

    const revenue = deviceRevenue + foodRevenue;

    // Get expenses with category breakdown
    const { data: expenses, error: expensesError } = await supabaseAdmin
      .from("expenses")
      .select("amount, description, category")
      .gte("date", filters.dateFrom)
      .lte("date", filters.dateTo);

    if (expensesError) throw expensesError;

    const totalExpenses = expenses?.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0) || 0;
    const opexExpenses = expenses?.filter((e: any) => e.category === 'operational')
      .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0) || 0;
    const capexExpenses = expenses?.filter((e: any) => e.category === 'capital')
      .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0) || 0;

    // Calculate profit (Revenue - OpEx only, as CapEx is not deducted from operational profit)
    const operationalProfit = revenue - opexExpenses;
    const netProfit = revenue - totalExpenses; // Including both OpEx and CapEx
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      success: true,
      data: {
        revenue,
        deviceRevenue,
        foodRevenue,
        totalExpenses,
        opexExpenses,
        capexExpenses,
        operationalProfit,
        netProfit,
        profit: netProfit, // For backward compatibility
        profitMargin,
        bookingCount: paidBookings.length,
        expenseCount: expenses?.length || 0,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
