"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setSlot, setPricing, setSlotHold, setPlayerCount, setDuration, setHappyHour } from "@/lib/redux/slices/bookingSlice";
import { getSlotOccupancy, initializeSoftLockReservation as createSoftLockTransaction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateSelector } from "@/components/booking/DateSelector";
import { Clock, ChevronRight, X, Plus, Minus, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { toast } from "sonner";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import {
  formatLocalDate,
  isDateWithinBookingWindow,
  BOOKING_WINDOW_ERROR
} from "@/lib/utils/dates";
import {
  formatMinutesTo12Hour,
  generateStartTimes,
  filterPastTimeSlots,
  generateDurationOptions,
  calculateEndTime,
  getMaxDurationForStartTime,
  calculatePrice,
  isWithinBusinessHours,
  isTimeSlotWithinRange,
  crossesMidnight,
  bookingEndDate
} from "@/lib/utils/timeSlots";
import { availableStartMinutes, type DeviceTypeOccupancy } from "@/lib/bookings/slotAvailability";
import { useHappyHours } from "@/lib/hooks/useHappyHours";
import { formatCurrency } from "@/lib/currency";
import { extraPlayersCharge, perExtraPlayerCharge } from "@/lib/payments/money";

export default function FlexibleSlotBookingPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { deviceTypeId, deviceTypeName, hourlyRate, addons, playerCount, includedPlayers, maxPlayers, extraPlayerCharge, hydrated, bookingId, holdToken } = useAppSelector((state) => state.booking);

  const [calendarDay, setCalendarDay] = useState<Date | undefined>(undefined);
  const confirmButtonRef = useRef<HTMLDivElement>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(60); // Default 1 hour in minutes
  /**
   * What is already booked on the chosen date - not what is free at the chosen
   * duration. Occupancy does not depend on how long the customer wants to stay,
   * so one fetch per date answers every duration they try; see
   * `availableStartTimes` below. `null` means "not fetched yet", which is also
   * the state the prerendered HTML is in.
   */
  const [occupancy, setOccupancy] = useState<DeviceTypeOccupancy | null>(null);
  const [queryingDb, setQueryingDb] = useState(false);
  const [submittingLock, setSubmittingLock] = useState(false);

  const [mobileStartTimeOpen, setMobileStartTimeOpen] = useState(false);
  const [mobileDurationOpen, setMobileDurationOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Happy Hours integration
  const { checkHappyHour, calculateDiscount, rules: happyHourRules } = useHappyHours();

  const allStartTimes = useMemo(() => generateStartTimes(), []);
  const allDurations = useMemo(() => generateDurationOptions(), []);

  // Filter out past time slots for today
  const availableStartTimesForDate = useMemo(() => {
    if (!calendarDay) return allStartTimes;
    return filterPastTimeSlots(allStartTimes, calendarDay);
  }, [allStartTimes, calendarDay]);

  /**
   * Which of those start times can actually take a booking of the chosen
   * length. Computed here rather than asked for, which is the whole point of
   * fetching occupancy instead of an answer: changing the duration used to cost
   * a round trip to the server and a blanked grid, and now costs one pass over
   * at most a handful of booked ranges.
   */
  const availableStartTimes = useMemo(() => {
    if (!occupancy) return new Set<string>();
    return new Set(availableStartMinutes(occupancy, selectedDuration).map(formatMinutesTo12Hour));
  }, [occupancy, selectedDuration]);

  useEffect(() => {
    setMounted(true);
    setCalendarDay(new Date());
  }, []);

  /**
   * Redirect if no device type selected.
   *
   * Waits for `hydrated`: Redux is empty on the first tick of every page load, and
   * this effect runs before the store is refilled from sessionStorage. Firing on
   * that empty tick is what sent a refreshed customer here - via "choose an
   * alternative time slot" - straight back to device selection a moment later.
   */
  useEffect(() => {
    if (!hydrated || deviceTypeId) return;
    console.warn('[Frontend] No device type selected, redirecting to booking page');
    router.push('/booking');
  }, [hydrated, deviceTypeId, router]);

  /**
   * Hold the page still behind the mobile drawers.
   *
   * `overflow: hidden` on its own does not stop iOS Safari scrolling, and pinning
   * <html> and <body> to `100dvh` to make it stick cost more than it bought.
   * Collapsing the document to a single viewport throws the scroll offset away,
   * so closing a sheet dropped the customer back at the top of the page - the
   * duration they had just chosen scrolled out of sight, which reads as the
   * screen having ignored the tap. And `dvh` is re-resolved every time Safari
   * animates its URL bar, so the whole page relaid out mid-gesture.
   *
   * Pinning the body at its current offset keeps the position and restores the
   * scroll on close. The effect only runs while a drawer is open, so nothing
   * touches the document in the common case.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!mobileDurationOpen && !mobileStartTimeOpen) return;

    const body = document.body;
    const mainEl = document.querySelector('main');
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    // The drawers render inside <main>, which the customer layout stacks below
    // the navbar (z-100); without this they would open underneath it.
    if (mainEl) mainEl.style.zIndex = '9999';

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      if (mainEl) mainEl.style.zIndex = '';
      window.scrollTo(0, scrollY);
    };
  }, [mobileDurationOpen, mobileStartTimeOpen]);

  // Sync selectedDuration to Redux booking state
  useEffect(() => {
    if (mounted) {
      dispatch(setDuration(selectedDuration));
    }
  }, [selectedDuration, mounted, dispatch]);

  /**
   * A new date invalidates the chosen start time.
   *
   * Duration is deliberately not a dependency any more. It used to be, because
   * changing it refetched the grid and the old answer had to be thrown away with
   * it - but the grid is now recomputed from occupancy already in hand, so a
   * start time that survives the change can simply stay selected. One that does
   * not is cleared by the effect further down, which is the one that actually
   * knows.
   *
   * Deliberately separate from the fetch below, and deliberately not keyed on
   * `bookingId`. Taking a hold changes the booking id, and while those were one
   * effect that meant confirming a slot wiped the customer's own selection on the
   * way out - the picker snapped back to "choose a start time" just as it was
   * navigating to checkout, which read as the page refusing to move on.
   */
  useEffect(() => {
    if (!mounted || !calendarDay || !deviceTypeId) return;
    setSelectedStartTime(null);
  }, [calendarDay, mounted, deviceTypeId]);

  /**
   * One fetch per date, not per duration.
   *
   * This used to ask the server for a finished list of free start times, which
   * meant every duration the customer tried cost a round trip and blanked the
   * grid while it was in flight - to recompute something that depends on no data
   * the first call had not already returned. It now fetches the day's occupancy
   * once and `availableStartTimes` derives the rest in the browser.
   *
   * Keyed on `hydrated`, never on `bookingId`.
   *
   * A hold restored after a refresh still has to be excluded from the grid, and
   * it arrives a tick after this first runs - but hydration is what delivers it,
   * so hydration is the thing to wait for.
   *
   * `bookingId` looks like the natural dependency and is a trap: taking a hold
   * changes it, so this effect would fire as part of the same state update that
   * starts the navigation to checkout. `getSlotOccupancy` is a server action,
   * and Next applies a server action's revalidation to the route the caller is
   * still on - which cancelled the pending push. The navigation silently did
   * nothing perhaps two times in three, leaving the customer on the picker with
   * a hold already taken in their name, and their next attempt refused because
   * their own hold now occupied the station.
   */
  useEffect(() => {
    if (!mounted || !calendarDay || !deviceTypeId) return;

    // Never query slots for a date outside the booking window. The querying flag
    // is cleared as well as set: a stale request from the previous date may have
    // left it raised, and nothing below would lower it.
    if (!isDateWithinBookingWindow(calendarDay)) {
      setOccupancy({ totalDevices: 0, occupied: [] });
      setQueryingDb(false);
      return;
    }

    // Tapping through dates faster than the server answers would otherwise let
    // an older response land last and paint the wrong day's availability.
    let current = true;
    const dateStr = formatLocalDate(calendarDay);

    setQueryingDb(true);
    setOccupancy(null);

    // A hold this browser already owns must not make its own slot look taken -
    // a customer who navigates back here still has ten minutes on it.
    getSlotOccupancy(dateStr, deviceTypeId, bookingId)
      .then((res) => {
        if (!current) return;
        if (res.success) {
          setOccupancy(res.occupancy);
        } else {
          console.warn(`[Frontend] No availability for ${dateStr}:`, res.error);
          setOccupancy({ totalDevices: 0, occupied: [] });
        }
        setQueryingDb(false);
      })
      .catch((error) => {
        if (!current) return;
        console.error('[Frontend] Availability check failed:', error);
        setOccupancy({ totalDevices: 0, occupied: [] });
        setQueryingDb(false);
      });

    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarDay, deviceTypeId, mounted, hydrated]);

  const endTime = useMemo(() => {
    if (!selectedStartTime) return null;
    return calculateEndTime(selectedStartTime, selectedDuration);
  }, [selectedStartTime, selectedDuration]);

  /**
   * A late start with a long duration finishes tomorrow, and the end time alone
   * does not say so - "01:00 AM" reads as an hour of the chosen day that has
   * already gone. Everywhere this screen shows the end of the booking says which
   * day it lands on.
   */
  const endsNextDay = useMemo(
    () => (selectedStartTime ? crossesMidnight(selectedStartTime, selectedDuration) : false),
    [selectedStartTime, selectedDuration]
  );

  const endCalendarDay = useMemo(() => {
    if (!calendarDay || !selectedStartTime) return null;
    return bookingEndDate(calendarDay, selectedStartTime, selectedDuration);
  }, [calendarDay, selectedStartTime, selectedDuration]);

  const maxDurationForSelectedStartTime = useMemo(() => {
    if (!selectedStartTime) return 300;
    return getMaxDurationForStartTime(selectedStartTime);
  }, [selectedStartTime]);

  const filteredDurations = useMemo(() => {
    if (!selectedStartTime) return allDurations;
    return allDurations.filter(d => d.value <= maxDurationForSelectedStartTime);
  }, [allDurations, maxDurationForSelectedStartTime, selectedStartTime]);

  const additivesCostAggregated = useMemo(() => {
    return addons.reduce((sum, asset) => sum + (asset.price * asset.quantity), 0);
  }, [addons]);

  const extraPlayersCount = Math.max(0, playerCount - includedPlayers);
  const durationHours = selectedDuration / 60;
  // Same helpers the server prices with, so this screen cannot quote a number the
  // checkout then disagrees with.
  const extraPlayersTotal = extraPlayersCharge(extraPlayersCount, extraPlayerCharge, durationHours);
  const perPlayerCharge = perExtraPlayerCharge(extraPlayerCharge, durationHours);
  const baselineSubtotal = calculatePrice(hourlyRate || 0, selectedDuration);

  // Check for Happy Hour discount
  const happyHourInfo = useMemo(() => {
    if (!calendarDay || !selectedStartTime || !deviceTypeName) {
      return { rule: null, discount: 0, discountAmount: 0 };
    }

    const endTime = calculateEndTime(selectedStartTime, selectedDuration);
    const { rule, discount } = checkHappyHour(
      deviceTypeName,
      calendarDay,
      selectedStartTime,
      endTime
    );

    // Happy hour applies to device booking + extra players (NOT addons/food)
    const discountableAmount = baselineSubtotal + extraPlayersTotal;
    const discountAmount = rule ? calculateDiscount(discountableAmount, discount) : 0;

    return { rule, discount, discountAmount };
  }, [calendarDay, selectedStartTime, deviceTypeName, selectedDuration, baselineSubtotal, extraPlayersTotal, checkHappyHour, calculateDiscount]);

  const aggregatedPayableTotal = baselineSubtotal + extraPlayersTotal + additivesCostAggregated - happyHourInfo.discountAmount;

  /**
   * Happy hour for every start time on offer, in one pass.
   *
   * Both the desktop list and the mobile drawer render all 48 half hours, and
   * the desktop list stays mounted behind `hidden md:block` on a phone - so
   * asking per slot, per render, meant close to a hundred rule matches every
   * time any piece of state moved, player count included. Rebuilt only when the
   * date, duration, device or the rules themselves change.
   */
  const happyHourBySlot = useMemo(() => {
    const bySlot = new Map<string, { discount: number }>();
    if (!calendarDay || !deviceTypeName || happyHourRules.length === 0) return bySlot;

    for (const time of availableStartTimesForDate) {
      const { rule, discount } = checkHappyHour(
        deviceTypeName,
        calendarDay,
        time,
        calculateEndTime(time, selectedDuration)
      );
      if (rule) bySlot.set(time, { discount });
    }
    return bySlot;
  }, [availableStartTimesForDate, calendarDay, deviceTypeName, selectedDuration, checkHappyHour, happyHourRules]);

  const selectedDurationLabel = useMemo(() => {
    const duration = allDurations.find(d => d.value === selectedDuration);
    return duration?.label || "";
  }, [selectedDuration, allDurations]);

  /**
   * Drop a start time the new date or duration has invalidated.
   *
   * This carries more weight than it used to. Changing the duration once cleared
   * the selection outright, because it refetched the grid and the old answer went
   * with it; now the grid is recomputed in place, so a selection that is still
   * free simply stays - and this is the only thing that removes one that is not.
   *
   * Gated on `occupancy` rather than on the set being non-empty. Both are empty
   * while a date is loading, and clearing then would wipe the customer's choice
   * on every fetch - but "no slots at all at this duration" is a real answer, and
   * the old guard could not tell it apart from "not known yet", so it left a
   * stale time sitting in the summary. Having the occupancy is what distinguishes
   * them.
   */
  useEffect(() => {
    if (selectedStartTime && occupancy && !availableStartTimes.has(selectedStartTime)) {
      setSelectedStartTime(null);
    }
  }, [availableStartTimes, selectedStartTime, occupancy]);

  const handleRegisterTransactionLock = async () => {
    if (!calendarDay) {
      toast.error("Please select a date to proceed");
      return;
    }
    if (!isDateWithinBookingWindow(calendarDay)) {
      toast.error(BOOKING_WINDOW_ERROR);
      return;
    }
    if (!selectedStartTime) {
      toast.error("Please select a start time to proceed");
      return;
    }
    if (!deviceTypeId) {
      toast.error("Please select a device to proceed");
      return;
    }
    if (!isTimeAvailable(selectedStartTime)) {
      toast.error("Selected time slot is not available");
      return;
    }
    if (!endTime) {
      // Unreachable while a start time is set, but it narrows the type and would
      // otherwise be the one exit that told the customer nothing.
      toast.error("Please select a start time to proceed");
      return;
    }

    if (!isWithinBusinessHours(selectedStartTime, endTime)) {
      toast.error("Selected time range exceeds business hours");
      return;
    }

    setSubmittingLock(true);
    const dateQueryString = formatLocalDate(calendarDay);
    // The marker travels with the label, so every later screen that shows the
    // reserved slot - checkout, the success card, Retrieve Booking - says which
    // day it ends on without each having to work it out again.
    const slotLabel = `${selectedStartTime} - ${endTime}${endsNextDay ? " (next day)" : ""}`;

    const res = await createSoftLockTransaction({
      deviceId: deviceTypeId!,
      deviceName: deviceTypeName || "Device Type",
      deviceType: "gaming",
      hourlyRate: baselineSubtotal,
      date: dateQueryString,
      slotLabel,
      start: selectedStartTime,
      end: endTime,
      addons,
      subtotal: baselineSubtotal,
      total: aggregatedPayableTotal,
      durationMinutes: selectedDuration,
      playerCount,
      // Picking again gives the previous station back in the same round trip,
      // rather than leaving this customer sitting on two of them.
      previousHold: bookingId && holdToken ? { bookingId, holdToken } : null
    });

    if (res.success && res.bookingId && res.holdToken && res.expiresAt) {
      dispatch(setSlot({ date: dateQueryString, slot: slotLabel, startTime: selectedStartTime, endTime }));
      dispatch(setSlotHold({
        bookingId: res.bookingId,
        holdToken: res.holdToken,
        expiresAt: res.expiresAt
      }));
      dispatch(setPricing({
        subtotal: baselineSubtotal,
        subscriptionDiscount: 0,
        promoDiscount: 0,
        happyHourDiscount: happyHourInfo.discountAmount,
        total: aggregatedPayableTotal
      }));
      dispatch(setHappyHour({
        ruleId: happyHourInfo.rule?.id || null,
        ruleName: happyHourInfo.rule?.name || null,
        discount: happyHourInfo.discountAmount
      }));
      router.push("/booking/auth");
    } else {
      toast.error(res.error);
    }
    setSubmittingLock(false);
  };

  /**
   * No `if (!mounted) return null` here.
   *
   * Returning null until the mount effect had run meant the prerendered HTML for
   * this route carried nothing at all inside <main> - 17 bytes of Suspense
   * marker - so a customer on a phone watched an empty page while roughly a
   * megabyte of JavaScript downloaded, parsed and hydrated before the date row
   * so much as appeared.
   *
   * Nothing here needs the guard. Every value that differs between the server
   * and the customer's browser is already effect-driven and starts out empty on
   * both sides: `calendarDay` is undefined until the mount effect sets it,
   * `DateSelector` renders its own skeleton until it has the week, the booking
   * slice is empty until `StoreProvider` restores it, and `occupancy` is null
   * until the fetch lands. So the first client render matches the HTML it is
   * hydrating, and the shell - progress steps, device card, date row, summary -
   * paints from the prerender while the bundle is still arriving.
   */

  /**
   * The booking slice is empty until `StoreProvider` restores it from
   * sessionStorage, and that happens after hydration - so the prerendered HTML
   * knows neither the device nor its rate. Printing them anyway would put
   * "Gaming Device" at "₹0 / hour" and a "Total Payable ₹0.00" in front of the
   * customer for as long as the bundle takes to arrive, which is exactly the
   * window the prerender exists to fill. Everything sourced from the store waits
   * behind a placeholder of its own width instead, so the layout is final and
   * only the figures arrive late.
   */
  const pending = (width: string) => (
    <span className={`inline-block ${width} h-3 align-middle rounded bg-zinc-800`} />
  );
  const rupees = (value: number) => `₹${Math.round(value)}.00`;

  const isTimeAvailable = (time: string) => availableStartTimes.has(time);
  const canProceed = calendarDay && selectedStartTime && endTime && isTimeAvailable(selectedStartTime);

  return (
    <div className="max-w-md md:max-w-7xl mx-auto py-2 px-1 pb-28 md:pb-12">

      {/* Progress Steps */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between pb-6 px-2 select-none">
        <div className="flex flex-col items-center gap-1">
          <div className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">1</div>
          <span className="text-xs font-black uppercase text-primary tracking-wider">Time Slot</span>
        </div>
        <div className="h-0.5 bg-zinc-800 flex-1 mx-2" />
        <div className="flex flex-col items-center gap-1">
          <div className="w-5 h-5 rounded-full bg-zinc-900 text-zinc-400 font-black text-[11px] flex items-center justify-center">2</div>
          <span className="text-xs font-black uppercase text-primary tracking-wider">Details</span>
        </div>

        <div className="h-0.5 bg-zinc-800 flex-1 mx-2" />
        <div className="flex flex-col items-center gap-1">
          <div className="w-5 h-5 rounded-full bg-zinc-900 text-zinc-400 font-bold text-[11px] flex items-center justify-center border border-zinc-800">3</div>
          <span className="text-xs font-black uppercase text-zinc-400 tracking-wider">Payment</span>
        </div>
      </div>

      {/* Happy Hour Banner */}
      {happyHourInfo.rule && (
        <div className="max-w-md mx-auto mb-4 px-2">
          <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-yellow-200">{happyHourInfo.rule.name}</p>
              <p className="text-xs text-yellow-300/80">{happyHourInfo.discount}% discount on eligible slots!</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-4 md:space-y-6">
          {/* Device Info */}
          <div className="bg-[#111] border border-zinc-900 rounded-xl p-4 flex items-center justify-between gap-4 shadow-md glow-box-hover">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2.5 bg-zinc-950 border border-zinc-800 text-primary rounded-lg flex-shrink-0">
                <Clock className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-black text-xs sm:text-sm min-w-0 text-white uppercase break-words leading-tight">{hydrated ? (deviceTypeName || "Gaming Device") : pending("w-28")}</h4>
                <p className="text-zinc-400 text-xs font-bold mt-0.5"><span className="text-primary font-black">{hydrated ? `₹${hourlyRate || 0}` : pending("w-10")}</span> / hour</p>
              </div>
            </div>
            <Button variant="gradient" onClick={() => router.push("/booking")} className="text-black font-black text-xs uppercase h-7 px-3 flex-shrink-0">
              Change
            </Button>
          </div>

          {/* Info Banner */}
          <Card className="bg-gradient-to-r from-primary/5 via-amber-400/5 to-primary/5 border-primary/20 p-4 glow-box-hover">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">Flexible Booking</p>
                <p className="text-xs text-zinc-400">Book from 30 minutes to 5 hours. Choose your preferred start time and duration.</p>
              </div>
            </div>
          </Card>

          {/* Mobile Flow Container */}
          <div className="space-y-4 md:hidden">
            {/* Date Selection - today + next 6 days, all on one row */}
            <div className="space-y-2">
              <span className="text-label-enhanced block pl-1">Select Date</span>
              <DateSelector selected={calendarDay} onSelect={setCalendarDay} />
            </div>

            <div onClick={() => setMobileDurationOpen(true)} className="bg-[#111] border border-zinc-900 p-4 rounded-xl flex justify-between items-center cursor-pointer glow-box-hover">
              <div className="space-y-1">
                <span className="text-label-enhanced block">Duration</span>
                <span className="text-sm font-black text-white">{selectedDurationLabel}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
            </div>

            <div onClick={() => setMobileStartTimeOpen(true)} className="bg-[#111] border border-zinc-900 p-4 rounded-xl flex justify-between items-center cursor-pointer glow-box-hover">
              <div className="space-y-1">
                <span className="text-label-enhanced block">Start Time</span>
                <span className="text-sm font-black text-primary">
                  {selectedStartTime || (queryingDb || !occupancy ? "Checking availability…" : "Choose Start Time")}
                </span>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-600" />
            </div>




            {/* Inline Dynamic Mobile Summary Card Block */}
            <Card className="bg-[#111] border border-zinc-900 p-5 space-y-4 shadow-xl rounded-xl glow-box-strong">
              <h3 className="text-sm font-black text-zinc-300 uppercase tracking-wider border-b border-zinc-900/60 pb-2">Booking Summary</h3>

              <div className="space-y-2.5 text-sm text-zinc-300 border-b border-zinc-900/60 pb-3">
                <div className="flex justify-between"><span>Date:</span><strong className="text-white font-bold">{calendarDay ? `${calendarDay.toLocaleDateString()} (${calendarDay.toLocaleDateString('en-US', { weekday: 'short' })})` : "Not Selected"}{endsNextDay && endCalendarDay && <span className="text-amber-400 font-bold block text-xs mt-0.5">ends {endCalendarDay.toLocaleDateString()} ({endCalendarDay.toLocaleDateString('en-US', { weekday: 'short' })})</span>}</strong></div>
                <div className="flex justify-between"><span>Duration:</span><strong className="text-white font-bold">{selectedDurationLabel}</strong></div>
                <div className="flex justify-between"><span>Start Time:</span><strong className="text-primary font-black">{selectedStartTime || "Not Selected"}</strong></div>
                <div className="flex justify-between"><span>End Time:</span><strong className="text-primary font-black">{endTime || "--"}{endsNextDay && <span className="text-amber-400 font-bold ml-1">(next day)</span>}</strong></div>
                <div className="flex justify-between"><span>Device:</span><strong className="text-xs text-white uppercase truncate max-w-[200px]">{hydrated ? (deviceTypeName || "N/A") : pending("w-20")}</strong></div>
              </div>

              {/* Player Multiplier Controller */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider">Number of Players</h4>
                <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-2.5">
                  <p className="text-xs text-zinc-300 font-bold">{hydrated ? `${includedPlayers} included • Max ${maxPlayers}` : pending("w-32")}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => playerCount > 1 && dispatch(setPlayerCount(playerCount - 1))}
                      disabled={playerCount <= 1}
                      className="w-7 h-7 rounded-md bg-zinc-900 border border-zinc-800 text-white disabled:opacity-30 flex items-center justify-center hover:border-primary/50 hover:bg-primary/10 transition-all duration-300"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-base font-black text-white w-6 text-center">{hydrated ? playerCount : "–"}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (playerCount >= maxPlayers) {
                          toast.error(`Maximum ${maxPlayers} players only`);
                        } else {
                          dispatch(setPlayerCount(playerCount + 1));
                        }
                      }}
                      disabled={playerCount >= maxPlayers}
                      className="w-7 h-7 rounded-md bg-gradient-to-r from-primary to-amber-400 text-black flex items-center justify-center font-bold hover:shadow-[0_0_15px_rgba(255,193,7,0.5)] disabled:opacity-30 transition-all duration-300"
                    >
                      <Plus className="h-3 w-3 stroke-[3]" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Price Calculations */}
              <div className="space-y-2 text-sm text-zinc-300 pt-1">
                <div className="flex justify-between"><span>Base Rate ({selectedDurationLabel})</span><span className="text-white font-bold">{hydrated ? rupees(baselineSubtotal) : pending("w-14")}</span></div>
                {extraPlayersCount > 0 && (
                  <div className="flex justify-between"><span>Extra Players ({extraPlayersCount} × ₹{perPlayerCharge})</span><span className="text-primary font-bold">₹{extraPlayersTotal}.00</span></div>
                )}
                {happyHourInfo.rule && happyHourInfo.discountAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                      Happy Hour ({happyHourInfo.discount}% OFF)
                    </span>
                    <span className="text-green-400 font-bold">-₹{Math.round(happyHourInfo.discountAmount)}.00</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2.5 border-t border-zinc-900 text-white font-black">
                  <span className="text-sm uppercase">Total Payable</span>
                  <span className="text-xl text-primary">{hydrated ? rupees(aggregatedPayableTotal) : pending("w-20")}</span>
                </div>
              </div>
            </Card>

            <div ref={confirmButtonRef} className="w-full">
              {!canProceed && (
                <p className="text-xs font-bold text-amber-500 text-center mt-2 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                  {!calendarDay
                    ? "⚠️ Please select a date to proceed"
                    : !selectedStartTime
                      ? "⚠️ Please select a start time to proceed"
                      : "⚠️ Selected time slot is not available"}
                </p>
              )}

              <Button variant="gradient" disabled={submittingLock} onClick={handleRegisterTransactionLock} className={`w-full text-black font-black uppercase text-xs py-5 rounded-xl flex items-center justify-center gap-1 mt-2 shadow-[0_4px_20px_rgba(255,193,7,0.2)] ${!canProceed ? "opacity-50 cursor-not-allowed" : ""}`}>
                {submittingLock ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm & Hold Slot <ChevronRight className="h-4 w-4 stroke-[3]" />
              </Button>
            </div>

          </div>

          {/* Desktop Layout */}
          <div className="hidden md:block space-y-6">
            {/* Date Selection - today + next 6 days */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest pl-1">📅 Select Date</h3>
              <DateSelector selected={calendarDay} onSelect={setCalendarDay} />
            </div>

            <div className="grid grid-cols-2 gap-6 items-start">
            {/* Duration Selection */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest pl-1">⏱️ Duration</h3>
              <div className="space-y-1.5">
                {filteredDurations.map((duration) => {
                  const isSelected = selectedDuration === duration.value;
                  const price = calculatePrice(hourlyRate || 0, duration.value);
                  return (
                    <button
                      key={duration.value}
                      onClick={() => {
                        setSelectedDuration(duration.value);
                        dispatch(setDuration(duration.value))
                      }}
                      className={`w-full p-3 border text-left rounded-xl transition-colors duration-200 ${isSelected
                        ? "bg-gradient-to-r from-primary via-yellow-400 to-primary border-transparent text-black shadow-[0_4px_20px_rgba(255,193,7,0.4)]"
                        : "bg-[#111] border-zinc-900 text-zinc-300 hover:border-primary/50 hover:bg-gradient-to-r hover:from-primary/10 hover:to-yellow-400/10 hover:shadow-[0_0_15px_rgba(255,193,7,0.2)]"
                        }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold">{duration.label}</span>
                        <span className={`text-xs font-black ${isSelected ? "text-black" : "text-primary"}`}>
                          ₹{price}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start Time Selection */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest pl-1">🕒 Start Time</h3>
              {queryingDb || !occupancy ? (
                <div className="h-96 flex flex-col items-center justify-center">
                  <BreakpointLoader size="md" text="Checking availability..." />
                </div>
              ) : availableStartTimesForDate.length === 0 ? (
                <div className="h-96 flex flex-col items-center justify-center gap-2 text-center px-4">
                  <Clock className="h-8 w-8 text-zinc-700" />
                  <p className="text-sm text-zinc-400 font-bold">No time slots available</p>
                  <p className="text-xs text-zinc-400">Try selecting a different date or duration</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-zinc-950">
                  {availableStartTimesForDate.map((time) => {
                    const isAvailable = isTimeAvailable(time);
                    const isSelected = selectedStartTime ? isTimeSlotWithinRange(time, selectedStartTime, selectedDuration) : false;
                    const happyHour = happyHourBySlot.get(time);
                    return (
                      <button
                        key={time}
                        disabled={!isAvailable}
                        onClick={() => setSelectedStartTime(time)}
                        className={`w-full p-3 border text-left rounded-xl transition-colors duration-200 text-sm font-bold relative ${!isAvailable
                          ? "bg-zinc-950/20 border-zinc-950 text-zinc-800 cursor-not-allowed"
                          : isSelected
                            ? "bg-gradient-to-r from-primary via-yellow-400 to-primary border-transparent text-black shadow-[0_4px_20px_rgba(255,193,7,0.4)]"
                            : happyHour
                              ? "bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30 text-yellow-200 hover:border-yellow-500/50 hover:bg-gradient-to-r hover:from-yellow-500/20 hover:to-orange-500/20 hover:shadow-[0_0_15px_rgba(255,193,7,0.3)]"
                              : "bg-[#111] border-zinc-900 text-zinc-300 hover:border-primary/50 hover:bg-gradient-to-r hover:from-primary/10 hover:to-yellow-400/10 hover:shadow-[0_0_15px_rgba(255,193,7,0.2)]"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{time} - {calculateEndTime(time, 30)}</span>
                          {happyHour && !isSelected && (
                            <span className="flex items-center gap-1 text-xs font-black text-yellow-400">
                              <Sparkles className="w-3 h-3" />
                              {happyHour.discount}% OFF
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          </div>
        </div>

        {/* Desktop Sidebar Summary */}
        <div className="hidden lg:block w-[360px] flex-shrink-0">
          <Card className="bg-[#111] border border-zinc-900 p-6 text-white space-y-6 shadow-2xl rounded-2xl sticky top-24 glow-box-strong">
            <h3 className="text-sm font-black text-zinc-300 uppercase tracking-wider border-b border-zinc-900 pb-3">Booking Summary</h3>

            <div className="space-y-4 text-sm text-zinc-300 border-b border-zinc-900 pb-3">
              <div className="flex justify-between">
                <span>Date:</span>
                <strong className="text-white font-bold">{calendarDay ? `${calendarDay.toLocaleDateString()} (${calendarDay.toLocaleDateString('en-US', { weekday: 'short' })})` : "Not Selected"}{endsNextDay && endCalendarDay && <span className="text-amber-400 font-bold block text-xs mt-0.5">ends {endCalendarDay.toLocaleDateString()} ({endCalendarDay.toLocaleDateString('en-US', { weekday: 'short' })})</span>}</strong>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <strong className="text-white font-bold">{selectedDurationLabel}</strong>
              </div>
              <div className="flex justify-between">
                <span>Start Time:</span>
                <strong className="text-primary font-black">{selectedStartTime || "Not Selected"}</strong>
              </div>
              <div className="flex justify-between">
                <span>End Time:</span>
                <strong className="text-primary font-black">{endTime || "--"}{endsNextDay && <span className="text-amber-400 font-bold ml-1">(next day)</span>}</strong>
              </div>
              <div className="flex justify-between">
                <span>Device:</span>
                <strong className="text-xs text-white uppercase text-right max-w-[200px] break-words leading-tight max-w-[160px]">{hydrated ? (deviceTypeName || "N/A") : pending("w-20")}</strong>
              </div>
            </div>

            {/* Player Selection Desktop */}
            <div className="border-b border-zinc-900 pb-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-3">Number of Players</h4>
              <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <div className="flex-1">
                  <p className="text-sm text-zinc-300 font-bold">
                    {hydrated ? `${includedPlayers} included • Max ${maxPlayers}` : pending("w-32")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => playerCount > 1 && dispatch(setPlayerCount(playerCount - 1))}
                    disabled={playerCount <= 1}
                    className="w-7 h-7 rounded-md bg-zinc-900 border border-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:border-primary/50 hover:bg-primary/10 transition-all duration-300 flex items-center justify-center"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="text-xl font-black text-white w-8 text-center">{hydrated ? playerCount : "–"}</span>
                  <button
                    onClick={() => {
                      if (playerCount >= maxPlayers) {
                        toast.error(`Maximum ${maxPlayers} players only`);
                      } else {
                        dispatch(setPlayerCount(playerCount + 1));
                      }
                    }}
                    disabled={playerCount >= maxPlayers}
                    className="w-7 h-7 rounded-md bg-gradient-to-r from-primary to-amber-400 border border-transparent text-black disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0_0_15px_rgba(255,193,7,0.5)] transition-all duration-300 flex items-center justify-center font-bold"
                  >
                    <Plus className="h-3 w-3 stroke-[3]" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-sm text-zinc-300">
              <div className="flex justify-between">
                <span>Base Rate ({selectedDurationLabel})</span>
                <span className="text-white font-bold">{hydrated ? rupees(baselineSubtotal) : pending("w-14")}</span>
              </div>
              {extraPlayersCount > 0 && (
                <div className="flex justify-between">
                  <span>Extra Players ({extraPlayersCount} × ₹{perPlayerCharge})</span>
                  <span className="text-primary font-bold">₹{extraPlayersTotal}.00</span>
                </div>
              )}
              {happyHourInfo.rule && happyHourInfo.discountAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5 text-sm">
                    <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                    Happy Hour ({happyHourInfo.discount}% OFF)
                  </span>
                  <span className="text-green-400 font-bold">-₹{Math.round(happyHourInfo.discountAmount)}.00</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-3 border-t border-zinc-900 text-white font-black">
                <span className="text-xs uppercase">Total Payable</span>
                <span className="text-2xl text-primary">{hydrated ? rupees(aggregatedPayableTotal) : pending("w-20")}</span>
              </div>
            </div>

            {!canProceed && (
              <p className="text-xs font-bold text-amber-500 text-center mt-3 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                {!calendarDay
                  ? "⚠️ Please select a date to proceed"
                  : !selectedStartTime
                    ? "⚠️ Please select a start time to proceed"
                    : "⚠️ Selected time slot is not available"}
              </p>
            )}

            <Button
              variant="gradient"
              disabled={submittingLock}
              onClick={handleRegisterTransactionLock}
              className={`w-full text-black font-black uppercase py-5 text-xs rounded-xl flex items-center justify-center gap-1 mt-3 ${!canProceed ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {submittingLock ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm & Hold Slot <ChevronRight className="h-4 w-4 stroke-[3]" />
            </Button>
          </Card>
        </div>
      </div>

      {/* Mobile Drawers */}
      {/*
        * No `backdrop-blur` on either backdrop. At 85% black there is almost
        * nothing left to see through it, but the filter still made Safari
        * re-blur the entire viewport - the animated background blobs included -
        * on every frame the sheet was open, which is what froze the phone while
        * the list underneath was being scrolled.
        */}
      {mobileDurationOpen && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-end md:hidden">
          <div className="bg-[#121212] border-t border-zinc-800 rounded-t-2xl w-full p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
              <span className="text-xs font-black uppercase text-zinc-400">Select Duration</span>
              <button onClick={() => setMobileDurationOpen(false)} className="p-1.5 rounded-full bg-zinc-950 text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              {filteredDurations.map((duration) => {
                const isSelected = selectedDuration === duration.value;
                const price = calculatePrice(hourlyRate || 0, duration.value);
                return (
                  <button
                    key={duration.value}
                    onClick={() => {
                      setSelectedDuration(duration.value);
                      setMobileDurationOpen(false);
                      dispatch(setDuration(duration.value))
                    }}
                    className={`w-full p-3 border text-left rounded-xl ${isSelected ? "bg-primary text-black border-transparent" : "bg-[#111] border-zinc-900 text-zinc-300"
                      }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold">{duration.label}</span>
                      <span className={`text-xs font-black ${isSelected ? "text-black" : "text-primary"}`}>
                        ₹{price}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mobileStartTimeOpen && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-end md:hidden">
          <div className="bg-[#121212] border-t border-zinc-800 rounded-t-2xl w-full p-5 space-y-4 max-h-[75vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-2 flex-shrink-0">
              <span className="text-xs font-black uppercase text-zinc-400">Select Start Time</span>
              <button onClick={() => setMobileStartTimeOpen(false)} className="p-1.5 rounded-full bg-zinc-950 text-zinc-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/*
              * The shell now paints before availability has landed, so this
              * sheet can be opened while `occupancy` is still null. Without
              * this it would show all 48 half hours struck through, which reads
              * as a fully booked day rather than a page still loading.
              */}
            {queryingDb || !occupancy ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <BreakpointLoader size="md" text="Checking availability..." />
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1 pb-4 scrollbar-thin">
              {availableStartTimesForDate.map((time) => {
                const isAvailable = isTimeAvailable(time);
                const isSelected = selectedStartTime ? isTimeSlotWithinRange(time, selectedStartTime, selectedDuration) : false;
                const happyHour = happyHourBySlot.get(time);
                return (
                  <button
                    key={time}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => {
                      setSelectedStartTime(time);
                      setMobileStartTimeOpen(false);
                      setTimeout(() => {
                        confirmButtonRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'end'
                        });
                      }, 300);
                    }}
                    className={`p-3 text-center rounded-xl text-xs font-black uppercase transition-colors duration-200 tracking-wider border relative ${!isAvailable
                      ? "bg-zinc-950/40 border-zinc-900/40 text-zinc-800 cursor-not-allowed line-through"
                      : isSelected
                        ? "bg-primary border-transparent text-black shadow-[0_0_15px_rgba(255,193,7,0.25)]"
                        : happyHour
                          ? "bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30 text-yellow-200"
                          : "bg-zinc-900 border-zinc-800 text-zinc-300 active:border-zinc-700"
                      }`}
                  >
                    <div className="flex flex-col gap-1">
                      <span>{time} - {calculateEndTime(time, 30)}</span>
                      {happyHour && !isSelected && (
                        <span className="flex items-center justify-center gap-0.5 text-[11px] font-black text-yellow-400">
                          <Sparkles className="w-2.5 h-2.5" />
                          {happyHour.discount}% OFF
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}