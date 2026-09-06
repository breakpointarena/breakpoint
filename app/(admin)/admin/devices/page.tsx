"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Monitor,
  CheckCircle,
  PlayCircle,
  Wrench,
  CheckCircle2,
  AlertCircle,
  MonitorPlay
} from "lucide-react";
import { deleteDevice, getDevices, getDeviceTypes } from "./actions";
import { DeviceFilters } from "@/components/admin/devices/DeviceFilters";
import { AddDeviceModal } from "@/components/admin/devices/AddDeviceModal";
import { EditDeviceModal } from "@/components/admin/devices/EditDeviceModal";
import { DeviceTable } from "@/components/admin/devices/DeviceTable";
import { DeviceGrid } from "@/components/admin/devices/DeviceGrid";
import { StatusBadge } from "@/components/admin/devices/StatusBadge";
import { toast } from "sonner";

export default function DevicesPage() {
  const [isPending, startTransition] = useTransition();
  const [devicesArray, setDevicesArray] = useState<any[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // --- CONTROLLER UI STATES ---
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [searchQuery, setSearchQuery] = useState("");
  const [typeTab, setTypeTab] = useState("All Devices");
  const [statusFilter, setStatusFilter] = useState("All");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any | null>(null);

  // --- CLIENT-SIDE DATA FETCH ---
  const fetchFreshDevices = async () => {
    setIsLoadingData(true);
    try {
      const data = await getDevices();
      setDevicesArray(data || []);
    } catch (err) {
      console.error("Failed loading inventory:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  /**
   * Both reads at once.
   *
   * The device types were awaited before the devices were even asked for, which
   * read as a dependency and never was one - the inventory query does not use
   * the type list, it is only wanted for the filter tabs beside it. So opening
   * this page paid two round trips end to end, and on a database any distance
   * away that is the whole of the wait.
   */
  useEffect(() => {
    async function loadData() {
      const [types] = await Promise.all([getDeviceTypes(), fetchFreshDevices()]);
      setDeviceTypes(types);
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- DATA FILTER MATRIX ---
  const filteredDevices = useMemo(() => {
    return devicesArray.filter((device) => {
      if (!device) return false;

      const stationNumber = String(device.station_number || "").toLowerCase().trim();
      const deviceTypeName = String(device.device_type?.display_name || "").toLowerCase().trim();
      // Filtering matches the counters above, so picking "Occupied" returns the
      // stations the Busy tile is counting rather than an empty list.
      const deviceStatus = String(device.effective_status ?? device.status ?? "")
        .toLowerCase()
        .trim();
      const search = searchQuery.toLowerCase().trim();

      const matchesSearch =
        search === "" ||
        stationNumber.includes(search) ||
        deviceTypeName.includes(search);

      const matchesType =
        typeTab === "All Devices" ||
        device.device_type_id === typeTab;

      const matchesStatus =
        statusFilter === "All" ||
        deviceStatus === statusFilter.toLowerCase().trim();

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [devicesArray, searchQuery, typeTab, statusFilter]);

  const devicesForCounting = useMemo(() => {
    return typeTab === "All Devices"
      ? devicesArray
      : devicesArray.filter(d => d.device_type_id === typeTab);
  }, [devicesArray, typeTab]);

  const totalDevices = devicesForCounting.length;

  /**
   * Counted on `effective_status`, not the stored `status`. Nothing in the
   * booking flow ever writes `occupied` to the column, so "Busy" read zero all
   * day however full the arena was.
   */
  const countByStatus = (status: string) =>
    devicesForCounting.filter(
      d => String(d?.effective_status ?? d?.status).toLowerCase() === status
    ).length;

  const availableDevices = countByStatus('available');
  const occupiedDevices = countByStatus('occupied');
  const maintenanceDevices = countByStatus('maintenance');
  const inactiveDevices = countByStatus('inactive');

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteDevice(id);
      if (res.success) {
        toast.success("Terminal Record Deleted", {
          description: "The hardware machine has been removed from inventory.",
          icon: <CheckCircle2 className="h-5 w-5 text-primary" />
        });
        await fetchFreshDevices();
      } else {
        toast.error("Deletion Failed", {
          description: res.error,
          icon: <AlertCircle className="h-5 w-5 text-[#f43f5e]" />
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 p-8 bg-[var(--background)] min-h-screen text-white animate-in fade-in duration-700">

      {/* HEADER PANELS */}
      <div className="flex items-center justify-between mb-2">
        <div className="space-y-1 animate-in slide-in-from-left-4 duration-500">
          <h1 className="text-2xl font-bold tracking-tight text-white">DEVICES MANAGEMENT</h1>
          <p className="text-[#a1a1aa] text-base">
            Manage all gaming platforms, stations and availability across the arena.
          </p>
        </div>

        <AddDeviceModal onFormSuccess={fetchFreshDevices} open={isAddOpen} setOpen={setIsAddOpen} />
      </div>

      {/* METRIC DISPLAY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 animate-in slide-in-from-bottom-8 duration-700 delay-100 fill-mode-both">
        {[
          { title: "Total", count: totalDevices, label: "Total Asset Range", icon: Monitor },
          { title: "Online", count: availableDevices, label: "Available Now", icon: CheckCircle, color: "text-primary" },
          { title: "Busy", count: occupiedDevices, label: "Currently Occupied", icon: PlayCircle },
          { title: "Alert", count: maintenanceDevices, label: "Under Maintenance", icon: Wrench },
          { title: "Offline", count: inactiveDevices, label: "Deactivated Stations", icon: MonitorPlay, color: "text-secondary-content" }
        ].map((stat) => (
          <Card key={stat.title} className="bg-[var(--surface)] border-[#27272a] hover:border-primary/70 hover:-translate-y-1 transition-all duration-500 group">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <stat.icon className="h-5 w-5 text-primary group-hover:scale-110 transition-transform duration-500" />
              {/* was .text-stat-label (12px); inlined one step larger so the shared
                  class stays as-is for the other admin pages that use it */}
              <span className="text-sm font-bold uppercase tracking-wider text-zinc-300">{stat.title}</span>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl lg:text-3xl font-bold mb-1 ${stat.color || 'text-white'}`}>{stat.count}</div>
              <p className="text-sm font-semibold text-secondary-content truncate">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FILTER TOOLBAR */}
      <DeviceFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        typeTab={typeTab}
        setTypeTab={setTypeTab}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        viewMode={viewMode}
        setViewMode={setViewMode}
        deviceTypes={deviceTypes}
      />

      {/* VIEW SELECTION ROUTER LAYER */}
      <div className="mt-2 animate-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
        {isLoadingData ? (
          <div className="text-center py-12 bg-[var(--surface)] border border-[#27272a] rounded-xl text-[#a1a1aa] flex justify-center items-center gap-2">
            <BreakpointLoader size="sm" /> Fetching device records...
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="text-center py-12 bg-[var(--surface)] border border-[#27272a] rounded-xl text-[#a1a1aa]">
            No terminal records match your active search constraints.
          </div>
        ) : viewMode === 'table' ? (
          <DeviceTable
            devices={filteredDevices}
            onEdit={setEditingDevice}
            onDelete={handleDelete}
            isPending={isPending}
          />
        ) : (
          <DeviceGrid
            devices={filteredDevices}
            onEdit={setEditingDevice}
            onDelete={handleDelete}
            isPending={isPending}
          />
        )}
      </div>

      {/* COMPACT INTERACTIVE EDIT OVERLAY */}
      {editingDevice && (
        <EditDeviceModal
          device={editingDevice}
          onFormSuccess={() => { setEditingDevice(null); fetchFreshDevices(); }}
          onClose={() => setEditingDevice(null)}
        />
      )}
    </div>
  );
}
