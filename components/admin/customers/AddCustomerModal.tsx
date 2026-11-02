"use client";

import { useState, useTransition } from "react";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createCustomerAction } from "@/app/(admin)/admin/customers/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddCustomerModalProps {
  onCreated: () => Promise<void>;
}

export function AddCustomerModal({ onCreated }: AddCustomerModalProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await createCustomerAction({
        name: String(formData.get("name") || ""),
        phone: String(formData.get("phone") || ""),
        email: String(formData.get("email") || ""),
        date_of_birth: String(formData.get("date_of_birth") || ""),
      });

      if (!result.success) {
        toast.error("Could not add customer", { description: result.error });
        return;
      }

      form.reset();
      setOpen(false);
      toast.success("Customer added");
      await onCreated();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && setOpen(nextOpen)}>
      <DialogTrigger asChild>
        <Button type="button" className="bg-gradient-primary font-bold text-[var(--button-text)]">
          <UserPlus className="mr-2 h-4 w-4" />
          Add Customer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg border-[#27272a] bg-[var(--background)] text-white">
        <div className="space-y-1 pr-6">
          <DialogTitle className="text-lg font-black uppercase">Add Customer</DialogTitle>
          <p className="text-sm text-secondary-content">Create a customer profile for bookings and subscriptions.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customer-name">Name</Label>
            <Input
              id="customer-name"
              name="name"
              maxLength={100}
              autoComplete="name"
              required
              className="border-[#3f3f46] bg-[var(--surface)] text-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-phone">Mobile number</Label>
            <Input
              id="customer-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              maxLength={15}
              autoComplete="tel"
              required
              className="border-[#3f3f46] bg-[var(--surface)] text-white"
            />
            <p className="text-xs text-secondary-content">Enter a 10-digit number, with or without the +91 country code.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-email">Email (optional)</Label>
            <Input
              id="customer-email"
              name="email"
              type="email"
              maxLength={100}
              autoComplete="email"
              className="border-[#3f3f46] bg-[var(--surface)] text-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-date-of-birth">Date of birth (optional)</Label>
            <Input
              id="customer-date-of-birth"
              name="date_of_birth"
              type="date"
              className="border-[#3f3f46] bg-[var(--surface)] text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-gradient-primary font-bold text-[var(--button-text)]">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Add Customer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
