export function StatusBadge({ status }: { status: string }) {
  const clean = String(status || "").toLowerCase().trim();

  if (clean === 'available') {
    return (
      <span className="inline-flex px-2 py-1 text-xs font-bold text-primary border border-primary/30 rounded uppercase bg-primary/5">
        Available
      </span>
    );
  }

  if (clean === 'occupied') {
    return (
      <span className="inline-flex px-2 py-1 text-xs font-bold text-[#a1a1aa] border border-[#a1a1aa]/30 rounded uppercase bg-[#a1a1aa]/5">
        Occupied
      </span>
    );
  }

  if (clean === 'maintenance') {
    return (
      <span className="inline-flex px-2 py-1 text-xs font-bold text-[#f43f5e] border border-[#f43f5e]/30 rounded uppercase bg-[#f43f5e]/5">
        Maintenance
      </span>
    );
  }

  return (
    <span className="inline-flex px-2 py-1 text-xs font-bold text-secondary-content border border-zinc-700 rounded uppercase">
      Inactive
    </span>
  );
}
