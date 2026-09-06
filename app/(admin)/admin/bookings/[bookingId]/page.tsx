"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BookingDetailModal } from "@/components/admin/bookings/BookingDetailModal";

/**
 * Standalone booking detail page.
 *
 * The dashboard stat modals (Today's Revenue, Active Sessions, Upcoming
 * Bookings) open this route in a new tab, so a booking is never a second dialog
 * on top of the one already open.
 *
 * The panel is BookingDetailModal in `variant="page"`, so this page and the
 * in-place modal on /admin/bookings can never drift apart.
 */
export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const router = useRouter();

  // Bumped after any action so the panel refetches, mirroring how the bookings
  // list passes onUpdate to refresh itself.
  const [, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8 bg-[var(--background)] min-h-screen text-white animate-in fade-in duration-500">
      <BookingDetailModal
        variant="page"
        bookingId={bookingId}
        open
        onClose={() => router.push("/admin/bookings")}
        onUpdate={() => setRefreshKey((n) => n + 1)}
        headerSlot={
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-content hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            All Bookings
          </Link>
        }
      />
    </div>
  );
}
