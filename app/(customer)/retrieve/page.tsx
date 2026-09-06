"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Phone, Calendar, Clock, QrCode, UtensilsCrossed, User, CheckCircle2, Sparkles, Zap, CreditCard , Loader2 } from 'lucide-react';
import { BreakpointLoader } from '@/components/shared/BreakpointLoader';
import { toast } from "sonner";
import { getMyBookings } from "./actions";
import { CustomerAuthGate } from "@/components/auth/CustomerAuthGate";
import { formatDbTime, formatDbTimeRange } from "@/lib/utils/timeSlots";
import { QRCodeSVG } from "qrcode.react";

/**
 * Rendered only behind CustomerAuthGate, so the customer is already known.
 * There is no phone field: which bookings to show is decided by the session,
 * not by anything typed on the page.
 */
function RetrieveBookingContent({ phone }: { phone: string }) {
  const router = useRouter();

  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [sessionLapsed, setSessionLapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const result = await getMyBookings();
      if (cancelled) return;

      if (result.success) {
        setBookings(result.bookings || []);
      } else if (result.verificationRequired) {
        // Session expired between the gate letting us through and this call.
        setSessionLapsed(true);
        setBookings([]);
      } else {
        toast.error("Error", { description: result.error || "Failed to fetch bookings." });
        setBookings([]);
      }

      setIsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getStatusBadge = (status: string) => {
    const statusConfig: any = {
      confirmed: {
        bg: 'bg-gradient-to-r from-green-500/20 to-emerald-500/20',
        text: 'text-green-400',
        border: 'border-green-500/40',
        glow: 'shadow-[0_0_15px_rgba(34,197,94,0.3)]'
      },
      checked_in: {
        bg: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20',
        text: 'text-blue-400',
        border: 'border-blue-500/40',
        glow: 'shadow-[0_0_15px_rgba(59,130,246,0.3)]'
      },
      completed: {
        bg: 'bg-zinc-800/50',
        text: 'text-zinc-400',
        border: 'border-zinc-700',
        glow: ''
      },
      locked: {
        bg: 'bg-gradient-to-r from-amber-500/20 to-pink-500/20',
        text: 'text-amber-400',
        border: 'border-amber-500/40',
        glow: 'shadow-[0_0_15px_rgba(255,193,7,0.3)]'
      },
    };

    const config = statusConfig[status] || statusConfig.confirmed;

    return (
      <span className={`text-xs px-3 py-1.5 rounded-full font-black uppercase ${config.bg} ${config.text} border ${config.border} ${config.glow} backdrop-blur-sm animate-in fade-in duration-300`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (sessionLapsed) {
    return (
      <Card className="bg-[#111] border-2 border-amber-500/30 p-10 text-center max-w-md mx-auto rounded-2xl">
        <h3 className="text-lg font-black text-white mb-2 uppercase">Session Expired</h3>
        <p className="text-sm text-zinc-400 mb-6">Please log in again to view your bookings.</p>
        <Button onClick={() => window.location.reload()} variant="gradient" className="h-11 px-8 rounded-xl">
          Log In
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header with Animation */}
        <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-amber-400 to-primary flex items-center justify-center shadow-[0_0_30px_rgba(255,193,7,0.4)] animate-pulse">
              <Search className="h-6 w-6 text-black" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black uppercase bg-gradient-to-r from-white via-amber-100 to-white bg-clip-text text-transparent tracking-tight">
                RETRIEVE BOOKING
              </h1>
              <p className="text-xs text-primary font-bold uppercase tracking-widest flex items-center gap-1.5 mt-1">
                <Zap className="h-3 w-3" />
                INSTANT ACCESS TO YOUR RESERVATIONS
              </p>
            </div>
          </div>
          <p className="text-sm text-zinc-400 pl-15">All bookings for +91 {phone}, with QR codes ready to scan at the counter</p>
        </div>


        {/* Loading State with Animation */}
        {isLoading && (
          <div className="flex flex-col justify-center items-center py-16 animate-in fade-in zoom-in duration-500">
            <BreakpointLoader size="lg" text="Searching bookings..." />
          </div>
        )}

        {/* No Results with Better Design */}
        {!isLoading && !sessionLapsed && bookings.length === 0 && (
          <Card className="bg-gradient-to-br from-[#111] to-zinc-950 border-2 border-zinc-800 p-12 text-center animate-in fade-in zoom-in duration-500 rounded-2xl">
            <div className="w-20 h-20 rounded-full bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center mx-auto mb-6">
              <Search className="h-10 w-10 text-zinc-700" />
            </div>
            <h3 className="text-xl font-black text-zinc-400 mb-3 uppercase">No Bookings Found</h3>
            <p className="text-sm text-zinc-400 max-w-md mx-auto">You don't have any bookings yet. Reserve a slot and it will show up here.</p>
            <Button
              onClick={() => router.push("/booking")}
              variant="gradient"
              className="mt-6 px-8 h-12 rounded-xl"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              CREATE NEW BOOKING
            </Button>
          </Card>
        )}

        {/* Bookings List with Enhanced Cards */}
        {!isLoading && !selectedBooking && bookings.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between animate-in fade-in slide-in-from-left-4 duration-500 delay-200">
              <h2 className="text-sm font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                </div>
                {bookings.length} Booking{bookings.length > 1 ? "s" : ""} Found
              </h2>
            </div>

            <div className="grid gap-5">
              {bookings.map((booking, index) => {
                const hasDeviceSlot = booking.booking_device_slots?.length > 0;
                const hasFoodItems = booking.booking_food_items?.length > 0;
                const isFoodOnly = !hasDeviceSlot && hasFoodItems;

                return (
                  <Card
                    key={booking.id}
                    className="bg-gradient-to-br from-[#111] via-[#0f0f0f] to-[#111] border-2 border-zinc-900 hover:border-primary/50 p-6 shadow-[0_0_20px_rgba(255,193,7,0.1)] hover:shadow-[0_0_30px_rgba(255,193,7,0.25)] rounded-2xl transition-all cursor-pointer group relative overflow-hidden"
                    onClick={() => setSelectedBooking(booking)}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    {/* Hover gradient effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-amber-400/5 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div className="space-y-4 flex-1">
                        {/* Title - Device Name OR Food Order */}
                        <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-zinc-800">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            {isFoodOnly ? (
                              <>
                                <UtensilsCrossed className="h-5 w-5 text-orange-400" />
                                <span className="text-lg sm:text-xl font-black text-white">
                                  Food Order
                                </span>
                                <span className="text-xs font-bold text-orange-400 bg-orange-500/10 px-2 py-1 rounded border border-orange-500/30">
                                  {booking.booking_food_items.length} items
                                </span>
                              </>
                            ) : (
                              <>
                                <Zap className="h-5 w-5 text-primary" />
                                <span className="text-lg sm:text-xl font-black text-white">
                                  {booking.booking_device_slots?.[0]?.device_type || 'Device'}
                                </span>
                                {/* nowrap: a station like "SS-001" gives the
                                    browser a break opportunity at the hyphen,
                                    splitting the tag across two lines. */}
                                <span className="text-xs font-bold text-zinc-400 bg-zinc-900 px-2 py-1 rounded whitespace-nowrap shrink-0">
                                  #{booking.booking_device_slots?.[0]?.device_station_number || 'N/A'}
                                </span>
                              </>
                            )}
                          </div>
                          <div>
                            {getStatusBadge(booking.status)}
                          </div>
                        </div>

                      {/* Booking ID - Small tag */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-zinc-400 bg-zinc-950/50 px-2 py-1 rounded border border-zinc-800">
                          #{booking.booking_number}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {isFoodOnly ? (
                          // Food-only booking info
                          <>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center">
                                <UtensilsCrossed className="h-4 w-4 text-orange-400" />
                              </div>
                              <div>
                                <p className="text-xs text-zinc-400 uppercase font-bold">Items</p>
                                <p className="text-sm text-white font-black">
                                  {booking.booking_food_items.length} item{booking.booking_food_items.length > 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center">
                                <Calendar className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs text-zinc-400 uppercase font-bold">Ordered</p>
                                <p className="text-sm text-white font-black">
                                  {new Date(booking.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center">
                                <CreditCard className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs text-zinc-400 uppercase font-bold">Amount</p>
                                <p className="text-sm text-primary font-black">₹{booking.total_amount}</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          // Device booking info
                          <>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center">
                                <Calendar className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs text-zinc-400 uppercase font-bold">Date</p>
                                <p className="text-sm text-white font-black">
                                  {booking.booking_device_slots?.[0]?.slot_date ?
                                    new Date(booking.booking_device_slots[0].slot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) :
                                    'N/A'
                                  }
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center">
                                <Clock className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs text-zinc-400 uppercase font-bold">Time</p>
                                <p className="text-sm text-white font-black">
                                  {formatDbTime(booking.booking_device_slots?.[0]?.slot_start_time)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center">
                                <CreditCard className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs text-zinc-400 uppercase font-bold">Amount</p>
                                <p className="text-sm text-primary font-black">₹{booking.total_amount}</p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBooking(booking);
                      }}
                      variant="gradient"
                      className="lg:w-auto w-full px-8 h-12 rounded-xl shadow-[0_0_20px_rgba(255,193,7,0.3)]"
                    >
                      VIEW DETAILS →
                    </Button>
                  </div>
                </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Booking Details with Enhanced Design */}
        {selectedBooking && (
          <div className="space-y-6">

            {/* Status Banner with Animation */}
            <Card className="bg-gradient-to-r from-primary/20 via-amber-500/10 to-primary/20 border-2 border-primary/40 p-4 sm:p-6 shadow-[0_0_40px_rgba(255,193,7,0.3)] rounded-2xl relative overflow-hidden animate-in fade-in zoom-in duration-500">
              {/* Animated shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />

              <div className="relative z-10">
                {/* Booking ID - Small tag at top right */}
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Booking Status</p>
                  <span className="text-xs font-mono font-bold text-zinc-400 bg-zinc-950/50 px-2 sm:px-3 py-1 rounded-md border border-zinc-800">
                    #{selectedBooking.booking_number}
                  </span>
                </div>

                {/* Status Info */}
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary via-amber-400 to-primary flex items-center justify-center shadow-[0_0_25px_rgba(255,193,7,0.5)] animate-pulse flex-shrink-0">
                    <CheckCircle2 className="h-6 w-6 sm:h-8 sm:w-8 text-black" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      {getStatusBadge(selectedBooking.status)}
                      <span className="text-xs text-zinc-400 hidden sm:inline">•</span>
                      <span className={`text-xs font-black uppercase px-2 sm:px-3 py-1 sm:py-1.5 rounded-full ${
                        selectedBooking.payment_status === 'paid'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                          : selectedBooking.payment_status === 'partial'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : selectedBooking.payment_status === 'pending'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}>
                        {selectedBooking.payment_status === 'partial'
                          ? 'Balance Due'
                          : selectedBooking.payment_status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* QR Code with Scanning Animation */}
            <Card className="bg-gradient-to-br from-[#111] via-zinc-950 to-[#111] border-2 border-primary/30 p-8 shadow-[0_0_40px_rgba(255,193,7,0.25)] rounded-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
              {/* Top border pulse */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />

              {/* Animated scanning line - behind all content */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-60 animate-scan shadow-[0_0_20px_rgba(255,193,7,0.8)]" />
              </div>

              <div className="space-y-6 relative z-10">
                <div className="flex items-center justify-center gap-2 text-xs font-black text-zinc-400 uppercase tracking-wider">
                  <QrCode className="h-5 w-5 text-primary" />
                  <span>Booking QR Code</span>
                </div>

                {/* QR Code Container */}
                <div className="flex justify-center">
                  <div className="relative">
                    {/* Corner brackets */}
                    <div className="absolute -top-3 -left-3 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-xl z-20" />
                    <div className="absolute -top-3 -right-3 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-xl z-20" />
                    <div className="absolute -bottom-3 -left-3 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-xl z-20" />
                    <div className="absolute -bottom-3 -right-3 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-xl z-20" />

                    {/* QR Code with white background */}
                    <div className="bg-white p-6 rounded-xl relative z-10">
                      <QRCodeSVG value={selectedBooking.booking_number} size={220} level="H" />
                    </div>

                    {/* Glow effect behind QR */}
                    <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary via-amber-400 to-primary rounded-xl blur-2xl opacity-40 animate-pulse" />
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-xs text-zinc-400">Show this QR code at the counter for instant check-in</p>
                </div>
              </div>
            </Card>

            {/* Device Slots - MOVED TO TOP */}
            {selectedBooking.booking_device_slots?.length > 0 && (
              <Card className="bg-gradient-to-br from-primary/10 via-amber-500/5 to-primary/10 border-2 border-primary/40 p-4 sm:p-6 shadow-[0_0_30px_rgba(255,193,7,0.3)] rounded-2xl hover:shadow-[0_0_40px_rgba(255,193,7,0.4)] transition-all animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 relative overflow-hidden">
                {/* Animated gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-shimmer" />

                <div className="relative z-10">
                  <h3 className="text-xs sm:text-sm font-black text-primary uppercase tracking-wider mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary via-amber-400 to-primary flex items-center justify-center shadow-[0_0_20px_rgba(255,193,7,0.5)]">
                      <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-black" />
                    </div>
                    YOUR GAMING SLOT
                  </h3>
                  <div className="grid gap-4">
                    {selectedBooking.booking_device_slots.map((slot: any, idx: number) => (
                      <div key={idx} className="bg-gradient-to-br from-[#111] to-zinc-950 p-4 sm:p-6 rounded-xl border-2 border-primary/30 hover:border-primary/50 transition-all shadow-[0_0_20px_rgba(255,193,7,0.2)] hover:shadow-[0_0_30px_rgba(255,193,7,0.3)]">
                        <div className="space-y-4 sm:space-y-5">
                          {/* Device Info - Large and Prominent with Responsive Sizing */}
                          <div className="pb-3 sm:pb-4 border-b-2 border-primary/20">
                            <p className="text-xs text-zinc-400 uppercase font-bold mb-2 tracking-wider">Gaming Device</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-white leading-tight">
                                {slot.device_type}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-zinc-400 bg-zinc-900 px-2 sm:px-3 py-1 rounded-lg whitespace-nowrap shrink-0">
                                #{slot.device_station_number}
                              </span>
                            </div>
                          </div>

                          {/* Date & Time - Combined in Single Box */}
                          <div className="bg-zinc-950/50 p-4 sm:p-5 rounded-lg border border-primary/20">
                            <div className="space-y-3 sm:space-y-4">
                              <div className="flex items-center gap-3">
                                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-xs text-zinc-400 uppercase font-bold mb-1">Date</p>
                                  <p className="text-sm sm:text-base md:text-lg font-black text-white leading-tight">
                                    {new Date(slot.slot_date).toLocaleDateString('en-US', {
                                      weekday: 'short',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-xs text-zinc-400 uppercase font-bold mb-1">Time Slot</p>
                                  <p className="text-sm sm:text-base md:text-lg font-black text-primary leading-tight">
                                    {formatDbTimeRange(slot.slot_start_time, slot.slot_end_time)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Duration and Player Count - Medium Size */}
                          <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            {slot.duration_hours && (
                              <div className="bg-zinc-950/30 p-3 sm:p-4 rounded-lg border border-zinc-800">
                                <p className="text-xs text-zinc-400 uppercase font-bold mb-1.5">Duration</p>
                                <p className="text-base sm:text-lg md:text-xl font-black text-white">{slot.duration_hours}h</p>
                              </div>
                            )}
                            {slot.player_count && (
                              <div className="bg-zinc-950/30 p-3 sm:p-4 rounded-lg border border-zinc-800">
                                <p className="text-xs text-zinc-400 uppercase font-bold mb-1.5">Players</p>
                                <p className="text-base sm:text-lg md:text-xl font-black text-white">{slot.player_count}</p>
                              </div>
                            )}
                          </div>

                          {slot.extra_players_total > 0 && (
                            <div className="flex items-center justify-between text-xs bg-primary/10 px-3 py-2 rounded-lg border border-primary/20">
                              <span className="text-zinc-400 font-bold">Extra Players Charge:</span>
                              <span className="text-primary font-black text-sm sm:text-base">+₹{slot.extra_players_total}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Customer Info */}
              <Card className="bg-[#111] border-2 border-zinc-900 p-6 shadow-[0_0_20px_rgba(255,193,7,0.15)] rounded-2xl hover:shadow-[0_0_30px_rgba(255,193,7,0.25)] transition-all animate-in fade-in slide-in-from-left-4 duration-500 delay-200">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  Customer Information
                </h3>
                {/* `last:` on every row so the trailing divider lands correctly
                    whether or not the customer has an email on file. */}
                <div className="space-y-4 text-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-900 last:pb-0 last:border-b-0">
                    <span className="text-zinc-400 font-bold">Customer:</span>
                    <span className="text-white font-black">{selectedBooking.customer_name}</span>
                  </div>
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-900 last:pb-0 last:border-b-0">
                    <span className="text-zinc-400 font-bold">Phone:</span>
                    <span className="text-primary font-black">{selectedBooking.customer_phone}</span>
                  </div>
                  {selectedBooking.customer_email && (
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-900 last:pb-0 last:border-b-0">
                      <span className="text-zinc-400 font-bold">Email:</span>
                      <span className="text-white font-bold truncate ml-2 text-right">{selectedBooking.customer_email}</span>
                    </div>
                  )}
                  {/* Date of birth is deliberately not shown here. It is still
                      captured at booking time and stored on the customer, but it
                      is only ever displayed in the admin customers table. */}
                </div>
              </Card>

              {/* Payment Summary */}
              <Card className="bg-gradient-to-br from-[#111] via-zinc-950 to-[#111] border-2 border-primary/30 p-6 shadow-[0_0_30px_rgba(255,193,7,0.2)] rounded-2xl animate-in fade-in slide-in-from-right-4 duration-500 delay-200">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-primary" />
                  </div>
                  Payment Summary
                </h3>
                <div className="space-y-3 text-sm">
                  {(() => {
                    // Calculate device charges with duration
                    const deviceSlot = selectedBooking.booking_device_slots?.[0];
                    const durationHours = deviceSlot?.duration_hours || 1;
                    const hourlyRate = deviceSlot?.hourly_rate || 0;
                    const deviceCharges = hourlyRate * durationHours;

                    // Calculate extra player charges
                    const extraPlayersTotal = selectedBooking.booking_device_slots?.reduce(
                      (sum: number, slot: any) => sum + (Number(slot.extra_players_total) || 0),
                      0
                    ) || 0;

                    // Calculate subtotal
                    const calculatedSubtotal = Number(selectedBooking.device_subtotal) + Number(selectedBooking.food_subtotal);

                    // Calculate total
                    const calculatedTotal = calculatedSubtotal -
                      Number(selectedBooking.subscription_discount || 0) -
                      Number(selectedBooking.promo_discount || 0) -
                      Number(selectedBooking.happy_hour_discount || 0);

                    return (
                      <>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-zinc-400 font-bold">
                            Device Booking ({durationHours}h × ₹{hourlyRate}):
                          </span>
                          <span className="text-white font-black">₹{deviceCharges.toFixed(2)}</span>
                        </div>

                        {extraPlayersTotal > 0 && (
                          <div className="flex items-center justify-between py-2">
                            <span className="text-zinc-400 font-bold">Extra Players:</span>
                            <span className="text-white font-black">₹{extraPlayersTotal.toFixed(2)}</span>
                          </div>
                        )}

                        {selectedBooking.food_subtotal > 0 && (
                          <div className="flex items-center justify-between py-2">
                            <span className="text-zinc-400 font-bold">Food & Beverages:</span>
                            <span className="text-white font-black">₹{Number(selectedBooking.food_subtotal).toFixed(2)}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between py-2 border-t border-zinc-800">
                          <span className="text-zinc-400 font-black">Subtotal:</span>
                          <span className="text-white font-black">₹{calculatedSubtotal.toFixed(2)}</span>
                        </div>

                        {selectedBooking.subscription_discount > 0 && (
                          <div className="flex items-center justify-between py-2 text-green-500">
                            <span className="font-bold flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Subscription Discount:
                            </span>
                            <span className="font-black">-₹{Number(selectedBooking.subscription_discount).toFixed(2)}</span>
                          </div>
                        )}

                        {selectedBooking.promo_discount > 0 && (
                          <div className="flex items-center justify-between py-2 text-primary">
                            <span className="font-bold">Promo Discount:</span>
                            <span className="font-black">-₹{Number(selectedBooking.promo_discount).toFixed(2)}</span>
                          </div>
                        )}

                        {selectedBooking.happy_hour_discount > 0 && (
                          <div className="flex items-center justify-between py-2 text-yellow-400">
                            <span className="font-bold flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              Happy Hour Discount:
                            </span>
                            <span className="font-black">-₹{Number(selectedBooking.happy_hour_discount).toFixed(2)}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t-2 border-primary/20">
                          <span className="text-white font-black text-base uppercase">Total Amount:</span>
                          <span className="text-3xl font-black bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">
                            ₹{calculatedTotal.toFixed(2)}
                          </span>
                        </div>

                        {/* Paid vs owed. Only money actually received is shown as
                            paid - anything added to the tab afterwards stays a
                            balance until it is settled at the counter. */}
                        {(() => {
                          const paid = Number(selectedBooking.amount_paid || 0);
                          const balanceDue = Math.max(0, calculatedTotal - paid);

                          return (
                            <>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-400 font-bold uppercase">
                                  Paid{Number(selectedBooking.online_amount || 0) > 0 ? " (Online)" : ""}:
                                </span>
                                <span className="text-green-400 font-black">₹{paid.toFixed(2)}</span>
                              </div>

                              {balanceDue > 0.01 && (
                                <div className="flex items-center justify-between text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                                  <span className="text-amber-400 font-bold uppercase">Balance Due:</span>
                                  <span className="text-amber-300 font-black">
                                    ₹{balanceDue.toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>
              </Card>
            </div>

            {/* Food Items */}
            {selectedBooking.booking_food_items?.length > 0 && (
              <Card className="bg-[#111] border-2 border-zinc-900 p-6 shadow-[0_0_20px_rgba(255,193,7,0.15)] rounded-2xl hover:shadow-[0_0_30px_rgba(255,193,7,0.25)] transition-all animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400">
                <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <UtensilsCrossed className="h-4 w-4 text-primary" />
                  </div>
                  Food & Add-ons
                </h3>
                <div className="space-y-2">
                  {selectedBooking.booking_food_items.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between py-3 px-4 bg-zinc-950/50 rounded-lg border border-zinc-900 hover:border-primary/30 transition-all">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-300 font-bold">{item.item_name}</span>
                        <span className="text-xs text-zinc-400 font-black bg-zinc-900 px-2 py-1 rounded">x{item.quantity}</span>
                      </div>
                      <span className="text-primary font-black">₹{item.line_total}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500">
              {(selectedBooking.status === 'confirmed' || selectedBooking.status === 'checked_in') && (
                <Button
                  onClick={() => router.push(`/food?bookingId=${selectedBooking.id}&bookingNumber=${selectedBooking.booking_number}&phone=${selectedBooking.customer_phone}&name=${selectedBooking.customer_name}&date_of_birth=${selectedBooking.customer_dob || ''}`)}
                  variant="gradient"
                  className="w-full h-14 rounded-xl text-sm shadow-[0_0_30px_rgba(255,193,7,0.4)] hover:shadow-[0_0_45px_rgba(255,193,7,0.6)]"
                >
                  <UtensilsCrossed className="h-5 w-5 mr-2" />
                  ORDER FOOD & DRINKS
                </Button>
              )}
              <Button
                onClick={() => router.push("/booking")}
                variant="outline"
                className="w-full h-12 rounded-xl border-2 border-primary/50 hover:border-primary bg-primary/5 hover:bg-primary/10 text-primary font-black"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                BOOK ANOTHER SLOT
              </Button>
              <Button
                onClick={() => setSelectedBooking(null)}
                variant="ghost"
                className="w-full border-2 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl"
              >
                ← BACK TO SEARCH
              </Button>
            </div>
          </div>
        )}

        {/* Back to Home */}
        {!selectedBooking && bookings.length === 0 && !isLoading && (
          <Button
            onClick={() => router.push("/")}
            variant="ghost"
            className="w-full text-zinc-400 hover:text-zinc-400 font-bold uppercase text-sm h-11 rounded-xl border border-zinc-900 hover:border-zinc-800"
          >
            ← BACK TO HOME
          </Button>
        )}
      </div>
    </div>
  );
}

export default function RetrieveBookingPage() {
  return (
    <div className="min-h-screen bg-[#0d0a14] text-white py-12 px-4">
      <CustomerAuthGate
        title="Log In To View Bookings"
        description="Verify your mobile number to see your bookings and QR codes."
      >
        {(phone) => <RetrieveBookingContent phone={phone} />}
      </CustomerAuthGate>
    </div>
  );
}
