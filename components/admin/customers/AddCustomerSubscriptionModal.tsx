"use client";

import { useState, useTransition } from "react";
import { BadgePlus, Loader2, Plus, WalletCards } from "lucide-react";
import { toast } from "sonner";
import {
  assignSubscriptionToCustomerAction,
  getAssignableSubscriptionPlansAction,
} from "@/app/(admin)/admin/customers/actions";
import type { AssignableSubscriptionPlan, CustomerRow } from "@/lib/types/customers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface AddCustomerSubscriptionModalProps {
  customer: Pick<CustomerRow, "id" | "name">;
  onAssigned: () => Promise<void>;
}

const formatPrice = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

function describePlan(plan: AssignableSubscriptionPlan) {
  const category = plan.plan_type === "hour_pack" && plan.device_type_name
    ? ` · ${plan.device_type_name}`
    : "";
  const hours = plan.plan_type === "hour_pack" && plan.hours_included
    ? ` · ${plan.hours_included} hours`
    : "";
  const type = plan.plan_type === "hour_pack" ? "Hour pack" : "Membership";
  return `${plan.name} · ${type}${category}${hours} · ${plan.duration_months} month${plan.duration_months === 1 ? "" : "s"} · ${formatPrice(plan.price)}`;
}

export function AddCustomerSubscriptionModal({
  customer,
  onAssigned,
}: AddCustomerSubscriptionModalProps) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<AssignableSubscriptionPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpenChange = async (nextOpen: boolean) => {
    if (isPending) return;
    setOpen(nextOpen);
    if (!nextOpen) return;

    setPlans([]);
    setPlanId("");
    setLoadError(null);
    setLoadingPlans(true);
    try {
      const result = await getAssignableSubscriptionPlansAction();
      if (!result.success) {
        setLoadError(result.error);
        toast.error("Could not load plans", { description: result.error });
        return;
      }
      setPlans(result.data);
      setPlanId(result.data[0]?.id || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load active plans.";
      setLoadError(message);
      toast.error("Could not load plans", { description: message });
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!planId) return;

    startTransition(async () => {
      try {
        const result = await assignSubscriptionToCustomerAction({
          customerId: customer.id,
          planId,
        });
        if (!result.success) {
          toast.error("Could not assign subscription", { description: result.error });
          return;
        }

        setOpen(false);
        toast.success("Subscription assigned", {
          description: `${result.planName} added to ${customer.name}.`,
        });
        await onAssigned();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not assign this subscription.";
        toast.error("Could not assign subscription", { description: message });
      }
    });
  };

  const selectedPlan = plans.find((plan) => plan.id === planId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="mt-0 h-8 w-8 border-zinc-700 p-0 text-zinc-300 hover:border-primary hover:text-primary"
          aria-label={`Add subscription for ${customer.name}`}
          title="Add subscription"
        >
          <BadgePlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg border-[#27272a] bg-[var(--background)] text-white">
        <div className="space-y-1 pr-6">
          <DialogTitle className="flex items-center gap-2 text-lg font-black uppercase">
            <WalletCards className="h-5 w-5 text-primary" />
            Assign subscription
          </DialogTitle>
          <p className="text-sm text-secondary-content">
            Assign a plan to {customer.name}. The full listed price will be recorded as paid.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor={`subscription-plan-${customer.id}`} className="text-sm font-semibold text-zinc-200">
              Active plan
            </label>
            <select
              id={`subscription-plan-${customer.id}`}
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              disabled={loadingPlans || plans.length === 0}
              required
              className="h-10 w-full rounded-md border border-[#3f3f46] bg-[var(--surface)] px-3 text-sm text-white disabled:opacity-60"
            >
              {plans.length === 0 ? (
                <option value="">{loadingPlans ? "Loading plans..." : "No active plans available"}</option>
              ) : (
                plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {describePlan(plan)}
                  </option>
                ))
              )}
            </select>
            {loadError && <p className="text-sm text-red-400">{loadError}</p>}
          </div>

          {selectedPlan && (
            <div className="rounded-lg border border-zinc-800 bg-[var(--surface)] p-3 text-sm">
              <p className="font-semibold text-white">{describePlan(selectedPlan)}</p>
              <p className="mt-1 text-xs text-secondary-content">
                Starts today and expires after {selectedPlan.duration_months} month{selectedPlan.duration_months === 1 ? "" : "s"}.
                {selectedPlan.plan_type === "hour_pack" && selectedPlan.hours_included
                  ? ` ${selectedPlan.hours_included} hours will be added to this customer's ${selectedPlan.device_type_name} balance.`
                  : ""}
              </p>
            </div>
          )}

          <p className="text-xs text-secondary-content">
            This staff assignment records the listed amount as paid; it does not create a Razorpay transaction.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || loadingPlans || !selectedPlan}
              className="bg-gradient-primary font-bold text-[var(--button-text)]"
            >
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Assign plan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
