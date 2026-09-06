"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookingTimingCell, SessionSummaryLine } from "./SessionTimeline";
import { BookingStatusBadge } from "./BookingStatusBadge";
import { AttentionBadges } from "./AttentionBadges";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { Calendar, Clock, MapPin, IndianRupee, Phone, User, Eye, UserCheck, LogOut, UtensilsCrossed, CreditCard, Link2, Ban, Undo2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatClockTime12h } from "@/lib/utils/dates";

interface BookingsGridProps {
  customerGroups: Array<{
    phone: string;
    customerName: string;
    bookings: any[];
    count: number;
    totalAmount: number;
    totalDevice: number;
    totalFood: number;
    hasBackToBack: boolean;
    earliestBooking: any;
  }>;
  onBookingClick: (booking: any) => void;
  onCheckIn: (bookingId: string, bookingNumber: string, booking: any) => void;
  onCheckOut: (bookingId: string, bookingNumber: string, booking: any) => void;
  onAddFood: (booking: any) => void;
  onCheckoutBilling: (bookingId: string) => void;
  /** Opens the cancel confirmation. Omitted where cancelling is not offered. */
  onCancel?: (booking: any) => void;
  canCancel?: (booking: any) => boolean;
  /** Records that a cancelled booking's money has been handed back. */
  onMarkRefunded?: (booking: any) => void;
  needsRefund?: (booking: any) => boolean;
  isPending: boolean;
}

