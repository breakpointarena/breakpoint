"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setSlot, setPricing, setSlotLockExpiry, setBookingId, setPlayerCount } from "@/lib/redux/slices/bookingSlice";
import { checkAvailabilityByDeviceType, initializeSoftLockReservation as createSoftLockTransaction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateSelector } from "@/components/booking/DateSelector";
import { Clock, ChevronRight, X, Users, Plus, Minus } from 'lucide-react';
import { toast } from "sonner";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import {
  formatLocalDate,
  isDateWithinBookingWindow,
  BOOKING_WINDOW_ERROR
} from "@/lib/utils/dates";

const staticDaylightSchedulesMatrix = [
  { id: "s1", label: "10:00 AM - 11:00 AM", start: "10:00 AM", end: "11:00 AM", tier: "Morning Slots" },
  { id: "s2", label: "11:00 AM - 12:00 PM", start: "11:00 AM", end: "12:00 PM", tier: "Morning Slots" },
  { id: "s3", label: "01:30 PM - 02:30 PM", start: "01:30 PM", end: "02:30 PM", tier: "Afternoon Slots" },
  { id: "s4", label: "02:30 PM - 03:30 PM", start: "02:30 PM", end: "03:30 PM", tier: "Afternoon Slots", peak: true },
  { id: "s5", label: "04:30 PM - 05:30 PM", start: "04:30 PM", end: "05:30 PM", tier: "Afternoon Slots" },
  { id: "s6", label: "07:00 PM - 08:00 PM", start: "07:00 PM", end: "08:00 PM", tier: "Evening R Night" },
  { id: "s7", label: "08:30 PM - 09:30 PM", start: "08:30 PM", end: "09:30 PM", tier: "Evening R Night" }
];

