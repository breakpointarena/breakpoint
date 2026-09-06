'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  CheckCircle2,
  CheckCircle,
  Gamepad2,
  FileText,
  UtensilsCrossed,
  Wifi,
  Award,
  Armchair,
  Loader2,
} from 'lucide-react'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { BreakpointLoader } from '@/components/shared/BreakpointLoader'

// Import your existing server action
import { getPublicSubscriptionPlan } from '@/app/(customer)/subscription/actions'
import {
  getMyActivePlanSummary,
  type ActivePlanSummary,
} from '@/app/(customer)/my-subscription/action'
import { parseLocalDate } from '@/lib/utils/dates'
import Link from 'next/link'

export default function SubscriptionActivatedPage() {
  const router = useRouter()
  const params = useParams()

  const [plan, setPlan] = useState<any>(null)
  /**
   * The membership that was actually created, read back from the session.
   *
   * Everything on this page used to come from the *plan* row, which knows the
   * price and the discount but nothing about this customer's purchase - so the
   * "Valid Until" line read `plan.validity`, a column that does not exist, and
   * rendered blank. Fetched rather than passed through the URL because a
   * membership id in a query string is a claim; this one comes from the
   * verified session and is the same rule the discount is resolved by.
   */
  const [membership, setMembership] = useState<ActivePlanSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBookingSlot, setIsBookingSlot] = useState(false)
  const [isViewingDetails, setIsViewingDetails] = useState(false)
  const [isBrowsingFood, setIsBrowsingFood] = useState(false)

  // The plan being celebrated, and the membership it produced.
  useEffect(() => {
    const fetchPlan = async () => {
      try {
        setIsLoading(true)
        const planId = Array.isArray(params.planId) ? params.planId[0] : params.planId

        const [response, active] = await Promise.all([
          planId ? getPublicSubscriptionPlan(planId) : Promise.resolve(null),
          getMyActivePlanSummary(),
        ])

        if (response?.success && response.data) {
          setPlan(response.data)
        }
        setMembership(active)
      } catch (error) {
        console.error('Error fetching plan:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchPlan()
  }, [params.planId])

  /**
   * "June 07, 2026" from a `YYYY-MM-DD`.
   *
   * Built from the date's own parts. `new Date('2026-09-17')` is UTC midnight,
   * which renders as the 16th to any viewer behind Greenwich - and an end date
   * is a calendar date, not an instant.
   */
  const formatDate = (dateString: string) => {
    const date = parseLocalDate(dateString)
    if (!date) return ''
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: '2-digit',
      year: 'numeric',
    })
  }

  /**
   * The membership's own id, shortened for reading aloud at the counter.
   *
   * This line used to be `SUB-${Math.floor(Math.random() * 90000) + 10000}` - a
   * fresh number on every render, under a heading that says "Subscription ID".
   * It is the first block of the real UUID, so it still finds the row: staff can
   * match it with `where id::text like '<prefix>%'`. Blank rather than invented
   * when the membership has not been read back.
   */
  const displaySubId = membership?.subscriptionId
    ? `SUB-${membership.subscriptionId.split('-')[0].toUpperCase()}`
    : '—'

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center">
        <BreakpointLoader size="lg" text="Finalizing your activation..." />
      </main>
    )
  }

  if (!plan) {
    return (
      <main className="min-h-screen bg-[var(--background)] flex items-center justify-center text-white">
        <p>Could not load subscription details.</p>
      </main>
    )
  }

  return (
    <main
      className="min-h-screen bg-[var(--background)] text-white font-sans relative overflow-hidden flex flex-col items-center  px-4 sm:px-6 lg:px-8 pt-5"
    >
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-200 h-150 bg-[var(--primary)]/5 rounded-full blur-[150px] pointer-events-none z-0" />

      <div className="max-w-275 w-full relative z-10">
        {/* Breadcrumb perfectly left-aligned at the top of the content container */}
        <Breadcrumb
          /* `(customer)` is a route group, so it is not part of the URL — the real
             paths are /subscription and /subscription/[planId]. The plan crumb is
             dropped: checkout is finished, so linking back into it would restart
             the purchase flow for a plan the customer just activated. */
          items={[
            { label: 'Home', href: '/' },
            { label: 'Subscriptions', href: '/subscription' },
            { label: 'Success' },
          ]}
        />

        {/* Success Header */}
        <div className="flex flex-col items-center text-center mb-16 mt-4 md:mt-8">
          <div className="w-24 h-24 mb-8 rounded-full bg-[var(--surface)] border border-[var(--primary)]/20 flex items-center justify-center shadow-[0_0_50px_rgba(184,134,11,0.15)] relative">
            <div className="absolute inset-0 rounded-full border border-[var(--primary)]/40 animate-ping opacity-20"></div>
            <CheckCircle2 className="w-12 h-12 text-[var(--primary)]" />
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
            Subscription Activated!
          </h1>
          <p className="text-neutral-400 text-[15px] md:text-base max-w-lg mx-auto leading-relaxed">
            Your membership benefits are now active. Welcome to the inner circle of elite
            competitive gaming.
          </p>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16">
          {/* Left Column: Subscription Details */}
          <div className="lg:col-span-2 bg-[var(--surface)] border border-neutral-800 rounded-md p-8 flex flex-col justify-between shadow-2xl glow-box-strong">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 mb-8">
              <div>
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  Subscription ID
                </p>
                <p className="text-[var(--primary)] font-bold text-lg">{displaySubId}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  Current Plan
                </p>
                <p className="text-[var(--primary)] font-bold text-lg">
                  {membership?.planName || plan.name}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  Valid Until
                </p>
                <p className="text-white font-bold text-[17px]">
                  {membership ? formatDate(membership.endDate) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  Membership Status
                </p>
                <div className="flex items-center text-[var(--primary)] font-bold text-[17px]">
                  <span className="w-2 h-2 rounded-full bg-[var(--primary)] mr-2 animate-pulse" />
                  Active & Secured
                </div>
              </div>
            </div>

            <div className="bg-[var(--surface-hover)] border border-[var(--primary)]/20 rounded-md p-4 flex items-center glow-box-hover">
              <CheckCircle className="w-5 h-5 text-[var(--primary)] mr-3 shrink-0" />
              <p className="text-neutral-300 text-sm font-medium">
                Your {membership?.discountPercentage ?? plan.discount_percentage}% elite discount
                has been applied to your membership
                summary.
              </p>
            </div>
          </div>

          {/* Right Column: Next Steps */}
          <div className="lg:col-span-1 bg-[var(--surface)] border border-neutral-800 rounded-md p-8 flex flex-col shadow-2xl glow-box-hover">
            <h3 className="text-xl font-bold text-white mb-3">Next Steps</h3>
            <p className="text-neutral-400 text-sm leading-relaxed mb-8">
              Ready to dominate? Book your exclusive gaming slot at the arena now.
            </p>

            <div className="mt-auto space-y-3">
              <button
                onClick={() => {
                  setIsBookingSlot(true)
                  router.push("/booking")
                }}
                disabled={isBookingSlot || isViewingDetails || isBrowsingFood}
                className="w-full bg-[var(--primary)] uppercase hover:bg-[var(--primary-hover)] text-black font-bold text-[15px] py-4 rounded-xl flex items-center justify-center transition-all shadow-[0_0_15px_rgba(184,134,11,0.2)] hover:scale-[1.02] disabled:opacity-50 disabled:pointer-events-none"
              >
                {isBookingSlot ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Gamepad2 className="w-5 h-5 mr-2" />
                )}
                Book Gaming Slot
              </button>

              <button
                onClick={() => {
                  setIsViewingDetails(true)
                  const phone = typeof window !== 'undefined' ? localStorage.getItem('customerPhone') : null
                  if (phone) {
                    router.push(`/my-subscription?phone=${phone}`)
                  } else {
                    router.push('/my-subscription')
                  }
                }}
                disabled={isBookingSlot || isViewingDetails || isBrowsingFood}
                className="w-full bg-transparent border border-neutral-700 hover:border-[var(--primary)] text-white font-bold text-[15px] py-4 rounded-xl flex items-center justify-center transition-all hover:text-[var(--primary)] disabled:opacity-50 disabled:pointer-events-none"
              >
                {isViewingDetails ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-5 h-5 mr-2" />
                )}
                View Subscription Details
              </button>

              <button
                onClick={() => {
                  setIsBrowsingFood(true)
                  router.push("/food")
                }}
                disabled={isBookingSlot || isViewingDetails || isBrowsingFood}
                className="w-full text-neutral-400 hover:text-white font-medium text-sm py-3 mt-2 flex items-center justify-center transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {isBrowsingFood ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UtensilsCrossed className="w-4 h-4 mr-2" />
                )}
                Browse Food Menu
              </button>
            </div>
          </div>
        </div>


      </div>
    </main>
  )
}
