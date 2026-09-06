import React from 'react'
import HeroCarousel from './home/hero-section/page'
import DevicePage from './home/device/page'
import FoodMenu from './home/food/page'
import Footer from '@/components/customer/layout/Footer'
import Testimonials from './home/testimonial/page'
import CTASection from '@/components/customer/subscription/CTASection'
import { CursorGlow } from '@/components/customer/home/CursorGlow'
import { fetchStations } from '@/lib/home/stations'
import { fetchMenu } from '@/lib/home/menu'

/**
 * Station availability and what the kitchen can actually serve are both read
 * live, so this page cannot be prerendered - a build-time copy would tell a
 * customer a table was free hours after somebody sat down at it.
 */
export const dynamic = 'force-dynamic'

/**
 * The landing page, rendered on the server.
 *
 * It used to be a client component - only because it tracked the pointer for a
 * cursor glow - and that one `useState` decided how the whole page loaded. The
 * device grid and the food menu each fetched themselves from a `useEffect`,
 * which meant neither request could even be sent until the browser had
 * downloaded and hydrated the bundle. Two server round trips queued up *behind*
 * the JavaScript rather than racing it, and the first thing a customer saw was
 * two blocks of skeletons.
 *
 * Both reads now happen here, together, while the page renders - so the markup
 * arrives with the stations and the menu already in it. The sections below are
 * still client components and still own all of their interactivity: the food
 * filters, the animations, the availability wording. They just start from real
 * data instead of from nothing.
 *
 * The glow that made this a client component in the first place is now its own
 * component, and no longer re-renders anything at all.
 */
export default async function LandingPage() {
  /**
   * Independent reads, so they go out together rather than one after the other.
   * Neither feeds the other and both are wanted before the first paint.
   */
  const [devices, menu] = await Promise.all([fetchStations(), fetchMenu()])

  return (
    <div className="relative">
      <CursorGlow />

      <HeroCarousel />
      <DevicePage initialDevices={devices} />
      <FoodMenu initialMenu={menu} />
      <div className="relative py-12 md:py-16 overflow-hidden bg-black/60 border-y border-zinc-900/40">
        <div
          className="absolute inset-0 z-0 opacity-80"
          style={{ background: 'linear-gradient(to bottom, #1E1F22 0%, rgba(30,31,34,0.88) 50%, #1E1F22 100%)' }}
        />
        <div className="relative z-10">
          <CTASection />
        </div>
      </div>
      <Testimonials />
      <Footer />
    </div>
  )
}
