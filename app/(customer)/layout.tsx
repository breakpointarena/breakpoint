"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Timer, ShieldAlert } from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { resetBooking, releaseSlotHold } from "@/lib/redux/slices/bookingSlice";
import { releaseSlotHold as releaseSlotHoldOnServer } from "@/app/(customer)/booking/actions";

/**
 * The only page that shows the hold countdown: checkout, where the customer is
 * finishing the booking and the clock is the thing they need to beat.
 *
 * Deliberately excludes the pages before it. On device selection (`/booking`) and the
 * slot picker (`/booking/slots-v2`) the customer is still choosing, so a countdown
 * there is pressure without purpose - and device selection actively releases the hold
 * so the next pick starts fresh.
 *
 * An allowlist rather than a "/booking" prefix, so no future `/booking/*` route
 * inherits the banner by accident.
 */
const HOLD_BANNER_ROUTES = ["/booking/auth"];
import { toast } from "sonner";
import Navbar from "@/components/customer/layout/NavBar";
import Footer from "@/components/customer/layout/Footer";
import AnimatedBackground from "@/components/customer/layout/AnimatedBackground";
import { ScrollToTop } from "@/components/shared/ScrollToTop";


export default function CustomerRouteGroupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const slotLockExpiry = useAppSelector((state) => state.booking.slotLockExpiry);
  const bookingId = useAppSelector((state) => state.booking.bookingId);
  const holdToken = useAppSelector((state) => state.booking.holdToken);

  const pathname = usePathname();

  const [timeLeftStr, setTimeLeftStr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  /**
   * The hold banner belongs to the booking flow, where the countdown is what stands
   * between the customer and losing their slot. This layout wraps every customer
   * route, so it was also sitting over the food menu, subscriptions and booking
   * lookup - a red "slot held" bar on a page you cannot act on it from.
   *
   * `/booking` and the slot picker are excluded: on both the customer is still
   * choosing, so counting down a hold they have just stepped away from is
   * misleading. Only checkout shows the banner.
   *
   * Only the banner is hidden. The hold keeps running and the expiry effect below
   * still fires wherever the customer happens to be, so wandering off to the food
   * menu never costs them the reservation.
   */
  const showsHoldBanner = HOLD_BANNER_ROUTES.includes(pathname ?? "");

  /**
   * Landing on device selection abandons whatever slot was being held.
   *
   * That page is where "change device" lands the customer, and where they arrive
   * after wandering off to the food menu and coming back. In both cases they are
   * starting the pick over, so the old hold is released rather than left counting
   * down - the next slot they choose gets a full ten minutes instead of whatever
   * was left of the previous one.
   *
   * `releaseSlotHold` drops the countdown and the held slot but keeps the device
   * type they already chose, so this does not throw them further back than intended.
   */
  useEffect(() => {
    if (!mounted || pathname !== "/booking") return;
    if (!slotLockExpiry) return;
    if (bookingId && holdToken) void releaseSlotHoldOnServer(bookingId, holdToken);
    dispatch(releaseSlotHold());
  }, [mounted, pathname, slotLockExpiry, bookingId, holdToken, dispatch]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !slotLockExpiry) {
      setTimeLeftStr(null);
      return;
    }

    const computeTimeDelta = () => {
      const remainingTime = slotLockExpiry - Date.now();
      if (remainingTime <= 0) {
        clearInterval(clockTicker);
        setTimeLeftStr(null);
        // The row lapses on its own - every availability check compares the
        // deadline - but releasing it now puts the station back on sale this
        // second rather than whenever something next sweeps.
        if (bookingId && holdToken) void releaseSlotHoldOnServer(bookingId, holdToken);
        dispatch(resetBooking());
        toast("Hold Window Expired", {
          description: "Your temporary slot reservation hold timed out.",
          icon: <ShieldAlert className="text-red-500 h-5 w-5" />
        });
        router.push("/booking");
        return;
      }
      const mins = Math.floor(remainingTime / 60000);
      const secs = Math.floor((remainingTime % 60000) / 1000);
      setTimeLeftStr(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
    };

    computeTimeDelta();
    const clockTicker = setInterval(computeTimeDelta, 1000);
    return () => clearInterval(clockTicker);
  }, [slotLockExpiry, mounted, bookingId, holdToken, dispatch, router]);

  return (
    <>
      <ScrollToTop />
      <div className="min-h-screen flex flex-col bg-[#0d0a14] relative">
        {/* Animated purple background blobs */}
        <AnimatedBackground />

        {/* 10-Minute Hold HUD Alert Banner */}
        {mounted && timeLeftStr && showsHoldBanner && (
          <div className="w-full h-10 bg-[#E53e3e] text-white text-xs font-black tracking-widest uppercase text-center flex items-center justify-center gap-2 relative z-50 shadow-xl select-none">
            <Timer className="h-3.5 w-3.5 animate-pulse text-white" />
            <span>Slot Held For: <span className="font-mono bg-black/30 px-1.5 py-0.5 rounded text-primary ml-1">{timeLeftStr}</span></span>
          </div>
        )}

        {/* REUSABLE COMPONENT INJECTIONS */}
        <Navbar />

        <main className="flex-1 w-full max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-8 flex flex-col mt-24 md:mt-10 mb-8 relative z-10">
          {children}
        </main>

        <Footer />
      </div>
    </>
  );
}