"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removeCustomerHourPackAction } from "@/app/(admin)/admin/customers/actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface RemoveCustomerHourPackButtonProps {
  customerId: string;
  customerName: string;
  subscriptionId: string;
  packName: string;
  onRemoved: () => Promise<void>;
}

export function RemoveCustomerHourPackButton({
  customerId,
  customerName,
  subscriptionId,
  packName,
  onRemoved,
}: RemoveCustomerHourPackButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRemove = () => {
    startTransition(async () => {
      try {
        const result = await removeCustomerHourPackAction({ customerId, subscriptionId });
        if (!result.success) {
          toast.error("Could not remove hour pack", { description: result.error });
          return;
        }

        setOpen(false);
        toast.success("Hour pack removed", {
          description: `${packName} is no longer available to ${customerName}.`,
        });
        await onRemoved();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not remove this hour pack.";
        toast.error("Could not remove hour pack", { description: message });
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !isPending && setOpen(nextOpen)}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove ${packName} from ${customerName}`}
          title="Remove hour pack"
          className="h-6 w-6 p-0 text-zinc-500 hover:bg-red-950/40 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-[#27272a] bg-[var(--background)] text-white">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this hour pack?</AlertDialogTitle>
          <AlertDialogDescription className="text-secondary-content">
            {packName} will be cancelled for {customerName} and its remaining minutes will be cleared.
            The subscription and any usage history will remain in the records.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800">
            Keep pack
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              handleRemove();
            }}
            disabled={isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Remove pack
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
