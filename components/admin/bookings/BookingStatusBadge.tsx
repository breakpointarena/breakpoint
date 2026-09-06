interface BookingStatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
}

export function BookingStatusBadge({ status, size = "md" }: BookingStatusBadgeProps) {
  const statusClean = String(status || "").toLowerCase().trim();

  const sizeClasses = {
    sm: "text-[11px] px-1.5 py-0.5",
    md: "text-[11px] px-2 py-0.5",
    lg: "text-xs px-2.5 py-1"
  };

  if (statusClean === "confirmed") {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} font-bold text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded-full whitespace-nowrap uppercase tracking-wide transition-all duration-300`}>
        <span className="w-1 h-1 rounded-full bg-blue-400" />
        CONFIRMED
      </span>
    );
  }

  if (statusClean === "checked_in") {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} font-bold text-green-300 bg-green-500/10 border border-green-500/30 rounded-full whitespace-nowrap uppercase tracking-wide transition-all duration-300`}>
        <span className="w-1 h-1 rounded-full bg-green-400" />
        CHECKED IN
      </span>
    );
  }

  if (statusClean === "completed") {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} font-bold text-muted-content bg-zinc-500/10 border border-zinc-500/30 rounded-full whitespace-nowrap uppercase tracking-wide transition-all duration-300`}>
        <span className="w-1 h-1 rounded-full bg-zinc-400" />
        COMPLETED
      </span>
    );
  }

  if (statusClean === "locked") {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full whitespace-nowrap uppercase tracking-wide transition-all duration-300`}>
        <span className="w-1 h-1 rounded-full bg-amber-400" />
        LOCKED
      </span>
    );
  }

  // Red rather than the grey "unknown" chip: a cancelled booking is a decision
  // somebody made, and staff scanning the list need to see it as different from
  // a booking that simply finished.
  if (statusClean === "cancelled") {
    return (
      <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-full whitespace-nowrap uppercase tracking-wide transition-all duration-300`}>
        <span className="w-1 h-1 rounded-full bg-red-400" />
        CANCELLED
      </span>
    );
  }

  // Default/Unknown status
  return (
    <span className={`inline-flex items-center gap-1 ${sizeClasses[size]} font-black text-muted-content bg-black/60 border border-zinc-700 rounded-full backdrop-blur-md whitespace-nowrap uppercase tracking-wide`}>
      <span className="w-1 h-1 rounded-full bg-zinc-500" />
      {statusClean.toUpperCase()}
    </span>
  );
}
