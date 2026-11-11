"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, IndianRupee, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getOutstandingPayments, markBookingAsPaid, markSharedPlayParticipantBalanceAsPaid } from "@/app/(admin)/admin/bookings/actions";
import { formatCurrency } from "@/lib/currency";

type PaymentMethod = "upi" | "cash" | "card";

export default function DuePaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [amount, setAmount] = useState("");

  const loadPayments = useCallback(async () => {
    setLoading(true);
    const result = await getOutstandingPayments();
    if (result.success) setPayments(result.payments);
    else toast.error("Could not load due payments", { description: result.error });
    setLoading(false);
  }, []);

  useEffect(() => { void loadPayments(); }, [loadPayments]);

  const amountNumber = Number(amount);
  const validAmount = Number.isFinite(amountNumber) && amountNumber > 0 && selected && amountNumber <= selected.balance_due + 0.01;
  const remainingAfterPayment = useMemo(() => selected && Number.isFinite(amountNumber)
    ? Math.max(0, Number(selected.balance_due) - amountNumber)
    : 0, [amountNumber, selected]);

  const openPayment = (booking: any) => {
    setSelected(booking);
    setAmount(Number(booking.balance_due).toFixed(2));
    setPaymentMethod("upi");
  };

  const handleRecordPayment = async () => {
    if (!selected || !validAmount || saving) return;
    setSaving(true);
    const paymentSplit = {
      cashAmount: paymentMethod === "cash" ? amountNumber : 0,
      cardAmount: paymentMethod === "card" ? amountNumber : 0,
      upiAmount: paymentMethod === "upi" ? amountNumber : 0,
    };
    const result = selected.payment_target === "participant"
      ? await markSharedPlayParticipantBalanceAsPaid(selected.id, selected.participant_id, {
          ...paymentSplit,
          idempotencyKey: crypto.randomUUID(),
        })
      : await markBookingAsPaid(selected.id, paymentSplit);
    if (result.success) {
      toast.success(remainingAfterPayment < 0.01 ? "Balance settled" : "Partial payment recorded", {
        description: remainingAfterPayment < 0.01 ? selected.booking_number : `₹${formatCurrency(remainingAfterPayment)} remains due`,
      });
      setSelected(null);
      await loadPayments();
    } else {
      toast.error("Could not record payment", { description: result.error });
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">Due Payments</h1>
            <p className="mt-1 text-sm text-secondary-content">Customers and shared-play participants with a remaining balance.</p>
          </div>
          <Button onClick={() => void loadPayments()} variant="outline" disabled={loading} className="border-zinc-700 text-white">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <Card className="border-zinc-800 bg-[var(--surface)] p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-secondary-content"><Loader2 className="h-5 w-5 animate-spin" /> Loading outstanding balances…</div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <CheckCircle2 className="mb-3 h-9 w-9 text-green-400" />
              <p className="font-bold text-white">All booking balances are settled</p>
              <p className="mt-1 text-sm text-secondary-content">Fully paid bookings disappear from this list.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs uppercase text-secondary-content">
                    <th className="px-3 py-3">Customer / Booking</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Bill</th>
                    <th className="px-3 py-3 text-right">Paid</th>
                    <th className="px-3 py-3 text-right">Remaining</th>
                    <th className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((booking) => (
                    <tr key={`${booking.payment_target}:${booking.id}:${booking.participant_id || "booking"}`} className="border-b border-zinc-800/70 last:border-0">
                      <td className="px-3 py-4">
                        <p className="font-bold text-white">{booking.customer_name || "Customer not linked"}</p>
                        <p className="mt-1 text-xs text-secondary-content">{booking.booking_number} · {booking.customer_phone || (booking.participant_name ? "No phone on file" : "No phone on booking")}</p>
                        {booking.participant_name && <p className="mt-1 text-[11px] font-semibold text-amber-300">Shared-play participant balance</p>}
                      </td>
                      <td className="px-3 py-4">
                        <Badge className={booking.amount_paid > 0 ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-red-500/40 bg-red-500/10 text-red-300"}>
                          {booking.amount_paid > 0 ? "Partially Paid" : "Unpaid"}
                        </Badge>
                      </td>
                      <td className="px-3 py-4 text-right tabular-nums text-zinc-300">₹{formatCurrency(booking.total_amount)}</td>
                      <td className="px-3 py-4 text-right tabular-nums text-green-300">₹{formatCurrency(booking.amount_paid)}</td>
                      <td className="px-3 py-4 text-right font-black tabular-nums text-amber-300">₹{formatCurrency(booking.balance_due)}</td>
                      <td className="px-3 py-4 text-right">
                        <Button size="sm" onClick={() => openPayment(booking)} className="bg-green-600 font-bold text-white hover:bg-green-700">
                          <IndianRupee className="mr-1 h-4 w-4" /> Record Payment
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !saving) setSelected(null); }}>
        <DialogContent className="max-w-md border-zinc-800 bg-[var(--background)] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black uppercase"><AlertCircle className="h-5 w-5 text-amber-400" /> Record Payment</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="font-bold">{selected.customer_name || "Customer not linked"}</p>
                <p className="mt-1 text-xs text-secondary-content">{selected.booking_number}</p>
                {selected.participant_name && <p className="mt-1 text-xs font-semibold text-amber-300">{selected.participant_name} · shared-play balance</p>}
                <p className="mt-3 text-sm text-secondary-content">Balance due <strong className="text-amber-300">₹{formatCurrency(selected.balance_due)}</strong></p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-payment-amount">Amount received (₹)</Label>
                <Input id="due-payment-amount" type="number" min="0.01" max={selected.balance_due} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="border-zinc-700 bg-zinc-900 text-white" />
                <p className="text-xs text-secondary-content">Remaining after payment: ₹{formatCurrency(remainingAfterPayment)}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="due-payment-method">Payment method</Label>
                <select id="due-payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white">
                  <option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option>
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={saving} onClick={() => setSelected(null)}>Cancel</Button>
            <Button disabled={!validAmount || saving} onClick={() => void handleRecordPayment()} className="bg-green-600 font-black text-white hover:bg-green-700">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {remainingAfterPayment < 0.01 ? "Mark as Paid" : "Mark as Partially Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
