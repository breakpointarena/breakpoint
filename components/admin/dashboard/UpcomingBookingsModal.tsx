"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, User, MapPin, Phone } from "lucide-react";
import { BookingStatusBadge } from "@/components/admin/bookings/BookingStatusBadge";
import { formatDbTimeRange } from "@/lib/utils/timeSlots";

interface UpcomingBookingsModalProps {
  open: boolean;
  onClose: () => void;
  bookings: any[];
  onBookingClick: (bookingId: string) => void;
}

export function UpcomingBookingsModal({ open, onClose, bookings, onBookingClick }: UpcomingBookingsModalProps) {
  const calculateMinutesUntil = (startTime: string) => {
    const now = new Date();
    const [hours, minutes] = startTime.split(':').map(Number);
    const start = new Date(now);
    start.setHours(hours, minutes, 0);

    const diff = start.getTime() - now.getTime();
    const minutesUntil = Math.floor(diff / 60000);

    if (minutesUntil < 0) return "Starting now";
    if (minutesUntil < 60) return `In ${minutesUntil}m`;

    const hoursUntil = Math.floor(minutesUntil / 60);
    const minsUntil = minutesUntil % 60;
    return `In ${hoursUntil}h ${minsUntil}m`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--background)] border-primary/30 max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-amber-500" />
            Upcoming Bookings
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="p-4 bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-lg mb-4">
          <p className="text-xs text-amber-400 mb-1">Next 2 Hours</p>
          <p className="text-2xl font-black text-white">{bookings.length} Upcoming Bookings</p>
        </div>

        {/* Bookings List */}
        <div className="space-y-3">
          {bookings.length > 0 ? (
            bookings.map((slot) => {
              const timeUntil = calculateMinutesUntil(slot.slot_start_time);
              const isStartingSoon = timeUntil.includes('In') && parseInt(timeUntil) <= 15;

              return (
                <div
                  key={slot.id}
                  className={`p-4 bg-[var(--surface)] border rounded-lg hover:border-amber-500/50 transition-colors cursor-pointer ${
                    isStartingSoon ? 'border-amber-500/30' : 'border-[#27272a]'
                  }`}
                  onClick={() => onBookingClick(slot.bookings?.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-white">{slot.bookings?.customer_name}</p>
                        <BookingStatusBadge status={slot.bookings?.status} size="sm" />
                      </div>
                      <p className="text-xs text-secondary-content font-mono flex items-center gap-2">
                        <Phone className="h-3 w-3" />
                        {slot.bookings?.customer_phone}
                      </p>
                      <p className="text-xs text-primary font-mono mt-1">{slot.bookings?.booking_number}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-black ${
                      isStartingSoon
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {timeUntil}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-secondary-content" />
                      <div>
                        <p className="text-xs text-white font-bold">{slot.device_type}</p>
                        <p className="text-label">Station #{slot.device_station_number}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-secondary-content" />
                      <div>
                        <p className="text-xs text-white font-bold">{slot.player_count} Players</p>
                        <p className="text-label">Booked</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 col-span-2">
                      <Clock className="h-3.5 w-3.5 text-secondary-content" />
                      <div>
                        <p className="text-xs text-white font-bold">
                          {formatDbTimeRange(slot.slot_start_time, slot.slot_end_time)}
                        </p>
                        <p className="text-label">
                          {new Date(slot.slot_date).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-muted-content">No upcoming bookings</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
