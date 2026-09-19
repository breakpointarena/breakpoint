"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimeOfDayField } from "@/components/ui/time-of-day-field";
import { LogOut, Loader2, Clock } from "lucide-react";
import { arenaClockTime, arenaToday, formatClockTime12h } from "@/lib/utils/dates";
import { formatPlayedDuration, resolveCheckoutTime } from "@/lib/bookings/walkInSession";

/**
 * Closing a walk-in session at the time the customer actually left.
 *
 * Checkout used to be the moment of the button press and nothing else, which is
 * right up until it is not: the customer leaves at nine, the desk is busy, and
 * the session is closed at half past eleven. Those two and a half hours were
 * billed to somebody who had already gone home.
 *
 * The field opens on the current time, so the ordinary checkout is still one
 * press and reads the same as it always did. What matters is that an untouched
 * dialog sends *nothing* rather than the time it happened to open at - the
 * database clock still decides, the row is not marked as stated, and a dialog
 * left open for ten minutes cannot quietly shave ten minutes off the bill.
 *
 * Shared by the bookings list and the detail modal, because two copies of a
 * money decision is one more than anybody can keep in step.
 */

export interface CheckOutTarget {
  id: string;
  booking_number?: string | null;
  customer_name?: string | null;
  checked_in_at?: string | null;
  deviceLabel?: string | null;
}

/** Minutes between two arena wall-clock stamps, for the preview only. */
function minutesBetween(from: string, to: string): number | null {
  const parse = (stamp: string) => {
    const m = stamp.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    // Read as UTC deliberately: both sides are arena readings, so the zone
    // cancels and no host offset can get in. The billed figure comes back from
    // the database regardless - this is what the desk sees before it commits.
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null;
  };
  const a = parse(from);
  const b = parse(to);
  return a === null || b === null ? null : b - a;
}

export function CheckOutSessionDialog({
  target,
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: {
  target: CheckOutTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `statedEnd` is undefined when the desk did not touch the time. */
  onConfirm: (statedEnd?: { date: string; clock: string }) => void;
  loading?: boolean;
}) {
  const [date, setDate] = useState("");
  const [clock, setClock] = useState("");
  /** Whether anybody has moved either field. Untouched means "use the clock". */
  const [touched, setTouched] = useState(false);

  // Reset to the present every time the dialog opens, rather than keeping what
  // was typed for the last customer - which would be a stale time attached to
  // the wrong session, and priced without complaint.
  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setDate(arenaToday(now));
    setClock(arenaClockTime(now).slice(0, 5));
    setTouched(false);
  }, [open, target?.id]);

  const resolved = useMemo(
    () =>
      target
        ? resolveCheckoutTime({ date, clock, checkedInAt: target.checked_in_at })
        : null,
    [target, date, clock]
  );

  const played = useMemo(() => {
    if (!target?.checked_in_at || !resolved?.ok) return null;
    const started = new Date(target.checked_in_at);
    const mins = minutesBetween(
      `${arenaToday(started)} ${arenaClockTime(started)}`,
      `${date} ${clock}`
    );
    return mins === null ? null : formatPlayedDuration(mins);
  }, [target, resolved, date, clock]);

  const blocked = Boolean(touched && resolved && !resolved.ok);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--background)] border-2 border-primary/40 text-white max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight">
            <LogOut className="h-5 w-5 text-primary" /> Check out session
          </DialogTitle>
          <DialogDescription className="text-secondary-content">
            The bill is the time between check-in and this moment. Change it only if
            the customer left earlier than now.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            <div className="bg-[var(--surface)] border border-[#27272a] rounded-lg p-4 space-y-1">
              <p className="text-sm font-black text-primary font-mono">{target.booking_number}</p>
              <p className="text-sm text-white">{target.customer_name}</p>
              <p className="text-label flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                In at {target.checked_in_at ? formatClockTime12h(target.checked_in_at) : "—"}
                {target.deviceLabel ? ` • ${target.deviceLabel}` : ""}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-label text-muted-content">Left at</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setTouched(true); }}
                  // A session that ran past midnight ends on the following date,
                  // and one forgotten since Friday ends on Friday - so the date
                  // is a field, not an assumption.
                  className="h-10 rounded-md border border-[#27272a] bg-[var(--surface)] px-2 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <TimeOfDayField
                  name="checkout-clock"
                  label="Time the customer left"
                  defaultValue={clock}
                  emptyBase={clock}
                  onChange={(time24) => { setClock(time24); setTouched(true); }}
                />
              </div>

              {blocked ? (
                <p className="text-xs font-bold text-red-400">{(resolved as any).error}</p>
              ) : (
                <p className="text-xs text-muted-content">
                  {played ? `${played} played.` : " "}
                  {touched ? " Recorded as a stated checkout." : " Using the current time."}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="border-[#27272a] text-secondary-content hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={() =>
              // Untouched sends nothing at all: the database clock decides, and
              // the row is not marked as a stated checkout.
              onConfirm(touched && resolved?.ok ? { date: resolved.date, clock: resolved.clock } : undefined)
            }
            disabled={loading || blocked}
            className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-black uppercase text-xs"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
