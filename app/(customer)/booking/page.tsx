"use client";

import { useEffect, useState } from "react";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setDeviceType, setPricing, resetBooking } from "@/lib/redux/slices/bookingSlice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Users, Sparkles } from 'lucide-react';
import { getDeviceTypesWithAvailability } from "./actions";
import Link from "next/link";

export default function GamingStationPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [loading, setLoading] = useState(true);
  const [deviceTypes, setDeviceTypes] = useState<any[]>([]);
  const [activeFilter, setActiveFilter] = useState("All Devices");

  useEffect(() => {
    // Reset booking state when starting a new booking
    dispatch(resetBooking());

    async function loadDeviceTypes() {
      const res = await getDeviceTypesWithAvailability();
      if (res.success) setDeviceTypes(res.deviceTypes);
      setLoading(false);
    }
    loadDeviceTypes();
  }, [dispatch]);

  const handleSelectAndProceed = (deviceType: any) => {
    const hourlyRate = Number(deviceType.regular_hourly_rate) || 0;

    dispatch(setDeviceType({
      id: deviceType.id,
      name: deviceType.display_name,
      hourlyRate: hourlyRate,
      includedPlayers: deviceType.included_players,
      maxPlayers: deviceType.max_players,
      extraPlayerCharge: Number(deviceType.extra_player_charge)
    }));

    dispatch(setPricing({
      subtotal: hourlyRate,
      subscriptionDiscount: 0,
      promoDiscount: 0,
      total: hourlyRate
    }));
    router.push("/booking/slots-v2");
  };

  if (loading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <BreakpointLoader size="md" text="Loading devices..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-12">
      <div className="pt-15 pb-4 px-4">
        <div className="space-y-1 relative z-0">
          <nav className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-2">
            <Link href="/" className="hover:text-primary transition-colors">
              HOME
            </Link>
            <span className="mx-1.5 text-zinc-700">›</span>
            <span className="text-primary">SELECT DEVICE</span>
          </nav>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-xl font-black uppercase text-white tracking-tight">
              CHOOSE YOUR GAMING STATION
            </h2>
            <Button
              onClick={() => router.push("/")}
              className="bg-gradient-primary text-[var(--button-text)] font-black text-xs uppercase h-9 px-4 w-full md:w-auto"
            >
              ← BACK TO HOME
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
        <div className="flex flex-wrap gap-2">
          {["All Devices", "Console", "PC", "Snooker"].map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveFilter(tag)}
              className={`px-4 py-2.5 text-xs font-black uppercase border rounded-xl transition-all whitespace-nowrap ${activeFilter === tag
                  ? "bg-gradient-primary text-[var(--button-text)] border-primary"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* DEVICE TYPES GRID CONTAINER */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {deviceTypes
          .filter(type => {
            if (activeFilter === "Console") return type.name === "ps5";
            if (activeFilter === "PC") return type.name === "gaming_pc";
            if (activeFilter === "Snooker") return type.name?.includes("snooker");
            return true;
          })
          .map((deviceType) => {
            const isAvail = deviceType.available_devices_count > 0;
            return (
              <Card key={deviceType.id} className="bg-[#111] border border-zinc-900 overflow-hidden flex flex-col justify-between rounded-xl shadow-lg group glow-box-hover">

                <div className="relative w-full aspect-video overflow-hidden bg-zinc-950 border-b border-zinc-900">
                  {deviceType.image_url ? (
                    <img
                      src={deviceType.image_url}
                      alt={deviceType.display_name}
                      className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-800">
                      <Sparkles className="h-8 w-8 opacity-20" />
                    </div>
                  )}

                  <span className={`absolute top-2 right-2 md:top-4 md:right-4 backdrop-blur-md border text-xs font-black uppercase tracking-wider px-2 py-1 rounded-md shadow-2xl z-30 ${isAvail ? "bg-black/90 border-green-500/30 text-green-400" : "bg-black/95 border-red-500/30 text-red-500"
                    }`}>
                    {isAvail ? `${deviceType.available_devices_count} AVAILABLE` : "FULLY BOOKED"}
                  </span>
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <h4 className="font-black text-sm text-white uppercase tracking-tight">
                          {deviceType.display_name}
                        </h4>
                        <p className="text-min text-secondary-content font-bold mt-0.5 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {deviceType.included_players} included • Max {deviceType.max_players}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 flex items-baseline gap-1 mt-1">
                        <span className="text-lg font-black text-primary">₹{Number(deviceType.regular_hourly_rate)}</span>
                        <span className="text-xs text-zinc-300 font-bold">/hr</span>
                      </div>
                    </div>

                    {/* No clamp: the card is normal flow inside a grid, so rows equalise
                        height and `justify-between` keeps the buttons aligned. Clamping to
                        2 lines was cutting the longer blurbs (e.g. the PS5 one). */}
                    <p className="text-description leading-relaxed font-medium bg-zinc-950/40 p-2 rounded border border-zinc-900/60 glow-box-hover">
                      {deviceType.description || "Premium gaming experience with top-tier equipment."}
                    </p>
                  </div>

                  <div className="pt-2">
                    {isAvail ? (
                      <Button
                        onClick={() => handleSelectAndProceed(deviceType)}
                        variant="gradient"
                        className="w-full text-xs font-black uppercase py-5 rounded-lg transition-all active:scale-[0.99]"
                      >
                        SELECT {deviceType.display_name.toUpperCase()}
                      </Button>
                    ) : (
                      <Button disabled className="w-full text-xs font-black uppercase py-5 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-lg cursor-not-allowed">
                        FULLY BOOKED
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