export default function SlotBookingPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { deviceTypeId, deviceTypeName, hourlyRate, addons, playerCount, includedPlayers, maxPlayers, extraPlayerCharge } = useAppSelector((state) => state.booking);

  const [calendarDay, setCalendarDay] = useState<Date | undefined>(undefined);
  const [selectedSlotNode, setSelectedSlotNode] = useState<typeof staticDaylightSchedulesMatrix[0] | null>(null);
  const [disabledLabelsArray, setDisabledLabelsArray] = useState<string[]>([]);
  const [slotAvailability, setSlotAvailability] = useState<Record<string, { available: number; total: number }>>({});
  const [queryingDb, setQueryingDb] = useState(false);
  const [submittingLock, setSubmittingLock] = useState(false);
  
  const [mobileTimeDrawerOpen, setMobileTimeDrawerOpen] = useState(false);
  const [mobileSummaryDrawerOpen, setMobileSummaryDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCalendarDay(new Date());
  }, []);

  // Disable body scroll when mobile drawers are open
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mainEl = document.querySelector('main');
    const htmlEl = document.documentElement;
    if (mobileTimeDrawerOpen || mobileSummaryDrawerOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100dvh';
      htmlEl.style.overflow = 'hidden';
      htmlEl.style.height = '100dvh';
      if (mainEl) mainEl.style.zIndex = '9999';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
      htmlEl.style.overflow = '';
      htmlEl.style.height = '';
      if (mainEl) mainEl.style.zIndex = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      htmlEl.style.overflow = '';
      htmlEl.style.height = '';
      if (mainEl) mainEl.style.zIndex = '';
    };
  }, [mobileTimeDrawerOpen, mobileSummaryDrawerOpen]);

  useEffect(() => {
    if (!mounted || !calendarDay || !deviceTypeId) return;
    // Never query slots for a date outside the booking window
    if (!isDateWithinBookingWindow(calendarDay)) {
      setDisabledLabelsArray([]);
      setSlotAvailability({});
      return;
    }
    async function checkAvailability() {
      setQueryingDb(true);
      const res = await checkAvailabilityByDeviceType(formatLocalDate(calendarDay!), deviceTypeId!);
      if (res.success) {
        setDisabledLabelsArray(res.unavailableSlots);
        setSlotAvailability(res.slotAvailability || {});
      }
      setQueryingDb(false);
    }
    checkAvailability();
  }, [calendarDay, mounted, deviceTypeId]);

  const additivesCostAggregated = useMemo(() => {
    return addons.reduce((sum, asset) => sum + (asset.price * asset.quantity), 0);
  }, [addons]);

  const extraPlayersCount = Math.max(0, playerCount - includedPlayers);
  const extraPlayersCharge = extraPlayersCount * extraPlayerCharge;
  const baselineSubtotal = hourlyRate || 0;
  const deviceAndPlayersSubtotal = baselineSubtotal + extraPlayersCharge;
  const aggregatedPayableTotal = deviceAndPlayersSubtotal + additivesCostAggregated;

  const handleRegisterTransactionLock = async () => {
    if (!calendarDay || !selectedSlotNode || !deviceTypeId) return;
    if (!isDateWithinBookingWindow(calendarDay)) {
      toast.error(BOOKING_WINDOW_ERROR);
      return;
    }
    setSubmittingLock(true);
    const dateQueryString = formatLocalDate(calendarDay);

    const res = await createSoftLockTransaction({
      deviceId: deviceTypeId!, deviceName: deviceTypeName || "Device Type", deviceType: "gaming", hourlyRate: baselineSubtotal,
      date: dateQueryString, slotLabel: selectedSlotNode.label, start: selectedSlotNode.start, end: selectedSlotNode.end,
      addons, subtotal: deviceAndPlayersSubtotal, total: aggregatedPayableTotal
    });

    if (res.success && res.bookingId && res.expiresAt) {
      dispatch(setSlot({ date: dateQueryString, slot: selectedSlotNode.label, startTime: selectedSlotNode.start, endTime: selectedSlotNode.end }));
      dispatch(setBookingId(res.bookingId));
      dispatch(setSlotLockExpiry(res.expiresAt));
      dispatch(setPricing({ subtotal: deviceAndPlayersSubtotal, subscriptionDiscount: 0, promoDiscount: 0, total: aggregatedPayableTotal }));
      router.push("/booking/auth");
    } else {
      toast.error(res.error);
    }
    setSubmittingLock(false);
  };

  if (!mounted) return null;

  return (
    <div className="max-w-md md:max-w-7xl mx-auto py-2 px-1 pb-28 md:pb-12">
      
      {/* 2. PROGRESS timeline tracks */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between pb-6 px-2 select-none">
        <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">1</div><span className="text-xs font-black uppercase text-primary tracking-wider">Date</span></div>
        <div className="h-0.5 bg-zinc-800 flex-1 mx-2" />
        <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">2</div><span className="text-xs font-black uppercase text-primary tracking-wider">Time</span></div>
        <div className="h-0.5 bg-zinc-800 flex-1 mx-2" />
        <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 rounded-full bg-zinc-900 text-zinc-400 font-bold text-[11px] flex items-center justify-center border border-zinc-800">3</div><span className="text-xs font-black uppercase text-zinc-400 tracking-wider">Summary</span></div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-4 md:space-y-6">
          <div className="bg-[#111] border border-zinc-900 rounded-xl p-4 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-zinc-950 border border-zinc-800 text-primary rounded-lg"><Clock className="h-4 w-4"/></div>
              <div className="min-w-0"><h4 className="font-black text-xs sm:text-sm text-white uppercase truncate">{deviceTypeName || "PLAYSTATION 5 - STATION #2"}</h4><p className="text-zinc-400 text-xs font-bold mt-0.5">₹ {hourlyRate || 300}/hour</p></div>
            </div>
            <Button onClick={() => router.push("/booking")} variant="outline" className="border-zinc-800 text-xs uppercase h-8 px-3 text-zinc-400">Change</Button>
          </div>

          {/* MOBILE FLOW CLICK*/}
          <div className="space-y-3 md:hidden">
            {/* Date Selection - today + next 6 days, all on one row */}
            <div className="space-y-2">
              <span className="text-[11px] font-black text-zinc-400 uppercase block pl-1">Select Date</span>
              <DateSelector selected={calendarDay} onSelect={setCalendarDay} />
            </div>

            <div onClick={() => setMobileTimeDrawerOpen(true)} className="bg-[#111] border border-zinc-900 p-4 rounded-xl flex justify-between items-center cursor-pointer">
              <div className="space-y-0.5"><span className="text-[11px] font-black text-zinc-400 uppercase block">Select Time Slot</span><span className="text-xs font-black text-primary">{selectedSlotNode ? selectedSlotNode.label : "Choose Operational Slot"}</span></div>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
            </div>

            <div onClick={() => setMobileSummaryDrawerOpen(true)} className="bg-[#111] border border-zinc-900 p-4 rounded-xl flex justify-between items-center cursor-pointer">
              <div className="space-y-0.5"><span className="text-[11px] font-black text-zinc-400 uppercase block">Booking Summary</span><span className="text-xs font-medium text-zinc-400">Check details before pay</span></div>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
            </div>

            <Button variant="gradient" disabled={!selectedSlotNode} onClick={handleRegisterTransactionLock} className="w-full text-black font-black uppercase text-xs py-5 rounded-xl flex items-center justify-center gap-1 mt-4">Continue <ChevronRight className="h-4 w-4 stroke-[3]" /></Button>
          </div>

          {/* WIDESCREEN DESKTOP CONSTANT INLINE CONTAINERS MAPS */}
          <div className="hidden md:block space-y-6">
            {/* Date Selection - today + next 6 days */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest pl-1">📅 Select Date</h3>
              <DateSelector selected={calendarDay} onSelect={setCalendarDay} />
            </div>
            <div className="space-y-4">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest pl-1">🕒 Select Time Slot</h3>
              {queryingDb ? <div className="h-32 flex items-center justify-center"><BreakpointLoader size="sm" /></div> : (
                ["Morning Slots", "Afternoon Slots", "Evening R Night"].map((g) => (
                  <div key={g} className="space-y-1.5">
                    <p className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1"><span className="w-1 h-1 bg-zinc-800 rounded-full"/> {g}</p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {staticDaylightSchedulesMatrix.filter(s => s.tier === g).map((slot) => {
                        const isBooked = disabledLabelsArray.includes(slot.label);
                        const isSelected = selectedSlotNode?.id === slot.id;
                        const availability = slotAvailability[slot.label];
                        return (
                          <button key={slot.id} disabled={isBooked} onClick={() => setSelectedSlotNode(slot)} className={`p-3.5 border text-left flex justify-between items-center rounded-xl transition-all ${isBooked ? "bg-zinc-950/20 border-zinc-950 text-zinc-800 line-through cursor-not-allowed" : isSelected ? "bg-primary border-transparent text-black font-black" : "bg-[#111] border-zinc-900 text-zinc-300 hover:border-zinc-800"}`}>
                            <span className="text-xs font-bold tracking-tight">{slot.label}</span>
                            <div className="flex items-center gap-2">
                              {availability && !isBooked && (
                                <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-sm ${isSelected ? "bg-black/10 text-black" : "bg-green-500/10 text-green-400"}`}>
                                  {availability.available} LEFT
                                </span>
                              )}
                              {slot.peak && !isBooked && <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-sm ${isSelected ? "bg-black/10 text-black" : "bg-orange-600/10 text-amber-400"}`}>PEAK</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* DESKTOP SIDEBAR PANEL SUMMARY */}
        <div className="hidden lg:block w-[360px] flex-shrink-0">
          <Card className="bg-[#111] border border-zinc-900 p-6 text-white space-y-6 shadow-2xl rounded-2xl sticky top-24">
            <h3 className="text-sm font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-900 pb-3">Booking Summary</h3>
            <div className="space-y-4 text-xs text-zinc-400 border-b border-zinc-900 pb-3">
              <div className="flex justify-between"><span>Selected Date:</span><strong className="text-white font-bold">{calendarDay ? calendarDay.toDateString() : "Pending"}</strong></div>
              <div className="flex justify-between"><span>Time Slot Frame:</span><strong className="text-primary font-black">{selectedSlotNode ? selectedSlotNode.label : "Pending"}</strong></div>
              <div className="flex justify-between"><span>Station Layout:</span><strong className="text-white uppercase truncate max-w-[160px]">{deviceTypeName || "PLAYSTATION 5 - STATION #2"}</strong></div>
            </div>

            {/* Player Selection */}
            <div className="border-b border-zinc-900 pb-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-3">Number of Players</h4>
              <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <div className="flex-1">
                  <p className="text-xs text-zinc-400">
                    {includedPlayers} included • Max {maxPlayers}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => playerCount > 1 && dispatch(setPlayerCount(playerCount - 1))}
                    disabled={playerCount <= 1}
                    className="w-7 h-7 rounded-md bg-zinc-900 border border-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-800 transition-all flex items-center justify-center"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-xl font-black text-white w-8 text-center">{playerCount}</span>
                  <button
                    onClick={() => {
                      if (playerCount >= maxPlayers) {
                        toast.error(`Maximum ${maxPlayers} players only`, {
                          description: `This device supports up to ${maxPlayers} players maximum.`
                        });
                      } else {
                        dispatch(setPlayerCount(playerCount + 1));
                      }
                    }}
                    disabled={playerCount >= maxPlayers}
                    className="w-7 h-7 rounded-md bg-primary border border-transparent text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary-hover transition-all flex items-center justify-center font-bold"
                  >
                    <Plus className="h-3 w-3 stroke-[3]" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-zinc-400">
              <div className="flex justify-between"><span>Base Rate</span><span className="text-white font-bold">₹ {baselineSubtotal}.00</span></div>
              {extraPlayersCount > 0 && (
                <div className="flex justify-between"><span>Extra Players ({extraPlayersCount})</span><span className="text-primary font-bold">₹ {extraPlayersCharge}.00</span></div>
              )}
              <div className="flex justify-between items-baseline pt-3 border-t border-zinc-900 text-white font-black"><span className="text-xs uppercase">Total Payable</span><span className="text-2xl text-primary">₹ {aggregatedPayableTotal}.00</span></div>
            </div>
            <Button variant="gradient" disabled={submittingLock || !selectedSlotNode} onClick={handleRegisterTransactionLock} className="w-full text-black font-black uppercase py-5 text-xs rounded-xl flex items-center justify-center gap-1">Continue <ChevronRight className="h-4 w-4 stroke-[3]" /></Button>
          </Card>
        </div>
      </div>

      {mobileTimeDrawerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:hidden animate-in fade-in duration-150">
          <div className="bg-[#121212] border-t border-zinc-800 rounded-t-2xl w-full p-5 space-y-4 max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-250">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-2"><span className="text-xs font-black uppercase text-zinc-400">Select Time Slot</span><button onClick={() => setMobileTimeDrawerOpen(false)} className="p-1.5 rounded-full bg-zinc-950 text-zinc-400"><X className="h-4 w-4"/></button></div>
            <div className="space-y-4 pt-2">
              {["Morning Slots", "Afternoon Slots", "Evening R Night"].map((tg) => (
                <div key={tg} className="space-y-1.5">
                  <p className="text-xs font-black uppercase text-zinc-400 pl-1">⚡ {tg}</p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {staticDaylightSchedulesMatrix.filter(s => s.tier === tg).map((slot) => {
                      const isBooked = disabledLabelsArray.includes(slot.label);
                      return (
                        <button key={slot.id} disabled={isBooked} onClick={() => { setSelectedSlotNode(slot); setMobileTimeDrawerOpen(false); }} className={`p-3.5 border text-left flex justify-between items-center rounded-xl ${isBooked ? "bg-zinc-950/20 border-zinc-950 text-zinc-800 line-through" : selectedSlotNode?.id === slot.id ? "bg-primary text-black font-black" : "bg-[#111] text-zinc-300"}`}><span className="text-xs font-bold">{slot.label}</span></button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mobileSummaryDrawerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:hidden animate-in fade-in duration-150">
          <div className="bg-[#121212] border-t border-zinc-800 rounded-t-2xl w-full p-5 space-y-4 animate-in slide-in-from-bottom duration-250">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-2"><span className="text-xs font-black uppercase text-zinc-400">Summary Breakdown</span><button onClick={() => setMobileSummaryDrawerOpen(false)} className="p-1.5 rounded-full bg-zinc-950 text-zinc-400"><X className="h-4 w-4"/></button></div>

            {/* Player Selection */}
            <div className="border-b border-zinc-900 pb-3">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Number of Players</h4>
              <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <div className="flex-1">
                  <p className="text-xs text-zinc-400">
                    {includedPlayers} included • Max {maxPlayers}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => playerCount > 1 && dispatch(setPlayerCount(playerCount - 1))}
                    disabled={playerCount <= 1}
                    className="w-8 h-8 rounded-md bg-zinc-900 border border-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-800 transition-all flex items-center justify-center"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-xl font-black text-white w-8 text-center">{playerCount}</span>
                  <button
                    onClick={() => {
                      if (playerCount >= maxPlayers) {
                        toast.error(`Maximum ${maxPlayers} players only`, {
                          description: `This device supports up to ${maxPlayers} players maximum.`
                        });
                      } else {
                        dispatch(setPlayerCount(playerCount + 1));
                      }
                    }}
                    disabled={playerCount >= maxPlayers}
                    className="w-8 h-8 rounded-md bg-primary border border-transparent text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary-hover transition-all flex items-center justify-center font-bold"
                  >
                    <Plus className="h-3 w-3 stroke-[3]" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-1 text-xs text-zinc-400">
              <div className="flex justify-between"><span>Base Rate</span><span className="text-white font-bold">₹ {baselineSubtotal}.00</span></div>
              {extraPlayersCount > 0 && (
                <div className="flex justify-between"><span>Extra Players ({extraPlayersCount})</span><span className="text-primary font-bold">₹ {extraPlayersCharge}.00</span></div>
              )}
              <div className="flex justify-between font-black text-white border-t border-zinc-900 pt-2"><span>Total Payable</span><span className="text-primary">₹ {aggregatedPayableTotal}</span></div>
              <Button variant="gradient" onClick={() => { setMobileSummaryDrawerOpen(false); handleRegisterTransactionLock(); }} className="w-full text-black font-black uppercase py-4 rounded-xl text-xs mt-2">Confirm & Hold Slot</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}