"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BookingStatusBadge } from "./BookingStatusBadge";
import { AttentionPanel } from "./AttentionBadges";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { SessionTimeline } from "./SessionTimeline";
import { CheckOutSessionDialog } from "@/components/admin/bookings/CheckOutSessionDialog";
import { getBookingDetails, checkInBooking, checkOutBooking, checkInWalkInSession, checkOutWalkInSession, addFoodToBooking, removeFoodItemFromBooking, setWalkInPlannedEnd, updatePlayerCount, setSharedPlayParticipants, getCustomersForSharedPlay, linkSharedPlayParticipantToCustomer, getSharedPlayParticipantCheckoutQuote, getSharedPlayCheckoutAllQuotes, checkOutSharedPlayParticipant, checkOutAllSharedPlayParticipants, changeCheckedInWalkInDevice, changeCheckedInSharedPlayDevice, changeCheckedInWalkInStartTime } from "@/app/(admin)/admin/bookings/actions";
import { getDeviceTypes } from "@/app/(admin)/admin/devices/actions";
import { getMenuItems } from "@/app/(admin)/admin/food/actions";
import { createCustomerAction } from "@/app/(admin)/admin/customers/actions";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";
import {
  User, Phone, Mail, Calendar, Clock, IndianRupee, Pencil, X,
  Loader2, CheckCircle2, LogIn, LogOut,
  UtensilsCrossed, QrCode, MapPin, Gamepad2, Plus, Minus, Search, Filter, Trash2, Play, Pause, UserPlus, ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDbTime, formatDbTimeRange } from "@/lib/utils/timeSlots";
import { arenaClockTime, formatClockTime12h } from "@/lib/utils/dates";
import { TimeOfDayField } from "@/components/ui/time-of-day-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPlayedDuration, MAX_BACKDATED_START_HOURS, playedMinutes, priceSession, resolveBackdatedStart, resolvePlannedSession } from "@/lib/bookings/walkInSession";
import { calculateSharedPlayShares, getSharedPlaySessions } from "@/lib/bookings/sharedPlay";
import type { SharedPlayCustomer, SharedPlayParticipant } from "@/lib/types/shared-play";

interface BookingDetailModalProps {
  bookingId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void;
  openFoodModalDirectly?: boolean;
  onPendingPayment?: (bookingId: string, balanceDue: number, bookingNumber: string) => void;
  /**
   * "modal" (default) renders inside a Dialog, as every existing caller expects.
   * "page" renders the same panel as ordinary page content, for the standalone
   * /admin/bookings/[bookingId] route the dashboard opens in a new tab - so a
   * booking is never a second dialog stacked on the stat modal behind it.
   *
   * The secondary dialogs below (add food, remove item) stay dialogs in
   * both modes: those confirm an action already under way, they are not a second
   * thing to browse.
   */
  variant?: "modal" | "page";
  /** Rendered above the title in page mode - used for the back link. */
  headerSlot?: React.ReactNode;
}

