"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gamepad2, MapPin, CheckCircle2, XCircle, Eye, Wrench, Info, ArrowLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface AvailableDevicesModalProps {
  open: boolean;
  onClose: () => void;
  devices: any[];
}

export function AvailableDevicesModal({ open, onClose, devices }: AvailableDevicesModalProps) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const availableDevices = devices.filter(d => d.status === "available");
  const occupiedDevices = devices.filter(d => d.status === "occupied");
  const maintenanceDevices = devices.filter(d => d.status === "maintenance");

  // Group devices by type
  const deviceTypeGroups = devices.reduce((acc: any, device: any) => {
    const typeName = device.device_type;
    if (!acc[typeName]) {
      acc[typeName] = {
        name: typeName,
        hourly_rate: device.hourly_rate,
        devices: []
      };
    }
    acc[typeName].devices.push(device);
    return acc;
  }, {});

  const deviceTypes = Object.values(deviceTypeGroups) as any[];

  const handleViewAllDevices = () => {
    router.push('/admin/devices');
    onClose();
  };

  const handleBack = () => {
    setSelectedType(null);
  };

  const selectedTypeData = selectedType ? deviceTypeGroups[selectedType] : null;
  const selectedDevices = selectedTypeData?.devices || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--background)] border-primary/30 max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase text-white flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-2 min-w-0">
              {selectedType && (
                <Button
                  onClick={handleBack}
                  size="sm"
                  variant="ghost"
                  className="text-white hover:text-primary -ml-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Gamepad2 className="h-5 w-5 text-amber-500" />
              {selectedType ? selectedType : 'Device Availability'}
            </div>
            <Button
              onClick={handleViewAllDevices}
              size="sm"
              variant="ghost"
              className="text-xs text-primary hover:text-primary-hover flex-shrink-0"
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              Manage Devices
            </Button>
          </DialogTitle>
        </DialogHeader>

        {!selectedType ? (
          /* Device Types Grid */
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-400 mb-1">Available</p>
                <p className="text-2xl font-black text-white">{availableDevices.length}</p>
                <p className="text-label mt-1">Ready to use</p>
              </div>

              <div className="p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400 mb-1">In Use</p>
                <p className="text-2xl font-black text-white">{occupiedDevices.length}</p>
                <p className="text-label mt-1">Currently booked</p>
              </div>

              <div className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-400 mb-1">Total</p>
                <p className="text-2xl font-black text-white">{devices.length}</p>
                <p className="text-label mt-1">All devices</p>
              </div>
            </div>

            {/* Device Types Cards */}
            <div className="space-y-3">
              <h4 className="text-sm font-black uppercase text-muted-content">Select Device Type</h4>
              <div className="grid grid-cols-2 gap-3">
                {deviceTypes.map((typeGroup: any) => {
                  const availableCount = typeGroup.devices.filter((d: any) => d.status === "available").length;
                  const totalCount = typeGroup.devices.length;
                  const percentage = totalCount > 0 ? Math.round((availableCount / totalCount) * 100) : 0;

                  return (
                    <div
                      key={typeGroup.name}
                      onClick={() => setSelectedType(typeGroup.name)}
                      className="p-4 bg-[var(--surface)] border border-[#27272a] rounded-lg cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.02] group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-white mb-1 group-hover:text-primary transition-colors">
                            {typeGroup.name}
                          </p>
                          <p className="text-xs text-primary font-bold">
                            ₹{typeGroup.hourly_rate}/hr
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-content group-hover:text-primary transition-colors" />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-content">Available</p>
                          <p className="text-lg font-black text-white">{availableCount}/{totalCount}</p>
                        </div>
                        <span className={`text-xs font-black px-2 py-1 rounded ${
                          percentage >= 50 ? 'bg-green-500/20 text-green-400' :
                          percentage > 0 ? 'bg-amber-500/20 text-amber-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* Stations View for Selected Type */
          <div className="space-y-4">

            {/* Summary for selected type */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-400 mb-1">Available</p>
                <p className="text-xl font-black text-white">
                  {selectedDevices.filter((d: any) => d.status === "available").length}
                </p>
              </div>

              <div className="p-3 bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400 mb-1">In Use</p>
                <p className="text-xl font-black text-white">
                  {selectedDevices.filter((d: any) => d.status === "occupied").length}
                </p>
              </div>

              <div className="p-3 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-400 mb-1">Total</p>
                <p className="text-xl font-black text-white">{selectedDevices.length}</p>
              </div>
            </div>

            {/* All Stations for Selected Type */}
            <div className="space-y-3">
              <h4 className="text-sm font-black uppercase text-muted-content">All Stations</h4>
              <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
                {selectedDevices.map((device: any) => {
                  const statusConfig = {
                    available: {
                      border: 'border-green-500/30',
                      icon: CheckCircle2,
                      iconColor: 'text-green-500',
                      label: 'Available',
                      labelColor: 'text-green-500',
                      bg: 'bg-green-500/5'
                    },
                    occupied: {
                      border: 'border-red-500/30',
                      icon: XCircle,
                      iconColor: 'text-red-500',
                      label: 'In Use',
                      labelColor: 'text-red-500',
                      bg: 'bg-red-500/5'
                    },
                    maintenance: {
                      border: 'border-amber-500/30',
                      icon: Wrench,
                      iconColor: 'text-amber-500',
                      label: 'Maintenance',
                      labelColor: 'text-amber-500',
                      bg: 'bg-amber-500/5'
                    }
                  };

                  const config = statusConfig[device.status as keyof typeof statusConfig] || statusConfig.occupied;
                  const Icon = config.icon;

                  return (
                    <div
                      key={device.id}
                      className={`p-3 bg-[var(--surface)] border ${config.border} rounded-lg transition-all ${config.bg}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <MapPin className={`h-3 w-3 ${config.iconColor}`} />
                          <p className="text-xs font-bold text-white">#{device.station_number}</p>
                        </div>
                        <Icon className={`h-3 w-3 ${config.iconColor}`} />
                      </div>

                      {device.specs && (
                        <p className="text-[11px] text-muted-content truncate mb-2">{device.specs}</p>
                      )}

                      <div className="flex items-center gap-1">
                        <p className={`text-[11px] font-bold uppercase ${config.labelColor}`}>{config.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
