import { AlertCircle } from "lucide-react";
import DashboardClient from "@/components/admin/dashboard/DashboardClient";
import { getDashboardData } from "./actions";

/**
 * The dashboard's data is fetched here, on the server, while the page renders.
 *
 * It used to be fetched from a `useEffect` in the client component, which meant
 * nothing was requested until the browser had downloaded the bundle and
 * hydrated - the fetch was queued behind the JavaScript rather than racing it,
 * and the operator watched a spinner for the whole of both. Fetching during the
 * render puts the figures in the HTML, so the page arrives populated.
 *
 * The client component still owns everything interactive: the stat modals, the
 * refresh button, and the refetch when the tab regains focus. It just starts
 * from real data instead of from nothing.
 */
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const result = await getDashboardData();

  if (!result.success) {
    /**
     * Rendered rather than thrown. A failure here is almost always a transient
     * database or auth blip, and an error boundary would replace the whole admin
     * shell - navigation included - leaving no way out but the back button.
     */
    return (
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase tracking-wider text-red-400 text-sm">
              Could not load the dashboard
            </p>
            <p className="text-sm text-secondary-content mt-1 leading-relaxed">
              {result.error || "Something went wrong fetching today's figures."}
            </p>
            <p className="text-sm text-muted-content mt-3">
              Reload the page to try again. Bookings and check-ins are unaffected.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardClient
      initialData={{
        stats: result.stats,
        quickStats: result.quickStats,
        recentBookings: result.recentBookings,
        schedule: result.schedule,
      }}
    />
  );
}
