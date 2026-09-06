import { formatCurrency } from "@/lib/currency";

interface PaymentStatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
  /**
   * Pass both to show what has been collected and what is still owed underneath a
   * partial badge. "Partial" on its own tells staff a booking is short but not by
   * how much, which is the number they need at the counter. Omit them where the
   * split is shown separately, as the booking detail panel does.
   */
  amountPaid?: number | null;
  balanceDue?: number | null;
  /**
   * The booking's own status, so a cancelled one can stop claiming money is
   * owed on it. Optional: everywhere else the payment status says it all.
   */
  bookingStatus?: string | null;
}

export function PaymentStatusBadge({
  status,
  size = "md",
  amountPaid,
  balanceDue,
  bookingStatus,
}: PaymentStatusBadgeProps) {
  const sizeClasses = {
    sm: "text-[11px] px-2 py-0.5",
    md: "text-xs px-2.5 py-1",
    lg: "text-xs px-3 py-1.5",
  };

  const statusConfig = {
    paid: {
      label: "Paid",
      bgClass: "bg-green-500/10 border-green-500/30 text-green-400",
    },
    pending: {
      label: "Pending",
      bgClass: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    },
    partial: {
      label: "Partial",
      bgClass: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    },
    failed: {
      label: "Failed",
      bgClass: "bg-red-500/10 border-red-500/30 text-red-400",
    },
    refunded: {
      label: "Refunded",
      bgClass: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    },
  };

  /**
   * A cancelled booking nobody paid for owes nothing, so "Pending" was a bill
   * that will never be collected sitting in amber next to a cancelled row -
   * staff chasing money that was never due. Grey, and says so.
   *
   * Cancelled bookings that *were* paid keep their real status: the money is a
   * fact, and the refund flag beside it is what says the job is unfinished.
   */
  const nothingToCollect =
    String(bookingStatus ?? "").toLowerCase() === "cancelled" &&
    (status === "pending" || !status);

  const config = nothingToCollect
    ? {
        label: "No charge",
        bgClass: "bg-zinc-500/10 border-zinc-500/30 text-muted-content",
      }
    : statusConfig[status as keyof typeof statusConfig] || {
        label: status,
        bgClass: "bg-zinc-500/10 border-zinc-500/30 text-muted-content",
      };

  const badge = (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-wider rounded-md border ${config.bgClass} ${sizeClasses[size]}`}
    >
      {config.label}
    </span>
  );

  // Checked explicitly rather than by truthiness: a bare `amountPaid &&` in JSX
  // renders a literal 0 when the value is zero.
  const showSplit =
    status === "partial" &&
    (amountPaid !== undefined && amountPaid !== null) &&
    (balanceDue !== undefined && balanceDue !== null);

  if (!showSplit) return badge;

  return (
    <div className="space-y-0.5">
      {badge}
      <p className="text-xs text-blue-400">Paid: ₹{formatCurrency(amountPaid ?? 0)}</p>
      <p className="text-xs text-amber-400 font-semibold">Due: ₹{formatCurrency(balanceDue ?? 0)}</p>
    </div>
  );
}
