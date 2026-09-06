"use client";

import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Loader2, ImageIcon } from "lucide-react";
import { StatusBadge } from "@/components/admin/devices/StatusBadge";
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

interface DeviceTableProps {
  devices: any[];
  onEdit: (device: any) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}

export function DeviceTable({ devices, onEdit, onDelete, isPending }: DeviceTableProps) {
  return (
    <div className="border border-zinc-900 rounded-xl bg-[var(--surface)] overflow-hidden shadow-2xl">
      <div className="p-4 bg-[var(--background)]/40 border-b border-zinc-900 font-black text-sm uppercase text-muted-content tracking-wider">
        Device Inventory List
      </div>
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--background)]/20 text-secondary-content font-black uppercase text-xs tracking-wider border-b border-zinc-900 select-none">
          <tr>
            <th className="py-4 px-6">Image</th>
            <th className="py-4 px-6">Station #</th>
            <th className="py-4 px-6">Type</th>
            <th className="py-4 px-6">Specs</th>
            <th className="py-4 px-6">Hourly Rate</th>
            <th className="py-4 px-6">Qty</th>
            <th className="py-4 px-6">Status</th>
            <th className="py-4 px-6 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900/60 font-medium">
          {devices.map((device) => {
            const statusClean = String(device.status || "").toLowerCase().trim();
            const isAvailable = statusClean === "available";

            return (
              <tr key={device.id} className="group hover:bg-[var(--background)]/30 transition-all duration-300">
                <td className="py-3 px-6">
                  <div className="h-10 w-14 bg-[var(--surface-hover)] border border-zinc-900 rounded overflow-hidden flex items-center justify-center">
                    {device.image_url ? (
                      <img src={device.image_url} alt="Cover" className="w-full h-full object-cover p-1" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-zinc-700" />
                    )}
                  </div>
                </td>
                <td className="py-4 px-6 font-black text-primary tracking-wide uppercase transition-all duration-300">
                  {device.station_number}
                </td>
                <td className="py-4 px-6 text-white font-bold">{device.device_type?.display_name || 'N/A'}</td>
                <td className="py-4 px-6 text-muted-content max-w-xs truncate">
                  {device.specs || <span className="text-muted-content italic">None listed</span>}
                </td>
                <td className="py-4 px-6 text-white font-bold font-mono">
                  ₹{device.device_type?.regular_hourly_rate ? Number(device.device_type.regular_hourly_rate).toLocaleString('en-IN') : "0"}/hr
                </td>

                <td className="py-4 px-6">
                  <span className="text-xs font-mono text-muted-content">{device.device_type?.included_players || 1}p inc.</span>
                </td>

                <td className="py-4 px-6">
                  <StatusBadge status={device.effective_status ?? device.status} />
                </td>
                <td className="py-4 px-6">
                  <div className="flex justify-end gap-2 opacity-0 -translate-x-4 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(device)}
                      className="h-8 w-8 text-muted-content hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isPending}
                          className="h-8 w-8 text-muted-content hover:text-[#ef4444] hover:bg-red-950/20"
                        >
                          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-red" />}
                        </Button>
                      </AlertDialogTrigger>

                      <AlertDialogContent className="bg-[var(--surface)] border border-[#27272a] text-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-xl font-bold">Remove Terminal Record?</AlertDialogTitle>
                          <AlertDialogDescription className="text-[#a1a1aa] text-base">
                            Are you sure you want to delete **Station {device.station_number}**? This action will remove the hardware machine data completely from your system inventory.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="mt-4">
                          <AlertDialogCancel className="bg-[#27272a] text-white border-zinc-700 hover:bg-zinc-800 hover:text-white">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDelete(device.id)}
                            className="bg-gradient-primary text-[var(--button-text)] font-semibold"
                          >
                            Confirm Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}