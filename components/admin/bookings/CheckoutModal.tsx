"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard, CheckCircle2, XCircle, AlertCircle, IndianRupee, ReceiptIndianRupee } from "lucide-react";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { roundToTwo } from "@/lib/currency";
import { toast } from "sonner";
import { getBookingBillingDetails, markBookingAsPaid, closeBooking } from "@/app/(admin)/admin/bookings/actions";

interface CheckoutModalProps {
  bookingId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CheckoutModal({ bookingId, isOpen, onClose, onSuccess }: CheckoutModalProps) {
  const [billing, setBilling] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi'>('cash');

  useEffect(() => {
    if (isOpen && bookingId) {
      loadBillingDetails();
    }
  }, [isOpen, bookingId]);

  const loadBillingDetails = async () => {
    if (!bookingId) return;

    setIsLoading(true);
    const result = await getBookingBillingDetails(bookingId);
    if (result.success) {
      setBilling(result.booking);
    } else {
      toast.error("Failed to load billing details", { description: result.error });
    }
    setIsLoading(false);
  };

  const handleMarkAsPaid = async () => {
    if (!bookingId || !billing) return;

    if (awaitingSessionBill) {
      toast.error("Nothing to settle yet", {
        description: "This session is still in progress. Check the customer out so the bill can be calculated."
      });
      return;
    }

    setIsProcessing(true);

    // Create payment split based on selected method (full amount in selected method)
    const balanceDue = roundToTwo(billing.total_amount - (billing.amount_paid || 0));
    const paymentSplit = {
      cashAmount: paymentMethod === 'cash' ? balanceDue : 0,
      cardAmount: paymentMethod === 'card' ? balanceDue : 0,
      upiAmount: paymentMethod === 'upi' ? balanceDue : 0
    };

    const result = await markBookingAsPaid(bookingId, paymentSplit);
    if (result.success) {
      toast.success("Payment Marked", { description: `Booking marked as paid via ${paymentMethod.toUpperCase()}` });
      loadBillingDetails();
      onSuccess();
    } else {
      toast.error("Failed to mark as paid", { description: result.error });
    }
    setIsProcessing(false);
  };

  const handleCloseBooking = async () => {
    if (!bookingId) return;

    if (billing?.payment_status !== "paid") {
      toast.error("Cannot Close", { description: "Payment must be settled before closing the booking" });
      return;
    }

    if (awaitingCheckIn) {
      toast.error("Cannot Close", {
        description: "This booking was never checked in. Check the customer in first, or cancel the booking if they never arrived."
      });
      return;
    }

    setIsProcessing(true);
    const result = await closeBooking(bookingId);
    if (result.success) {
      toast.success("Booking Closed", { description: "Booking has been completed and closed" });
      onSuccess();
      onClose();
    } else {
      toast.error("Failed to close booking", { description: result.error });
    }
    setIsProcessing(false);
  };

  const isPaid = billing?.payment_status === "paid";
  const isPending = billing?.payment_status === "pending";

  /**
   * Mirrors the server guard in `closeBooking`: a device session has to have
   * started before it can be closed, so a booking still sitting in `confirmed`
   * cannot be checked out from here. Food-only orders have no station to take and
   * never check in, so they settle straight from the billing dialog.
   *
   * Settling the payment stays available either way - the money is owed whether or
   * not the customer turned up.
   */
  const awaitingCheckIn =
    (billing?.booking_device_slots?.length ?? 0) > 0 && billing?.status !== "checked_in";

  /**
   * A walk-in session whose clock is still running. There is no bill to settle
   * yet - the total is zero only because checkout has not worked it out - so both
   * actions here are refused, server-side as well.
   */
  const awaitingSessionBill =
    billing?.billed_on_actual_time === true && !billing?.completed_at;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--background)] border-2 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <ReceiptIndianRupee className="h-5 w-5 text-primary" />
            Checkout & Billing
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <BreakpointLoader size="md" text="Loading bill..." />
          </div>
        ) : billing ? (
          <div className="space-y-6 py-4">
            {/* Booking Info */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-secondary-content">Booking Number</span>
                <span className="text-base font-black text-primary font-mono">{billing.booking_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-secondary-content">Customer</span>
                <span className="text-sm font-bold text-white">{billing.customer_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-secondary-content">Phone</span>
                <span className="text-sm font-bold text-white">{billing.customer_phone}</span>
              </div>
            </div>

            {/* Payment Status Card */}
            <div className={`border-2 rounded-xl p-6 ${isPaid
                ? 'bg-green-500/10 border-green-500/40'
                : 'bg-red-500/10 border-red-500/40'
              }`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-muted-content">Payment Status</h3>
                {isPaid ? (
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-red-500" />
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-white">Status:</span>
                  <Badge className={`${isPaid
                      ? 'bg-green-500/20 text-green-400 border-green-500/40'
                      : 'bg-red-500/20 text-red-400 border-red-500/40'
                    } font-black uppercase`}>
                    {isPaid ? 'Fully Paid' : 'Pending Payment'}
                  </Badge>
                </div>

                {/* Amount Paid and Balance Due */}
                {!isPaid && (
                  <>
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-700">
                      <div>
                        <p className="text-xs text-secondary-content uppercase mb-1">Amount Paid</p>
                        <p className="text-lg font-black text-green-400">₹{Number(billing.amount_paid || 0).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-secondary-content uppercase mb-1">Balance Due</p>
                        <p className="text-lg font-black text-red-400">₹{Number(billing.balance_due || 0).toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="mt-4 p-4 bg-red-950/50 border border-red-900/50 rounded-lg">
                      <div className="flex items-start gap-3">
                        <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-red-400">
                            {billing.unpaid_items?.length || 0} Unpaid Item(s)
                          </p>
                          <p className="text-xs text-red-300 mt-1">
                            ₹{Number(billing.unpaid_amount || 0).toFixed(2)} pending payment
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Billing Breakdown - Using Line Items */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-secondary-content flex items-center gap-2">
                <IndianRupee className="h-4 w-4" />
                Billing Breakdown
              </h3>

              <div className="space-y-2 text-sm">
                {billing.line_items && billing.line_items.length > 0 ? (
                  <>
                    {billing.line_items.map((item: any) => {
                      const isUnpaid = !item.is_paid;
                      const isDiscount = item.item_type.includes('discount');

                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between py-2 px-3 rounded-lg ${isUnpaid
                              ? 'bg-amber-500/10 border-l-4 border-amber-500'
                              : 'border-b border-zinc-800'
                            }`}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            {isUnpaid && (
                              <AlertCircle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                            )}
                            <span className={`font-medium ${isDiscount
                                ? item.item_type === 'subscription_discount'
                                  ? 'text-green-500'
                                  : 'text-primary'
                                : isUnpaid
                                  ? 'text-amber-300'
                                  : 'text-muted-content'
                              }`}>
                              {item.description}
                              {item.quantity > 1 && item.item_type !== 'device' && (
                                <span className="text-xs ml-1">x{item.quantity}</span>
                              )}
                            </span>
                            {isUnpaid && (
                              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[11px] px-1.5 py-0">
                                UNPAID
                              </Badge>
                            )}
                          </div>
                          <span className={`font-bold ${isDiscount
                              ? item.item_type === 'subscription_discount'
                                ? 'text-green-500'
                                : 'text-primary'
                              : isUnpaid
                                ? 'text-amber-300'
                                : 'text-white'
                            }`}>
                            {isDiscount ? '-' : ''}₹{Math.abs(Number(item.line_total)).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between pt-4 border-t-2 border-primary/20">
                      <span className="text-base font-black text-white uppercase">Total Amount:</span>
                      <span className="text-2xl font-black text-primary">
                        ₹{Number(billing.total_amount).toFixed(2)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-muted-content py-4">No billing details available</p>
                )}
              </div>
            </div>

            {/* Payment Method Selector & Action Buttons */}
            <div className="space-y-3">
              {!isPaid && (
                <>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <Label className="text-xs font-black uppercase text-secondary-content mb-2 block">
                      Payment Method (Offline)
                    </Label>
                    <Select value={paymentMethod} onValueChange={(value: 'cash' | 'card' | 'upi') => setPaymentMethod(value)}>
                      <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="cash" className="text-white hover:bg-zinc-800">
                          💵 Cash
                        </SelectItem>
                        <SelectItem value="card" className="text-white hover:bg-zinc-800">
                          💳 Card
                        </SelectItem>
                        <SelectItem value="upi" className="text-white hover:bg-zinc-800">
                          📱 UPI
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleMarkAsPaid}
                    disabled={isProcessing || awaitingSessionBill}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-black uppercase text-sm h-12 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    Mark as Paid ({paymentMethod.toUpperCase()})
                  </Button>
                </>
              )}

              {awaitingSessionBill && (
                <div className="bg-blue-950/30 border border-blue-900/40 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-blue-300">Session still in progress</p>
                    <p className="text-xs text-blue-200/80 mt-1">
                      The bill is calculated from the time actually played, so there is nothing to
                      settle until the customer is checked out.
                    </p>
                  </div>
                </div>
              )}

              {awaitingCheckIn && !awaitingSessionBill && (
                <div className="bg-amber-950/40 border border-amber-900/50 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-400">Never Checked In</p>
                    <p className="text-xs text-amber-300/90 mt-1">
                      Check the customer in before closing this booking. If they never arrived, cancel it
                      instead so it is not counted as a played session.
                    </p>
                  </div>
                </div>
              )}

              <Button
                onClick={handleCloseBooking}
                disabled={isProcessing || !isPaid || awaitingCheckIn || awaitingSessionBill}
                className={`w-full font-black uppercase text-sm h-12 rounded-xl ${isPaid && !awaitingCheckIn
                    ? 'bg-primary hover:bg-primary-hover text-black'
                    : 'bg-zinc-800 text-muted-content cursor-not-allowed'
                  }`}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                {!isPaid
                  ? 'Close Booking (Payment Required)'
                  : awaitingCheckIn
                    ? 'Close Booking (Check-In Required)'
                    : 'Close Booking'}
              </Button>

              <Button
                onClick={onClose}
                variant="ghost"
                className="w-full border border-zinc-800 text-muted-content hover:text-white font-bold uppercase text-xs h-10 rounded-xl"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-secondary-content">
            No billing information available
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
