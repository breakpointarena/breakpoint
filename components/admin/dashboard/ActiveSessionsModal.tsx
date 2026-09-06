"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, Clock, User, MapPin, Timer } from "lucide-react";
import { formatDbTimeRange } from "@/lib/utils/timeSlots";

interface ActiveSessionsModalProps {
  open: boolean;
  onClose: () => void;
  sessions: any[];
  onBookingClick: (bookingId: string) => void;
}

export function ActiveSessionsModal({ open, onClose, sessions, onBookingClick }: ActiveSessionsModalProps) {
  // One card per station, but the headline counts customers - a booking holding
  // two stations is one group playing, and this number has to be the one on the
  // tile that opened the modal.
  const sessionCount = new Set(sessions.map((session) => session.bookings?.id)).size;

  const calculateTimeRemaining = (endTime: string) => {
    const now = new Date();
    const [hours, minutes] = endTime.split(':').map(Number);
    const end = new Date(now);
    end.setHours(hours, minutes, 0);

    const diff = end.getTime() - now.getTime();
    const minutesRemaining = Math.floor(diff / 60000);

    if (minutesRemaining < 0) return "Overtime";
    if (minutesRemaining < 60) return `${minutesRemaining}m left`;

    const hoursRemaining = Math.floor(minutesRemaining / 60);
    const minsRemaining = minutesRemaining % 60;
    return `${hoursRemaining}h ${minsRemaining}m left`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--background)] border-primary/30 max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Active Sessions
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-lg mb-4">
          <p className="text-xs text-blue-400 mb-1">Currently Playing</p>
          <p className="text-2xl font-black text-white">
            {sessionCount} Active Session{sessionCount === 1 ? "" : "s"}
          </p>
        </div>

        {/* Sessions List */}
        <div className="space-y-3">
          {sessions.length > 0 ? (
            sessions.map((session) => {
              const timeRemaining = calculateTimeRemaining(session.slot_end_time);
              const isOvertime = timeRemaining === "Overtime";

              return (
                <div
                  key={session.id}
                  className="p-4 bg-[var(--surface)] border border-[#27272a] rounded-lg hover:border-blue-500/50 transition-colors cursor-pointer"
                  onClick={() => onBookingClick(session.bookings?.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white mb-1">{session.bookings?.customer_name}</p>
                      <p className="text-xs text-secondary-content font-mono">{session.bookings?.customer_phone}</p>
                      <p className="text-xs text-primary font-mono mt-1">{session.bookings?.booking_number}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-black ${
                      isOvertime
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {isOvertime ? '⚠️ OVERTIME' : '✓ ACTIVE'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-secondary-content" />
                      <div>
                        <p className="text-xs text-white font-bold">{session.device_type}</p>
                        <p className="text-label">Station #{session.device_station_number}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-secondary-content" />
                      <div>
                        <p className="text-xs text-white font-bold">{session.player_count} Players</p>
                        <p className="text-label">Active</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-secondary-content" />
                      <div>
                        <p className="text-xs text-white font-bold">
                          {formatDbTimeRange(session.slot_start_time, session.slot_end_time)}
                        </p>
                        <p className="text-label">Booked slot</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Timer className={`h-3.5 w-3.5 ${isOvertime ? 'text-red-400' : 'text-green-500'}`} />
                      <div>
                        <p className={`text-xs font-black ${isOvertime ? 'text-red-400' : 'text-green-500'}`}>
                          {timeRemaining}
                        </p>
                        <p className="text-label">Time remaining</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-muted-content">No active sessions</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
