"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
  getBookingWindowDates,
  isDateWithinBookingWindow,
  isSameLocalDay,
  msUntilNextLocalMidnight,
  BOOKING_WINDOW_DAYS
} from "@/lib/utils/dates";

interface DateSelectorProps {
  selected?: Date;
  onSelect: (date: Date) => void;
  className?: string;
}

export function DateSelector({ selected, onSelect, className }: DateSelectorProps) {
  const [dates, setDates] = useState<Date[]>([]);

  // onSelect is called from the midnight rollover, which must not re-subscribe
  // its timers every time the parent hands over a new callback identity.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const refresh = () => {
      const next = getBookingWindowDates();
      // Keep the old array when the day has not actually changed, so a tab
      // regaining focus does not re-render the whole row for nothing.
      setDates((prev) => (prev.length > 0 && isSameLocalDay(prev[0], next[0]) ? prev : next));
      clearTimeout(timeoutId);
      timeoutId = setTimeout(refresh, msUntilNextLocalMidnight());
    };

    // Background tabs get their timers throttled and sleeping devices skip them
    // entirely, so re-check whenever the page comes back into view.
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  // A date picked before the rollover can now be in the past - move the
  // selection to today, which also refetches that day's slots.
  useEffect(() => {
    if (dates.length === 0 || !selected) return;
    const bookingWindow = { start: dates[0], end: dates[dates.length - 1] };
    if (!isDateWithinBookingWindow(selected, bookingWindow)) {
      onSelectRef.current(dates[0]);
    }
  }, [dates, selected]);

  if (dates.length === 0) {
    return (
      <div className={cn("flex gap-1.5 md:gap-2", className)} aria-hidden="true">
        {Array.from({ length: BOOKING_WINDOW_DAYS }).map((_, index) => (
          <div
            key={index}
            className="h-[60px] md:h-[68px] flex-1 min-w-0 rounded-xl bg-[#111] border border-zinc-900 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Select booking date"
      className={cn("flex gap-1.5 md:gap-2", className)}
    >
      {dates.map((date) => {
        const isSelected = !!selected && isSameLocalDay(date, selected);
        return (
          <button
            key={date.toISOString()}
            type="button"
            aria-pressed={isSelected}
            aria-label={date.toLocaleDateString("en-US", {
              weekday: "long",
              day: "numeric",
              month: "long"
            })}
            onClick={() => onSelect(date)}
            className={cn(
              // flex-1 + min-w-0 keeps all seven pills on one row at any width
              "flex-1 min-w-0 px-1 py-2 md:px-2 md:py-2.5 border rounded-xl flex flex-col items-center justify-center leading-none transition-all duration-300",
              isSelected
                ? "bg-gradient-to-b from-primary via-yellow-400 to-primary border-transparent text-black shadow-[0_4px_20px_rgba(255,193,7,0.4)]"
                : "bg-[#111] border-zinc-900 text-zinc-300 hover:border-primary/50 hover:bg-gradient-to-b hover:from-primary/10 hover:to-yellow-400/10 hover:shadow-[0_0_15px_rgba(255,193,7,0.2)]"
            )}
          >
            <span
              className={cn(
                "text-[11px] md:text-xs font-black uppercase tracking-wide md:tracking-widest",
                isSelected ? "text-black/70" : "text-zinc-400"
              )}
            >
              {date.toLocaleDateString("en-US", { weekday: "short" })}
            </span>
            <span
              className={cn(
                "my-1 text-base md:text-xl font-black",
                isSelected ? "text-black" : "text-white"
              )}
            >
              {date.getDate()}
            </span>
            <span
              className={cn(
                "text-[11px] md:text-xs font-black uppercase tracking-wide md:tracking-widest",
                isSelected ? "text-black/70" : "text-zinc-400"
              )}
            >
              {date.toLocaleDateString("en-US", { month: "short" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default DateSelector;
