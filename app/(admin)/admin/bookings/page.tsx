"use client";

import { useState, useEffect, useRef, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BookingStatusBadge } from "@/components/admin/bookings/BookingStatusBadge";
import { AttentionBadges } from "@/components/admin/bookings/AttentionBadges";
import { PaymentStatusBadge } from "@/components/admin/bookings/PaymentStatusBadge";
import { BookingsGrid } from "@/components/admin/bookings/BookingsGrid";
import { BookingDetailModal } from "@/components/admin/bookings/BookingDetailModal";
import { RevealAmount } from "@/components/admin/dashboard/RevealAmount";
import { useNotifications } from "@/lib/contexts/NotificationContext";
import { CheckoutModal } from "@/components/admin/bookings/CheckoutModal";
import { getAllBookings, getAttentionBookings, getBookingStats, checkInBooking, checkOutBooking, checkInWalkInSession, checkOutWalkInSession, getBookingBillingDetails, markBookingAsPaid, cancelBooking, markBookingRefunded, type BookingFilters } from "./actions";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { Search, Filter, Calendar, CalendarDays, IndianRupee, Users, CheckCircle2, Clock, Loader2, Eye, ReceiptIndianRupee, PlusCircle, UserCheck, LogOut, UtensilsCrossed, ChevronDown, ChevronRight, Link2, CreditCard, Grid3x3, List, AlertCircle, RefreshCw, ShieldAlert, AlertTriangle, Ban, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { CountUp } from "@/components/shared/CountUp";
import { roundToTwo, formatCurrency } from "@/lib/currency";
import { formatDbTime, formatDbTimeRange } from "@/lib/utils/timeSlots";
import { BookingTimingCell } from "@/components/admin/bookings/SessionTimeline";
import {
  arenaDate,
  arenaToday,
  formatClockTime12h,
  formatLocalDate,
  parseLocalDate,
  startOfLocalDay,
  validateReportDateRange
} from "@/lib/utils/dates";

export default function AdminBookingsPage() {
  const router = useRouter();
  const { addNotification } = useNotifications();
  const [bookings, setBookings] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300); // Debounce search by 300ms
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [attentionCount, setAttentionCount] = useState(0);

  /**
   * When the last tab-return resync ran.
   *
   * Returning to this screen fires both listeners below: "focus" catches an
   * alt-tab back into the browser, "visibilitychange" catches a switch between
   * tabs. They are complementary - neither alone covers both - but a plain
   * tab switch raises the two together, which re-read the whole screen twice.
   * Ignoring a second resync that lands in the same instant keeps both
   * triggers and pays for the reads once.
   */
  const lastResyncRef = useRef(0);

  /** The attention tab is a cross-status view, not one of the status filters. */
  const isAttentionTab = activeStatusFilter === "attention";
  // The page opens on today's sessions - the slots the front desk is working.
  // Defaults to the arena's today. `formatLocalDate` reads the browser's clock,
  // which is the same answer in India and a different one anywhere else.
  const [dateFrom, setDateFrom] = useState(() => arenaToday());
  const [dateTo, setDateTo] = useState(() => arenaToday());
  const [activeQuickFilter, setActiveQuickFilter] = useState<string>("today");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [openFoodModal, setOpenFoodModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null);
  const [openCheckoutModal, setOpenCheckoutModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [pendingPaymentModal, setPendingPaymentModal] = useState<{
    open: boolean;
    bookingId: string | null;
    balanceDue: number;
    bookingNumber: string;
    isCheckout: boolean; // Track if this is from checkout attempt (vs billing modal)
  }>({
    open: false,
    bookingId: null,
    balanceDue: 0,
    bookingNumber: "",
    isCheckout: false
  });
  const [paymentSplit, setPaymentSplit] = useState({
    cashAmount: 0,
    cardAmount: 0,
    upiAmount: 0
  });

  // Initialize payment split when modal opens
  useEffect(() => {
    if (pendingPaymentModal.open && pendingPaymentModal.balanceDue > 0) {
      // Default to full amount in cash
      setPaymentSplit({
        cashAmount: pendingPaymentModal.balanceDue,
        cardAmount: 0,
        upiAmount: 0
      });
    }
  }, [pendingPaymentModal.open, pendingPaymentModal.balanceDue]);

  // --- Date range validation -------------------------------------------------
  // Recomputed every render so the pickers stay in step with each other: the
  // bounds of one are always derived from the current value of the other.
  const today = startOfLocalDay(new Date());
  const fromDate = dateFrom ? parseLocalDate(dateFrom) : null;
  const toDate = dateTo ? parseLocalDate(dateTo) : null;
  const dateRangeError = validateReportDateRange(dateFrom, dateTo);

  // From Date runs up to the chosen To Date, and is unbounded without one
  const isFromDateDisabled = (day: Date) => {
    const candidate = startOfLocalDay(day);
    return !!toDate && candidate > toDate;
  };

  // To Date starts at the chosen From Date, and is unbounded without one
  const isToDateDisabled = (day: Date) => {
    const candidate = startOfLocalDay(day);
    return !!fromDate && candidate < fromDate;
  };

  const handleSelectFromDate = (date?: Date) => {
    if (!date) return;
    const next = formatLocalDate(date);
    setDateFrom(next);
    setActiveQuickFilter("");
    // Belt and braces: the picker disables these days, but a preset or a stale
    // popover must not be able to leave the range inverted.
    if (dateTo && next > dateTo) setDateTo(next);
  };

  const handleSelectToDate = (date?: Date) => {
    if (!date) return;
    const next = formatLocalDate(date);
    setDateTo(next);
    setActiveQuickFilter("");
    if (dateFrom && next < dateFrom) setDateFrom(next);
  };

  const setQuickDateRange = (preset: "today" | "future" | "7days" | "30days" | "month" | "90days" | "all") => {
    const now = new Date();
    // The arena's today, not the browser's. These presets are compared against
    // dates the server derives in Asia/Kolkata, so a staff laptop on any other
    // clock would ask for a range that does not line up with them.
    const todayStr = arenaToday(now);

    setActiveQuickFilter(preset);

    switch (preset) {
      case "today":
        setDateFrom(todayStr);
        setDateTo(todayStr);
        break;
      case "future": {
        // Tomorrow onwards, with no upper bound - a booking three months out
        // still belongs here. Every other preset looks backwards, so a future
        // reservation was only visible under "All Time", buried among the
        // history. This is the view for "what is coming".
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        setDateFrom(arenaDate(tomorrow));
        setDateTo("");
        break;
      }
      case "7days": {
        const week = new Date(now);
        week.setDate(week.getDate() - 7);
        setDateFrom(arenaDate(week));
        setDateTo(todayStr);
        break;
      }
      case "30days": {
        const month = new Date(now);
        month.setDate(month.getDate() - 30);
        setDateFrom(arenaDate(month));
        setDateTo(todayStr);
        break;
      }
      case "month": {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setDateFrom(arenaDate(firstDay));
        setDateTo(arenaDate(lastDay));
        break;
      }
      case "90days": {
        const quarter = new Date(now);
        quarter.setDate(quarter.getDate() - 90);
        setDateFrom(arenaDate(quarter));
        setDateTo(todayStr);
        break;
      }
      case "all":
        setDateFrom("");
        setDateTo("");
        break;
    }
  };

  // Every reload reads the live filter state, so no call site can silently drop
  // the selected date range.
  const buildFilters = (): BookingFilters => ({
    status: activeStatusFilter === "all" ? undefined : activeStatusFilter,
    searchQuery: debouncedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined
  });

  // Reload the list whenever a filter changes; the search box is debounced
  useEffect(() => {
    loadBookings();
  }, [debouncedSearch, activeStatusFilter, dateFrom, dateTo]);

  /**
   * Kept in step with the tabs so the badge is right even while another tab is
   * open - a count that only appears once you click it is no use as a warning.
   *
   * Deliberately not keyed on the bookings array. Every list load replaces it
   * with a fresh reference, so keying on it re-ran this after *every* fetch -
   * including a status-tab switch, which cannot change a cross-status count.
   * Mount seeds it; refreshAll() re-reads it after anything that can move it.
   */
  useEffect(() => {
    loadAttention();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The status counts are scoped to the date range, not to the status tab.
   *
   * Tracking `bookings` as well is what keeps the tiles honest. They used to
   * re-read only when the date range changed, so a check-in performed anywhere
   * other than this page's own buttons - from the timeline, from a detail panel
   * opened there, from the walk-in screen - moved the booking into `checked_in`
   * while the Checked In tile went on showing the old number. The list already
   * reloads on every one of those; the counts above it now follow it, the same way
   * the attention badge does.
   */
  useEffect(() => {
    loadStats();
  }, [dateFrom, dateTo]);

  /**
   * Re-sync when the tab comes back to the front.
   *
   * Two people work this screen at once. Nothing tells this terminal that the
   * other one just checked a customer in, so the tiles and the list would sit
   * stale until somebody pressed Refresh. Coming back to the tab is the moment
   * staff look at it, and costs two queries.
   */
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastResyncRef.current < 1000) return;
      lastResyncRef.current = now;
      refreshAll();
    };

    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [debouncedSearch, activeStatusFilter, dateFrom, dateTo]);

  const loadBookings = async () => {
    // Never query on a range the user has been told is invalid
    if (dateRangeError) {
      setLoading(false);
      return;
    }

    setLoading(true);

    /**
     * The attention tab is not a status, so it does not go through the normal
     * filtered query. It also ignores the date range on purpose: the sessions it
     * exists to surface are weeks old, and scoping it to the selected days would
     * hide exactly the bookings nobody has noticed.
     */
    const result = isAttentionTab
      ? await getAttentionBookings()
      : await getAllBookings(buildFilters());

    if (result.success) {
      setBookings(result.bookings);
    } else {
      toast.error("Failed to load bookings", { description: result.error });
    }
    setLoading(false);
  };

  const loadStats = async () => {
    if (dateRangeError) return;

    const result = await getBookingStats({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined
    });
    if (result.success) {
      setStats(result.stats);
    }
  };

  const loadAttention = async () => {
    const result = await getAttentionBookings();
    if (result.success) setAttentionCount(result.bookings.length);
  };

  /**
   * Everything this screen shows, re-read once and in parallel.
   *
   * The list, the status tiles and the attention badge are three independent
   * reads that every mutation invalidates together. They used to be fired as
   * a pair of calls plus a cascade off the bookings array, which re-requested
   * the tiles twice for one check-in. Naming the set makes the cost of a
   * mutation one round of three parallel reads instead of four serial ones.
   */
  const refreshAll = () => {
    void loadBookings();
    void loadStats();
    void loadAttention();
  };

  const handleApplyFilters = () => {
    if (dateRangeError) {
      toast.error("Invalid date range", { description: dateRangeError });
      return;
    }
    refreshAll();
  };

  const handleFilterChange = (status: string) => {
    setActiveStatusFilter(status);
    // loadBookings will be triggered automatically by useEffect watching activeStatusFilter
  };

  const handleRefresh = () => {
    refreshAll();
    toast.success("Refreshed", { description: "Bookings data reloaded" });
  };

  const handleBookingDetailClose = () => {
    setSelectedBooking(null);
    setOpenFoodModal(false);
    // Reload data when closing booking detail modal
    refreshAll();
  };

  /**
   * Cancelling is offered for a booking that has not started, and nothing else.
   *
   * Once the customer is at a station the booking is a session that happened -
   * it has a start time, it may have food on it, and it is owed for - so the way
   * out of it is checkout. The server re-checks all of this; this only decides
   * whether the button is worth showing.
   */
  const canCancelBooking = (booking: any) =>
    booking?.status === "confirmed" && !booking?.checked_in_at && !booking?.completed_at;

  const handleCancelBooking = () => {
    if (!cancelTarget) return;
    const { id, booking_number } = cancelTarget;
    const reason = cancelReason.trim();

    startTransition(async () => {
      const result = await cancelBooking(id, reason || undefined);
      if (result.success) {
        // Announced once, through the bell. A toast as well said the same thing
        // twice to the person who pressed the button and nothing at all to
        // anyone else - and the notification reaches both.
        const restored = Number(result.restoredItems || 0);
        const paid = Number(result.amountPaid || 0);
        /**
         * Everyone on the floor sees this, not just whoever pressed the button.
         * A cancellation frees a station and may leave money to hand back, and
         * the person who needs to know either of those things is often at the
         * other screen.
         */
        addNotification({
          id: `booking:${id}:cancelled`,
          type: "booking",
          title: "Booking Cancelled",
          message:
            paid > 0
              ? `${cancelTarget.customer_name || "Customer"} • #${booking_number} • ₹${formatCurrency(paid)} to refund`
              : restored > 0
                ? `${cancelTarget.customer_name || "Customer"} • #${booking_number} • station free, ${restored} food item${restored === 1 ? "" : "s"} back in stock`
                : `${cancelTarget.customer_name || "Customer"} • #${booking_number} • station free again`,
          bookingId: id,
          bookingNumber: booking_number,
        });

        setCancelTarget(null);
        setCancelReason("");
        refreshAll();
      } else {
        toast.error("Cancellation failed", { description: result.error });
      }
    });
  };

  /**
   * Records that the money on a cancelled booking has been handed back.
   *
   * The refund itself happens at the till or through the payment provider; this
   * is the note that says it was done, which is what clears the flag from the
   * row so the next person does not do it twice.
   */
  /**
   * A cancelled booking with money still on it. The badge on the row says the
   * same thing; this decides whether the button that clears it is offered.
   */
  const needsRefund = (booking: any) =>
    booking?.status === "cancelled" &&
    Number(booking?.amount_paid || 0) > 0 &&
    booking?.payment_status !== "refunded";
  const handleMarkRefunded = (booking: any) => {
    const collected = Number(booking.amount_paid || 0);
    const confirmed = window.confirm(
      `Mark ₹${formatCurrency(collected)} as refunded for booking ${booking.booking_number}?

` +
        `Do this once the money has actually gone back to the customer.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await markBookingRefunded(booking.id);
      if (result.success) {
        toast.success(`Refund recorded for ${booking.booking_number}`, {
          description: `₹${formatCurrency(Number(result.refundedAmount || 0))} marked as returned.`
        });
        refreshAll();
      } else {
        toast.error("Could not record the refund", { description: result.error });
      }
    });
  };

  const handleCheckIn = async (bookingId: string, bookingNumber: string, booking: any) => {
    // A walk-in session has no slot to be early or late for: check-in is what
    // creates one, and the clock it starts is the clock the bill is read from.
    if (booking.billed_on_actual_time) {
      startTransition(async () => {
        const result = await checkInWalkInSession(bookingId);
        if (result.success) {
          toast.success("Checked in — playing now", {
            description:
              `Station ${result.stationNumber} · billing starts ` +
              `${formatClockTime12h(result.checkedInAt!)}`
          });
          refreshAll();
        } else {
          toast.error("Check-in failed", { description: result.error });
        }
      });
      return;
    }

    // Check if checking in early (more than 10 minutes before slot start time)
    const deviceSlot = booking.booking_device_slots?.[0];
    if (deviceSlot?.slot_start_time && deviceSlot?.slot_date) {
      const slotDateTime = new Date(`${deviceSlot.slot_date}T${deviceSlot.slot_start_time}`);
      const now = new Date();
      const minutesUntilStart = (slotDateTime.getTime() - now.getTime()) / (1000 * 60);

      if (minutesUntilStart > 10) {
        const confirmed = window.confirm(
          `⚠️ Early Check-In Warning\n\n` +
          `You are checking in ${Math.round(minutesUntilStart)} minutes before the scheduled start time.\n\n` +
          `Scheduled time: ${formatDbTime(deviceSlot.slot_start_time)}\n` +
          `Current time: ${formatClockTime12h(now)}\n\n` +
          `Do you want to proceed with early check-in?`
        );
        if (!confirmed) return;
      }
    }

    startTransition(async () => {
      const result = await checkInBooking(bookingId);
      if (result.success) {
        toast.success("Customer checked in successfully", {
          description: `Booking ${bookingNumber} is now active`
        });
        refreshAll();
      } else {
        toast.error("Check-in failed", { description: result.error });
      }
    });
  };

  const handleCheckOut = async (bookingId: string, bookingNumber: string, booking: any) => {
    // A session has no scheduled end to be early for. Checking out is what fixes
    // the end time and, with it, the price.
    if (booking.billed_on_actual_time) {
      startTransition(async () => {
        const result = await checkOutWalkInSession(bookingId);
        if (result.success) {
          toast.success(`Checked out — ${result.durationLabel} played`, {
            description: `Billed ₹${Number(result.totalAmount).toFixed(2)}. Settle payment from Checkout & Billing.`
          });
          refreshAll();
        } else {
          toast.error("Check-out failed", { description: result.error });
        }
      });
      return;
    }

    // Check if checking out early (more than 5 minutes before slot end time)
    const deviceSlot = booking.booking_device_slots?.[0];
    if (deviceSlot?.slot_end_time && deviceSlot?.slot_date) {
      const slotDateTime = new Date(`${deviceSlot.slot_date}T${deviceSlot.slot_end_time}`);
      const now = new Date();
      const minutesUntilEnd = (slotDateTime.getTime() - now.getTime()) / (1000 * 60);

      if (minutesUntilEnd > 5) {
        const confirmed = window.confirm(
          `⚠️ Early Check-Out Warning\n\n` +
          `You are checking out ${Math.round(minutesUntilEnd)} minutes before the scheduled end time.\n\n` +
          `Scheduled end time: ${formatDbTime(deviceSlot.slot_end_time)}\n` +
          `Current time: ${formatClockTime12h(now)}\n\n` +
          `Do you want to proceed with early check-out?`
        );
        if (!confirmed) return;
      }
    }

    // Check if there are pending payments before checkout
    const billingResult = await getBookingBillingDetails(bookingId);

    if (!billingResult.success || !billingResult.booking) {
      toast.error("Failed to load booking details");
      return;
    }

    const { booking: billingBooking } = billingResult;
    const balanceDue = Number(billingBooking.balance_due || 0);

    // If there's a balance due (pending payment), show warning modal first
    if (balanceDue > 0 && billingBooking.payment_status !== "paid") {
      setPendingPaymentModal({
        open: true,
        bookingId: billingBooking.id,
        balanceDue: balanceDue,
        bookingNumber: billingBooking.booking_number,
        isCheckout: true // Mark this as a checkout attempt
      });
      return;
    }

    // No pending payment, proceed with checkout
    startTransition(async () => {
      const result = await checkOutBooking(bookingId);
      if (result.success) {
        toast.success("Customer checked out successfully", {
          description: `Booking ${bookingNumber} is now completed`
        });
        refreshAll();
      } else {
        toast.error("Check-out failed", { description: result.error });
      }
    });
  };

  const handleCheckoutBillingClick = async (bookingId: string) => {
    // First, check if there are pending payments
    const billingResult = await getBookingBillingDetails(bookingId);

    if (!billingResult.success || !billingResult.booking) {
      toast.error("Failed to load billing details");
      return;
    }

    const { booking } = billingResult;
    const balanceDue = Number(booking.balance_due || 0);

    // If there's a balance due (pending payment), show warning modal first
    if (balanceDue > 0 && booking.payment_status !== "paid") {
      setPendingPaymentModal({
        open: true,
        bookingId: booking.id,
        balanceDue: balanceDue,
        bookingNumber: booking.booking_number,
        isCheckout: false // This is for billing modal, not direct checkout
      });
    } else {
      // No pending payment, proceed directly to checkout billing modal
      setCheckoutBookingId(bookingId);
      setOpenCheckoutModal(true);
    }
  };

  const handleMarkAsPaidAndProceed = async () => {
    if (!pendingPaymentModal.bookingId) return;

    // Validate split amounts
    const totalSplit = paymentSplit.cashAmount + paymentSplit.cardAmount + paymentSplit.upiAmount;
    if (Math.abs(totalSplit - pendingPaymentModal.balanceDue) > 0.01) {
      toast.error("Invalid payment split", {
        description: `Total split (₹${totalSplit.toFixed(2)}) must equal balance due (₹${pendingPaymentModal.balanceDue.toFixed(2)})`
      });
      return;
    }

    const bookingIdToProcess = pendingPaymentModal.bookingId;
    const isCheckoutAttempt = pendingPaymentModal.isCheckout;

    startTransition(async () => {
      const result = await markBookingAsPaid(bookingIdToProcess, paymentSplit);

      if (result.success) {
        // Build payment description
        const methods = [];
        if (paymentSplit.cashAmount > 0) methods.push(`Cash: ₹${paymentSplit.cashAmount}`);
        if (paymentSplit.cardAmount > 0) methods.push(`Card: ₹${paymentSplit.cardAmount}`);
        if (paymentSplit.upiAmount > 0) methods.push(`UPI: ₹${paymentSplit.upiAmount}`);

        toast.success("Payment marked as paid", {
          description: methods.join(', ')
        });
        setPendingPaymentModal({ open: false, bookingId: null, balanceDue: 0, bookingNumber: "", isCheckout: false });
        setPaymentSplit({ cashAmount: 0, cardAmount: 0, upiAmount: 0 }); // Reset

        if (isCheckoutAttempt) {
          // If this was a checkout attempt, proceed with checkout
          const checkoutResult = await checkOutBooking(bookingIdToProcess);
          if (checkoutResult.success) {
            toast.success("Customer checked out successfully");
          } else {
            toast.error("Check-out failed", { description: checkoutResult.error });
          }
        } else {
          // Otherwise, open the checkout billing modal
          setCheckoutBookingId(bookingIdToProcess);
          setOpenCheckoutModal(true);
        }

        refreshAll();
      } else {
        toast.error("Failed to mark as paid", { description: result.error });
      }
    });
  };

  const filterTabs = [
    { id: "all", label: "All Bookings", count: stats?.total || 0 },
    { id: "confirmed", label: "Confirmed", count: stats?.confirmed || 0 },
    { id: "checked_in", label: "Checked In", count: stats?.checked_in || 0 },
    { id: "completed", label: "Completed", count: stats?.completed || 0 },
    { id: "cancelled", label: "Cancelled", count: stats?.cancelled || 0 },
    { id: "attention", label: "Needs Attention", count: attentionCount }
  ];

  // When a booking happens, for ordering purposes: the slot it reserves, or for
  // a food-only booking the moment it was raised.
  const getBookingTime = (booking: any): number => {
    const slot = booking.booking_device_slots?.[0];
    if (slot?.slot_date) {
      return new Date(`${slot.slot_date}T${slot.slot_start_time || "00:00:00"}`).getTime();
    }
    return new Date(booking.created_at).getTime();
  };

  // Group bookings by customer
  const groupedBookings = bookings.reduce((groups, booking) => {
    const key = booking.customer_phone;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(booking);
    return groups;
  }, {} as Record<string, any[]>);

  // Sort each group by date/time and calculate stats
  const customerGroups = Object.entries(groupedBookings).map(([phone, customerBookings]) => {
    const sorted = (customerBookings as any[]).sort(
      (a, b) => getBookingTime(b) - getBookingTime(a) // Most recent slot first
    );

    const totalAmount = roundToTwo(sorted.reduce((sum, b) => sum + Number(b.total_amount || 0), 0));
    // Calculate actual revenue after discounts (including happy hour)
    const totalDevice = roundToTwo(sorted.reduce((sum, b) => {
      const deviceSubtotal = Number(b.device_subtotal || 0);
      const discount = Number(b.subscription_discount || 0) + Number(b.promo_discount || 0) + Number(b.happy_hour_discount || 0);
      return sum + Math.max(0, deviceSubtotal - discount);
    }, 0));
    const totalFood = roundToTwo(sorted.reduce((sum, b) => sum + Number(b.food_subtotal || 0), 0));

    // Check for back-to-back bookings
    let hasBackToBack = false;
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentSlot = sorted[i].booking_device_slots?.[0];
      const nextSlot = sorted[i + 1].booking_device_slots?.[0];

      if (currentSlot && nextSlot) {
        const currentDate = currentSlot.slot_date;
        const nextDate = nextSlot.slot_date;
        const currentEnd = currentSlot.slot_end_time;
        const nextStart = nextSlot.slot_start_time;

        if (currentDate === nextDate && currentEnd === nextStart) {
          hasBackToBack = true;
          break;
        }
      }
    }

    return {
      phone,
      customerName: sorted[0].customer_name,
      bookings: sorted,
      count: sorted.length,
      totalAmount,
      totalDevice,
      totalFood,
      hasBackToBack,
      earliestBooking: sorted[0] // Now returns most recent booking (sorted desc)
    };
  })
    // Rows read newest slot first, so the session in progress sits at the top
    .sort((a, b) => getBookingTime(b.earliestBooking) - getBookingTime(a.earliestBooking));

  const toggleCustomerExpansion = (phone: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else {
        next.add(phone);
      }
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase text-white tracking-tight">BOOKING MANAGEMENT</h1>
          <p className="text-description font-medium mt-1">View and manage all customer bookings</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleRefresh}
            disabled={loading}
            variant="outline"
            className="border-[#27272a] text-white hover:bg-[var(--surface)] font-black uppercase text-xs h-10 px-4"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => router.push("/admin/bookings/walk-in")}
            className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase text-xs h-10 px-6"
          >
            <PlusCircle className="h-4 w-4 mr-2 stroke-[3]" />
            Create Walk-In Booking
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-[var(--surface)] border-[#27272a] p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <ReceiptIndianRupee className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-label text-muted-content">Total Bookings</p>
              <p className="text-xl font-black text-white"><CountUp end={stats?.total || 0} duration={1000} /></p>
            </div>
          </div>
        </Card>

        <Card className="bg-[var(--surface)] border-[#27272a] p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-label text-muted-content">Checked In</p>
              <p className="text-xl font-black text-white"><CountUp end={stats?.checked_in || 0} duration={900} /></p>
            </div>
          </div>
        </Card>

        <Card className="bg-[var(--surface)] border-[#27272a] p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <IndianRupee className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-label text-muted-content">Today's Revenue</p>
              <p className="text-xl font-black text-primary"><RevealAmount amount={stats?.todayRevenue || 0} label="today's revenue" /></p>
            </div>
          </div>
        </Card>

        <Card className="bg-[var(--surface)] border-[#27272a] p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-600/10 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-label text-muted-content">Completed</p>
              <p className="text-xl font-black text-white"><CountUp end={stats?.completed || 0} duration={900} /></p>
            </div>
          </div>
        </Card>

      </div>

      {/* Date Filters */}
      <Card className="bg-[var(--surface)] border-[#27272a] p-4 space-y-4">
        {/* Quick Filter Buttons */}
        <div>
          <Label className="text-label text-muted-content mb-2 block">
            Quick Filters
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2">
            {([
              { id: "today", label: "Today" },
              { id: "future", label: "Future" },
              { id: "7days", label: "Last 7 Days" },
              { id: "30days", label: "Last 30 Days" },
              { id: "month", label: "This Month" },
              { id: "90days", label: "Last 90 Days" },
              { id: "all", label: "All Time" }
            ] as const).map((preset) => (
              <Button
                key={preset.id}
                size="sm"
                variant="outline"
                onClick={() => setQuickDateRange(preset.id)}
                className={`w-full md:w-auto font-bold uppercase text-xs h-9 ${
                  activeQuickFilter === preset.id
                    ? "bg-primary text-white border-primary glow-box-hover scale-[1.02] hover:bg-primary hover:text-white hover:scale-[1.02]"
                    : "text-primary"
                }`}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom Date Range */}
        <div className="flex flex-col md:flex-row gap-4 items-end mt-2">

          {/* Date Pickers Container: 2 columns on mobile */}
          <div className="flex-1 grid grid-cols-2 gap-3 w-full">
            {/* FROM DATE POP-OVER */}
            <div className="space-y-2 w-full">
              <Label className="text-label text-muted-content ml-2 flex items-center gap-1.5">
                From Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full bg-[var(--background)] border border-zinc-900 h-12 rounded-xl px-3 sm:px-4 text-xs font-mono font-bold text-left flex items-center justify-between transition-all hover:border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-primary overflow-hidden"
                  >
                    <span className="truncate mr-2">{dateFrom ? format(new Date(dateFrom), "dd-MM-yyyy") : <span className="text-muted-content">dd-mm-yyyy</span>}</span>
                    <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-[var(--background)] border border-zinc-800 rounded-xl shadow-2xl" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={fromDate ?? undefined}
                    onSelect={handleSelectFromDate}
                    disabled={isFromDateDisabled}
                    defaultMonth={fromDate ?? toDate ?? today}
                    endMonth={toDate ?? undefined}
                    className="text-white"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* TO DATE POP-OVER */}
            <div className="space-y-2 w-full">
              <Label className="text-label text-muted-content ml-2 flex items-center gap-1.5">
                To Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full bg-[var(--background)] border border-zinc-900 h-12 rounded-xl px-3 sm:px-4 text-xs font-mono font-bold text-left flex items-center justify-between transition-all hover:border-zinc-700 text-white focus:outline-none focus:ring-1 focus:ring-primary overflow-hidden"
                  >
                    <span className="truncate mr-2">{dateTo ? format(new Date(dateTo), "dd-MM-yyyy") : <span className="text-muted-content">dd-mm-yyyy</span>}</span>
                    <CalendarDays className="h-4 w-4 text-primary flex-shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-[var(--background)] border border-zinc-800 rounded-xl shadow-2xl" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={toDate ?? undefined}
                    onSelect={handleSelectToDate}
                    disabled={isToDateDisabled}
                    defaultMonth={toDate ?? today}
                    startMonth={fromDate ?? undefined}
                    className="text-white "
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Action Buttons Container: 2 columns on mobile, flex on desktop */}
          <div className="grid grid-cols-2 gap-3 w-full md:w-auto md:flex md:gap-4">
            <Button
              onClick={handleApplyFilters}
              disabled={!!dateRangeError}
              className="w-full md:w-auto bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase text-xs h-11 rounded-xl px-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply Range
            </Button>
            <Button
              onClick={() => setQuickDateRange("all")}
              variant="outline"
              className="w-full md:w-auto font-bold uppercase text-xs h-11 rounded-xl px-6"
            >
              Clear Filters
            </Button>
          </div>

        </div>

        {/* Validation message - the pickers disable these days, so this only
            shows if a range was set some other way */}
        {dateRangeError && (
          <p
            role="alert"
            className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
          >
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            {dateRangeError}
          </p>
        )}
      </Card>

      {/* The date pickers stay visible and keep their value - switching back to
          any other tab should return to the range the user had set - but they do
          not apply here, and saying so beats letting staff conclude the filter is
          broken. */}
      {isAttentionTab && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200/90 leading-relaxed">
            <span className="font-bold">Showing every unfinished booking, across all dates.</span>{" "}
            Sessions checked in but never checked out, bookings nobody arrived for,
            and sessions that were used but never paid for. The date range above
            does not apply to this tab.
          </p>
        </div>
      )}

      {/* Search and view, then the categories they apply to */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-content" />
            <Input
              placeholder="Search by name, phone, or booking number... (auto-search)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[var(--surface)] border-[#27272a] text-white h-10 text-sm"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-spin" />
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex bg-[var(--surface)] border border-[#27272a] rounded-lg overflow-hidden self-start sm:self-auto">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition-colors ${viewMode === "list"
                  ? "bg-primary text-black"
                  : "text-secondary-content hover:text-white"
                }`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 transition-colors ${viewMode === "grid"
                  ? "bg-primary text-black"
                  : "text-secondary-content hover:text-white"
                }`}
              title="Grid View"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-none w-full">
          {filterTabs.map((tab) => {
            const isActive = activeStatusFilter === tab.id;
            /* The attention tab carries amber when it has anything in it, so an
               unfinished booking is visible without opening the tab. At zero it
               looks like every other tab - nothing to chase. */
            const isAlerting = tab.id === "attention" && tab.count > 0;

            return (
              <button
                key={tab.id}
                onClick={() => handleFilterChange(tab.id)}
                className={`px-4 py-2 text-min font-black uppercase border rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${isActive
                    ? isAlerting
                      ? "bg-amber-500 text-black border-transparent"
                      : "bg-primary text-black border-transparent"
                    : isAlerting
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-300 hover:border-amber-500/70"
                      : "bg-[var(--surface)] border-[#27272a] text-secondary-content hover:border-zinc-700"
                  }`}
              >
                {isAlerting && <AlertTriangle className="h-3.5 w-3.5" />}
                {tab.label}
                <span className={isActive ? "text-black/70" : isAlerting ? "text-amber-300/70" : "text-secondary-content"}>
                  ({tab.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bookings List/Grid */}
      {loading ? (
        <div className="h-96 flex items-center justify-center">
          <BreakpointLoader size="lg" text="Loading Bookings..." />
        </div>
      ) : bookings.length === 0 ? (
        <Card className="bg-[var(--surface)] border-[#27272a] p-12">
          <div className="text-center space-y-2">
            <ReceiptIndianRupee className="h-12 w-12 text-zinc-700 mx-auto" />
            <h3 className="text-lg font-black text-muted-content uppercase">No Bookings Found</h3>
            <p className="text-sm text-muted-content">No bookings match your current filters.</p>
          </div>
        </Card>
      ) : viewMode === "grid" ? (
        <BookingsGrid
          customerGroups={customerGroups}
          onBookingClick={(booking) => setSelectedBooking(booking)}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onCancel={(booking) => {
            setCancelReason("");
            setCancelTarget(booking);
          }}
          canCancel={canCancelBooking}
          onMarkRefunded={handleMarkRefunded}
          needsRefund={needsRefund}
          onAddFood={(booking) => {
            setSelectedBooking(booking);
            setOpenFoodModal(true);
          }}
          onCheckoutBilling={handleCheckoutBillingClick}
          isPending={isPending}
        />
      ) : (
        <Card className="bg-[var(--surface)] border-[#27272a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--background)] border-b border-[#27272a]">
                <tr>
                  <th className="py-4 px-4 text-left text-label text-muted-content">
                    Booking #
                  </th>
                  <th className="py-4 px-4 text-left text-label text-muted-content">
                    Customer
                  </th>
                  <th className="py-4 px-4 text-left text-label text-muted-content">
                    Device
                  </th>
                  <th className="py-4 px-4 text-left text-label text-muted-content">
                    Date & Time
                  </th>
                  <th className="py-4 px-4 text-left text-label text-muted-content">
                    Amount
                  </th>
                  <th className="py-4 px-4 text-left text-label text-muted-content">
                    Payment
                  </th>
                  <th className="py-4 px-4 text-left text-label text-muted-content">
                    Status
                  </th>
                  <th className="py-4 px-4 text-right text-label text-muted-content">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a]">
                {customerGroups.map((group) => {
                  const isExpanded = expandedCustomers.has(group.phone);
                  const isSingleBooking = group.count === 1;
                  const firstBooking = group.earliestBooking;
                  const firstSlot = firstBooking.booking_device_slots?.[0];

                  return (
                    <Fragment key={`group-${group.phone}`}>
                      {/* Parent Row - Customer Summary */}
                      <tr
                        className={`group hover:bg-[var(--surface-hover)] transition-colors ${!isSingleBooking ? 'cursor-pointer' : ''}`}
                        onClick={() => !isSingleBooking && toggleCustomerExpansion(group.phone)}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            {!isSingleBooking && (
                              <button
                                onClick={() => toggleCustomerExpansion(group.phone)}
                                className="text-secondary-content hover:text-primary transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <div>
                              <p className="text-sm font-black text-primary font-mono">
                                {isSingleBooking ? firstBooking.booking_number : `${group.count} Bookings`}
                              </p>
                              <p className="text-min text-secondary-content mt-0.5">
                                {new Date(firstBooking.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-sm font-bold text-data-visible">{group.customerName}</p>
                              <p className="text-sm-readable text-secondary-content font-mono">{group.phone}</p>
                            </div>
                            {!isSingleBooking && (
                              <span className="bg-gradient-primary text-black text-[11px] font-black px-2 py-0.5 rounded-full">
                                ×{group.count}
                              </span>
                            )}
                            {group.hasBackToBack && (
                              <span className="bg-gradient-secondary text-white text-[11px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Link2 className="h-2.5 w-2.5" />
                                B2B
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {isSingleBooking ? (
                            firstSlot ? (
                              <>
                                <p className="text-sm font-bold text-data-visible">
                                  {firstSlot.device_type}
                                </p>
                                <p className="text-sm-readable text-secondary-content">
                                  Station #{firstSlot.device_station_number}
                                </p>
                              </>
                            ) : firstBooking.walk_in_device_type_name ? (
                              <>
                                <p className="text-sm font-bold text-data-visible">
                                  {firstBooking.walk_in_device_type_name}
                                </p>
                                <p className="text-sm-readable text-secondary-content">
                                  Station on check-in
                                </p>
                              </>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <UtensilsCrossed className="h-4 w-4 text-amber-400" />
                                <div>
                                  <p className="text-sm font-bold text-amber-400">Food Only</p>
                                  <p className="text-xs text-secondary-content">
                                    {firstBooking.booking_food_items?.length || 0} item(s)
                                  </p>
                                </div>
                              </div>
                            )
                          ) : (
                            <p className="text-sm-readable text-secondary-content">Multiple devices</p>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {isSingleBooking ? (
                            firstSlot ? (
                              <>
                                <p className="text-sm font-bold text-data-visible">
                                  {new Date(firstSlot.slot_date).toLocaleDateString()}
                                </p>
                                <p className="text-sm-readable text-secondary-content">
                                  <BookingTimingCell booking={firstBooking} slot={firstSlot} />
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-bold text-data-visible">
                                  {new Date(firstBooking.created_at).toLocaleDateString()}
                                </p>
                                <p className="text-sm-readable text-secondary-content">
                                  {/* A walk-in waiting for check-in has no slot yet, so this
                                      is the only row that ever shows its creation time - and
                                      it says so rather than passing it off as a start time. */}
                                  <BookingTimingCell booking={firstBooking} slot={null} />
                                </p>
                              </>
                            )
                          ) : (
                            <p className="text-sm-readable text-secondary-content italic">Multiple slots</p>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-sm font-black text-date-visible">₹{formatCurrency(group.totalAmount)}</p>
                          {isSingleBooking && (
                            <div className="flex flex-col gap-0.5 mt-1">
                              <p className="text-min text-secondary-content">
                                Games: ₹{formatCurrency(group.totalDevice)}
                              </p>
                              {group.totalFood > 0 && (
                                <p className="text-min text-secondary-content">
                                  Food: ₹{formatCurrency(group.totalFood)}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {isSingleBooking ? (
                            <PaymentStatusBadge
                              status={firstBooking.payment_status || 'pending'}
                              bookingStatus={firstBooking.status}
                              size="md"
                              amountPaid={firstBooking.amount_paid}
                              balanceDue={firstBooking.balance_due}
                            />
                          ) : (
                            <p className="text-sm-readable text-secondary-content italic">-</p>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          {isSingleBooking ? (
                            <div className="space-y-1.5">
                              <BookingStatusBadge status={firstBooking.status} size="md" />
                              <AttentionBadges booking={firstBooking} compact />
                            </div>
                          ) : (
                            <p className="text-sm-readable text-secondary-content italic">-</p>
                          )}
                        </td>
                        <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                          {isSingleBooking && (
                            <div className="flex justify-end gap-2">
                              {firstBooking.status === "confirmed" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleCheckIn(firstBooking.id, firstBooking.booking_number, firstBooking)}
                                  disabled={isPending}
                                  className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                  title="Check In"
                                >
                                  <UserCheck className="h-4 w-4" />
                                </Button>
                              )}
                              {firstBooking.status === "checked_in" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleCheckOut(firstBooking.id, firstBooking.booking_number, firstBooking)}
                                  disabled={isPending}
                                  className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                  title="Check Out"
                                >
                                  <LogOut className="h-4 w-4" />
                                </Button>
                              )}
                              {canCancelBooking(firstBooking) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setCancelReason("");
                                    setCancelTarget(firstBooking);
                                  }}
                                  disabled={isPending}
                                  className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  title="Cancel Booking"
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                              )}
                              {(firstBooking.status === "confirmed" || firstBooking.status === "checked_in") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedBooking(firstBooking);
                                    setOpenFoodModal(true);
                                  }}
                                  className="h-8 w-8 p-0 text-primary hover:text-primary-hover hover:bg-primary/10"
                                  title="Add Food"
                                >
                                  <UtensilsCrossed className="h-4 w-4" />
                                </Button>
                              )}
                              {/* Still reachable once a session is checked out and owes money. */}
                              {(firstBooking.status === "confirmed" ||
                                firstBooking.status === "checked_in" ||
                                Number(firstBooking.balance_due || 0) > 0.01) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleCheckoutBillingClick(firstBooking.id)}
                                  className="h-8 w-8 p-0 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                                  title="Checkout & Billing"
                                >
                                  <CreditCard className="h-4 w-4" />
                                </Button>
                              )}
                              {needsRefund(firstBooking) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleMarkRefunded(firstBooking)}
                                  disabled={isPending}
                                  className="h-8 w-8 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                  title="Mark as refunded"
                                >
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedBooking(firstBooking)}
                                className="h-8 w-8 p-0 text-muted-content hover:text-white"
                                title="View Details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Child Rows - Individual Bookings (when expanded) */}
                      {!isSingleBooking && isExpanded && group.bookings.map((booking, index) => {
                        const deviceSlot = booking.booking_device_slots?.[0];
                        return (
                          <tr key={booking.id} className="bg-[var(--background)] hover:bg-[var(--surface)] transition-colors border-l-4 border-l-primary/30">
                            <td className="py-3 px-4 pl-12">
                              <p className="text-sm font-black text-primary font-mono">{booking.booking_number}</p>
                              <p className="text-min text-secondary-content mt-0.5">
                                Booking #{index + 1}
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="text-sm-readable text-secondary-content">Same customer</p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="text-sm font-bold text-date-visible">
                                {deviceSlot?.device_type || booking.walk_in_device_type_name || "N/A"}
                              </p>
                              <p className="text-sm-readable text-secondary-content">
                                {deviceSlot?.device_station_number
                                  ? `Station #${deviceSlot.device_station_number}`
                                  : booking.walk_in_device_type_name
                                    ? "Station on check-in"
                                    : "Station #N/A"}
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="text-sm font-bold text-date-visible">
                                {deviceSlot?.slot_date
                                  ? new Date(deviceSlot.slot_date).toLocaleDateString()
                                  : new Date(booking.created_at).toLocaleDateString()}
                              </p>
                              <p className="text-sm-readable text-secondary-content">
                                <BookingTimingCell booking={booking} slot={deviceSlot} />
                              </p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="text-sm font-black text-data-visible">₹{formatCurrency(booking.total_amount)}</p>
                              <div className="flex flex-col gap-0.5 mt-1">
                                <p className="text-min text-secondary-content">
                                  Games: ₹{formatCurrency(Math.max(0, Number(booking.device_subtotal || 0) - (Number(booking.subscription_discount || 0) + Number(booking.promo_discount || 0) + Number(booking.happy_hour_discount || 0))))}
                                </p>
                                {booking.food_subtotal > 0 && (
                                  <p className="text-min text-secondary-content">
                                    Food: ₹{formatCurrency(booking.food_subtotal)}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <PaymentStatusBadge
                                status={booking.payment_status || 'pending'}
                                bookingStatus={booking.status}
                                size="md"
                                amountPaid={booking.amount_paid}
                                balanceDue={booking.balance_due}
                              />
                            </td>
                            <td className="py-3 px-4">
                              <div className="space-y-1.5">
                                <BookingStatusBadge status={booking.status} size="md" />
                                <AttentionBadges booking={booking} compact />
                              </div>
                            </td>
                            <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-2">
                                {booking.status === "confirmed" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleCheckIn(booking.id, booking.booking_number, booking)}
                                    disabled={isPending}
                                    className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                                    title="Check In"
                                  >
                                    <UserCheck className="h-4 w-4" />
                                  </Button>
                                )}
                                {canCancelBooking(booking) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setCancelReason("");
                                      setCancelTarget(booking);
                                    }}
                                    disabled={isPending}
                                    className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                    title="Cancel Booking"
                                  >
                                    <Ban className="h-4 w-4" />
                                  </Button>
                                )}
                                {booking.status === "checked_in" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleCheckOut(booking.id, booking.booking_number, booking)}
                                    disabled={isPending}
                                    className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                    title="Check Out"
                                  >
                                    <LogOut className="h-4 w-4" />
                                  </Button>
                                )}
                                {(booking.status === "confirmed" || booking.status === "checked_in") && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setSelectedBooking(booking);
                                      setOpenFoodModal(true);
                                    }}
                                    className="h-8 w-8 p-0 text-primary hover:text-primary-hover hover:bg-primary/10"
                                    title="Add Food"
                                  >
                                    <UtensilsCrossed className="h-4 w-4" />
                                  </Button>
                                )}
                                {/* Still reachable once a session is checked out and owes money. */}
                                {(booking.status === "confirmed" ||
                                  booking.status === "checked_in" ||
                                  Number(booking.balance_due || 0) > 0.01) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleCheckoutBillingClick(booking.id)}
                                    className="h-8 w-8 p-0 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                                    title="Checkout & Billing"
                                  >
                                    <CreditCard className="h-4 w-4" />
                                  </Button>
                                )}
                                {needsRefund(booking) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleMarkRefunded(booking)}
                                    disabled={isPending}
                                    className="h-8 w-8 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                    title="Mark as refunded"
                                  >
                                    <Undo2 className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedBooking(booking)}
                                  className="h-8 w-8 p-0 text-muted-content hover:text-white"
                                  title="View Details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Booking Detail Modal */}
      <BookingDetailModal
        bookingId={selectedBooking?.id || null}
        open={!!selectedBooking}
        onClose={handleBookingDetailClose}
        onUpdate={() => {
          refreshAll();
        }}
        openFoodModalDirectly={openFoodModal}
        onPendingPayment={(bookingId, balanceDue, bookingNumber) => {
          // Show the pending payment modal (from checkout attempt)
          setPendingPaymentModal({
            open: true,
            bookingId,
            balanceDue,
            bookingNumber,
            isCheckout: true
          });
        }}
      />

      {/* Pending Payment Confirmation Dialog */}
      <Dialog open={pendingPaymentModal.open} onOpenChange={(open) => {
        if (!open) {
          setPendingPaymentModal({ open: false, bookingId: null, balanceDue: 0, bookingNumber: "", isCheckout: false });
        }
      }}>
        <DialogContent className="bg-[var(--background)] border-2 border-amber-500/50 text-white max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 text-amber-400">
              <AlertCircle className="h-5 w-5" />
              Pending Payment
            </DialogTitle>
            <DialogDescription className="text-secondary-content">
              This booking has an outstanding balance that needs to be settled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Booking Info */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <p className="text-xs text-secondary-content uppercase mb-1">Booking Number</p>
              <p className="text-base font-black text-primary font-mono">{pendingPaymentModal.bookingNumber}</p>
            </div>

            {/* Pending Amount */}
            <div className="bg-gradient-to-br from-amber-500/20 to-red-500/20 border-2 border-amber-500/40 rounded-lg p-6 text-center">
              <p className="text-xs text-amber-400/80 uppercase tracking-wider mb-2">Outstanding Balance</p>
              <p className="text-4xl font-black text-amber-400">
                ₹{pendingPaymentModal.balanceDue.toFixed(2)}
              </p>
              <p className="text-xs text-amber-300/60 mt-2">This amount must be paid before checkout</p>
            </div>

            {/* Warning Message */}
            <div className="bg-amber-950/50 border border-amber-900/50 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">
                Mark this payment as received to proceed with checkout
              </p>
            </div>

            {/* Split Payment Inputs */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
              <Label className="text-xs font-black uppercase text-secondary-content block">
                Split Payment Across Methods
              </Label>

              {/* Cash Amount */}
              <div className="flex items-center gap-2">
                <span className="text-2xl">💵</span>
                <div className="flex-1">
                  <Label className="text-xs text-zinc-400 uppercase">Cash</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentSplit.cashAmount || ''}
                    onChange={(e) => setPaymentSplit({ ...paymentSplit, cashAmount: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700 text-white h-9 text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Card Amount */}
              <div className="flex items-center gap-2">
                <span className="text-2xl">💳</span>
                <div className="flex-1">
                  <Label className="text-xs text-zinc-400 uppercase">Card</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentSplit.cardAmount || ''}
                    onChange={(e) => setPaymentSplit({ ...paymentSplit, cardAmount: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700 text-white h-9 text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* UPI Amount */}
              <div className="flex items-center gap-2">
                <span className="text-2xl">📱</span>
                <div className="flex-1">
                  <Label className="text-xs text-zinc-400 uppercase">UPI</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentSplit.upiAmount || ''}
                    onChange={(e) => setPaymentSplit({ ...paymentSplit, upiAmount: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700 text-white h-9 text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Total Validator */}
              <div className="pt-2 border-t border-zinc-800">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-400">Total Split:</span>
                  <span className={`text-sm font-black ${Math.abs((paymentSplit.cashAmount + paymentSplit.cardAmount + paymentSplit.upiAmount) - pendingPaymentModal.balanceDue) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
                    ₹{(paymentSplit.cashAmount + paymentSplit.cardAmount + paymentSplit.upiAmount).toFixed(2)}
                  </span>
                </div>
                {Math.abs((paymentSplit.cashAmount + paymentSplit.cardAmount + paymentSplit.upiAmount) - pendingPaymentModal.balanceDue) >= 0.01 && (
                  <p className="text-xs text-red-400 mt-1">
                    ⚠️ Total must equal ₹{pendingPaymentModal.balanceDue.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Quick Fill Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentSplit({ cashAmount: pendingPaymentModal.balanceDue, cardAmount: 0, upiAmount: 0 })}
                  className="flex-1 text-xs h-7 border-zinc-700 hover:bg-zinc-800"
                >
                  All Cash
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentSplit({ cashAmount: 0, cardAmount: pendingPaymentModal.balanceDue, upiAmount: 0 })}
                  className="flex-1 text-xs h-7 border-zinc-700 hover:bg-zinc-800"
                >
                  All Card
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentSplit({ cashAmount: 0, cardAmount: 0, upiAmount: pendingPaymentModal.balanceDue })}
                  className="flex-1 text-xs h-7 border-zinc-700 hover:bg-zinc-800"
                >
                  All UPI
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              onClick={() => setPendingPaymentModal({ open: false, bookingId: null, balanceDue: 0, bookingNumber: "", isCheckout: false })}
              variant="ghost"
              className="flex-1 border border-zinc-800 text-muted-content hover:text-white font-bold uppercase text-xs h-10 rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMarkAsPaidAndProceed}
              disabled={isPending}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs h-10 rounded-lg"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Mark as Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Booking Confirmation */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="bg-[var(--background)] border-red-500/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-white flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-400" />
              Cancel Booking
            </DialogTitle>
            <DialogDescription className="text-sm text-secondary-content">
              This cannot be undone. The station is released for someone else.
            </DialogDescription>
          </DialogHeader>

          {cancelTarget && (
            <div className="space-y-4">
              <div className="bg-[var(--surface)] border border-[#27272a] rounded-lg p-4 space-y-1">
                <p className="text-sm font-black text-primary font-mono">{cancelTarget.booking_number}</p>
                <p className="text-sm text-white">{cancelTarget.customer_name}</p>
                <p className="text-label">
                  {cancelTarget.booking_device_slots?.[0]
                    ? `${cancelTarget.booking_device_slots[0].device_type} · ${formatDbTimeRange(
                        cancelTarget.booking_device_slots[0].slot_start_time,
                        cancelTarget.booking_device_slots[0].slot_end_time
                      )}`
                    : cancelTarget.walk_in_device_type_name || "No station assigned yet"}
                </p>
              </div>

              {/* Cancelled bookings are left out of every revenue report, so money
                  already taken would simply vanish from the figures if nobody was
                  told to refund it. */}
              {Number(cancelTarget.amount_paid || 0) > 0 && (
                <div className="bg-amber-950/50 border border-amber-900/50 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200">
                    ₹{formatCurrency(cancelTarget.amount_paid)} has already been collected on this
                    booking. Cancelling leaves it out of the revenue reports - refund it separately.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-label text-muted-content">Reason (optional)</Label>
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Customer called to cancel"
                  maxLength={200}
                  className="bg-[var(--surface)] border-[#27272a] text-white h-10 text-sm"
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button
              onClick={() => {
                setCancelTarget(null);
                setCancelReason("");
              }}
              variant="ghost"
              className="flex-1 border border-zinc-800 text-muted-content hover:text-white font-bold uppercase text-xs h-10 rounded-lg"
            >
              Keep Booking
            </Button>
            <Button
              onClick={handleCancelBooking}
              disabled={isPending}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs h-10 rounded-lg"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
              Cancel Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout & Billing Modal */}
      <CheckoutModal
        bookingId={checkoutBookingId}
        isOpen={openCheckoutModal}
        onClose={() => {
          setOpenCheckoutModal(false);
          setCheckoutBookingId(null);
        }}
        onSuccess={() => {
          refreshAll();
        }}
      />
    </div>
  );
}
