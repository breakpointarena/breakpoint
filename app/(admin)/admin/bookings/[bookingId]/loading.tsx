import { BreakpointLoader } from "@/components/shared/BreakpointLoader";

/**
 * Route-level loading UI.
 *
 * This route is normally reached by opening a new tab from the dashboard stat
 * modals, so it is a cold page load - without this the tab sits blank until the
 * chunk hydrates. Matches the full-page loader the dashboard uses.
 */
export default function Loading() {
  return (
    <div className="flex items-center justify-center h-screen bg-[var(--background)]">
      <BreakpointLoader size="lg" text="Loading Booking..." />
    </div>
  );
}