export function BookingsGrid({
  customerGroups,
  onBookingClick,
  onCheckIn,
  onCheckOut,
  onAddFood,
  onCheckoutBilling,
  onCancel,
  canCancel,
  onMarkRefunded,
  needsRefund,
  isPending
}: BookingsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {customerGroups.flatMap((group) => {
        return group.bookings.map((booking) => {
          const deviceSlot = booking.booking_device_slots?.[0];
          const foodItems = booking.booking_food_items || [];
          const isFoodOnly = !deviceSlot && foodItems.length > 0;
          const hasDevice = !!deviceSlot;
          // An open-ended walk-in: no station until check-in, no price until checkout.
          const isSession = booking.billed_on_actual_time === true;
          const awaitingCheckIn = isSession && booking.status === "confirmed";
          const isPlaying = isSession && booking.status === "checked_in";

          return (
            <Card
              key={booking.id}
              className="bg-[var(--surface)] border-[#27272a] hover:border-primary/40 transition-all overflow-hidden group hover:shadow-[0_0_20px_rgba(255,193,7,0.1)]"
            >
              {/* Header - Booking ID & Status */}
              <div className="p-4 bg-gradient-to-br from-[var(--background)] to-[var(--surface)] border-b border-[#27272a]/50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-mono text-primary/70">{booking.booking_number}</p>
                  <BookingStatusBadge status={booking.status} size="sm" />
                </div>

                {/* Customer Name - Big */}
                <h3 className="text-lg font-black text-white mb-1 truncate group-hover:text-primary transition-colors">
                  {group.customerName}
                </h3>
                <p className="text-xs text-muted-content font-mono">{group.phone}</p>

                <AttentionBadges booking={booking} compact className="mt-2" />
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                {/* Where this walk-in is in its lifecycle. Shown above everything
                    else because "booked at 8:55" and "playing since 9:00" are the
                    two facts staff must never confuse. */}
                {isSession && (
                  <div className={`p-2.5 rounded-lg border text-xs font-bold ${awaitingCheckIn
                    ? "bg-amber-500/10 border-amber-500/30"
                    : isPlaying
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-zinc-900/60 border-zinc-800"
                    }`}>
                    <SessionSummaryLine
                      status={booking.status}
                      createdAt={booking.created_at}
                      checkedInAt={booking.checked_in_at}
                      completedAt={booking.completed_at}
                    />
                    {awaitingCheckIn && (
                      <p className="text-[11px] text-amber-300/70 font-medium mt-1">
                        {booking.walk_in_device_type_name || "Device"} · station assigned on check-in
                      </p>
                    )}
                  </div>
                )}

                {/* Food Only Booking */}
                {isFoodOnly && !isSession ? (
                  <>
                    {/* Food Order Badge */}
                    <div className="flex items-center gap-2 p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
                      <div className="p-1.5 bg-amber-500/20 rounded">
                        <UtensilsCrossed className="h-4 w-4 text-amber-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-amber-400">Food Order Only</p>
                        <p className="text-sm font-bold text-white">{foodItems.length} item(s)</p>
                      </div>
                    </div>

                    {/* Order Date */}
                    <div className="flex items-center gap-2 p-2 bg-[var(--background)] rounded-lg border border-[#27272a]/50">
                      <div className="p-1.5 bg-blue-500/10 rounded">
                        <Calendar className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-content">Order Date</p>
                        <p className="text-sm font-bold text-white">
                          {new Date(booking.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-muted-content flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatClockTime12h(booking.created_at)}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Device Type Only */}
                    <div className="flex items-center gap-2 p-2 bg-[var(--background)] rounded-lg border border-[#27272a]/50">
                      <div className="p-1.5 bg-primary/10 rounded">
                        <MapPin className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-content">Device</p>
                        {/* Before check-in there is no station, only the type the
                            customer is waiting for - "N/A" would read as an error. */}
                        <p className="text-sm font-bold text-white">
                          {deviceSlot?.device_type || booking.walk_in_device_type_name || "N/A"}
                        </p>
                        {deviceSlot?.device_station_number && (
                          <p className="text-xs text-muted-content">
                            Station #{deviceSlot.device_station_number}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Date & Time */}
                    <div className="flex items-center gap-2 p-2 bg-[var(--background)] rounded-lg border border-[#27272a]/50">
                      <div className="p-1.5 bg-blue-500/10 rounded">
                        <Calendar className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-content">Date & Time</p>
                        <p className="text-sm font-bold text-white">
                          {deviceSlot?.slot_date
                            ? new Date(deviceSlot.slot_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
                            : new Date(booking.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                        </p>
                        {/* The session banner at the top of the card already carries
                            the play times, so only a fixed booking needs this. */}
                        {!isSession && (
                          <p className="text-xs text-muted-content flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <BookingTimingCell booking={booking} slot={deviceSlot} />
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Payment Details */}
                <div className="flex items-center gap-2 p-2 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                  <div className="p-1.5 bg-primary/20 rounded">
                    <IndianRupee className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-primary/70">Total Amount</p>
                    <p className="text-lg font-black text-primary">
                      ₹{formatCurrency(booking.total_amount)}
                    </p>
                  </div>
                  <PaymentStatusBadge
                    status={booking.payment_status || 'pending'}
                    bookingStatus={booking.status}
                    size="sm"
                    amountPaid={booking.amount_paid}
                    balanceDue={booking.balance_due}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="p-3 bg-[var(--background)]/50 border-t border-[#27272a]/50 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {/* Only show check-in/check-out for bookings with device slots */}
                  {(awaitingCheckIn || (!isFoodOnly && !isSession && booking.status === "confirmed")) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onCheckIn(booking.id, booking.booking_number, booking)}
                      disabled={isPending}
                      className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-lg"
                      title="Check In"
                    >
                      <UserCheck className="h-4 w-4" />
                    </Button>
                  )}
                  {onMarkRefunded && needsRefund?.(booking) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onMarkRefunded(booking)}
                      disabled={isPending}
                      className="h-8 w-8 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg"
                      title="Mark as refunded"
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                  {onCancel && canCancel?.(booking) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onCancel(booking)}
                      disabled={isPending}
                      className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                      title="Cancel Booking"
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                  {(isPlaying || (!isFoodOnly && !isSession && booking.status === "checked_in")) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onCheckOut(booking.id, booking.booking_number, booking)}
                      disabled={isPending}
                      className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg"
                      title="Check Out"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  )}
                  {/* Food can only be added while the booking is live. A food-only
                      order has no session to be live for, so it stays open on its
                      own - but not once it has been called off or closed, which is
                      how a cancelled food order kept offering this button. */}
                  {booking.status !== "cancelled" &&
                    booking.status !== "completed" &&
                    (isFoodOnly || booking.status === "confirmed" || booking.status === "checked_in") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onAddFood(booking)}
                      className="h-8 w-8 p-0 text-primary hover:text-primary-hover hover:bg-primary/10 rounded-lg"
                      title="Add Food"
                    >
                      <UtensilsCrossed className="h-4 w-4" />
                    </Button>
                  )}
                  {/* Billing stays reachable while money is owed, whatever the status.
                      A walk-in session is only priced at checkout, which moves it to
                      `completed` - so gating this on the live statuses alone hid the
                      one button that could collect the bill just calculated. */}
                  {(isFoodOnly ||
                    booking.status === "confirmed" ||
                    booking.status === "checked_in" ||
                    Number(booking.balance_due || 0) > 0.01) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onCheckoutBilling(booking.id)}
                      className="h-8 w-8 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg"
                      title="Checkout & Billing"
                    >
                      <CreditCard className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => onBookingClick(booking)}
                  className="h-8 px-3 bg-[var(--surface)] hover:bg-primary/10 border border-[#27272a] hover:border-primary/50 text-white hover:text-primary text-xs font-black uppercase rounded-lg transition-all"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  View
                </Button>
              </div>
            </Card>
          );
        });
      })}
    </div>
  );
}
