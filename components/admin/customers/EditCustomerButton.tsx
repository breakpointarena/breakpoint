"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { updateCustomerAction } from "@/app/(admin)/admin/customers/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditableCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
}

interface EditCustomerButtonProps {
  customer: EditableCustomer;
  onUpdated: () => Promise<void>;
}

export function EditCustomerButton({ customer, onUpdated }: EditCustomerButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone);
  const [email, setEmail] = useState(customer.email || "");
  const [dateOfBirth, setDateOfBirth] = useState(customer.date_of_birth?.slice(0, 10) || "");

  const handleOpenChange = (nextOpen: boolean) => {
    if (isPending) return;
    if (nextOpen) {
      setName(customer.name);
      setPhone(customer.phone);
      setEmail(customer.email || "");
      setDateOfBirth(customer.date_of_birth?.slice(0, 10) || "");
    }
    setOpen(nextOpen);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateCustomerAction({
        id: customer.id,
        name,
        phone,
        email,
        date_of_birth: dateOfBirth,
      });

      if (!result.success) {
        toast.error("Could not update customer", { description: result.error });
        return;
      }

      toast.success("Customer details updated");
      setOpen(false);
      await onUpdated();
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Edit details for ${customer.name}`}
          title={`Edit details for ${customer.name}`}
          className="h-9 w-9 rounded-lg text-zinc-400 hover:text-primary"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg border-[#27272a] bg-[var(--background)] text-white">
        <div className="space-y-1 pr-6">
          <DialogTitle className="text-lg font-black uppercase">Edit Customer</DialogTitle>
          <p className="text-sm text-secondary-content">Update this customer&apos;s profile details.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`edit-customer-name-${customer.id}`}>Name</Label>
            <Input
              id={`edit-customer-name-${customer.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              autoComplete="name"
              required
              className="border-[#3f3f46] bg-[var(--surface)] text-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-customer-phone-${customer.id}`}>Mobile number</Label>
            <Input
              id={`edit-customer-phone-${customer.id}`}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
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
            <Label htmlFor={`edit-customer-email-${customer.id}`}>Email (optional)</Label>
            <Input
              id={`edit-customer-email-${customer.id}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              maxLength={100}
              autoComplete="email"
              className="border-[#3f3f46] bg-[var(--surface)] text-white"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-customer-dob-${customer.id}`}>Date of birth (optional)</Label>
            <Input
              id={`edit-customer-dob-${customer.id}`}
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              type="date"
              className="border-[#3f3f46] bg-[var(--surface)] text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-gradient-primary font-bold text-[var(--button-text)]">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
