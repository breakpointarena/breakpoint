"use client";

import { useEffect, useState } from "react";
import { Clock, LogIn, LogOut, PlayCircle, ReceiptIndianRupee } from "lucide-react";
import { formatPlayedDuration, sessionTimes } from "@/lib/bookings/walkInSession";
import { formatClockTime12h } from "@/lib/utils/dates";
import { formatDbTimeRange } from "@/lib/utils/timeSlots";

/**
 * The three times a walk-in has, told apart.
 *
 * Staff confusing the moment a booking was typed in with the moment the customer
 * started playing is the whole reason this exists: a walk-in created at 8:55 for
 * somebody who sat down at 9:00 must never read as 1h50m of play at 10:45. Every
 * screen that shows one of these times shows it labelled.
 */

export interface SessionTimes {
  createdAt: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
}

const timeOnly = (value: string) => formatClockTime12h(value);

/**
 * Minutes of play, from check-in to checkout or to right now.
 *
 * Rounds up, and never returns zero, because that is exactly what
 * `checkout_walkin_session` does when it decides what to charge
 * (`GREATEST(1, CEIL(...))`). This used to floor, so a session of six minutes
 * and forty-seven seconds was billed as seven minutes and displayed as "6m" -
 * two numbers for one session, on the same screen, with the smaller one next to
 * the larger bill.
 */
export function sessionMinutes(checkedInAt: string, completedAt?: string | null): number {
  const start = new Date(checkedInAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  return Math.max(1, Math.ceil((end - start) / 60000));
}

/**
 * Counts up while the customer is playing.
 *
 * Ticks every ten seconds rather than every second: the figure is shown to the
 * minute, so a faster clock would only cost renders.
 */
export function SessionTimer({ checkedInAt }: { checkedInAt: string }) {
  const [minutes, setMinutes] = useState(() => sessionMinutes(checkedInAt));

  useEffect(() => {
    setMinutes(sessionMinutes(checkedInAt));
    const ticker = setInterval(() => setMinutes(sessionMinutes(checkedInAt)), 10_000);
    return () => clearInterval(ticker);
  }, [checkedInAt]);

  return <>{formatPlayedDuration(minutes)}</>;
}

/**
 * The two ends of a session, each in its own colour.
 *
 * Mirrors how the payment badge already stacks "Paid:" and "Due:" in different
 * colours, and reuses the colours the timeline and the detail panel already give
 * these two events - green for the clock starting, blue for it stopping - so a
 * glance at the list tells staff which time they are reading without them having
 * to parse the label.
 *
 * Renders nothing for a fixed booking; the caller falls back to its slot range.
 */
export function SessionTimesCell({
  booking
}: {
  booking: {
    billed_on_actual_time?: boolean | null;
    status?: string | null;
    checked_in_at?: string | null;
    completed_at?: string | null;
  };
}) {
  const times = sessionTimes(booking);
  if (!times) return null;

  if (!times.checkedInAt) {
    return <span className="text-amber-400 font-semibold">Not checked in</span>;
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-green-400 font-semibold">In: {times.checkedInAt}</span>
      {times.completedAt && (
        <span className="text-blue-400 font-semibold">Out: {times.completedAt}</span>
      )}
    </span>
  );
}

/**
 * Where a session has got to, for the booking list and the grid card.
 *
 * Two lines while it runs - how long, then when it started - and three once it
 * has stopped. The duration carries its own colour and the clock times carry
 * theirs (green in, blue out), so a glance separates "2h 15m of play" from
 * "9:00 PM" without either being read as the other.
 */
export function SessionSummaryLine({
  status,
  createdAt,
  checkedInAt,
  completedAt
}: SessionTimes & { status: string }) {
  if (status === "confirmed") {
    return (
      <span className="flex items-center gap-1.5 text-amber-400">
        <Clock className="h-3 w-3" />
        Not checked in{createdAt ? ` · booked ${timeOnly(createdAt)}` : ""}
      </span>
    );
  }

  if (status === "checked_in" && checkedInAt) {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-white font-semibold">
          {/* The icon keeps the live green; the duration does not, so it cannot
              be misread as another clock time. */}
          <PlayCircle className="h-3 w-3 text-green-400" />
          Playing <SessionTimer checkedInAt={checkedInAt} />
        </span>
        <span className="text-green-400 font-semibold">In: {timeOnly(checkedInAt)}</span>
      </span>
    );
  }

  if (checkedInAt && completedAt) {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-secondary-content">
          <LogOut className="h-3 w-3" />
          Played {formatPlayedDuration(sessionMinutes(checkedInAt, completedAt))}
        </span>
        <span className="text-green-400 font-semibold">In: {timeOnly(checkedInAt)}</span>
        <span className="text-blue-400 font-semibold">Out: {timeOnly(completedAt)}</span>
      </span>
    );
  }

  // Checked in but in some other state - cancelled, no-show, anything the
  // three cases above do not name. The time is still the useful fact, so it
  // is shown labelled rather than dropped.
  if (checkedInAt) {
    return (
      <span className="flex items-center gap-1.5 text-green-400">
        <LogIn className="h-3 w-3" />
        In: {timeOnly(checkedInAt)}
      </span>
    );
  }

  return null;
}

