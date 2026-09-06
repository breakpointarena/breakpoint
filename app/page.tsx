import React from 'react';
import LandingPage from "./(customer)/page";

/**
 * This is the file that actually serves `/`.
 *
 * `app/(customer)/page.tsx` declares the same config, but route segment config
 * only counts on the file that owns the route - and the build manifest maps
 * `/page` to this one, reaching the other only as an imported component. So the
 * declaration there does nothing, and without this line the landing page was
 * prerendered at build time with the station availability and the food menu
 * baked into the HTML: tables reported free hours after somebody sat down at
 * them, and sold-out items stayed on the menu until the next deploy.
 */
export const dynamic = 'force-dynamic';

/**
 * Deliberately not a Client Component.
 *
 * It only renders a wrapper around the landing page, and marking it `"use client"`
 * pulled `app/(customer)/page.tsx` into the client graph with it. That was
 * harmless while the landing page fetched its own data from effects, but it
 * cannot survive the landing page becoming an async Server Component: an async
 * server component may not be rendered by a client one, and the server-only
 * query modules it imports are rejected outright by the bundler.
 */
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <LandingPage></LandingPage>
    </div>
  );
}
