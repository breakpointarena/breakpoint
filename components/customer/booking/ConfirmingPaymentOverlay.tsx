"use client";

import { useEffect } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * Covers the screen between Razorpay closing and the booking being confirmed.
 *
 * This is the one moment in the flow where the customer's money has moved but
 * their booking does not exist yet: the payment succeeded, and the browser is
 * still telling our server about it. Closing the tab here used to look, to the
 * customer, exactly like a successful payment that lost their slot.
 *
 * The webhook is the real safety net - it fulfils the order regardless of what
 * the browser does - but it is a recovery path measured in seconds to minutes,
 * and a customer standing at the counter will not wait. Holding them still for
 * the second or two this takes is much the better outcome.
 *
 * Deliberately not dismissible: there is nothing useful to do here but wait.
 */
export function ConfirmingPaymentOverlay({ show }: { show: boolean }) {
  // Native "leave site?" prompt, for the tab close and the reload that this
  // overlay cannot intercept on its own.
  useEffect(() => {
    if (!show) return;

    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers ignore custom text now and show their own wording, but the
      // value still has to be set for the prompt to appear at all.
      e.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Confirming your payment"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm px-6 animate-in fade-in duration-200"
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/30 blur-2xl animate-pulse" />
            <Loader2 className="relative h-16 w-16 animate-spin text-primary" />
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-black uppercase text-white tracking-tight">
            Confirming your payment
          </h2>
          <p className="text-base font-bold text-primary">
            Please do not close or refresh this page
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Your payment went through and we are reserving your slot. This takes
            just a moment.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 pt-2 border-t border-zinc-800">
          <ShieldCheck className="h-3.5 w-3.5 text-zinc-600" />
          <span>Payment received — securing your booking</span>
        </div>
      </div>
    </div>
  );
}

export default ConfirmingPaymentOverlay;
