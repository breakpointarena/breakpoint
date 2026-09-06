"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { CurrencyCountUp } from "@/components/shared/CountUp";

/**
 * A money figure that stays hidden until someone asks for it.
 *
 * The dashboard is open on a screen at the front desk, where customers and
 * anyone else in the room can read it. Takings are not something to broadcast
 * by default, so the figure is masked on load and revealed by a deliberate
 * press.
 *
 * Hiding resets on every mount rather than persisting: "the dashboard opened
 * and the day's takings were on show" is the thing being fixed, so a fresh load
 * has to start covered. The reports page is deliberately left alone - it is
 * opened on purpose to look at exactly this.
 */
interface RevealAmountProps {
  amount: number;
  /** Screen-reader label, e.g. "today's revenue". */
  label: string;
  className?: string;
}

export function RevealAmount({ amount, label, className = "" }: RevealAmountProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <button
      type="button"
      // The card behind this opens a detail modal; revealing the figure is a
      // separate intent and must not trigger it.
      onClick={(e) => {
        e.stopPropagation();
        setRevealed((v) => !v);
      }}
      aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={revealed}
      title={revealed ? "Hide amount" : "Show amount"}
      className={`group flex items-center gap-2 rounded-lg -mx-1 px-1 py-0.5 transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/40 ${className}`}
    >
      {revealed ? (
        <CurrencyCountUp amount={amount} duration={1200} />
      ) : (
        // Fixed-width mask so revealing does not shunt the card's layout about.
        <span className="tracking-[0.2em] select-none" aria-hidden="true">
          ₹ ••••••
        </span>
      )}
      {revealed ? (
        <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-content opacity-0 group-hover:opacity-100 transition-opacity" />
      ) : (
        <Eye className="h-3.5 w-3.5 shrink-0 text-muted-content" />
      )}
    </button>
  );
}

export default RevealAmount;
