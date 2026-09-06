"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookingsTimeline } from "@/components/admin/bookings/BookingsTimeline";
import { BookingDetailModal } from "@/components/admin/bookings/BookingDetailModal";
import { getTimelineBookings } from "@/app/(admin)/admin/bookings/actions";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { BreakpointLoader } from "@/components/shared/BreakpointLoader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export default function TimelinePage() {
  const [timelineDate, setTimelineDate] = useState(new Date());
  const [timelineBookings, setTimelineBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [openFoodModal, setOpenFoodModal] = useState(false);

  useEffect(() => {
    loadTimelineBookings();
  }, [timelineDate]);

  const loadTimelineBookings = async () => {
    setLoading(true);
    const year = timelineDate.getFullYear();
    const month = String(timelineDate.getMonth() + 1).padStart(2, '0');
    const day = String(timelineDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const result = await getTimelineBookings(dateStr);
    if (result.success) {
      setTimelineBookings(result.bookings);
    } else {
      toast.error("Failed to load timeline", { description: result.error });
    }
    setLoading(false);
  };

  const goToPreviousDay = () => {
    const newDate = new Date(timelineDate);
    newDate.setDate(newDate.getDate() - 1);
    setTimelineDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(timelineDate);
    newDate.setDate(newDate.getDate() + 1);
    setTimelineDate(newDate);
  };

  const goToToday = () => {
    setTimelineDate(new Date());
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isToday = timelineDate.toDateString() === new Date().toDateString();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">
            Bookings Timeline
          </h1>
          <p className="text-sm text-secondary-content mt-1">Visual timeline of all bookings</p>
        </div>
      </div>

      {/* Date Navigation */}
      <Card className="bg-[var(--surface)] border-[#27272a] p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              onClick={goToPreviousDay}
              size="sm"
              className="bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-white border border-[#27272a] h-9 px-3"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[#27272a] rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold text-white">
                    {formatDate(timelineDate)}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3 bg-[var(--background)] border border-zinc-800 rounded-xl shadow-2xl" align="start">
                <CalendarComponent
                  mode="single"
                  selected={timelineDate}
                  onSelect={(date) => date && setTimelineDate(date)}
                  className="text-white"
                />
              </PopoverContent>
            </Popover>

            <Button
              onClick={goToNextDay}
              size="sm"
              className="bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-white border border-[#27272a] h-9 px-3"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {!isToday && (
            <Button
              onClick={goToToday}
              size="sm"
              className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase text-xs h-9 px-4"
            >
              Today
            </Button>
          )}
        </div>
      </Card>

      {/* Timeline */}
      {loading ? (
        <div className="h-96 flex items-center justify-center">
          <BreakpointLoader size="lg" text="Loading Timeline..." />
        </div>
      ) : (
        <BookingsTimeline
          bookings={timelineBookings}
          selectedDate={timelineDate}
          onDateChange={setTimelineDate}
          onBookingClick={(booking) => {
            setSelectedBooking(booking);
          }}
        />
      )}

      {/* Booking Detail Modal */}
      <BookingDetailModal
        bookingId={selectedBooking?.id || null}
        open={!!selectedBooking}
        onClose={() => {
          setSelectedBooking(null);
          setOpenFoodModal(false);
        }}
        onUpdate={() => {
          loadTimelineBookings();
        }}
        openFoodModalDirectly={openFoodModal}
      />
    </div>
  );
}
