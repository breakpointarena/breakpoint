"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MonitorPlay, Pencil, Trash2, Loader2, Cpu } from "lucide-react";
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

interface DeviceGridProps {
  devices: any[];
  onEdit: (device: any) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}

export function DeviceGrid({ devices, onEdit, onDelete, isPending }: DeviceGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {devices.map((device) => {
        // `effective_status` folds in the live-session check; `status` alone
        // never reads "occupied" because no booking flow writes it.
        const statusClean = String(device.effective_status ?? device.status ?? "").toLowerCase().trim();

        return (
          <Card
            key={device.id}
            className="bg-[var(--surface)] border-[#27272a] hover:border-primary/50 hover:shadow-[0_0_20px_rgba(184,134,11,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col h-full overflow-hidden group relative animate-in zoom-in-95"
          >
            {/* 1. MEDIA CONTAINER FRAME */}
            <div className="h-48 w-full bg-[var(--background)] border-b border-[#27272a] flex items-center justify-center overflow-hidden relative">
              {device.image_url ? (
                <img
                  src={device.image_url}
                  alt="Hardware Cover"
                  className="w-full h-full object-cover p-2 transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex flex-col items-center text-zinc-800 gap-1.5">
                  <MonitorPlay className="h-6 w-6" />
                  <span className="text-xs">No Asset Staged</span>
                </div>
              )}
              <div className="absolute top-3 right-3 z-10">
                <GridStatusBadge status={statusClean} />
              </div>
            </div>

            {/* 2. CARD CONTENT DESCRIPTION PANEL */}
            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-black text-xl text-primary uppercase tracking-wide truncate max-w-[130px]" title={device.station_number}>
                      {device.station_number}
                    </h3>
                    <p className="text-sm text-[#a1a1aa] font-medium truncate max-w-[130px]">{device.device_type?.display_name || 'N/A'}</p>
                  </div>

                  {/* HOURLY PRICING NODE */}
                  <div className="text-primary font-black text-xl text-right flex-shrink-0">
                    ₹{device.device_type?.regular_hourly_rate ? Number(device.device_type.regular_hourly_rate).toLocaleString('en-IN') : "0"}
                    <span className="text-[#a1a1aa] text-xs font-normal tracking-tight">/hr</span>
                  </div>
                </div>

                {/* HARDWARE SPECIFICATIONS BLOCKS */}
                {/* The description runs in full here - the grid is the view that
                    has room for it. The table still truncates to keep rows even. */}
                <div className="flex items-start gap-1.5 text-xs text-[#a1a1aa]/80 bg-[#161616] border border-[#27272a]/40 p-2 rounded-lg mt-1">
                  <Cpu className="h-3.5 w-3.5 text-muted-content flex-shrink-0 mt-0.5" />
                  <span className="min-w-0 flex-1 whitespace-pre-line break-words leading-relaxed">
                    {device.specs || <span className="text-muted-content italic">No specs listed</span>}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="mt-auto h-0 opacity-0 group-hover:h-14 group-hover:opacity-100 transition-all duration-300 ease-out bg-[#0e0e0e]/60 border-t border-[#27272a]/30 flex items-center justify-end gap-2 px-4 overflow-hidden w-full">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(device)}
                className="h-8 w-8 text-white bg-[#27272a] hover:bg-[#3f3f46] border border-zinc-700/60 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    className="h-8 w-8 text-white bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 transition-colors"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                      className="bg-gradient-primary text-[var(--button-text)] hover:bg-gradient-primary-hover font-semibold"
                    >
                      Confirm Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function GridStatusBadge({ status }: { status: string }) {
  if (status === 'available') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-black text-white bg-black/60 border border-green-500/40 rounded-full backdrop-blur-md whitespace-nowrap">
        <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
        AVAILABLE
      </span>
    );
  }
  if (status === 'maintenance') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-black text-white bg-black/60 border border-red-500/40 rounded-full backdrop-blur-md whitespace-nowrap">
        <span className="w-1 h-1 rounded-full bg-red-500" />
        MAINTENANCE
      </span>
    );
  }
  if (status === 'inactive') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-black text-muted-content bg-black/60 border border-zinc-700 rounded-full backdrop-blur-md whitespace-nowrap">
        <span className="w-1 h-1 rounded-full bg-zinc-500" />
        OFFLINE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-black text-white bg-black/60 border border-amber-500/40 rounded-full backdrop-blur-md whitespace-nowrap">
      <span className="w-1 h-1 rounded-full bg-amber-500" />
      FULLY BOOKED
    </span>
  );
}