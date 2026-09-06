"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Award, ChevronDown, LogOut, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { signOutCustomerAction } from "@/app/(customer)/booking/otp-actions";
import {
  getCustomerHeaderStateShared,
  notifyCustomerSessionChanged,
  subscribeToCustomerSession,
} from "@/lib/auth/customer-session-client";
import type { ActivePlanSummary } from "@/app/(customer)/my-subscription/action";

/**
 * Who is signed in, what they are a member of, and the way out.
 *
 * A twelve-hour session is a convenience on a personal phone and a liability on
 * a shared one, so the way out has to be visible rather than buried. The
 * membership sits beside it because it is the thing the header was silent about:
 * the discount applies automatically at checkout, so a customer had no way of
 * telling whether it was still running without opening the account page.
 *
 * Renders nothing at all when there is no session, so the header is unchanged
 * for someone who has not verified. A verified customer with no membership gets
 * the same control with the plan block replaced by a way to buy one - the menu
 * never disappears just because there is nothing to renew.
 */

/** "2026-09-17" -> "17-09-2026", read off the string so no zone is involved. */
function formatDayFirst(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((isoDate ?? "").trim());
  if (!match) return "—";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** "22 days", "1 day", and the last day of a membership said as such. */
function formatDaysLeft(days: number): string {
  if (days <= 0) return "Last day";
  return days === 1 ? "1 day" : `${days} days`;
}

export function CustomerSessionMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phone, setPhone] = useState<string | null>(null);
  const [plan, setPlan] = useState<ActivePlanSummary | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Newest lookup wins.
   *
   * Two of these can now be in flight at once - a route change and a customer
   * verifying land close together - and the slower one must not paint its older
   * answer over the newer one.
   */
  const latestRequest = useRef(0);

  const refreshSession = useCallback(() => {
    const request = ++latestRequest.current;

    // One request, not two. This runs on every route change - a static legal
    // page included - and it used to ask for the session and the membership as
    // two Server Functions side by side. Each resolved the session cookie
    // separately, so one question cost two round trips and two validations.
    // `getCustomerHeaderState` answers both from a single session lookup.
    getCustomerHeaderStateShared()
      .then((state) => {
        if (request !== latestRequest.current) return;
        setPhone(state.phone);
        // A membership without a live session is not shown; the server already
        // returns null for the plan in that case, and the control itself
        // renders nothing without a number.
        setPlan(state.phone ? state.plan : null);
      })
      .catch(() => {
        if (request !== latestRequest.current) return;
        setPhone(null);
        setPlan(null);
      });
  }, []);

  // Re-checked on navigation, so the control disappears once the session lapses
  // and picks up a membership bought in another tab, without a reload. Buying
  // one here is covered too: the success page is a route change.
  useEffect(() => {
    refreshSession();
  }, [pathname, refreshSession]);

  /**
   * And on the session itself changing, which navigation cannot stand in for.
   *
   * Verifying a number never changes the route - every login surface swaps a
   * step in local state on the page the customer is already on - so this control
   * kept rendering nothing, and a customer with a membership saw no plan in the
   * header until something else happened to make them navigate or reload.
   */
  useEffect(() => subscribeToCustomerSession(refreshSession), [refreshSession]);

  // The panel is a menu, so it closes the way menus do: click anywhere else, or
  // press Escape. Without the first, navigating from inside it leaves it hanging
  // open over the next page.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Closed on navigation rather than left to the outside-click handler, which
  // never fires when the route changes from a keyboard press.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!phone) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutCustomerAction();
      setPhone(null);
      setPlan(null);
      setOpen(false);
      // The other direction of the same problem: anything else on screen that
      // is showing this customer's membership has to drop it now, not on their
      // next navigation.
      notifyCustomerSessionChanged();
      toast.success("Signed Out", {
        description: "You'll need to verify your number again next time.",
      });
      // Refresh so any page holding customer data drops it immediately.
      router.refresh();
      router.push("/");
    } catch {
      toast.error("Could not sign out", { description: "Please try again." });
    } finally {
      setSigningOut(false);
    }
  };

  const masked = `+91 ${phone.slice(0, 2)}•••••${phone.slice(-3)}`;

  const go = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  /** The plan block, shared by the dropdown and the mobile sheet. */
  const planDetails = plan ? (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
        Active Plan
      </p>

      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
          <Award className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{plan.planName}</p>
          <p className="text-xs font-bold text-primary">
            {plan.discountPercentage}% off every booking
          </p>
        </div>
      </div>

      <dl className="space-y-2 rounded-xl border border-zinc-800 bg-black/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
            Valid Until
          </dt>
          <dd className="text-xs font-black text-white">{formatDayFirst(plan.endDate)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
            Time Left
          </dt>
          <dd className="text-xs font-black text-white">
            {formatDaysLeft(plan.daysRemaining)}
          </dd>
        </div>
      </dl>

      <button
        onClick={() => go("/my-subscription")}
        className="w-full rounded-xl border border-primary/60 py-2.5 text-xs font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/10"
      >
        Manage Plan
      </button>
    </div>
  ) : (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        No Active Plan
      </p>
      <p className="text-xs leading-relaxed text-zinc-400">
        Members get a discount on every booking, applied automatically at checkout.
      </p>
      <button
        onClick={() => go("/subscription")}
        className="w-full rounded-xl border border-primary/60 py-2.5 text-xs font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/10"
      >
        View Plans
      </button>
    </div>
  );

  const signOutRow = (
    <button
      onClick={handleSignOut}
      disabled={signingOut}
      className="flex w-full items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500 transition-colors hover:text-red-400 disabled:opacity-50"
    >
      {signingOut ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      Sign Out
    </button>
  );

  // The mobile menu is already a full-screen sheet, so the same content is laid
  // out flat rather than hidden behind a second thing to tap.
  if (compact) {
    return (
      <div className="space-y-4 rounded-2xl border border-zinc-800 bg-[#111111] p-4">
        <span className="flex items-center gap-2 text-sm font-bold text-white">
          <UserCheck className="h-4 w-4 text-primary" />
          {masked}
        </span>
        <div className="border-t border-zinc-900 pt-4">{planDetails}</div>
        <div className="border-t border-zinc-900 pt-4">{signOutRow}</div>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative hidden lg:block">
      <button
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Verified as +91 ${phone}`}
        className={`flex items-center gap-3 rounded-xl border px-4 py-2 text-left transition-colors ${open
          ? "border-primary/60 bg-primary/10"
          : "border-primary/25 bg-[#141110] hover:border-primary/50"
          }`}
      >
        <Award className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0">
          {/* The plan is the headline when there is one; otherwise the number
              stands on its own rather than under an empty label. */}
          {plan ? (
            <>
              <span className="block truncate text-[11px] font-black uppercase tracking-wider text-primary">
                {plan.planName}
              </span>
              <span className="block text-[10px] font-bold text-zinc-400">{masked}</span>
            </>
          ) : (
            <span className="block text-xs font-bold text-zinc-300">{masked}</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""
            }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 space-y-4 rounded-2xl border border-zinc-800 bg-[#111111] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.7)] animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-white">
            <UserCheck className="h-4 w-4 text-primary" />
            {masked}
          </span>

          <div className="border-t border-zinc-900 pt-4">{planDetails}</div>

          <div className="border-t border-zinc-900 pt-4">{signOutRow}</div>
        </div>
      )}
    </div>
  );
}

export default CustomerSessionMenu;
