"use client";

import { useState, useTransition, type FormEvent } from "react";
import { WalletCards } from "lucide-react";
import { toast } from "sonner";
import { addCustomerWalletCreditAction } from "@/app/(admin)/admin/customers/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddWalletCreditButtonProps {
  customer: { id: string; name: string };
  onCredited?: () => Promise<void>;
}

export function AddWalletCreditButton({ customer, onCredited }: AddWalletCreditButtonProps) {
  const [open, setOpen] = useState(false);
  const [creditType, setCreditType] = useState<"paid" | "bonus">("paid");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi">("cash");
  const [bonusNeverExpires, setBonusNeverExpires] = useState(false);
  const [pricePaidPreview, setPricePaidPreview] = useState(0);
  const [walletCreditsPreview, setWalletCreditsPreview] = useState(0);
  const [requestKey, setRequestKey] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleOpenChange = (nextOpen: boolean) => {
    if (isPending) return;
    if (nextOpen) {
      setRequestKey(crypto.randomUUID());
      setCreditType("paid");
      setPaymentMethod("cash");
      setBonusNeverExpires(false);
      setPricePaidPreview(0);
      setWalletCreditsPreview(0);
    }
    setOpen(nextOpen);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const amount = Number(formData.get("amount"));
    const walletCredits = creditType === "paid" ? Number(formData.get("wallet_credits")) : amount;
    const reason = String(formData.get("reason") || "").trim();
    const bonusExpiryRaw = formData.get("bonus_expiry_days");
    const bonusExpiryDays = bonusNeverExpires ? null : bonusExpiryRaw == null ? undefined : Number(bonusExpiryRaw);

    startTransition(async () => {
      const result = await addCustomerWalletCreditAction({
        customerId: customer.id,
        amount,
        walletCredits,
        creditType,
        paymentMethod: creditType === "paid" ? paymentMethod : undefined,
        bonusExpiryDays,
        reason,
        idempotencyKey: requestKey,
      });

      if (!result.success) {
        toast.error("Could not add wallet credit", { description: result.error });
        return;
      }

      toast.success(creditType === "paid" ? "Wallet sale recorded" : "Wallet bonus added", {
        description: creditType === "paid"
          ? `INR ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} received; INR ${result.walletCredits.toLocaleString("en-IN", { minimumFractionDigits: 2 })} wallet credit added for ${customer.name}.`
          : `INR ${result.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} bonus credit added for ${customer.name}.`,
      });
      setOpen(false);
      await onCredited?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="mt-0 h-8 w-8 p-0"
        aria-label={`Add wallet credit for ${customer.name}`}
        title="Add wallet credit"
        onClick={() => handleOpenChange(true)}
      >
        <WalletCards className="h-4 w-4" />
      </Button>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-white">
        <div className="space-y-2">
          <DialogTitle className="text-lg font-black">Add wallet credit</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Record a paid wallet sale or add complimentary bonus credit to {customer.name}&apos;s wallet.
          </DialogDescription>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`wallet-credit-type-${customer.id}`}>Credit type</Label>
            <select
              id={`wallet-credit-type-${customer.id}`}
              value={creditType}
              onChange={event => setCreditType(event.target.value as "paid" | "bonus")}
              className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm"
              disabled={isPending}
            >
              <option value="paid">Paid wallet sale</option>
              <option value="bonus">Complimentary bonus</option>
            </select>
          </div>

          {creditType === "paid" && (
            <div className="space-y-2">
              <Label htmlFor={`wallet-sale-price-${customer.id}`}>Price paid (INR)</Label>
              <Input id={`wallet-sale-price-${customer.id}`} name="amount" type="number" min="0.01" max="1000000" step="0.01" required disabled={isPending} placeholder="2500.00" onChange={event => setPricePaidPreview(Number(event.target.value) || 0)} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`wallet-credit-amount-${customer.id}`}>{creditType === "paid" ? "Paid wallet credits (INR)" : "Bonus credit amount (INR)"}</Label>
            <Input
              id={`wallet-credit-amount-${customer.id}`}
              name={creditType === "paid" ? "wallet_credits" : "amount"}
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              required
              disabled={isPending}
              placeholder={creditType === "paid" ? "3000.00" : "500.00"}
              onChange={event => setWalletCreditsPreview(Number(event.target.value) || 0)}
            />
          </div>

          {creditType === "paid" && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
              <p className="font-bold text-white">Bonus credit (INR): {Math.max(0, Math.round((walletCreditsPreview - pricePaidPreview) * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
            </div>
          )}

          {creditType === "paid" && (
            <div className="space-y-2">
              <Label htmlFor={`wallet-sale-method-${customer.id}`}>Payment received by</Label>
              <select
                id={`wallet-sale-method-${customer.id}`}
                value={paymentMethod}
                onChange={event => setPaymentMethod(event.target.value as "cash" | "card" | "upi")}
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm"
                disabled={isPending}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
              </select>
            </div>
          )}

          {(creditType === "bonus" || walletCreditsPreview > pricePaidPreview) && (
            <div className="space-y-2">
              <Label htmlFor={`wallet-credit-expiry-${customer.id}`}>Bonus expiry (days)</Label>
              <Input
                id={`wallet-credit-expiry-${customer.id}`}
                name="bonus_expiry_days"
                type="number"
                min="1"
                max="3650"
                step="1"
                defaultValue="90"
                required={!bonusNeverExpires}
                disabled={isPending || bonusNeverExpires}
              />
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={bonusNeverExpires} onChange={event => setBonusNeverExpires(event.target.checked)} disabled={isPending} className="accent-primary" />
                Bonus never expires
              </label>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`wallet-credit-reason-${customer.id}`}>{creditType === "paid" ? "Sale note" : "Reason for bonus"}</Label>
            <Input
              id={`wallet-credit-reason-${customer.id}`}
              name="reason"
              minLength={3}
              maxLength={200}
              required
              disabled={isPending}
              placeholder={creditType === "paid" ? "e.g. Wallet top-up received at counter" : "e.g. Complimentary credit approved by manager"}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !requestKey}>
              {isPending ? "Adding…" : "Add credit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
