"use client";

import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { BookingStatusBadge } from "./BookingStatusBadge";

interface TimelineBooking {
  id: string;
  booking_number: string;
  customer_name: string;
  customer_phone: string;
  device_type: string;
  device_station_number: string;
  device_id: string;
  slot_start_time: string; // "10:00:00"
  slot_end_time: string; // "12:00:00"
  status: string;
  total_amount: number;
}

interface BookingsTimelineProps {
  bookings: TimelineBooking[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onBookingClick: (booking: any) => void;
}

export function BookingsTimeline({ bookings, selectedDate, onDateChange, onBookingClick }: BookingsTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Generate 48 time slots (24 hours × 2 for 30-min intervals)
  const timeSlots: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute of [0, 30]) {
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      timeSlots.push(time);
    }
  }

  // Convert time to 12-hour format for display
  const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  // Convert time to minutes since midnight
  const timeToMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // The minutes a booking covers, as a flat span. Overnight bookings run past
  // midnight rather than backwards, so the end can sit beyond 24:00.
  const bookingSpan = (startTime: string, endTime: string) => {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const duration = endMinutes < startMinutes
      ? (24 * 60 - startMinutes) + endMinutes
      : endMinutes - startMinutes;

    return { start: startMinutes, end: startMinutes + duration, duration };
  };

  // Calculate position and width for booking block
  const getBookingPosition = (startTime: string, endTime: string) => {
    const { start, duration } = bookingSpan(startTime, endTime);

    // Each slot is 30 minutes, timeline is 48 slots wide
    const slotWidth = 100 / 48; // percentage
    const left = (start / 30) * slotWidth;
    const width = (duration / 30) * slotWidth;

    return { left: `${left}%`, width: `${width}%` };
  };

  /**
   * Stack a device's overlapping bookings instead of piling them up.
   *
   * Every block on a row is absolutely positioned by its start time, so two
   * bookings that share a station and a stretch of clock landed on the exact
   * same pixels and the later one painted straight over the earlier one -
   * a booking staff could neither see nor click. That happens routinely here:
   * a walk-in checked in on a station that already has a slot booked, or an
   * overnight booking still running when the next morning's starts.
   *
   * Each booking now gets the first lane free at its start time, and the row
   * grows tall enough to show every lane, so an overlap reads as two blocks
   * one above the other.
   */
  const LANE_HEIGHT = 64;
  const LANE_GAP = 4;
  const ROW_PADDING = 8; // the old top-2/bottom-2, now applied per lane

  const layoutRow = (rowBookings: TimelineBooking[]) => {
    const laneEnds: number[] = [];

    const placed = [...rowBookings]
      .sort((a, b) =>
        bookingSpan(a.slot_start_time, a.slot_end_time).start -
        bookingSpan(b.slot_start_time, b.slot_end_time).start
      )
      .map((booking) => {
        const { start, end } = bookingSpan(booking.slot_start_time, booking.slot_end_time);
        let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = end;
        return { booking, lane };
      });

    const laneCount = Math.max(1, laneEnds.length);
    return {
      placed,
      height: ROW_PADDING * 2 + laneCount * LANE_HEIGHT + (laneCount - 1) * LANE_GAP
    };
  };

  // Group bookings by device
  const deviceGroups = bookings.reduce((groups, booking) => {
    const key = `${booking.device_type} #${booking.device_station_number}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(booking);
    return groups;
  }, {} as Record<string, TimelineBooking[]>);

  const deviceKeys = Object.keys(deviceGroups).sort();

  // Calculate current time indicator position
  const getCurrentTimePosition = () => {
    const isToday = selectedDate.toDateString() === new Date().toDateString();
    if (!isToday) return null;

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const slotWidth = 100 / 48;
    const position = (minutes / 30) * slotWidth;
    return `${position}%`;
  };

  const currentTimePosition = getCurrentTimePosition();

  // Scroll to current time on mount (if today)
  useEffect(() => {
    if (currentTimePosition && scrollRef.current) {
      const scrollPosition = (parseFloat(currentTimePosition) / 100) * scrollRef.current.scrollWidth;
      scrollRef.current.scrollLeft = scrollPosition - scrollRef.current.clientWidth / 2;
    }
  }, [currentTimePosition, selectedDate]);

  return (
    <Card className="bg-gradient-to-br from-[var(--background)] via-[var(--surface)] to-[var(--background)] border-2 border-primary/30 overflow-hidden glow-box-strong relative">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-shimmer pointer-events-none" />

      {/* Header */}
      <div className="p-4 border-b border-primary/20 flex items-center justify-between relative z-10">
        <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
          <div className="w-1 h-4 bg-gradient-to-b from-primary to-primary rounded-full" />
          Timeline View
        </h3>
        <div className="text-xs text-secondary-content">
          {bookings.length} booking{bookings.length !== 1 ? 's' : ''} on this day
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Time header */}
        <div
          ref={scrollRef}
          className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-zinc-950"
        >
          <div className="min-w-max">
            {/* Hour labels */}
            <div className="sticky top-0 z-30 bg-gradient-to-b from-[var(--background)] to-[var(--surface)] border-b border-primary/20 flex">
              {/* Frozen with the device column below it, and above it in the
                  stack, so the hour labels scroll underneath rather than through. */}
              <div className="w-40 flex-shrink-0 border-r border-primary/20 p-3 sticky left-0 z-40 bg-gradient-to-b from-[var(--background)] to-[var(--surface)]">
                <span className="text-xs font-black text-primary uppercase">Device</span>
              </div>
              <div className="flex flex-1" style={{ minWidth: '2400px' }}>
                {timeSlots.map((time, index) => {
                  const isHourStart = time.endsWith(':00');
                  return (
                    <div
                      key={time}
                      className={`flex-1 border-r border-zinc-800/50 p-2 ${isHourStart ? 'bg-primary/5' : 'bg-transparent'}`}
                    >
                      {isHourStart && (
                        <div className="text-[11px] font-black text-muted-content uppercase">
                          {formatTime12h(time)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Device rows */}
            {deviceKeys.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-muted-content font-bold">No bookings for this date</p>
                <p className="text-xs text-zinc-700 mt-1">Try selecting a different date</p>
              </div>
            ) : (
              deviceKeys.map((deviceKey) => {
                const { placed, height } = layoutRow(deviceGroups[deviceKey]);

                return (
                  <div key={deviceKey} className="flex border-b border-zinc-800/50 hover:bg-primary/5 transition-colors relative group">
                    {/* Device label — sits above the blocks so a booking sliding
                        past on horizontal scroll cannot cover the station name. */}
                    <div className="w-40 flex-shrink-0 border-r border-zinc-800/50 p-3 flex items-center sticky left-0 bg-gradient-to-r from-[var(--background)] to-[var(--surface)] z-20 group-hover:from-primary/10 group-hover:to-primary/5">
                      <div>
                        <p className="text-xs font-black text-white">{deviceKey.split(' #')[0]}</p>
                        <p className="text-label">Station #{deviceKey.split('#')[1]}</p>
                      </div>
                    </div>

                    {/* Timeline grid */}
                    <div className="flex-1 relative" style={{ minWidth: '2400px', height: `${height}px` }}>
                      {/* Grid lines */}
                      <div className="absolute inset-0 flex">
                        {timeSlots.map((time) => (
                          <div key={time} className="flex-1 border-r border-[#27272a]/30" />
                        ))}
                      </div>

                      {/* Current time indicator */}
                      {currentTimePosition && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-[15]"
                          style={{ left: currentTimePosition }}
                        >
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
                        </div>
                      )}

                      {/* Bookings */}
                      {placed.map(({ booking, lane }) => {
                        const position = getBookingPosition(booking.slot_start_time, booking.slot_end_time);
                        const statusColors = {
                          confirmed: 'bg-blue-500/20 border-blue-500/50 text-blue-300',
                          checked_in: 'bg-green-500/20 border-green-500/50 text-green-300',
                          completed: 'bg-zinc-700/20 border-zinc-600/50 text-muted-content',
                          locked: 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                        };
                        const colorClass = statusColors[booking.status as keyof typeof statusColors] || statusColors.confirmed;

                        return (
                          <div
                            key={booking.id}
                            className={`absolute ${colorClass} border rounded-lg p-2 cursor-pointer hover:scale-[1.02] transition-all z-10 overflow-hidden shadow-lg`}
                            style={{
                              ...position,
                              top: ROW_PADDING + lane * (LANE_HEIGHT + LANE_GAP),
                              height: LANE_HEIGHT
                            }}
                            onClick={() => onBookingClick(booking)}
                          >
                            <div className="flex flex-col h-full justify-between">
                              <div>
                                <p className="text-xs font-black uppercase truncate">{booking.customer_name}</p>
                                <p className="text-[11px] opacity-80 truncate">{booking.device_type} #{booking.device_station_number}</p>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold">
                                  {formatTime12h(booking.slot_start_time.substring(0, 5))}
                                </span>
                                <span className="text-[11px] opacity-60">₹{booking.total_amount}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="p-3 border-t border-[#27272a] flex items-center gap-4 bg-[var(--background)]">
        <span className="text-xs font-black text-secondary-content uppercase">Status:</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/50" />
            <span className="text-xs text-muted-content">Confirmed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/50" />
            <span className="text-xs text-muted-content">Checked In</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-zinc-700/20 border border-zinc-600/50" />
            <span className="text-xs text-muted-content">Completed</span>
          </div>
          {currentTimePosition && (
            <div className="flex items-center gap-1.5 ml-2">
              <div className="w-0.5 h-3 bg-red-500" />
              <span className="text-xs text-red-400 font-bold">Current Time</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
