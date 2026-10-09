"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getDeviceTypesWithAvailability } from "@/app/(customer)/booking/actions";
import { getMenuItems } from "@/app/(customer)/booking/[bookingId]/food/actions";
import WalkInDeviceForm from "./WalkInDeviceForm";
import WalkInFoodForm from "./WalkInFoodForm";

type Kind = "session" | "advance" | "food";

export default function NewWalkInModal({ open, initialKind = "session", onOpenChange, onSuccess }: {
  open: boolean;
  initialKind?: Kind;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [deviceTypes, setDeviceTypes] = useState<any[] | undefined>();
  const [menuItems, setMenuItems] = useState<any[] | undefined>();
  const [prefetched, setPrefetched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setPrefetched(false);
    let active = true;
    Promise.all([getDeviceTypesWithAvailability(), getMenuItems()]).then(([devices, menu]) => {
      if (!active) return;
      setDeviceTypes(devices.success ? devices.deviceTypes || [] : []);
      setMenuItems(menu.success ? menu.items || [] : []);
      setPrefetched(true);
    }).catch(() => {
      if (!active) return;
      setDeviceTypes([]);
      setMenuItems([]);
      setPrefetched(true);
    });
    return () => { active = false; };
  }, [open, initialKind]);

  const finish = () => {
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-zinc-800 bg-[var(--background)] p-4 text-white sm:p-6">
        <DialogTitle className="pr-8 text-lg font-black uppercase">New Walk-In Booking</DialogTitle>
        <div className="grid grid-cols-3 gap-2 pr-8">
          {([
            ["session", "Walk-in now"],
            ["advance", "Advance booking"],
            ["food", "Food only"],
          ] as const).map(([value, label]) => (
            <Button key={value} type="button" variant={kind === value ? "default" : "outline"}
              className="text-xs font-bold" onClick={() => setKind(value)}>{label}</Button>
          ))}
        </div>
        {prefetched && (kind === "food" ? (
          <WalkInFoodForm key="food" initialMenuItems={menuItems} onSuccess={finish} onCancel={() => onOpenChange(false)} />
        ) : (
          <WalkInDeviceForm key={kind} initialMode={kind} initialDeviceTypes={deviceTypes} onSuccess={finish} onCancel={() => onOpenChange(false)} />
        ))}
      </DialogContent>
    </Dialog>
  );
}
