import { BreakpointLoader } from "@/components/shared/BreakpointLoader";

/**
 * Route-level loading UI, and the thing that makes clicking "Dashboard" feel
 * instant.
 *
 * The page fetches its figures on the server. Without a loading boundary, Next
 * holds the current route on screen until that fetch finishes and only then
 * swaps - so tapping Dashboard from another admin tab did nothing visible for a
 * moment and then jumped, which reads as a hung click rather than a load. The
 * presence of this file gives the route a Suspense boundary: navigation commits
 * immediately, this renders, and the real content replaces it when the data
 * lands.
 *
 * Sized to the content area rather than the viewport, so the sidebar and header
 * stay put and stay clickable - the operator can change their mind mid-load
 * instead of waiting out a full-screen takeover.
 */
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <BreakpointLoader size="lg" text="Loading Dashboard..." />
    </div>
  );
}