export function BookingDetailModal({ bookingId, open, onClose, onUpdate, openFoodModalDirectly, onPendingPayment, variant = "modal", headerSlot }: BookingDetailModalProps) {
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [addFoodModalOpen, setAddFoodModalOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [selectedFoodItems, setSelectedFoodItems] = useState<Record<string, number>>({});
  const [foodParticipantId, setFoodParticipantId] = useState("");
  const [participantCheckoutQuote, setParticipantCheckoutQuote] = useState<any>(null);
  const [participantCheckoutCashAmount, setParticipantCheckoutCashAmount] = useState("0");
  const [participantCheckoutUpiAmount, setParticipantCheckoutUpiAmount] = useState("0");
  const [participantCheckoutCardAmount, setParticipantCheckoutCardAmount] = useState("0");
  const [participantCheckoutUseWallet, setParticipantCheckoutUseWallet] = useState(false);
  const [participantCheckoutKey, setParticipantCheckoutKey] = useState("");
  const [participantCheckoutLoading, setParticipantCheckoutLoading] = useState(false);
  const participantExternalDue = participantCheckoutQuote
    ? Number(participantCheckoutQuote.totalAmount) - (participantCheckoutUseWallet
      ? Math.min(Number(participantCheckoutQuote.totalAmount), Number(participantCheckoutQuote.walletBalance))
      : 0)
    : 0;
  const participantSplitTotal = Number(participantCheckoutCashAmount || 0) + Number(participantCheckoutUpiAmount || 0) + Number(participantCheckoutCardAmount || 0);
  const participantSplitValid = Number.isFinite(participantSplitTotal) && Math.abs(participantSplitTotal - participantExternalDue) < 0.005;
  const [checkoutAllQuotes, setCheckoutAllQuotes] = useState<any[]>([]);
  const [checkoutAllOpen, setCheckoutAllOpen] = useState(false);
  const [checkoutAllWalletIds, setCheckoutAllWalletIds] = useState<string[]>([]);
  const [checkoutAllCashAmount, setCheckoutAllCashAmount] = useState("0");
  const [checkoutAllUpiAmount, setCheckoutAllUpiAmount] = useState("0");
  const [checkoutAllCardAmount, setCheckoutAllCardAmount] = useState("0");
  const [checkoutAllKey, setCheckoutAllKey] = useState("");
  const checkoutAllRemaining = checkoutAllQuotes.reduce((sum, quote) => {
    const wallet = checkoutAllWalletIds.includes(quote.participantId)
      ? Math.min(Number(quote.totalAmount || 0), Number(quote.walletBalance || 0))
      : 0;
    return sum + Math.max(0, Number(quote.totalAmount || 0) - wallet);
  }, 0);
  const checkoutAllSplitTotal = Number(checkoutAllCashAmount || 0) + Number(checkoutAllUpiAmount || 0) + Number(checkoutAllCardAmount || 0);
  const checkoutAllSplitValid = Number.isFinite(checkoutAllSplitTotal) && Math.abs(checkoutAllSplitTotal - checkoutAllRemaining) < 0.005;
  const [updatingPlayerCount, setUpdatingPlayerCount] = useState(false);
  const [foodItemToRemove, setFoodItemToRemove] = useState<any>(null);
  const [removingFoodItem, setRemovingFoodItem] = useState(false);
  const [foodSearchQuery, setFoodSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  /**
   * The fetch only starts in the effect below, i.e. after the first paint, so
   * without this the first render has `loading === false` and `booking === null`
   * and briefly shows "No booking data available" before the spinner appears.
   * Barely visible inside an animating dialog; very visible on the standalone
   * page, which is a cold load in a fresh tab.
   */
  const [hasLoaded, setHasLoaded] = useState(false);
  /** Open while the desk is changing when the customer expects to finish. */
  const [editingPlannedEnd, setEditingPlannedEnd] = useState(false);
  /** 24-hour `HH:MM` being typed. Empty means "take the plan off". */
  const [plannedEndDraft, setPlannedEndDraft] = useState("");
  const [savingPlannedEnd, setSavingPlannedEnd] = useState(false);
  const [deviceEditOpen, setDeviceEditOpen] = useState(false);
  const [deviceTypeOptions, setDeviceTypeOptions] = useState<any[]>([]);
  const [selectedDeviceTypeId, setSelectedDeviceTypeId] = useState("");
  const [loadingDeviceTypes, setLoadingDeviceTypes] = useState(false);
  const [savingDeviceChange, setSavingDeviceChange] = useState(false);
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [startTimeDraft, setStartTimeDraft] = useState("");
  const [savingStartTime, setSavingStartTime] = useState(false);
  const [sharedRoster, setSharedRoster] = useState<string[]>([]);
  const [activePlayers, setActivePlayers] = useState<string[]>([]);
  const [newParticipantCustomerId, setNewParticipantCustomerId] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [addPlayerCustomerOpen, setAddPlayerCustomerOpen] = useState(false);
  const [creatingPlayerCustomer, setCreatingPlayerCustomer] = useState(false);
  const [sharedPlayCustomers, setSharedPlayCustomers] = useState<SharedPlayCustomer[]>([]);
  const [loadingSharedPlayCustomers, setLoadingSharedPlayCustomers] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [savingSharedPlay, setSavingSharedPlay] = useState(false);
  const [sitInDialogOpen, setSitInDialogOpen] = useState(false);
  const [sitInClockDraft, setSitInClockDraft] = useState("");
  const [sitOutDialogOpen, setSitOutDialogOpen] = useState(false);
  const [sitOutClockDraft, setSitOutClockDraft] = useState("");
  const [participantCustomerDrafts, setParticipantCustomerDrafts] = useState<Record<string, string>>({});
  const [linkingParticipantCustomer, setLinkingParticipantCustomer] = useState<string | null>(null);
  const [sharedPlayNow, setSharedPlayNow] = useState(() => new Date());

  /**
   * The draft, read the way the server will read it: forwards from now, since a
   * finish that has already passed is a checkout rather than a plan.
   */
  const plannedEndDraftCheck = useMemo(
    () => (plannedEndDraft ? resolvePlannedSession(null, plannedEndDraft) : null),
    [plannedEndDraft]
  );

  /**
   * Save the new finish, or remove it.
   *
   * The refusal that matters comes from the database: the hours this session
   * freed may already have been sold, and `set_walkin_planned_end` re-tests the
   * window against the station before it moves anything.
   */
  const handleSavePlannedEnd = async () => {
    if (!booking?.id) return;

    setSavingPlannedEnd(true);
    const result = await setWalkInPlannedEnd(
      booking.id,
      plannedEndDraftCheck?.ok ? plannedEndDraftCheck.session.end.clock : null
    );
    setSavingPlannedEnd(false);

    if (!result.success) {
      toast.error("Could not change the finish time", { description: result.error });
      return;
    }

    toast.success(
      plannedEndDraft
        ? `Held until ${formatClockTime12h(result.heldUntil!)}`
        : "Finish time removed - held until checkout"
    );
    setEditingPlannedEnd(false);
    setPlannedEndDraft("");
    await loadBookingDetails();
  };

  useEffect(() => {
    if (open && bookingId) {
      // Reset so switching to a different booking shows the loader again rather
      // than the previous booking's details.
      setHasLoaded(false);
      loadBookingDetails();
      loadMenuItems();
      loadSharedPlayCustomers();
      if (openFoodModalDirectly) {
        setFoodParticipantId("");
        setAddFoodModalOpen(true);
      }
    }
  }, [open, bookingId, openFoodModalDirectly]);

  useEffect(() => {
    if (!open || booking?.billed_on_actual_time !== true || booking.status !== "checked_in") return;
    const timer = window.setInterval(() => setSharedPlayNow(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, [open, booking?.billed_on_actual_time, booking?.status]);

  useEffect(() => {
    if (!addFoodModalOpen || !booking?.shared_play_enabled || foodParticipantId) return;
    const firstEligible = (booking.shared_play_participants || []).find((participant: any) => !participant.checked_out_at);
    if (firstEligible) setFoodParticipantId(firstEligible.id);
  }, [addFoodModalOpen, booking?.shared_play_enabled, booking?.shared_play_participants, foodParticipantId]);

  const loadBookingDetails = async () => {
    if (!bookingId) return;
    setLoading(true);
    const result = await getBookingDetails(bookingId);
    if (result.success) {
      setBooking(result.booking);
      const participants: SharedPlayParticipant[] = result.booking.shared_play_participants || [];
      setSharedRoster(participants.map((participant) => participant.name));
      setActivePlayers(participants
        .filter((participant) => participant.shared_play_periods?.some((period) => !period.ended_at))
        .map((participant) => participant.name));
      setSelectedParticipants([]);
    } else {
      toast.error("Failed to load booking details", { description: result.error });
    }
    setLoading(false);
    // Set on failure too, so a booking that cannot be fetched falls through to
    // the empty state instead of spinning forever.
    setHasLoaded(true);
  };

  const loadMenuItems = async () => {
    const result = await getMenuItems();
    if (result.success) {
      // Filter only available items
      const availableItems = result.menuItems.filter((item: any) => item.status === "available");
      setMenuItems(availableItems);
    }
  };

  const loadSharedPlayCustomers = async () => {
    setLoadingSharedPlayCustomers(true);
    const result = await getCustomersForSharedPlay();
    setLoadingSharedPlayCustomers(false);
    if (!result.success) {
      toast.error("Could not load customer profiles", { description: result.error });
      return;
    }
    setSharedPlayCustomers(result.customers);
  };

  const handleAddFoodItems = async () => {
    if (!bookingId || Object.keys(selectedFoodItems).length === 0) {
      toast.error("Please select at least one item");
      return;
    }
    if (booking?.shared_play_enabled && !foodParticipantId) {
      toast.error("Choose which participant ordered this food");
      return;
    }

    setActionLoading(true);

    const items = Object.entries(selectedFoodItems)
      .filter(([_, qty]) => qty > 0)
      .map(([itemId, quantity]) => {
        const menuItem = menuItems.find((item) => item.id === itemId);
        return {
          menuItemId: itemId,
          itemName: menuItem.name,
          itemCategory: menuItem.category,
          quantity,
          unitPrice: Number(menuItem.price),
          participantId: booking?.shared_play_enabled ? foodParticipantId : null
        };
      });

    const result = await addFoodToBooking(bookingId, items);

    if (result.success) {
      toast.success("Food items added successfully!");
      setSelectedFoodItems({});
      setAddFoodModalOpen(false);
      if (openFoodModalDirectly) {
        onClose();
      } else {
        loadBookingDetails();
        onUpdate?.();
      }
    } else {
      toast.error("Failed to add food items", { description: result.error });
    }

    setActionLoading(false);
  };

  const openFoodPicker = () => {
    const firstEligible = (booking?.shared_play_participants || []).find((participant: any) => !participant.checked_out_at);
    setFoodParticipantId(booking?.shared_play_enabled ? firstEligible?.id || "" : "");
    setAddFoodModalOpen(true);
  };

  const handleOpenParticipantCheckout = async (participantId: string) => {
    if (!bookingId) return;
    setParticipantCheckoutLoading(true);
    const result = await getSharedPlayParticipantCheckoutQuote(bookingId, participantId);
    setParticipantCheckoutLoading(false);
    if (!result.success) {
      toast.error("Could not calculate participant bill", { description: result.error });
      return;
    }
    setParticipantCheckoutQuote(result.quote);
    setParticipantCheckoutUseWallet(false);
    setParticipantCheckoutCashAmount("0");
    setParticipantCheckoutUpiAmount(Number(result.quote.totalAmount).toFixed(2));
    setParticipantCheckoutCardAmount("0");
    setParticipantCheckoutKey(crypto.randomUUID());
  };

  const handleOpenCheckoutAll = async () => {
    if (!bookingId) return;
    setParticipantCheckoutLoading(true);
    const result = await getSharedPlayCheckoutAllQuotes(bookingId);
    setParticipantCheckoutLoading(false);
    if (!result.success) {
      toast.error("Could not calculate group bill", { description: result.error });
      return;
    }
    setCheckoutAllQuotes(result.quotes);
    setCheckoutAllWalletIds([]);
    const due = result.quotes.reduce((sum: number, quote: any) => sum + Number(quote.totalAmount || 0), 0);
    setCheckoutAllCashAmount("0");
    setCheckoutAllUpiAmount(due.toFixed(2));
    setCheckoutAllCardAmount("0");
    setCheckoutAllKey(crypto.randomUUID());
    setCheckoutAllOpen(true);
  };

  const handleConfirmCheckoutAll = async () => {
    if (!bookingId || checkoutAllQuotes.length === 0) return;
    setParticipantCheckoutLoading(true);
    const result = await checkOutAllSharedPlayParticipants({
      bookingId,
      useWalletFor: checkoutAllWalletIds,
      cashAmount: Number(checkoutAllCashAmount),
      upiAmount: Number(checkoutAllUpiAmount),
      cardAmount: Number(checkoutAllCardAmount),
      idempotencyKey: checkoutAllKey
    });
    setParticipantCheckoutLoading(false);
    if (!result.success) {
      setCheckoutAllOpen(false);
      toast.error(result.settledParticipants.length
        ? `Checked out ${result.settledParticipants.length} participant${result.settledParticipants.length === 1 ? "" : "s"}; the rest are still active`
        : "Checkout all failed", { description: result.error });
      await loadBookingDetails();
      onUpdate?.();
      return;
    }

    setCheckoutAllOpen(false);
    setCheckoutAllQuotes([]);
    const closeResult = booking?.billed_on_actual_time
      ? await checkOutWalkInSession(bookingId)
      : await checkOutBooking(bookingId);
    if (!closeResult.success) {
      toast.error("Everyone paid, but the booking could not be closed", { description: closeResult.error });
    } else {
      toast.success("Everyone checked out", {
        description: `${result.settledParticipants.length} participants settled.`
      });
    }
    await loadBookingDetails();
    onUpdate?.();
  };

  const handleConfirmParticipantCheckout = async () => {
    if (!bookingId || !participantCheckoutQuote) return;
    setParticipantCheckoutLoading(true);
    const result = await checkOutSharedPlayParticipant({
      bookingId,
      participantId: participantCheckoutQuote.participantId,
      useWallet: participantCheckoutUseWallet,
      cashAmount: Number(participantCheckoutCashAmount),
      upiAmount: Number(participantCheckoutUpiAmount),
      cardAmount: Number(participantCheckoutCardAmount),
      idempotencyKey: participantCheckoutKey
    });
    setParticipantCheckoutLoading(false);
    if (!result.success) {
      toast.error("Participant checkout failed", { description: result.error });
      return;
    }
    const walletUsed = Number(result.payment?.wallet_amount || 0);
    toast.success(`${participantCheckoutQuote.participantName} checked out`, {
      description: `₹${Number(result.quote.totalAmount).toFixed(2)} total (UPI ₹${Number(participantCheckoutUpiAmount).toFixed(2)}, cash ₹${Number(participantCheckoutCashAmount).toFixed(2)}, card ₹${Number(participantCheckoutCardAmount).toFixed(2)})${walletUsed > 0 ? `; ₹${walletUsed.toFixed(2)} from wallet` : ""}.`
    });
    setParticipantCheckoutQuote(null);
    const remainingParticipants = (booking.shared_play_participants || []).filter(
      (participant: any) => participant.id !== result.quote.participantId && !participant.checked_out_at
    );
    if (remainingParticipants.length === 0) {
      const closeResult = booking.billed_on_actual_time
        ? await checkOutWalkInSession(bookingId)
        : await checkOutBooking(bookingId);
      if (!closeResult.success) {
        toast.error("Participant paid, but booking could not be closed", { description: closeResult.error });
      }
    }
    await loadBookingDetails();
    onUpdate?.();
  };

  /** True for a walk-in whose bill comes from the clock, not from a chosen slot. */
  const isSession = booking?.billed_on_actual_time === true;
  const canEditBilling = !!booking &&
    booking.status !== "cancelled" &&
    (booking.payment_status !== "paid" || (booking.shared_play_enabled && booking.status === "checked_in")) &&
    booking.payment_status !== "refunded";

  const handleSessionCheckIn = async () => {
    if (!bookingId) return;
    setActionLoading(true);
    const result = await checkInWalkInSession(bookingId);
    if (result.success) {
      toast.success("Checked in — playing now", {
        description: `Station ${result.stationNumber}. Billing starts from this moment.`
      });
      loadBookingDetails();
      onUpdate?.();
    } else {
      toast.error("Check-in failed", { description: result.error });
    }
    setActionLoading(false);
  };

  /**
   * Ask when the customer left before closing the session.
   *
   * The bill is the window between check-in and checkout, so the moment of the
   * button press is a price. Confirming without touching the field keeps the
   * old behaviour exactly: the database clock decides.
   */
  const handleSessionCheckOut = () => {
    if (!bookingId) return;
    if (booking?.shared_play_enabled) {
      const remainingParticipants = (booking.shared_play_participants || []).filter(
        (participant: any) => !participant.checked_out_at
      );
      if (remainingParticipants.length > 1) {
        void handleOpenCheckoutAll();
        return;
      }
      if (remainingParticipants.length === 1) {
        void handleOpenParticipantCheckout(remainingParticipants[0].id);
        return;
      }
    }
    setCheckOutOpen(true);
  };

  const confirmSessionCheckOut = async (statedEnd?: { date: string; clock: string }) => {
    if (!bookingId) return;
    setActionLoading(true);
    const result = await checkOutWalkInSession(bookingId, statedEnd);
    if (result.success) {
      setCheckOutOpen(false);
      toast.success(`Checked out — ${result.durationLabel} played`, {
        description: `Billed ₹${Number(result.totalAmount).toFixed(2)} for the time actually played.`
      });
      loadBookingDetails();
      onUpdate?.();
    } else {
      toast.error("Check-out failed", { description: result.error });
    }
    setActionLoading(false);
  };

  const handleCheckIn = async () => {
    if (!bookingId) return;
    setActionLoading(true);
    const result = await checkInBooking(bookingId);
    if (result.success) {
      toast.success("Customer checked in successfully!");
      loadBookingDetails();
      onUpdate?.();
    } else {
      toast.error("Check-in failed", { description: result.error });
    }
    setActionLoading(false);
  };

  const handleCheckOut = async () => {
    if (!bookingId || !booking) return;

    if (booking.shared_play_enabled) {
      const remainingParticipants = (booking.shared_play_participants || []).filter((participant: any) => !participant.checked_out_at);
      if (remainingParticipants.length === 1) {
        await handleOpenParticipantCheckout(remainingParticipants[0].id);
        return;
      }
      if (remainingParticipants.length > 1) {
        await handleOpenCheckoutAll();
        return;
      }
    }

    // Check if there are pending payments before checkout
    const balanceDue = Number(booking.balance_due || 0);

    // If there's a balance due (pending payment), trigger the pending payment handler or show modal
    if (balanceDue > 0 && booking.payment_status !== "paid") {
      if (onPendingPayment) {
        // Pass to parent to handle with the pending payment modal
        onPendingPayment(booking.id, balanceDue, booking.booking_number);
        onClose(); // Close this modal so the parent modal can show
      } else {
        // Fallback: show error toast
        toast.error("Cannot check out", {
          description: `There is a pending balance of ₹${balanceDue.toLocaleString('en-IN')}. Please mark the payment as paid first.`
        });
      }
      return;
    }

    setActionLoading(true);
    const result = await checkOutBooking(bookingId);
    if (result.success) {
      toast.success("Customer checked out successfully!");
      loadBookingDetails();
      onUpdate?.();
    } else {
      toast.error("Check-out failed", { description: result.error });
    }
    setActionLoading(false);
  };


  const handleRemoveFoodItem = async () => {
    if (!bookingId || !foodItemToRemove) return;
    setRemovingFoodItem(true);

    const result = await removeFoodItemFromBooking(bookingId, foodItemToRemove.id);

    if (result.success) {
      toast.success(`${foodItemToRemove.item_name} removed`, {
        description: `New total: ₹${Number(result.newTotal || 0).toLocaleString('en-IN')}`
      });
      setFoodItemToRemove(null);
      loadBookingDetails();
      onUpdate?.();
    } else {
      toast.error("Could not remove item", { description: result.error });
    }

    setRemovingFoodItem(false);
  };

  const handleUpdatePlayerCount = async (slotId: string, newCount: number, maxPlayers: number) => {
    setUpdatingPlayerCount(true);
    const result = await updatePlayerCount(slotId, newCount, maxPlayers);

    if (result.success) {
      // A session in progress has no total to quote - its bill is worked out at
      // checkout - so the message stands on its own there.
      toast.success(result.message, {
        description:
          typeof result.newTotal === "number"
            ? `New total: ₹${result.newTotal.toLocaleString('en-IN')}`
            : undefined
      });
      loadBookingDetails();
      onUpdate?.();
    } else {
      toast.error("Failed to update player count", { description: result.error });
    }

    setUpdatingPlayerCount(false);
  };

  const handleSaveSharedPlay = async (
    enabled: boolean,
    rosterOverride?: string[],
    activeOverride?: string[],
    successMessage?: string,
    rosterCustomers: Array<{ customerId: string; name: string }> = [],
    sitInClock: string | null = null,
    sitOutClock: string | null = null
  ): Promise<boolean> => {
    if (!bookingId) return false;
    const roster = rosterOverride ?? sharedRoster;
    const active = activeOverride ?? activePlayers;
    setSavingSharedPlay(true);
    const result = await setSharedPlayParticipants(
      bookingId,
      enabled,
      roster,
      active,
      rosterCustomers,
      sitInClock,
      sitOutClock
    );
    setSavingSharedPlay(false);
    if (!result.success) {
      toast.error("Could not update shared play", { description: result.error });
      await loadBookingDetails();
      return false;
    }
    toast.success(successMessage || (enabled ? "Shared play started" : "Standard play selected"));
    await loadBookingDetails();
    onUpdate?.();
    return true;
  };

  const handleLinkParticipantCustomer = async (participantId: string, name: string) => {
    if (!bookingId) return;
    setLinkingParticipantCustomer(participantId);
    const result = await linkSharedPlayParticipantToCustomer(
      bookingId,
      participantId,
      participantCustomerDrafts[participantId] || ""
    );
    setLinkingParticipantCustomer(null);
    if (!result.success) {
      toast.error("Could not link customer account", { description: result.error });
      return;
    }
    toast.success(`${name} linked to ${result.customerName}'s account`, { description: "Wallet credits are available at checkout." });
    await loadBookingDetails();
    onUpdate?.();
  };

  const handleAddSharedParticipant = async (customerOverride?: SharedPlayCustomer) => {
    if (savingSharedPlay) return;
    const customer = customerOverride ||
      sharedPlayCustomers.find((entry) => entry.id === newParticipantCustomerId);
    if (!customer) {
      toast.error("Select a customer profile");
      return;
    }
    const existingRosterName = sharedRoster.find(
      (entry) => entry.toLowerCase() === customer.name.toLowerCase()
    );
    if (existingRosterName) {
      const existingParticipant = booking?.shared_play_participants?.find(
        (participant: SharedPlayParticipant) =>
          participant.name.toLowerCase() === existingRosterName.toLowerCase()
      );
      if (existingParticipant?.customer_id === customer.id) {
        toast.error("This customer is already on the player list.");
        return;
      }
      if (existingParticipant?.customer_id) {
        toast.error("This player is already linked to a different customer account.");
        return;
      }

      const linked = await handleSaveSharedPlay(
        true,
        sharedRoster,
        activePlayers,
        `${customer.name}'s customer profile linked to this player.`,
        [{ customerId: customer.id, name: existingRosterName }]
      );
      if (linked) {
        setNewParticipantCustomerId("");
        setSelectedParticipants([existingRosterName]);
      }
      return;
    }

    const nextRoster = [...sharedRoster, customer.name];
    setSharedRoster(nextRoster);
    const saved = await handleSaveSharedPlay(
      true,
      nextRoster,
      activePlayers,
      `${customer.name} added. Select them and tap Sit in to start their timer.`,
      [{ customerId: customer.id, name: customer.name }]
    );
    if (saved) {
      setNewParticipantCustomerId("");
      setSelectedParticipants([customer.name]);
    }
  };

  const handleCreatePlayerCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const customerName = String(formData.get("name") || "").trim();
    if (sharedRoster.some((name) => name.toLowerCase() === customerName.toLowerCase())) {
      toast.error("A player with this name is already on the list.");
      return;
    }
    setCreatingPlayerCustomer(true);
    const result = await createCustomerAction({
      name: String(formData.get("name") || ""),
      phone: String(formData.get("phone") || ""),
      email: String(formData.get("email") || ""),
    });
    setCreatingPlayerCustomer(false);

    if (!result.success) {
      toast.error("Could not add customer", { description: result.error });
      return;
    }

    const createdCustomer: SharedPlayCustomer = result.customer;
    setSharedPlayCustomers((current) => [...current, createdCustomer].sort((a, b) => a.name.localeCompare(b.name)));
    setNewParticipantCustomerId(createdCustomer.id);
    setAddPlayerCustomerOpen(false);
    form.reset();
    await handleAddSharedParticipant(createdCustomer);
  };

  const handleSetSelectedParticipantsPlaying = async (
    sitIn: boolean,
    sitInClock: string | null = null,
    sitOutClock: string | null = null
  ) => {
    if (savingSharedPlay) return;
    const selectedNames = sharedRoster.filter((name) =>
      selectedParticipants.some((selected) => selected.toLowerCase() === name.toLowerCase())
    );
    if (selectedNames.length === 0) {
      toast.error("Select at least one player");
      return;
    }
    const selectedSet = new Set(selectedNames.map((name) => name.toLowerCase()));
    const nextActive = sitIn
      ? [...new Map([...activePlayers, ...selectedNames].map((name) => [name.toLowerCase(), name])).values()]
      : activePlayers.filter((name) => !selectedSet.has(name.toLowerCase()));
    const maxPlayers = Number(deviceSlot?.devices?.device_type?.max_players || 10);
    if (sitIn && nextActive.length > maxPlayers) {
      toast.error(`This device supports up to ${maxPlayers} players at a time`);
      return;
    }

    setActivePlayers(nextActive);
    const saved = await handleSaveSharedPlay(
      true,
      sharedRoster,
      nextActive,
      `${selectedNames.length} player${selectedNames.length === 1 ? "" : "s"} ${sitIn ? "sat in" : "marked sitting out"}`,
      [],
      sitInClock,
      sitOutClock
    );
    if (saved) {
      setSelectedParticipants([]);
      if (sitIn) setSitInDialogOpen(false);
      else if (sitOutClock) setSitOutDialogOpen(false);
    }
  };

  const openSitInDialog = () => {
    setSitInClockDraft(arenaClockTime(sharedPlayNow).slice(0, 5));
    setSitInDialogOpen(true);
  };

  const confirmSitIn = () => {
    const started = resolveBackdatedStart(sitInClockDraft, sharedPlayNow);
    if (!started.ok) {
      toast.error("Check the sit-in time", { description: started.error });
      return;
    }
    void handleSetSelectedParticipantsPlaying(true, sitInClockDraft);
  };

  const openSitOutDialog = () => {
    setSitOutClockDraft(arenaClockTime(sharedPlayNow).slice(0, 5));
    setSitOutDialogOpen(true);
  };

  const confirmSitOut = () => {
    const ended = resolveBackdatedStart(sitOutClockDraft, sharedPlayNow);
    if (!ended.ok) {
      toast.error("Check the sit-out time", { description: ended.error });
      return;
    }
    void handleSetSelectedParticipantsPlaying(false, null, sitOutClockDraft);
  };

  const deviceSlot = booking?.booking_device_slots?.[0];
  const isActiveActualWalkIn = booking?.billed_on_actual_time === true &&
    booking.status === "checked_in" &&
    Boolean(booking.checked_in_at);
  const liveSessionDuration = useMemo(() => {
    if (!isActiveActualWalkIn) return null;
    return formatPlayedDuration(playedMinutes({
      startedAt: new Date(booking.checked_in_at),
      endedAt: sharedPlayNow,
    }));
  }, [isActiveActualWalkIn, booking?.checked_in_at, sharedPlayNow]);
  const canChangeActiveWalkInDevice = booking?.billed_on_actual_time === true &&
    booking.status === "checked_in" &&
    !booking.completed_at &&
    !booking.shared_play_enabled &&
    booking.booking_device_slots?.length === 1;
  const canChangeActiveSharedPlayDevice = booking?.shared_play_enabled === true &&
    booking.status === "checked_in" &&
    !booking.completed_at &&
    booking.booking_device_slots?.length === 1 &&
    ["standard_snooker", "medium_snooker", "american_pool"].includes(
      booking.booking_device_slots?.[0]?.devices?.device_type?.name
    ) &&
    activePlayers.length > 0;
  const canChangeActiveSessionDevice = canChangeActiveWalkInDevice || canChangeActiveSharedPlayDevice;

  const openDeviceEditor = async () => {
    if (!canChangeActiveSessionDevice) return;
    setLoadingDeviceTypes(true);
    const types = await getDeviceTypes();
    setDeviceTypeOptions(booking?.shared_play_enabled
      ? types.filter((type: any) => ["standard_snooker", "medium_snooker", "american_pool"].includes(type.name))
      : types);
    setSelectedDeviceTypeId(deviceSlot?.devices?.device_type?.id || "");
    setLoadingDeviceTypes(false);
    setDeviceEditOpen(true);
  };

  const saveDeviceChange = async () => {
    if (!bookingId || !selectedDeviceTypeId) return;
    setSavingDeviceChange(true);
    const result = booking.shared_play_enabled
      ? await changeCheckedInSharedPlayDevice(bookingId, selectedDeviceTypeId)
      : await changeCheckedInWalkInDevice(bookingId, selectedDeviceTypeId);
    setSavingDeviceChange(false);
    if (!result.success) {
      toast.error("Could not change device", { description: result.error });
      return;
    }
    setDeviceEditOpen(false);
    toast.success("Session device updated", {
      description: booking.shared_play_enabled
        ? `${result.deviceTypeName} #${result.stationNumber}. Unsettled shared-play charges are recalculated at this device's rates.`
        : `${result.deviceTypeName} #${result.stationNumber}. Its rate will be used for the session at checkout.`
    });
    await loadBookingDetails();
    onUpdate?.();
  };

  const openStartTimeEditor = () => {
    if (!canChangeActiveWalkInDevice || !booking?.checked_in_at) return;
    setStartTimeDraft(arenaClockTime(new Date(booking.checked_in_at)).slice(0, 5));
    setEditingStartTime(true);
  };

  const saveStartTimeChange = async () => {
    if (!bookingId || !startTimeDraft) return;
    setSavingStartTime(true);
    const result = await changeCheckedInWalkInStartTime(bookingId, startTimeDraft);
    setSavingStartTime(false);
    if (!result.success) {
      toast.error("Could not change start time", { description: result.error });
      return;
    }
    setEditingStartTime(false);
    toast.success("Session start time updated");
    await loadBookingDetails();
    onUpdate?.();
  };
  const isFiSimulator =
    booking?.walk_in_device_type_name?.trim().toLowerCase() === "fi simulator" ||
    ["fi_simulator", "other"].includes(deviceSlot?.devices?.device_type?.name) ||
    deviceSlot?.devices?.device_type?.display_name?.trim().toLowerCase() === "fi simulator";
  const sharedPlayPeriods = useMemo(
    () => (booking?.shared_play_participants || []).flatMap((participant: any) =>
      (participant.shared_play_periods || []).map((period: any) => ({
        id: period.id,
        participant_id: participant.id,
        started_at: period.started_at,
        ended_at: period.ended_at,
        hourly_rate: period.hourly_rate,
        extra_player_rate: period.extra_player_rate,
        included_players: period.included_players,
      }))
    ),
    [booking?.shared_play_participants]
  );
  const sharedPlayEnd = booking?.status === "completed" && booking.completed_at
    ? new Date(booking.completed_at)
    : sharedPlayNow;
  const sharedPlaySessions = useMemo(
    () => getSharedPlaySessions(sharedPlayPeriods, sharedPlayEnd),
    [sharedPlayPeriods, sharedPlayEnd]
  );
  const sharedPlayCalculation = useMemo(() => {
    if (!booking?.shared_play_enabled || !deviceSlot) return null;
    return calculateSharedPlayShares(
      sharedPlayPeriods,
      Number(deviceSlot.hourly_rate || 0),
      Number(deviceSlot.extra_player_charge || 0),
      Number(deviceSlot.included_players || 1),
      booking.status === "completed" ? Number(deviceSlot.slot_total || 0) : null,
      sharedPlayEnd,
    );
  }, [booking?.shared_play_enabled, booking?.status, deviceSlot, sharedPlayPeriods, sharedPlayEnd]);
  const isLiveActualSession =
    booking?.billed_on_actual_time === true && booking.status === "checked_in";
  const sharedParticipantShares = useMemo(
    () => new Map((sharedPlayCalculation?.shares || []).map((share) => [share.participantId, share.amount])),
    [sharedPlayCalculation]
  );
  const standardLivePricing = useMemo(() => {
    if (
      !booking?.billed_on_actual_time ||
      booking.status !== "checked_in" ||
      booking.shared_play_enabled ||
      !booking.checked_in_at ||
      !deviceSlot
    ) {
      return null;
    }
    return priceSession({
      playedMinutes: playedMinutes({
        startedAt: new Date(booking.checked_in_at),
        endedAt: sharedPlayNow
      }),
      hourlyRate: Number(deviceSlot.hourly_rate || 0),
      playerCount: Number(deviceSlot.player_count || 1),
      includedPlayers: Number(deviceSlot.included_players || 1),
      extraPlayerCharge: Number(deviceSlot.extra_player_charge || 0)
    });
  }, [booking?.billed_on_actual_time, booking?.status, booking?.shared_play_enabled, booking?.checked_in_at, deviceSlot, sharedPlayNow]);

  const liveSessionBalanceDue = (() => {
    if (!isLiveActualSession) return Number(booking?.balance_due || 0);

    const liveDeviceTotal = booking?.shared_play_enabled
      ? (sharedPlayCalculation?.deviceCharges || 0) + (sharedPlayCalculation?.extraPlayersTotal || 0)
      : standardLivePricing?.deviceSubtotal || 0;
    const discounts =
      Number(booking?.subscription_discount || 0) +
      Number(booking?.promo_discount || 0) +
      Number(booking?.happy_hour_discount || 0) +
      Number(booking?.hour_pass_discount || 0);
    const liveTotal = liveDeviceTotal + Number(booking?.food_subtotal || 0) - discounts;
    return Math.max(0, Number((liveTotal - Number(booking?.amount_paid || 0)).toFixed(2)));
  })();

  // The detail panel itself, wrapped either in a Dialog or in plain page markup
  // further down. Kept as one expression so both modes render exactly the same
  // thing and cannot drift apart.
  const detailBody = (
    <>
          {loading || (bookingId && !hasLoaded) ? (
            <div className="h-96 flex items-center justify-center">
              <BreakpointLoader size="md" text="Loading Booking..." />
            </div>
          ) : booking ? (
            <div className="space-y-6 mt-4">
              {/* QR Code and Booking Number */}
              <Card className="bg-[var(--background)] border-[#27272a] p-6">
                <div className="flex flex-col md:flex-row gap-6 items-center">
                  <div className="bg-white p-4 rounded-xl">
                    <QRCodeSVG value={booking.booking_number} size={140} level="H" />
                  </div>
                  <div className="flex-1 space-y-3 text-center md:text-left">
                    <div>
                      <p className="text-label-enhanced mb-1">
                        Booking Number
                      </p>
                      <p className="text-3xl font-black text-primary font-mono tracking-wide">
                        {booking.booking_number}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 justify-center md:justify-start text-sm-enhanced">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="text-data-placeholder">Created: {new Date(booking.created_at).toLocaleString()}</span>
                      </div>
                      {booking.checked_in_at && (
                        <div className="flex items-center gap-1 text-green-500">
                          <LogIn className="h-3.5 w-3.5" />
                          {editingStartTime ? (
                            <>
                              <span>In:</span>
                              <TimeOfDayField
                                name="booking-start-time"
                                label="Session start time"
                                defaultValue={startTimeDraft}
                                onChange={setStartTimeDraft}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Save start time"
                                title="Save start time"
                                onClick={() => void saveStartTimeChange()}
                                disabled={savingStartTime || !startTimeDraft}
                                className="h-8 w-8 shrink-0 text-emerald-400 hover:text-emerald-300"
                              >
                                {savingStartTime ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Cancel start time change"
                                title="Cancel start time change"
                                onClick={() => setEditingStartTime(false)}
                                disabled={savingStartTime}
                                className="h-8 w-8 shrink-0 text-secondary-content hover:text-white"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span>In: {new Date(booking.checked_in_at).toLocaleString()}</span>
                              {canChangeActiveWalkInDevice && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Edit session start time"
                                  title="Edit session start time"
                                  onClick={openStartTimeEditor}
                                  className="h-7 w-7 text-secondary-content hover:text-primary"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {/* Sessions get the full timeline below instead: for those,
                          these two stamps are the bill, not just a record. */}
                      {/* `completed_at` is the checkout stamp - there is no
                          checked_out_at column, so this row never rendered. */}
                      {booking.completed_at && (
                        <div className="flex items-center gap-1 text-blue-500">
                          <LogOut className="h-3.5 w-3.5" />
                          <span>Out: {new Date(booking.completed_at).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Sits directly under the booking header, above everything else:
                  if a session was never closed or never paid for, that is the
                  first thing whoever opened this needs to know. */}
              <AttentionPanel booking={booking} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Information */}
                <Card className="bg-[var(--background)] border-[#27272a] p-5 space-y-4">
                  <h3 className="text-section-header border-b border-[#27272a] pb-3 mb-2">
                    Customer Information
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 text-primary mt-0.5" />
                      <div className="flex-1">
                        <p className="text-label-enhanced text-muted-content mb-1">Customer</p>
                        <p className="text-base font-bold text-white">{booking.customer_name}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-primary mt-0.5" />
                      <div className="flex-1">
                        <p className="text-label-enhanced text-muted-content mb-1">Phone</p>
                        <p className="text-base font-mono text-white font-semibold">{booking.customer_phone}</p>
                      </div>
                    </div>
                    {booking.customer_email && (
                      <div className="flex items-start gap-3">
                        <Mail className="h-4 w-4 text-primary mt-0.5" />
                        <div className="flex-1">
                          <p className="text-label-enhanced text-muted-content mb-1">Email</p>
                          <p className="text-base text-white break-all font-semibold">{booking.customer_email}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Device Slot Information */}
                <Card className="bg-[var(--background)] border-[#27272a] p-5 space-y-4">
                  <h3 className="text-section-header border-b border-[#27272a] pb-3 mb-2">
                    Device & Slot Details
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-primary mt-0.5" />
                      <div className="flex-1">
                        <p className="text-label-enhanced text-muted-content mb-1">Device</p>
                        <div className="flex w-full items-center gap-2">
                          {deviceEditOpen ? (
                            <>
                              <select
                                aria-label="Device type"
                                value={selectedDeviceTypeId}
                                onChange={(event) => setSelectedDeviceTypeId(event.target.value)}
                                className="h-9 min-w-0 max-w-[280px] flex-1 rounded-md border border-[#3f3f46] bg-[var(--surface)] px-3 text-sm font-semibold text-white"
                              >
                                {deviceTypeOptions.map((type) => (
                                  <option key={type.id} value={type.id}>
                                    {type.display_name} · ₹{Number(type.regular_hourly_rate || 0).toFixed(0)}/hour
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Save device change"
                                title="Save device change"
                                onClick={() => void saveDeviceChange()}
                                disabled={savingDeviceChange || !selectedDeviceTypeId || selectedDeviceTypeId === deviceSlot?.devices?.device_type?.id}
                                className="h-8 w-8 shrink-0 text-emerald-400 hover:text-emerald-300"
                              >
                                {savingDeviceChange ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Cancel device change"
                                title="Cancel device change"
                                onClick={() => setDeviceEditOpen(false)}
                                disabled={savingDeviceChange}
                                className="h-8 w-8 shrink-0 text-secondary-content hover:text-white"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <p className="text-base font-bold text-white">
                                {deviceSlot?.device_type} #{deviceSlot?.device_station_number}
                              </p>
                              {canChangeActiveSessionDevice && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Edit device"
                                  title={booking.shared_play_enabled ? "Change device and recalculate shared-play charges" : "Edit device"}
                                  onClick={() => void openDeviceEditor()}
                                  disabled={loadingDeviceTypes}
                                  className="h-7 w-7 text-secondary-content hover:text-primary"
                                >
                                  {loadingDeviceTypes
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Pencil className="h-4 w-4" />}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="h-4 w-4 text-primary mt-0.5" />
                      <div className="flex-1">
                        <p className="text-label-enhanced text-muted-content mb-1">Date</p>
                        <p className="text-base text-white font-semibold">
                          {deviceSlot?.slot_date ? new Date(deviceSlot.slot_date).toLocaleDateString() : "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="h-4 w-4 text-primary mt-0.5" />
                      <div className="flex-1">
                        <p className="text-label-enhanced text-muted-content mb-1">Time Slot</p>
                        <p className="text-base text-white font-semibold">
                          {isActiveActualWalkIn
                            ? `Playing for ${liveSessionDuration}`
                            : formatDbTimeRange(deviceSlot?.slot_start_time, deviceSlot?.slot_end_time)}
                        </p>
                        {!isActiveActualWalkIn && (
                          <p className="text-sm-enhanced text-secondary-content mt-1">
                            Duration: {deviceSlot?.duration_hours}h
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Game Orders */}
              {booking.booking_device_slots && booking.booking_device_slots.length > 0 && (
                <Card className="bg-[var(--background)] border-[#27272a] p-5 space-y-4">
                  <h3 className="text-xs font-black text-secondary-content uppercase tracking-wider border-b border-[#27272a] pb-2 flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4" />
                    Game Orders
                  </h3>
                  <div className="space-y-3">
                    {booking.booking_device_slots.map((slot: any) => {
                      const currentPlayerCount = slot.player_count || slot.included_players || 1;
                      const displayPlayerCount = booking.shared_play_enabled
                        ? Math.max(sharedRoster.length, 1)
                        : currentPlayerCount;
                      const includedPlayers = slot.included_players || 1;
                      const maxPlayers = slot.devices?.device_type?.max_players || 10;
                      const extraPlayers = booking.shared_play_enabled
                        ? 0
                        : Math.max(0, currentPlayerCount - includedPlayers);
                      /**
                       * The charge actually billed, not the headline rate.
                       *
                       * This multiplied the extra-player count by the *hourly*
                       * rate and ignored duration, so a seven-minute session with
                       * six extra players showed 6 x 79 = 474 against a real
                       * charge of 54. The stored column already holds what was
                       * billed - it is written by the same helper that priced the
                       * session - so there is nothing to recompute here.
                       */
                      const extraPlayersCharge = Number(slot.extra_players_total || 0);
                      const canEdit = canEditBilling && !booking.shared_play_enabled;

                      return (
                        <div key={slot.id} className="bg-[var(--surface)] border border-[#27272a] rounded-lg p-4 space-y-3">
                          {/* Game/Device Info */}
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-black text-white">{slot.device_type}</p>
                              <p className="text-sm font-semibold text-secondary-content">
                                {isActiveActualWalkIn
                                  ? `Playing for ${liveSessionDuration} · ₹${Number(slot.hourly_rate).toLocaleString('en-IN')}/hr`
                                  : `${slot.duration_hours}h × ₹${Number(slot.hourly_rate).toLocaleString('en-IN')}/hr`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-white">₹{Number(slot.slot_total).toLocaleString('en-IN')}</p>
                              <p className="text-[11px] text-data-placeholder uppercase">Base Rate</p>
                            </div>
                          </div>

                          {/* Player Count Control */}
                          <div className="pt-2 border-t border-[#27272a]/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-bold text-white uppercase">
                                  {booking.shared_play_enabled ? "Participants" : "Player Count"}
                                </p>
                                <p className="text-min-enhanced text-secondary-content">
                                  {booking.shared_play_enabled
                                    ? `${activePlayers.length} currently playing • ${Math.max(0, displayPlayerCount - activePlayers.length)} sitting out`
                                    : `${includedPlayers} included • Max ${maxPlayers}`}
                                </p>
                              </div>
                              {canEdit ? (
                                <div className="flex items-center gap-3">
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdatePlayerCount(slot.id, currentPlayerCount - 1, maxPlayers)}
                                    disabled={updatingPlayerCount || currentPlayerCount <= 1}
                                    className="h-8 w-8 p-0 bg-primary hover:bg-primary-hover text-black disabled:opacity-30"
                                  >
                                    <Minus className="h-3 w-3 bg-primary hover:bg-primary-hover text-black font-black" />
                                  </Button>
                                  <span className="text-lg font-black text-white w-8 text-center">
                                    {currentPlayerCount}
                                  </span>
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdatePlayerCount(slot.id, currentPlayerCount + 1, maxPlayers)}
                                    disabled={updatingPlayerCount || currentPlayerCount >= maxPlayers}
                                    className="h-8 w-8 p-0 bg-primary hover:bg-primary-hover text-black disabled:opacity-30"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-lg font-black text-white">{displayPlayerCount}</span>
                              )}
                            </div>

                            {/* Extra Players Charge */}
                            {!booking.shared_play_enabled && extraPlayers > 0 && (
                              <div className="flex justify-between items-center pt-2 border-t border-[#27272a]/30">
                                <div>
                                  <p className="text-sm font-bold text-primary">Extra Players</p>
                                  <p className="text-sm text-secondary-content font-medium">
                                    {extraPlayers} player{extraPlayers > 1 ? 's' : ''} × ₹{Number(slot.extra_player_charge || 0).toLocaleString('en-IN')}/hr
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-black text-primary">₹{extraPlayersCharge.toLocaleString('en-IN')}</p>
                                  <p className="text-[11px] text-muted-content uppercase">Additional</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {booking.billed_on_actual_time === true &&
                !isFiSimulator &&
                booking.booking_device_slots?.length === 1 &&
                (booking.status === "checked_in" || (booking.status === "completed" && booking.shared_play_enabled)) && (
                <Card className="bg-[var(--background)] border-[#27272a] p-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wide">Play mode</h3>
                      <p className="text-xs text-secondary-content mt-1">Choose Shared play to track each person’s time at the board.</p>
                    </div>
                    {booking.status === "checked_in" ? (
                      <select
                        aria-label="Play mode"
                        value={booking.shared_play_enabled ? "shared" : "standard"}
                        onChange={(event) => {
                          if (event.target.value !== "shared") return;
                          const initialRoster = sharedRoster.length > 0
                            ? sharedRoster
                            : [booking.customer_name || "Player 1"];
                          const initialActive = activePlayers.length > 0
                            ? activePlayers
                            : initialRoster;
                          setSharedRoster(initialRoster);
                          setActivePlayers(initialActive);
                          handleSaveSharedPlay(true, initialRoster, initialActive);
                        }}
                        className="h-10 rounded-md border border-[#3f3f46] bg-[var(--surface)] px-3 text-sm font-bold text-white"
                      >
                        <option value="standard">Standard play</option>
                        <option value="shared">Shared play</option>
                      </select>
                    ) : (
                      <span className="rounded-md border border-[#3f3f46] bg-[var(--surface)] px-3 py-2 text-sm font-bold text-white">Shared play</span>
                    )}
                  </div>

                  {booking.shared_play_enabled && (
                    <div className="space-y-3 border-t border-[#27272a] pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="min-w-0 flex-1 text-xs text-secondary-content">Select players, then choose Sit in or Sit out and set when the change happened.</p>
                        {booking.status === "checked_in" && (
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pr-3">
                            {selectedParticipants.length > 0 && (
                              <span className="mr-1 text-xs text-secondary-content">
                                {selectedParticipants.length} selected
                              </span>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              disabled={savingSharedPlay || selectedParticipants.length === 0}
                              onClick={openSitInDialog}
                              className="bg-emerald-600 text-white hover:bg-emerald-500"
                            >
                              <Play className="mr-1 h-3 w-3" /> Sit in
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingSharedPlay || selectedParticipants.length === 0}
                              onClick={openSitOutDialog}
                              className="border-zinc-700 text-secondary-content"
                            >
                              <Pause className="mr-1 h-3 w-3" /> Sit out
                            </Button>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-bold text-primary">
                        Currently playing: {activePlayers.length} / {sharedRoster.length} participants · Board rate ₹{(Number(deviceSlot?.hourly_rate || 0) + Math.max(0, activePlayers.length - Number(deviceSlot?.included_players || 1)) * Number(deviceSlot?.extra_player_charge || 0)).toLocaleString("en-IN")}/hour
                      </p>
                      {activePlayers.length === 0 && booking.status === "checked_in" && (
                        <p className="text-xs font-semibold text-amber-300">Everyone is sitting out. Player timers are paused until someone sits in.</p>
                      )}
                      {booking.status === "checked_in" && (booking.shared_play_participants || []).filter((participant: any) => !participant.checked_out_at).length > 1 && (
                        <p className="text-xs font-semibold text-secondary-content">Check out each person beside their name, or use Checkout All to review everyone’s play and assigned food together.</p>
                      )}
                      <div className="space-y-2">
                        {sharedRoster.map((name) => {
                          const participant: SharedPlayParticipant | undefined = booking.shared_play_participants?.find(
                            (row: SharedPlayParticipant) => row.name.toLowerCase() === name.toLowerCase()
                          );
                          const isActive = activePlayers.some((active) => active.toLowerCase() === name.toLowerCase());
                          const isBookedPlayer = name.trim().toLowerCase() === (booking.customer_name || "Player 1").trim().toLowerCase();
                          const playedMinutes = Math.floor(
                            (participant?.shared_play_periods || []).reduce((total: number, period) => {
                              const startedAt = new Date(period.started_at).getTime();
                              const endedAt = period.ended_at ? new Date(period.ended_at).getTime() : sharedPlayNow.getTime();
                              return total + Math.max(0, endedAt - startedAt);
                            }, 0) / 60_000
                          );
                          return (
                            <div key={name} className="flex items-center justify-between gap-3 rounded-md border border-[#27272a] bg-[var(--surface)] px-3 py-2">
                              <div className="flex min-w-0 items-center gap-3">
                                {booking.status === "checked_in" && !participant?.checked_out_at && (
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${name}`}
                                    checked={selectedParticipants.some((selected) => selected.toLowerCase() === name.toLowerCase())}
                                    disabled={savingSharedPlay}
                                    onChange={(event) => setSelectedParticipants((current) =>
                                      event.target.checked
                                        ? [...current, name]
                                        : current.filter((selected) => selected.toLowerCase() !== name.toLowerCase())
                                    )}
                                    className="h-4 w-4 shrink-0 accent-emerald-500"
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-white">{name}</span>
                                    {isBookedPlayer && <span className="shrink-0 text-[10px] font-bold uppercase text-primary">Booked</span>}
                                  </div>
                                  <span className="text-[11px] text-secondary-content">{playedMinutes} min played</span>
                                  {participant?.customer_id && (
                                    <span className="block text-[11px] font-semibold text-emerald-300">
                                      Customer: {participant.customer?.name || "Linked profile"}
                                      {participant.customer?.phone ? ` · ${participant.customer.phone}` : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-3">
                                <span className="text-xs font-bold text-primary">
                                  ₹{Number(
                                    booking.status === "completed"
                                      ? participant?.billed_amount
                                      : participant
                                        ? sharedParticipantShares.get(participant.id) || 0
                                        : 0
                                  ).toFixed(2)}
                                </span>
                              {booking.status === "checked_in" && (
                                <span className={participant?.checked_out_at
                                  ? "min-w-16 rounded border border-amber-500/40 px-2 py-1 text-center text-xs font-bold text-amber-300"
                                  : isActive
                                    ? "min-w-16 rounded border border-emerald-500/40 px-2 py-1 text-center text-xs font-bold text-emerald-300"
                                    : "min-w-16 rounded border border-zinc-700 px-2 py-1 text-center text-xs font-bold text-secondary-content"}>
                                  {participant?.checked_out_at ? "Checked out" : isActive ? "Playing" : "Sit out"}
                                </span>
                              )}
                              {booking.status === "checked_in" && participant?.id && !participant?.checked_out_at && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={participantCheckoutLoading}
                                  onClick={() => void handleOpenParticipantCheckout(participant.id)}
                                  className="h-8 shrink-0 border-amber-500/50 px-2 text-xs text-amber-300 hover:bg-amber-500/10"
                                >
                                  {participantCheckoutLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="mr-1 h-3 w-3" />}
                                  Check out
                                </Button>
                              )}
                              </div>
                              {booking.status === "checked_in" && !participant?.customer_id && participant?.id && !participant?.checked_out_at && (
                                <div className="flex w-full flex-wrap items-center gap-2 pl-7 pt-1">
                                  <Select
                                    value={participantCustomerDrafts[participant.id] || ""}
                                    onValueChange={(customerId) => setParticipantCustomerDrafts((current) => ({
                                      ...current,
                                      [participant.id]: customerId,
                                    }))}
                                  >
                                    <SelectTrigger
                                      aria-label={`Select customer account for ${name}`}
                                      disabled={loadingSharedPlayCustomers || sharedPlayCustomers.length === 0}
                                      className="h-8 min-w-0 flex-1 border-[#3f3f46] bg-[var(--background)] text-xs text-white"
                                    >
                                      <SelectValue placeholder={
                                        loadingSharedPlayCustomers
                                          ? "Loading customer accounts..."
                                          : "Select customer account for wallet"
                                      } />
                                    </SelectTrigger>
                                    <SelectContent className="border-[#3f3f46] bg-[var(--surface)] text-white">
                                      {sharedPlayCustomers.filter((customer) => !booking.shared_play_participants?.some(
                                        (row: SharedPlayParticipant) => row.id !== participant.id && row.customer_id === customer.id
                                      )).map((customer) => (
                                        <SelectItem key={customer.id} value={customer.id}>
                                          {customer.name} · {customer.phone}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={loadingSharedPlayCustomers || linkingParticipantCustomer === participant.id || !participantCustomerDrafts[participant.id]}
                                    onClick={() => void handleLinkParticipantCustomer(participant.id, name)}
                                    className="h-8 shrink-0 border-primary/40 px-2 text-xs text-primary"
                                  >
                                    {linkingParticipantCustomer === participant.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link account"}
                                  </Button>
                                  {!loadingSharedPlayCustomers && sharedPlayCustomers.length === 0 && (
                                    <p className="w-full text-[11px] text-secondary-content">No customer accounts are available.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <details className="group rounded-md border border-[#27272a] bg-[var(--surface)]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
                          <span>Play sessions</span>
                          <span className="flex items-center gap-2 text-xs font-medium text-secondary-content">
                            {sharedPlaySessions.length} interval{sharedPlaySessions.length === 1 ? "" : "s"}
                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                          </span>
                        </summary>
                        <div className="space-y-2 border-t border-[#27272a] p-3">
                          {sharedPlaySessions.length === 0 ? (
                            <p className="text-xs text-secondary-content">No play sessions recorded yet.</p>
                          ) : (
                            sharedPlaySessions.map((session, index) => {
                              const names = session.participantIds.map((participantId) =>
                                booking.shared_play_participants?.find((participant: any) => participant.id === participantId)?.name || "Unknown player"
                              );
                              const durationMinutes = Math.floor((session.endedAt - session.startedAt) / 60_000);
                              const sessionAmount = sharedPlayCalculation?.sessions[index]?.amount;
                              return (
                                <div
                                  key={`${session.startedAt}-${session.endedAt}-${index}`}
                                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-[#27272a] px-3 py-2"
                                >
                                  <div>
                                    <p className="text-sm font-semibold text-white">{names.join(" + ")}</p>
                                    <p className="text-xs text-secondary-content">
                                      {formatClockTime12h(session.startedAt)} – {formatClockTime12h(session.endedAt)}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                                    {typeof sessionAmount === "number" && (
                                      <span className="text-xs font-bold text-primary">
                                        ₹{sessionAmount.toFixed(2)}
                                      </span>
                                    )}
                                    <span className="text-xs font-medium text-secondary-content">
                                      {formatPlayedDuration(durationMinutes)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </details>
                      {booking.status === "checked_in" && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Popover
                            open={customerPickerOpen}
                            onOpenChange={(open) => {
                              setCustomerPickerOpen(open);
                              if (!open) setCustomerSearchQuery("");
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={loadingSharedPlayCustomers}
                                aria-label="Search customers to add as a player"
                                className="min-w-0 flex-1 justify-between border-[#3f3f46] bg-[var(--surface)] text-left text-white"
                              >
                                <span className="truncate">
                                  {loadingSharedPlayCustomers
                                    ? "Loading customer profiles..."
                                    : sharedPlayCustomers.find((customer) => customer.id === newParticipantCustomerId)?.name ||
                                      "Search customer by name"}
                                </span>
                                <Search className="ml-2 h-4 w-4 shrink-0 text-secondary-content" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-[min(22rem,calc(100vw-2rem))] border-[#3f3f46] bg-[var(--surface)] p-2 text-white"
                            >
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-content" />
                                <Input
                                  autoFocus
                                  value={customerSearchQuery}
                                  onChange={(event) => setCustomerSearchQuery(event.target.value)}
                                  placeholder="Search name or phone..."
                                  aria-label="Search customer name or phone"
                                  className="h-9 border-[#3f3f46] bg-[var(--background)] pl-9 text-white"
                                />
                              </div>
                              <div
                                className="mt-2 max-h-[40vh] min-h-0 overflow-y-scroll overscroll-contain touch-pan-y"
                                onWheel={(event) => event.stopPropagation()}
                                onTouchMove={(event) => event.stopPropagation()}
                              >
                                {sharedPlayCustomers
                                  .filter((customer) => !booking.shared_play_participants?.some(
                                    (participant: SharedPlayParticipant) => participant.customer_id === customer.id
                                  ))
                                  .filter((customer) => {
                                    const query = customerSearchQuery.trim().toLowerCase();
                                    return !query ||
                                      customer.name.toLowerCase().includes(query) ||
                                      customer.phone.toLowerCase().includes(query) ||
                                      customer.email?.toLowerCase().includes(query);
                                  })
                                  .map((customer) => (
                                    <button
                                      key={customer.id}
                                      type="button"
                                      onClick={() => {
                                        setNewParticipantCustomerId(customer.id);
                                        setCustomerPickerOpen(false);
                                        setCustomerSearchQuery("");
                                      }}
                                      className="flex w-full flex-col rounded px-3 py-2 text-left hover:bg-zinc-800"
                                    >
                                      <span className="text-sm font-semibold text-white">{customer.name}</span>
                                      <span className="text-xs text-secondary-content">
                                        {customer.phone}{customer.email ? ` · ${customer.email}` : ""}
                                      </span>
                                    </button>
                                  ))}
                                {!loadingSharedPlayCustomers && sharedPlayCustomers.filter((customer) => {
                                  const query = customerSearchQuery.trim().toLowerCase();
                                  return !booking.shared_play_participants?.some(
                                    (participant: SharedPlayParticipant) => participant.customer_id === customer.id
                                  ) &&
                                    (!query || customer.name.toLowerCase().includes(query) ||
                                      customer.phone.toLowerCase().includes(query) ||
                                      customer.email?.toLowerCase().includes(query));
                                }).length === 0 && (
                                  <p className="px-3 py-4 text-center text-xs text-secondary-content">
                                    No matching unlinked customers. Use + to create a profile.
                                  </p>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Add selected customer as player"
                            title="Add selected customer as player"
                            disabled={!newParticipantCustomerId || savingSharedPlay || loadingSharedPlayCustomers}
                            onClick={() => void handleAddSharedParticipant()}
                            className="border-[#3f3f46] text-white"
                          >
                            {savingSharedPlay ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                          </Button>
                          <Dialog open={addPlayerCustomerOpen} onOpenChange={(open) => !creatingPlayerCustomer && setAddPlayerCustomerOpen(open)}>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label="Create customer and add as player"
                              title="Create customer and add as player"
                              onClick={() => setAddPlayerCustomerOpen(true)}
                              className="border-primary/40 text-primary"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <DialogContent className="max-w-md border-[#27272a] bg-[var(--background)] text-white">
                              <DialogHeader>
                                <DialogTitle className="text-lg font-black uppercase">Add Player Customer</DialogTitle>
                              </DialogHeader>
                              <form onSubmit={handleCreatePlayerCustomer} className="space-y-4">
                                <div className="space-y-2">
                                  <Label htmlFor="shared-player-customer-name">Name</Label>
                                  <Input
                                    id="shared-player-customer-name"
                                    name="name"
                                    maxLength={100}
                                    required
                                    className="border-[#3f3f46] bg-[var(--surface)] text-white"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="shared-player-customer-phone">Mobile number</Label>
                                  <Input
                                    id="shared-player-customer-phone"
                                    name="phone"
                                    type="tel"
                                    inputMode="numeric"
                                    maxLength={15}
                                    required
                                    className="border-[#3f3f46] bg-[var(--surface)] text-white"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="shared-player-customer-email">Email (optional)</Label>
                                  <Input
                                    id="shared-player-customer-email"
                                    name="email"
                                    type="email"
                                    maxLength={100}
                                    className="border-[#3f3f46] bg-[var(--surface)] text-white"
                                  />
                                </div>
                                <div className="flex justify-end">
                                  <Button type="submit" disabled={creatingPlayerCustomer || savingSharedPlay}>
                                    {creatingPlayerCustomer
                                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      : <UserPlus className="mr-2 h-4 w-4" />}
                                    Create & Add Player
                                  </Button>
                                </div>
                              </form>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                      {booking.status === "checked_in" && (
                        <p className="text-right text-[11px] text-muted-content">Live split estimate, updates every 10 seconds</p>
                      )}
                      {booking.status === "completed" && (
                        <div className="rounded-md bg-[var(--surface)] px-3 py-2 text-xs text-secondary-content">
                          Board rate is split by time. Each active player above {Number(deviceSlot?.included_players || 1)} included adds ₹{Number(deviceSlot?.extra_player_charge || 0)}/hour.
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )}

              {/* Food Items */}
              <Card className="bg-[var(--background)] border-[#27272a] p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-[#27272a] pb-3 mb-2">
                  <h3 className="text-section-header flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                    Food & Beverage Orders
                  </h3>
                  {canEditBilling && (
                    <Button
                      onClick={openFoodPicker}
                      size="sm"
                      className="bg-primary hover:bg-primary-hover text-black font-black uppercase text-xs h-9 px-4"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Food
                    </Button>
                  )}
                </div>
                {booking.booking_food_items && booking.booking_food_items.length > 0 ? (
                  <div className="space-y-3">
                    {booking.booking_food_items.map((item: any) => (
                      <div key={item.id} className="flex justify-between items-center p-4 bg-[var(--surface)] border border-[#27272a] rounded-lg hover:border-primary/30 transition-colors">
                        <div className="flex-1">
                          <p className="text-lg font-bold text-white mb-1">{item.item_name}</p>
                          <p className="text-sm-enhanced text-secondary-content">Qty: <span className="font-bold">{item.quantity}</span> × ₹{Number(item.unit_price).toLocaleString('en-IN')}</p>
                          {item.participant_id && booking.shared_play_enabled && (
                            <p className="mt-1 text-xs font-semibold text-primary">
                              For {booking.shared_play_participants?.find((participant: any) => participant.id === item.participant_id)?.name || "participant"}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xl font-black text-primary">₹{Number(item.line_total).toLocaleString('en-IN')}</p>
                            <p className="text-min text-muted-content uppercase mt-1">{item.status}</p>
                          </div>
                          {/* Only unpaid food an admin added can be taken back off */}
                          {item.removable && canEditBilling && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setFoodItemToRemove(item)}
                              className="h-9 w-9 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              title={`Remove ${item.item_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm-enhanced text-center py-6">No food items ordered yet</p>
                )}
              </Card>

              {/* Payment Summary - Detailed Breakdown */}
              <Card className="bg-gradient-to-br from-[#0a0a0a] via-zinc-950 to-[#0a0a0a] border-2 border-primary/30 p-6 shadow-[0_0_30px_rgba(184,134,11,0.2)]">
                <h3 className="text-section-header text-primary mb-5 flex items-center gap-2">
                  <IndianRupee className="h-5 w-5" />
                  Payment Summary
                </h3>
                <div className="space-y-4 text-base">
                  {(() => {
                    const slots = booking.booking_device_slots || [];
                    const deviceSlot = slots[0];
                    const durationHours = deviceSlot?.duration_hours || 1;
                    const hourlyRate = deviceSlot?.hourly_rate || 0;

                    /**
                     * Read the billed figures, never re-derive them.
                     *
                     * This used to compute `hourlyRate * durationHours` off the
                     * first slot alone. `duration_hours` is stored rounded to two
                     * decimals, so a 7-minute session billed at 44 was displayed
                     * as 0.12 x 379 = 45.48 - and since the Subtotal below comes
                     * from `device_subtotal`, the line items visibly failed to add
                     * up to the total underneath them. Multi-slot bookings were
                     * worse: one slot priced, all of them counted in the subtotal.
                     */
                    const isLiveSharedSession =
                      booking.shared_play_enabled === true &&
                      booking.billed_on_actual_time === true &&
                      booking.status === "checked_in";
                    const isLiveStandardSession =
                      standardLivePricing !== null &&
                      booking.billed_on_actual_time === true &&
                      booking.status === "checked_in" &&
                      booking.shared_play_enabled !== true;
                    const isLiveActualSession = isLiveSharedSession || isLiveStandardSession;
                    const liveSharedTotal = isLiveSharedSession
                      ? (sharedPlayCalculation?.deviceCharges || 0) + (sharedPlayCalculation?.extraPlayersTotal || 0)
                      : 0;
                    const liveSharedExtraPlayersTotal = isLiveSharedSession
                      ? sharedPlayCalculation?.extraPlayersTotal || 0
                      : 0;
                    const deviceCharges = isLiveSharedSession
                      ? sharedPlayCalculation?.deviceCharges || 0
                      : isLiveStandardSession
                        ? standardLivePricing.deviceCharges
                      : slots.reduce(
                      (sum: number, slot: any) => sum + (Number(slot.slot_total) || 0),
                      0
                    );

                    const extraPlayersTotal = isLiveSharedSession
                      ? liveSharedExtraPlayersTotal
                      : isLiveStandardSession
                        ? standardLivePricing.extraPlayersTotal
                      : slots.reduce(
                      (sum: number, slot: any) => sum + (Number(slot.extra_players_total) || 0),
                      0
                    );

                    const liveDeviceSubtotal = isLiveSharedSession
                      ? liveSharedTotal
                      : isLiveStandardSession
                        ? standardLivePricing.deviceSubtotal
                      : Number(booking.device_subtotal);
                    const calculatedSubtotal = liveDeviceSubtotal + Number(booking.food_subtotal);

                    // Calculate total (subtract all discounts)
                    const calculatedTotal = calculatedSubtotal -
                      Number(booking.subscription_discount || 0) -
                      Number(booking.promo_discount || 0) -
                      Number(booking.happy_hour_discount || 0) -
                      Number(booking.hour_pass_discount || 0);

                    return (
                      <>
                        <div className="flex items-center justify-between py-3 border-b border-zinc-800">
                          <span className="text-secondary-content font-semibold text-base">
                            {/* The rate breakdown only describes a single slot; with
                                several stations on one booking it would be quoting
                                one of them against the sum of all. */}
                            {slots.length === 1
                              ? `Device Booking (${durationHours}h × ₹${hourlyRate}):`
                              : `Device Booking (${slots.length} stations):`}
                          </span>
                          <span className="text-white font-bold text-lg">₹{deviceCharges.toFixed(2)}</span>
                        </div>

                        {extraPlayersTotal > 0 && (
                          <div className="flex items-center justify-between py-3 border-b border-zinc-800">
                            <span className="text-secondary-content font-semibold text-base">Extra Players:</span>
                            <span className="text-white font-bold text-lg">₹{extraPlayersTotal.toFixed(2)}</span>
                          </div>
                        )}

                        {booking.food_subtotal > 0 && (
                          <div className="flex items-center justify-between py-3 border-b border-zinc-800">
                            <span className="text-secondary-content font-semibold text-base">Food & Beverages:</span>
                            <span className="text-white font-bold text-lg">₹{Number(booking.food_subtotal).toFixed(2)}</span>
                          </div>
                        )}

                        {booking.booking_food_items && booking.booking_food_items.length > 0 && (
                          <div className="ml-4 space-y-2 py-3 border-b border-zinc-800">
                            {booking.booking_food_items.map((item: any) => (
                              <div key={item.id} className="flex items-center justify-between text-sm">
                                <span className="text-secondary-content font-medium">
                                  {item.item_name} x{item.quantity}
                                </span>
                                <span className="text-muted-content font-semibold">₹{item.line_total}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between py-3 border-b-2 border-zinc-700">
                          <span className="text-white font-bold text-lg">Subtotal:</span>
                          <span className="text-white font-black text-xl">₹{calculatedSubtotal.toFixed(2)}</span>
                        </div>

                        {booking.subscription_discount > 0 && (
                          <div className="flex items-center justify-between py-2 border-b border-zinc-800 text-green-500">
                            <span className="font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Subscription Discount:
                            </span>
                            <span className="font-bold">-₹{Number(booking.subscription_discount).toFixed(2)}</span>
                          </div>
                        )}

                        {booking.promo_discount > 0 && (
                          <div className="flex items-center justify-between py-2 border-b border-zinc-800 text-primary">
                            <span className="font-medium">Promo Discount:</span>
                            <span className="font-bold">-₹{Number(booking.promo_discount).toFixed(2)}</span>
                          </div>
                        )}

                        {booking.happy_hour_discount > 0 && (
                          <div className="flex items-center justify-between py-2 border-b border-zinc-800 text-amber-400">
                            <span className="font-medium flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Happy Hour Discount:
                            </span>
                            <span className="font-bold">-₹{Number(booking.happy_hour_discount).toFixed(2)}</span>
                          </div>
                        )}

                        {booking.hour_pass_discount > 0 && (
                          <div className="flex items-center justify-between py-2 border-b border-zinc-800 text-cyan-400">
                            <span className="font-medium">Personal Hour Pack:</span>
                            <span className="font-bold">-₹{Number(booking.hour_pass_discount).toFixed(2)}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-5 border-t-2 border-primary/20">
                          <span className="text-white font-black text-xl uppercase">
                            {isLiveActualSession ? "Live Total (estimate):" : "Total Amount:"}
                          </span>
                          <span className="text-3xl font-black bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">
                            ₹{calculatedTotal.toFixed(2)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-sm pt-3">
                          <span className="text-secondary-content uppercase font-bold">Payment Status</span>
                          <span className={`font-black uppercase px-3 py-1 rounded-full ${
                            booking.payment_status === 'paid'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                              : booking.payment_status === 'partial'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : booking.payment_status === 'pending'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                              : 'bg-zinc-800 text-secondary-content border border-zinc-700'
                          }`}>
                            {booking.payment_status}
                          </span>
                        </div>

                        {/* Payment Breakdown for Partial/Paid */}
                        {(booking.payment_status === 'partial' || booking.payment_status === 'paid') && Number(booking.amount_paid || 0) > 0 && (
                          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-blue-400 font-bold uppercase">Amount Paid:</span>
                              <span className="text-blue-300 font-black">
                                ₹{Number(booking.amount_paid || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                            {/* Show payment method breakdown */}
                            <div className="space-y-1 text-xs text-blue-300/70 pl-2 border-l-2 border-blue-500/30">
                              {Number(booking.cash_amount || 0) > 0 && (
                                <div className="flex justify-between">
                                  <span>Cash:</span>
                                  <span className="font-semibold">₹{Number(booking.cash_amount).toLocaleString('en-IN')}</span>
                                </div>
                              )}
                              {Number(booking.card_amount || 0) > 0 && (
                                <div className="flex justify-between">
                                  <span>Card:</span>
                                  <span className="font-semibold">₹{Number(booking.card_amount).toLocaleString('en-IN')}</span>
                                </div>
                              )}
                              {Number(booking.upi_amount || 0) > 0 && (
                                <div className="flex justify-between">
                                  <span>UPI:</span>
                                  <span className="font-semibold">₹{Number(booking.upi_amount).toLocaleString('en-IN')}</span>
                                </div>
                              )}
                              {Number(booking.online_amount || 0) > 0 && (
                                <div className="flex justify-between">
                                  <span>Online (Razorpay):</span>
                                  <span className="font-semibold">₹{Number(booking.online_amount).toLocaleString('en-IN')}</span>
                                </div>
                              )}
                            </div>
                            {/* Gateway reference, so staff can reconcile against the
                                Razorpay dashboard when a customer queries a charge. */}
                            {booking.razorpay_payment_id && (
                              <div className="flex items-center justify-between gap-2 text-xs text-blue-300/60 border-t border-blue-500/20 pt-2">
                                <span className="uppercase font-bold shrink-0">Payment ID</span>
                                <span className="font-mono truncate">{booking.razorpay_payment_id}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Balance Due Warning */}
                        {liveSessionBalanceDue > 0 && (isLiveActualSession || booking.payment_status !== 'paid') && (
                          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-amber-400 font-bold text-sm uppercase">
                                {isLiveActualSession ? "Total Balance Due (Estimate):" : "Balance Due:"}
                              </span>
                              <span className="text-amber-300 font-black text-lg">
                                ₹{liveSessionBalanceDue.toLocaleString('en-IN')}
                              </span>
                            </div>
                            {isLiveActualSession && (
                              <p className="border-t border-amber-500/20 pt-2 text-xs text-amber-200/80">
                                Includes current play charges and food, less payments already recorded. The estimate updates while the session is active.
                              </p>
                            )}
                            {booking.payment_status === 'partial' && booking.unpaid_items && booking.unpaid_items.length > 0 && (
                              <div className="border-t border-amber-500/20 pt-2 space-y-1">
                                <p className="text-xs text-amber-300/80 font-bold uppercase">
                                  Unpaid Items:
                                </p>
                                <div className="space-y-1 pl-2">
                                  {booking.unpaid_items.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-xs text-amber-300/70">
                                      <span>{item.description || item.item_type}</span>
                                      <span className="font-semibold">₹{Number(item.line_total).toLocaleString('en-IN')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <p className="text-xs text-amber-300/60 border-t border-amber-500/20 pt-2">
                              Payment must be collected before checkout
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </Card>

              {/* Created / checked in / played / checked out, one under the other,
                  so the booking time can never be mistaken for the start of play. */}
              {isSession && (
                <SessionTimeline
                  status={booking.status}
                  createdAt={booking.created_at}
                  checkedInAt={booking.checked_in_at}
                  completedAt={booking.completed_at}
                  plannedEndAt={booking.walk_in_planned_end}
                  totalAmount={booking.total_amount}
                  sharedPlayEnabled={booking.shared_play_enabled}
                  sharedPlayParticipants={booking.shared_play_participants || []}
                />
              )}

              {/* Changing when they are expected to finish.

                  Customers stay longer, and the planned end is not a note - the
                  station goes back on sale the moment it passes, so one that is
                  wrong shows a machine as free while somebody is sitting at it.
                  Only offered while the session is running; after checkout there
                  are two real times and nothing left to plan. */}
              {isSession && booking.status === "checked_in" && (
                <Card className="bg-[var(--surface)] border border-[#27272a] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase tracking-wider text-muted-content">
                      Expected finish
                    </p>
                    {booking.walk_in_planned_end && !editingPlannedEnd && (
                      <span className="text-sm font-black text-blue-300">
                        {formatClockTime12h(booking.walk_in_planned_end)}
                      </span>
                    )}
                  </div>

                  {!editingPlannedEnd ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs leading-relaxed text-muted-content">
                        {booking.walk_in_planned_end
                          ? "The station is held until then, and free to book afterwards."
                          : "Nobody has said. The station is held until checkout."}
                      </p>
                      <Button
                        onClick={() => {
                          setPlannedEndDraft(
                            booking.walk_in_planned_end
                              ? arenaClockTime(new Date(booking.walk_in_planned_end)).slice(0, 5)
                              : ""
                          );
                          setEditingPlannedEnd(true);
                        }}
                        variant="ghost"
                        className="border border-zinc-800 text-xs font-black uppercase text-zinc-300 hover:text-white h-9 px-4 rounded-lg"
                      >
                        {booking.walk_in_planned_end ? "Change" : "Set"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <TimeOfDayField
                        name="plannedEndDraft"
                        label="Expected finish"
                        defaultValue={plannedEndDraft}
                        onChange={setPlannedEndDraft}
                      />

                      {!plannedEndDraft ? (
                        <p className="text-[11px] leading-relaxed text-muted-content">
                          Save with this blank to take the plan off and hold the station
                          until checkout.
                        </p>
                      ) : plannedEndDraftCheck?.ok ? (
                        <p className="text-[11px] font-bold text-emerald-400">
                          Held until {formatDbTime(plannedEndDraftCheck.session.end.clock)}
                        </p>
                      ) : (
                        <p className="text-[11px] font-bold text-amber-500">
                          {plannedEndDraftCheck?.error}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setEditingPlannedEnd(false);
                            setPlannedEndDraft("");
                          }}
                          variant="ghost"
                          className="flex-1 border border-zinc-800 text-xs font-black uppercase text-muted-content hover:text-white h-9 rounded-lg"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSavePlannedEnd}
                          disabled={
                            savingPlannedEnd ||
                            (!!plannedEndDraft && !plannedEndDraftCheck?.ok)
                          }
                          className="flex-1 bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] text-xs font-black uppercase h-9 rounded-lg disabled:opacity-50"
                        >
                          {savingPlannedEnd ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : plannedEndDraft ? (
                            "Save"
                          ) : (
                            "Remove"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-6 border-t-2 border-[#27272a]">
                {isSession && booking.status === "confirmed" && (
                  <Button
                    onClick={handleSessionCheckIn}
                    disabled={actionLoading}
                    className="bg-green-600 hover:bg-green-700 text-white font-black uppercase text-sm h-12 px-8 flex items-center gap-2"
                  >
                    {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                    Check In &amp; Start Session
                  </Button>
                )}

                {isSession && booking.status === "checked_in" && (!booking.shared_play_enabled || (booking.shared_play_participants || []).some((participant: any) => !participant.checked_out_at)) && (
                  <Button
                    onClick={handleSessionCheckOut}
                    disabled={actionLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-sm h-12 px-8 flex items-center gap-2"
                  >
                    {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                    {booking.shared_play_enabled
                      ? (booking.shared_play_participants || []).filter((participant: any) => !participant.checked_out_at).length > 1
                        ? "Checkout All Participants"
                        : "Check Out & Calculate Individual Bill"
                      : "Check Out & Calculate Bill"}
                  </Button>
                )}

                {!isSession && booking.status === "confirmed" && (
                  <Button
                    onClick={handleCheckIn}
                    disabled={actionLoading}
                    className="bg-green-600 hover:bg-green-700 text-white font-black uppercase text-sm h-12 px-8 flex items-center gap-2"
                  >
                    {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                    Check In Customer
                  </Button>
                )}

                {!isSession && booking.status === "checked_in" && (!booking.shared_play_enabled || (booking.shared_play_participants || []).some((participant: any) => !participant.checked_out_at)) && (
                  <Button
                    onClick={handleCheckOut}
                    disabled={actionLoading || (!booking.shared_play_enabled && Number(booking.balance_due || 0) > 0 && booking.payment_status !== 'paid')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-sm h-12 px-8 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                    {booking.shared_play_enabled && (booking.shared_play_participants || []).filter((participant: any) => !participant.checked_out_at).length > 1
                      ? "Checkout All Participants"
                      : "Check Out Customer"}
                  </Button>
                )}

                <Button
                  onClick={onClose}
                  className="ml-auto bg-primary hover:bg-primary-hover text-black font-black uppercase text-sm h-12 px-8"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-96 flex items-center justify-center">
              <p className="text-muted-content">No booking data available</p>
            </div>
          )}
    </>
  );

  const titleRow = (
    <>
      BOOKING DETAILS
      {booking && (
        <span className="flex-shrink-0">
          <BookingStatusBadge status={booking.status} size="lg" />
        </span>
      )}
    </>
  );

  return (
    <>
      {variant === "page" ? (
        // Standalone route: same panel, no Dialog, so nothing is ever stacked.
        <div className="max-w-4xl mx-auto w-full">
          {headerSlot}
          <h1 className="text-xl font-black uppercase tracking-tight text-white flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
            {titleRow}
          </h1>
          {detailBody}
        </div>
      ) : (
        <Dialog open={open && !openFoodModalDirectly} onOpenChange={onClose}>
          <DialogContent className="bg-[var(--surface)] border-[#27272a] text-white max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase tracking-tight flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                {titleRow}
              </DialogTitle>
            </DialogHeader>
            {detailBody}
          </DialogContent>
        </Dialog>
      )}

      {/* Add Food Modal */}
      <Dialog open={addFoodModalOpen} onOpenChange={(val) => {
        setAddFoodModalOpen(val);
        if (!val) {
          setSelectedFoodItems({});
          setFoodSearchQuery("");
          setSelectedCategory("All");
          if (openFoodModalDirectly) {
            onClose();
          }
        }
      }}>
        {/*
          * Header, search/filter and the Add Items footer stay put; only the
          * item list scrolls. The menu runs to dozens of rows across three
          * categories, and with the whole dialog as one scroll region the
          * button that actually adds the order was the thing pushed off the
          * bottom of the screen - reachable, but only after scrolling past
          * everything it acts on.
          */}
        <DialogContent className="bg-[var(--surface)] border-[#27272a] text-white max-w-2xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-6 pb-4 flex-shrink-0">
            <DialogTitle className="text-xl font-black uppercase tracking-tight">
              Add Food & Beverages
            </DialogTitle>
          </DialogHeader>

          {booking?.shared_play_enabled && (
            <div className="px-6 pb-4">
              <Label htmlFor="shared-food-participant" className="mb-2 block text-xs font-bold uppercase text-secondary-content">
                Assign food to participant
              </Label>
              <select
                id="shared-food-participant"
                value={foodParticipantId}
                onChange={(event) => setFoodParticipantId(event.target.value)}
                className="h-10 w-full rounded-md border border-[#3f3f46] bg-[var(--background)] px-3 text-sm text-white"
              >
                <option value="">Select participant</option>
                {(booking.shared_play_participants || []).filter((participant: any) => !participant.checked_out_at).map((participant: any) => (
                  <option key={participant.id} value={participant.id}>{participant.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-secondary-content">The food cost will be added to this participant’s checkout.</p>
            </div>
          )}

          {/* Search and Filter Controls */}
          <div className="space-y-3 px-6 pb-4 border-b border-[#27272a] flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-content" />
              <Input
                type="text"
                placeholder="Search food items..."
                value={foodSearchQuery}
                onChange={(e) => setFoodSearchQuery(e.target.value)}
                className="pl-10 bg-[var(--background)] border-[#27272a] text-white placeholder:text-muted-content focus:border-primary/50"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-content" />
              {["All", "Snacks", "Drinks", "Meals"].map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    selectedCategory === category
                      ? "bg-primary text-black"
                      : "bg-[var(--background)] text-muted-content hover:text-white border border-[#27272a] hover:border-primary/30"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-4 py-4">
            {["Snacks", "Drinks", "Meals"].map((category) => {
              // Filter by selected category and search query
              const categoryItems = menuItems.filter((item) => {
                const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
                const matchesSearch = foodSearchQuery === "" ||
                  item.name.toLowerCase().includes(foodSearchQuery.toLowerCase());
                return item.category === category && matchesCategory && matchesSearch;
              });

              if (categoryItems.length === 0) return null;

              return (
                <div key={category} className="space-y-3">
                  <h4 className="text-label-enhanced border-b border-[#27272a] pb-2">
                    {category}
                  </h4>
                  <div className="space-y-3">
                    {categoryItems.map((item: any) => (
                      <div key={item.id} className="flex justify-between items-center p-4 bg-[var(--background)] border border-[#27272a] rounded-lg hover:border-primary/30 transition-colors">
                        <div className="flex-1">
                          <p className="text-lg font-bold text-white">{item.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-sm-enhanced text-primary font-bold">₹{Number(item.price).toLocaleString('en-IN')}</p>
                            <span className="text-xs text-muted-content">
                              • Stock: {item.quantity}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              const qty = (selectedFoodItems[item.id] || 0);
                              if (qty > 0) {
                                setSelectedFoodItems({ ...selectedFoodItems, [item.id]: qty - 1 });
                              }
                            }}
                            disabled={(selectedFoodItems[item.id] || 0) === 0}
                            className="h-10 w-10 p-0 bg-primary hover:bg-primary-hover text-black"
                          >
                            <Minus className="h-4 w-4 " />
                          </Button>
                          <span className="text-lg font-black text-white w-10 text-center">
                            {selectedFoodItems[item.id] || 0}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => {
                              const qty = (selectedFoodItems[item.id] || 0);
                              // Check stock availability
                              if (qty >= item.quantity) {
                                if (item.quantity === 0) {
                                  toast.error(`${item.name} is out of stock`);
                                } else {
                                  toast.error(`Only ${item.quantity} ${item.name} available in stock`);
                                }
                                return;
                              }
                              setSelectedFoodItems({ ...selectedFoodItems, [item.id]: qty + 1 });
                            }}
                            className="h-10 w-10 p-0 bg-primary hover:bg-primary-hover text-black"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {menuItems.length === 0 && (
              <p className="text-center text-muted-content py-8">No menu items available</p>
            )}

            {menuItems.length > 0 &&
              !["Snacks", "Drinks", "Meals"].some((category) => {
                const categoryItems = menuItems.filter((item) => {
                  const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
                  const matchesSearch = foodSearchQuery === "" ||
                    item.name.toLowerCase().includes(foodSearchQuery.toLowerCase());
                  return item.category === category && matchesCategory && matchesSearch;
                });
                return categoryItems.length > 0;
              }) && (
                <p className="text-center text-muted-content py-8">
                  No items match your search or filter criteria
                </p>
              )}
          </div>
          </div>

          {/* Footer stays fixed at the bottom of the panel, not the bottom of
              the item list - visible the instant a quantity is picked, on any
              screen, without scrolling past the menu to reach it. */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#27272a] flex-shrink-0">
            <Button
              variant="ghost"
              onClick={() => {
                setAddFoodModalOpen(false);
                setSelectedFoodItems({});
                setFoodParticipantId("");
                setFoodSearchQuery("");
                setSelectedCategory("All");
                if (openFoodModalDirectly) {
                  onClose();
                }
              }}
              className="border-[#27272a] text-muted-content hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddFoodItems}
              disabled={actionLoading || Object.values(selectedFoodItems).every((qty) => qty === 0) || (booking?.shared_play_enabled && !foodParticipantId)}
              className="bg-primary hover:bg-primary-hover text-black font-black uppercase"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Items
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Food Item Confirmation Dialog */}
      <AlertDialog
        open={!!foodItemToRemove}
        onOpenChange={(open) => !open && setFoodItemToRemove(null)}
      >
        <AlertDialogContent className="bg-[var(--surface)] border-[#27272a] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Remove Food Item?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-content">
              <span className="text-primary font-bold">
                {foodItemToRemove?.quantity} × {foodItemToRemove?.item_name}
              </span>{" "}
              (₹{Number(foodItemToRemove?.line_total || 0).toLocaleString('en-IN')}) will be taken
              off this booking, the amount deducted from the bill and the stock returned to the
              menu. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#27272a] text-white border-zinc-700 hover:bg-zinc-800">
              Keep Item
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Keep the dialog up while the request is in flight
                event.preventDefault();
                handleRemoveFoodItem();
              }}
              disabled={removingFoodItem}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              {removingFoodItem ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove Item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CheckOutSessionDialog
        open={checkOutOpen}
        onOpenChange={setCheckOutOpen}
        loading={actionLoading}
        target={
          booking
            ? {
                id: booking.id,
                booking_number: booking.booking_number,
                customer_name: booking.customer_name,
                checked_in_at: booking.checked_in_at,
                deviceLabel: booking.walk_in_device_type_name,
              }
            : null
        }
        onConfirm={confirmSessionCheckOut}
      />

      <Dialog open={sitInDialogOpen} onOpenChange={setSitInDialogOpen}>
        <DialogContent className="max-w-sm border-[#27272a] bg-[var(--surface)] text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Sit-in time</DialogTitle>
            <DialogDescription className="text-secondary-content">
              Set when the selected participant{selectedParticipants.length === 1 ? " sat in" : "s sat in"}. The current time is filled in; adjust it if you are recording an earlier start.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-secondary-content">Time</Label>
            <TimeOfDayField
              name="shared-play-sit-in-time"
              label="Sit-in time"
              defaultValue={sitInClockDraft}
              onChange={setSitInClockDraft}
            />
            <p className="text-xs text-secondary-content">You can enter a time up to {MAX_BACKDATED_START_HOURS} hours ago.</p>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button type="button" variant="ghost" onClick={() => setSitInDialogOpen(false)} disabled={savingSharedPlay}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmSitIn} disabled={savingSharedPlay || !sitInClockDraft} className="bg-emerald-600 text-white hover:bg-emerald-500">
              {savingSharedPlay ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start timer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sitOutDialogOpen} onOpenChange={setSitOutDialogOpen}>
        <DialogContent className="max-w-sm border-[#27272a] bg-[var(--surface)] text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Sit-out time</DialogTitle>
            <DialogDescription className="text-secondary-content">
              Set when the selected participant{selectedParticipants.length === 1 ? " stopped playing" : "s stopped playing"}. The current time is filled in; adjust it if they sat out earlier.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-secondary-content">Time</Label>
            <TimeOfDayField
              name="shared-play-sit-out-time"
              label="Sit-out time"
              defaultValue={sitOutClockDraft}
              onChange={setSitOutClockDraft}
            />
            <p className="text-xs text-secondary-content">You can enter a time up to {MAX_BACKDATED_START_HOURS} hours ago.</p>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button type="button" variant="ghost" onClick={() => setSitOutDialogOpen(false)} disabled={savingSharedPlay}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmSitOut} disabled={savingSharedPlay || !sitOutClockDraft} className="border-zinc-700 text-white" variant="outline">
              {savingSharedPlay ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
              Save sit-out time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={checkoutAllOpen} onOpenChange={(open) => !open && setCheckoutAllOpen(false)}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden border-[#27272a] bg-[var(--surface)] text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Checkout All Participants</DialogTitle>
            <DialogDescription className="text-secondary-content">
              Review each person’s play charge and assigned food together. The server settles everyone at the same checkout time.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-3">
            {checkoutAllQuotes.map((quote: any) => {
              const useWallet = checkoutAllWalletIds.includes(quote.participantId);
              const walletUsed = useWallet ? Math.min(Number(quote.totalAmount), Number(quote.walletBalance)) : 0;
              const remaining = Math.max(0, Number(quote.totalAmount) - walletUsed);
              return (
                <div key={quote.participantId} className="rounded-lg border border-[#27272a] bg-[var(--background)] p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">{quote.participantName}</p>
                      <p className="mt-1 text-xs text-secondary-content">Play charge · {quote.playedMinutes} min: ₹{Number(quote.deviceAmount).toFixed(2)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-primary">₹{Number(quote.totalAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-secondary-content">
                    <span>Assigned food</span><span>₹{Number(quote.foodAmount).toFixed(2)}</span>
                  </div>
                  {quote.foodItems.map((item: any) => (
                    <div key={item.id} className="mt-1 flex justify-between gap-3 text-xs text-secondary-content">
                      <span>{item.quantity} × {item.item_name}</span>
                      <span>₹{Number(item.line_total).toFixed(2)}</span>
                    </div>
                  ))}
                  <label className="mt-3 flex w-full min-w-0 cursor-pointer flex-wrap items-start gap-x-2 gap-y-1 border-t border-[#27272a] pt-3">
                    <input
                      type="checkbox"
                      checked={useWallet}
                      disabled={!quote.customerId || Number(quote.walletBalance) <= 0 || participantCheckoutLoading}
                      onChange={(event) => {
                        const nextWalletIds = event.target.checked
                          ? [...checkoutAllWalletIds, quote.participantId]
                          : checkoutAllWalletIds.filter((id) => id !== quote.participantId);
                        setCheckoutAllWalletIds(nextWalletIds);
                        const nextDue = checkoutAllQuotes.reduce((sum, row) => {
                          const wallet = nextWalletIds.includes(row.participantId)
                            ? Math.min(Number(row.totalAmount || 0), Number(row.walletBalance || 0))
                            : 0;
                          return sum + Math.max(0, Number(row.totalAmount || 0) - wallet);
                        }, 0);
                        setCheckoutAllUpiAmount(Math.max(0, nextDue - Number(checkoutAllCashAmount || 0) - Number(checkoutAllCardAmount || 0)).toFixed(2));
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                    />
                    <span className="min-w-0 flex-1 break-words text-xs text-secondary-content">
                      Use {quote.participantName}’s wallet · available ₹{Number(quote.walletBalance).toFixed(2)}
                      <span className="ml-2 font-semibold text-white">Due after wallet ₹{remaining.toFixed(2)}</span>
                    </span>
                  </label>
                </div>
              );
            })}
          </div>

          {(() => {
            const total = checkoutAllQuotes.reduce((sum, quote) => sum + Number(quote.totalAmount || 0), 0);
            const walletTotal = checkoutAllQuotes.reduce((sum, quote) => checkoutAllWalletIds.includes(quote.participantId)
              ? sum + Math.min(Number(quote.totalAmount || 0), Number(quote.walletBalance || 0))
              : sum, 0);
            const remaining = Math.max(0, total - walletTotal);
            return (
              <div className="space-y-3 rounded-lg border border-primary/30 bg-[var(--background)] p-4">
                <div className="flex justify-between text-base font-black">
                  <span>Total for everyone (play + food)</span><span className="text-primary">₹{total.toFixed(2)}</span>
                </div>
                {walletTotal > 0 && <div className="flex justify-between text-xs text-emerald-300"><span>Wallet credits</span><span>−₹{walletTotal.toFixed(2)}</span></div>}
                <div className="flex justify-between border-t border-[#27272a] pt-3 text-sm font-bold">
                  <span>Collect now</span><span>₹{remaining.toFixed(2)}</span>
                </div>
                {remaining > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase text-secondary-content">Split everyone&apos;s remaining amount</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label htmlFor="checkout-all-cash" className="mb-1 block text-xs text-secondary-content">Cash (INR)</Label><input id="checkout-all-cash" type="number" min="0" step="0.01" disabled={participantCheckoutLoading} value={checkoutAllCashAmount} onChange={(event) => setCheckoutAllCashAmount(event.target.value)} className="h-10 w-full rounded-md border border-[#3f3f46] bg-[var(--surface)] px-3 text-sm text-white" /></div>
                      <div><Label htmlFor="checkout-all-upi" className="mb-1 block text-xs text-secondary-content">UPI (INR)</Label><input id="checkout-all-upi" type="number" min="0" step="0.01" disabled={participantCheckoutLoading} value={checkoutAllUpiAmount} onChange={(event) => setCheckoutAllUpiAmount(event.target.value)} className="h-10 w-full rounded-md border border-[#3f3f46] bg-[var(--surface)] px-3 text-sm text-white" /></div>
                      <div><Label htmlFor="checkout-all-card" className="mb-1 block text-xs text-secondary-content">Card (INR)</Label><input id="checkout-all-card" type="number" min="0" step="0.01" disabled={participantCheckoutLoading} value={checkoutAllCardAmount} onChange={(event) => setCheckoutAllCardAmount(event.target.value)} className="h-10 w-full rounded-md border border-[#3f3f46] bg-[var(--surface)] px-3 text-sm text-white" /></div>
                    </div>
                    <p className="mt-2 text-xs text-secondary-content">Entered INR {checkoutAllSplitTotal.toFixed(2)} of INR {remaining.toFixed(2)}{!checkoutAllSplitValid && "; amounts must match"}</p>
                  </div>
                )}
              </div>
            );
          })()}
          </div>

          <div className="flex shrink-0 flex-col-reverse justify-end gap-2 border-t border-[#27272a] pt-3 sm:flex-row">
            <Button variant="ghost" disabled={participantCheckoutLoading} onClick={() => setCheckoutAllOpen(false)}>Cancel</Button>
            <Button disabled={participantCheckoutLoading || checkoutAllQuotes.length === 0 || !checkoutAllSplitValid} onClick={() => void handleConfirmCheckoutAll()} className="bg-primary font-black text-black hover:bg-primary-hover">
              {participantCheckoutLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              Checkout everyone
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!participantCheckoutQuote} onOpenChange={(open) => !open && setParticipantCheckoutQuote(null)}>
        <DialogContent className="max-w-md border-[#27272a] bg-[var(--surface)] text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase">Check out {participantCheckoutQuote?.participantName}</DialogTitle>
          </DialogHeader>
          {participantCheckoutQuote && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#27272a] bg-[var(--background)] p-4 text-sm">
                <div className="flex justify-between"><span className="text-secondary-content">Play charge ({participantCheckoutQuote.playedMinutes} min)</span><span>₹{Number(participantCheckoutQuote.deviceAmount).toFixed(2)}</span></div>
                <div className="mt-2 flex justify-between"><span className="text-secondary-content">Assigned food</span><span>₹{Number(participantCheckoutQuote.foodAmount).toFixed(2)}</span></div>
                {participantCheckoutQuote.foodItems.map((item: any) => (
                  <p key={item.id} className="mt-1 text-xs text-secondary-content">{item.quantity} × {item.item_name}</p>
                ))}
                <div className="mt-3 flex justify-between border-t border-[#27272a] pt-3 font-black">
                  <span>Total due</span><span className="text-primary">₹{Number(participantCheckoutQuote.totalAmount).toFixed(2)}</span>
                </div>
              </div>

              <label className="flex w-full min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-[#27272a] p-3">
                <input
                  type="checkbox"
                  checked={participantCheckoutUseWallet}
                  disabled={!participantCheckoutQuote.customerId || participantCheckoutQuote.walletBalance <= 0}
                  onChange={(event) => {
                    const useWallet = event.target.checked;
                    setParticipantCheckoutUseWallet(useWallet);
                    const due = Number(participantCheckoutQuote.totalAmount) - (useWallet
                      ? Math.min(Number(participantCheckoutQuote.totalAmount), Number(participantCheckoutQuote.walletBalance))
                      : 0);
                    setParticipantCheckoutUpiAmount(Math.max(0, due - Number(participantCheckoutCashAmount || 0) - Number(participantCheckoutCardAmount || 0)).toFixed(2));
                  }}
                  className="mt-1 h-4 w-4 shrink-0 accent-emerald-500"
                />
                <span className="min-w-0 flex-1 break-words">
                  <span className="block text-sm font-bold">Use wallet credits</span>
                  <span className="text-xs text-secondary-content">
                    {participantCheckoutQuote.customerId
                      ? `Available ₹${Number(participantCheckoutQuote.walletBalance).toFixed(2)}`
                      : "Link this participant to a customer account to use wallet credits."}
                  </span>
                </span>
              </label>

              {participantExternalDue > 0 && (
                <div className="space-y-3 rounded-lg border border-[#27272a] p-3">
                  <p className="text-xs font-bold uppercase text-secondary-content">Split remaining payment</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label htmlFor="participant-cash-amount" className="mb-1 block text-xs text-secondary-content">Cash (INR)</Label><input id="participant-cash-amount" type="number" min="0" step="0.01" value={participantCheckoutCashAmount} onChange={(event) => setParticipantCheckoutCashAmount(event.target.value)} className="h-10 w-full rounded-md border border-[#3f3f46] bg-[var(--background)] px-3 text-sm text-white" /></div>
                    <div><Label htmlFor="participant-upi-amount" className="mb-1 block text-xs text-secondary-content">UPI (INR)</Label><input id="participant-upi-amount" type="number" min="0" step="0.01" value={participantCheckoutUpiAmount} onChange={(event) => setParticipantCheckoutUpiAmount(event.target.value)} className="h-10 w-full rounded-md border border-[#3f3f46] bg-[var(--background)] px-3 text-sm text-white" /></div>
                    <div><Label htmlFor="participant-card-amount" className="mb-1 block text-xs text-secondary-content">Card (INR)</Label><input id="participant-card-amount" type="number" min="0" step="0.01" value={participantCheckoutCardAmount} onChange={(event) => setParticipantCheckoutCardAmount(event.target.value)} className="h-10 w-full rounded-md border border-[#3f3f46] bg-[var(--background)] px-3 text-sm text-white" /></div>
                  </div>
                  <p className="text-xs text-secondary-content">Remaining INR {participantExternalDue.toFixed(2)}; entered INR {participantSplitTotal.toFixed(2)}{!participantSplitValid && "; amounts must match"}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" disabled={participantCheckoutLoading} onClick={() => setParticipantCheckoutQuote(null)}>Cancel</Button>
                <Button disabled={participantCheckoutLoading || !participantSplitValid} onClick={() => void handleConfirmParticipantCheckout()} className="bg-primary font-black text-black hover:bg-primary-hover">
                  {participantCheckoutLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                  Confirm checkout
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
