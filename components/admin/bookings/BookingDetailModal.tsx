"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingStatusBadge } from "./BookingStatusBadge";
import { AttentionPanel } from "./AttentionBadges";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { SessionTimeline } from "./SessionTimeline";
import { getBookingDetails, checkInBooking, checkOutBooking, checkInWalkInSession, checkOutWalkInSession, addFoodToBooking, removeFoodItemFromBooking, updatePlayerCount } from "@/app/(admin)/admin/bookings/actions";
import { getMenuItems } from "@/app/(admin)/admin/food/actions";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";
import {
  User, Phone, Mail, Calendar, Clock, IndianRupee,
  Loader2, CheckCircle2, LogIn, LogOut,
  UtensilsCrossed, QrCode, MapPin, Gamepad2, Plus, Minus, Search, Filter, Trash2
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
import { formatDbTimeRange } from "@/lib/utils/timeSlots";

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
  const [addFoodModalOpen, setAddFoodModalOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [selectedFoodItems, setSelectedFoodItems] = useState<Record<string, number>>({});
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

  useEffect(() => {
    if (open && bookingId) {
      // Reset so switching to a different booking shows the loader again rather
      // than the previous booking's details.
      setHasLoaded(false);
      loadBookingDetails();
      loadMenuItems();
      if (openFoodModalDirectly) {
        setAddFoodModalOpen(true);
      }
    }
  }, [open, bookingId, openFoodModalDirectly]);

  const loadBookingDetails = async () => {
    if (!bookingId) return;
    setLoading(true);
    const result = await getBookingDetails(bookingId);
    if (result.success) {
      setBooking(result.booking);
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

  const handleAddFoodItems = async () => {
    if (!bookingId || Object.keys(selectedFoodItems).length === 0) {
      toast.error("Please select at least one item");
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
          unitPrice: Number(menuItem.price)
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

  /** True for a walk-in whose bill comes from the clock, not from a chosen slot. */
  const isSession = booking?.billed_on_actual_time === true;

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

  const handleSessionCheckOut = async () => {
    if (!bookingId) return;
    setActionLoading(true);
    const result = await checkOutWalkInSession(bookingId);
    if (result.success) {
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

  const deviceSlot = booking?.booking_device_slots?.[0];

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
                          <span>In: {new Date(booking.checked_in_at).toLocaleString()}</span>
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
                        <p className="text-base font-bold text-white">
                          {deviceSlot?.device_type} #{deviceSlot?.device_station_number}
                        </p>
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
                          {formatDbTimeRange(deviceSlot?.slot_start_time, deviceSlot?.slot_end_time)}
                        </p>
                        <p className="text-sm-enhanced text-secondary-content mt-1">
                          Duration: {deviceSlot?.duration_hours}h
                        </p>
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
                      const includedPlayers = slot.included_players || 1;
                      const maxPlayers = slot.devices?.device_type?.max_players || 10;
                      const extraPlayers = Math.max(0, currentPlayerCount - includedPlayers);
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
                      const canEdit = booking.status !== "cancelled" && booking.status !== "completed";

                      return (
                        <div key={slot.id} className="bg-[var(--surface)] border border-[#27272a] rounded-lg p-4 space-y-3">
                          {/* Game/Device Info */}
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-black text-white">{slot.device_type}</p>
                              <p className="text-sm font-semibold text-secondary-content">
                                {slot.duration_hours}h × ₹{Number(slot.hourly_rate).toLocaleString('en-IN')}/hr
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
                                <p className="text-sm font-bold text-white uppercase">Player Count</p>
                                <p className="text-min-enhanced text-secondary-content">
                                  {includedPlayers} included • Max {maxPlayers}
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
                                <span className="text-lg font-black text-white">{currentPlayerCount}</span>
                              )}
                            </div>

                            {/* Extra Players Charge */}
                            {extraPlayers > 0 && (
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

              {/* Food Items */}
              <Card className="bg-[var(--background)] border-[#27272a] p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-[#27272a] pb-3 mb-2">
                  <h3 className="text-section-header flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-primary" />
                    Food & Beverage Orders
                  </h3>
                  {booking.status !== "cancelled" && booking.status !== "completed" && (
                    <Button
                      onClick={() => setAddFoodModalOpen(true)}
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
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xl font-black text-primary">₹{Number(item.line_total).toLocaleString('en-IN')}</p>
                            <p className="text-min text-muted-content uppercase mt-1">{item.status}</p>
                          </div>
                          {/* Only unpaid food an admin added can be taken back off */}
                          {item.removable && booking.status !== "cancelled" && booking.status !== "completed" && (
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
                    const deviceCharges = slots.reduce(
                      (sum: number, slot: any) => sum + (Number(slot.slot_total) || 0),
                      0
                    );

                    const extraPlayersTotal = slots.reduce(
                      (sum: number, slot: any) => sum + (Number(slot.extra_players_total) || 0),
                      0
                    );

                    // Calculate subtotal
                    const calculatedSubtotal = Number(booking.device_subtotal) + Number(booking.food_subtotal);

                    // Calculate total (subtract all discounts)
                    const calculatedTotal = calculatedSubtotal -
                      Number(booking.subscription_discount || 0) -
                      Number(booking.promo_discount || 0) -
                      Number(booking.happy_hour_discount || 0);

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

                        <div className="flex items-center justify-between pt-5 border-t-2 border-primary/20">
                          <span className="text-white font-black text-xl uppercase">Total Amount:</span>
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
                        {Number(booking.balance_due || 0) > 0 && booking.payment_status !== 'paid' && (
                          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-amber-400 font-bold text-sm uppercase">Balance Due:</span>
                              <span className="text-amber-300 font-black text-lg">
                                ₹{Number(booking.balance_due).toLocaleString('en-IN')}
                              </span>
                            </div>
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
                  totalAmount={booking.total_amount}
                />
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

                {isSession && booking.status === "checked_in" && (
                  <Button
                    onClick={handleSessionCheckOut}
                    disabled={actionLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-sm h-12 px-8 flex items-center gap-2"
                  >
                    {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                    Check Out &amp; Calculate Bill
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

                {!isSession && booking.status === "checked_in" && (
                  <Button
                    onClick={handleCheckOut}
                    disabled={actionLoading || (Number(booking.balance_due || 0) > 0 && booking.payment_status !== 'paid')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-sm h-12 px-8 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                    Check Out Customer
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
        <DialogContent className="bg-[var(--surface)] border-[#27272a] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">
              Add Food & Beverages
            </DialogTitle>
          </DialogHeader>

          {/* Search and Filter Controls */}
          <div className="space-y-3 mt-4 pb-4 border-b border-[#27272a]">
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

          <div className="space-y-4 mt-4">
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

          <div className="flex justify-end gap-2 pt-4 border-t border-[#27272a] mt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setAddFoodModalOpen(false);
                setSelectedFoodItems({});
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
              disabled={actionLoading || Object.values(selectedFoodItems).every((qty) => qty === 0)}
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

    </>
  );
}
