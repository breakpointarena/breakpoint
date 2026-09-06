"use client";

import { AlertTriangle, BadgeCheck, CalendarClock, Clock, IndianRupee, Timer, TimerOff, Undo2, UserX } from "lucide-react";
import { bookingAttention, type BookingAttention } from "@/lib/bookings/attention";

const ICONS = {
  never_checked_out: Clock,
  no_show: UserX,
  unpaid: IndianRupee,
  starting_soon: CalendarClock,
  ending_soon: Timer,
  overrunning: TimerOff,
  refund_due: Undo2,
  refunded: BadgeCheck,
} as const;

/**
 * Red for money already lost or a station silently tied up, amber for something
 * that only needs tidying, green for a job already done. Staff scan this list all
 * day; three levels they can tell apart at a glance beat five they have to read.
 */
const TONE = {
  high: "border-red-500/40 bg-red-500/10 text-red-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  // Settled, not urgent: green so a refunded booking reads as finished rather
  // than as one more thing on the pile.
  info: "border-green-500/40 bg-green-500/10 text-green-300",
} as const;

export function AttentionBadge({ flag, compact = false }: { flag: BookingAttention; compact?: boolean }) {
  const Icon = ICONS[flag.kind] ?? AlertTriangle;

  return (
    <span
      title={flag.detail || undefined}
      className={`inline-flex items-center gap-1.5 rounded-md border font-bold uppercase tracking-wide ${
        TONE[flag.severity]
      } ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"}`}
    >
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {flag.label}
    </span>
  );
}

/**
 * Every unfinished-booking warning for a row, or nothing at all.
 *
 * Renders null rather than an empty wrapper so a healthy booking costs no layout
 * - most of the list is healthy, and a row of blank gaps reads as broken.
 */
export function AttentionBadges({
  booking,
  compact = false,
  className = "",
}: {
  booking: Parameters<typeof bookingAttention>[0];
  compact?: boolean;
  className?: string;
}) {
  const flags = bookingAttention(booking);
  if (flags.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {flags.map((flag) => (
        <AttentionBadge key={flag.kind} flag={flag} compact={compact} />
      ))}
    </div>
  );
}

/**
 * The same warnings spelled out, for the detail view where there is room to say
 * what to do about them.
 */
export function AttentionPanel({ booking }: { booking: Parameters<typeof bookingAttention>[0] }) {
  const flags = bookingAttention(booking);
  if (flags.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-400">
        <AlertTriangle className="h-4 w-4" />
        Needs attention
      </p>
      {flags.map((flag) => (
        <div key={flag.kind} className="space-y-1">
          <AttentionBadge flag={flag} />
          {flag.detail && (
            <p className="text-sm text-secondary-content leading-relaxed">{flag.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}