/**
 * What the bookings list shows in its date/time column.
 *
 * A walk-in has two different times and staff need the one that actually
 * happened: the grid has shown "Playing 2h 15m · since 9:00 AM" since walk-in
 * sessions were added, while the list showed only the slot the booking was
 * filed against - so the same session read differently depending on which view
 * was open. Both views now answer with the same line.
 *
 * For a fixed booking the agreed slot is still the headline, because that is
 * what was sold; the actual check-in and checkout go underneath it, labelled,
 * once they exist.
 */
export function BookingTimingCell({
  booking,
  slot,
}: {
  booking: {
    billed_on_actual_time?: boolean | null;
    status?: string | null;
    created_at?: string | null;
    checked_in_at?: string | null;
    completed_at?: string | null;
  };
  slot?: { slot_start_time?: string | null; slot_end_time?: string | null } | null;
}) {
  if (booking.billed_on_actual_time) {
    return (
      <SessionSummaryLine
        status={booking.status || ""}
        createdAt={booking.created_at || null}
        checkedInAt={booking.checked_in_at || null}
        completedAt={booking.completed_at || null}
      />
    );
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span>
        {slot
          ? formatDbTimeRange(slot.slot_start_time, slot.slot_end_time)
          : booking.created_at
            ? timeOnly(booking.created_at)
            : "N/A"}
      </span>
      {booking.checked_in_at && (
        <span className="text-green-400 font-semibold">In: {timeOnly(booking.checked_in_at)}</span>
      )}
      {booking.completed_at && (
        <span className="text-blue-400 font-semibold">Out: {timeOnly(booking.completed_at)}</span>
      )}
    </span>
  );
}

/** The full timeline, for the booking details screen. */
export function SessionTimeline({
  status,
  createdAt,
  checkedInAt,
  completedAt,
  totalAmount
}: SessionTimes & { status: string; totalAmount?: number | null }) {
  const steps: Array<{
    icon: React.ReactNode;
    label: string;
    value: string;
    note?: string;
    tone: string;
  }> = [];

  if (createdAt) {
    steps.push({
      icon: <ReceiptIndianRupee className="h-3.5 w-3.5" />,
      label: "Walk-in created",
      value: timeOnly(createdAt),
      note: "Not billable",
      tone: "text-muted-content"
    });
  }

  if (checkedInAt) {
    steps.push({
      icon: <LogIn className="h-3.5 w-3.5" />,
      label: "Checked in",
      value: timeOnly(checkedInAt),
      note: "Billing starts here",
      tone: "text-green-400"
    });
  } else {
    steps.push({
      icon: <Clock className="h-3.5 w-3.5" />,
      label: "Waiting for check-in",
      value: "—",
      note: "Customer has not started playing",
      tone: "text-amber-400"
    });
  }

  if (status === "checked_in" && checkedInAt) {
    steps.push({
      icon: <PlayCircle className="h-3.5 w-3.5" />,
      label: "Playing",
      value: `${timeOnly(checkedInAt)} – now`,
      note: "Bill is calculated at checkout",
      tone: "text-green-400"
    });
  }

  if (completedAt) {
    steps.push({
      icon: <LogOut className="h-3.5 w-3.5" />,
      label: "Checked out",
      value: timeOnly(completedAt),
      note: "Billing stops here",
      tone: "text-blue-400"
    });
  }

  const played =
    checkedInAt && (completedAt || status === "checked_in")
      ? formatPlayedDuration(sessionMinutes(checkedInAt, completedAt))
      : null;

  return (
    <div className="bg-[var(--background)]/40 border border-zinc-900 rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-black uppercase tracking-wider text-muted-content">
        Session timeline
      </h4>

      <div className="space-y-2">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-start gap-3">
            <div className={`mt-0.5 ${step.tone}`}>{step.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-xs font-black uppercase tracking-wide ${step.tone}`}>
                  {step.label}
                </span>
                <span className="text-sm font-bold text-white font-mono">{step.value}</span>
              </div>
              {step.note && <p className="text-[11px] text-muted-content mt-0.5">{step.note}</p>}
            </div>
          </div>
        ))}
      </div>

      {played && checkedInAt && (
        <div className="border-t border-zinc-900 pt-3 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-white">
              {completedAt ? "Billed on" : "Billing on"}
            </span>
            <span className="text-sm font-bold text-primary font-mono">
              {timeOnly(checkedInAt)} – {completedAt ? timeOnly(completedAt) : "now"}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-secondary-content">Actual usage</span>
            <span className="text-sm font-black text-white">
              {status === "checked_in" && !completedAt ? (
                <SessionTimer checkedInAt={checkedInAt} />
              ) : (
                played
              )}
            </span>
          </div>
          {completedAt && typeof totalAmount === "number" && (
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-secondary-content">Amount charged</span>
              <span className="text-lg font-black text-primary font-mono">
                ₹{Number(totalAmount).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
