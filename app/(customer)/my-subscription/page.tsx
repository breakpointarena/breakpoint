'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { Percent, Gamepad2, Ticket, Wallet, Monitor, AlertTriangle, History, AlertCircle, Phone, Loader2 } from 'lucide-react'
import { BreakpointLoader } from '@/components/shared/BreakpointLoader'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { useRouter } from 'next/navigation'
import {
  getMembershipBookingSummary,
  getMySubscription,
  type MembershipBookingSummary,
} from './action'
import { arenaToday, daysBetweenDates, parseLocalDate } from '@/lib/utils/dates'
import { formatDbTime } from '@/lib/utils/timeSlots'
import { formatPlayedDuration } from '@/lib/bookings/walkInSession'
import { CustomerAuthGate } from '@/components/auth/CustomerAuthGate'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

/**
 * Rendered only once CustomerAuthGate has a verified session, so `phone` is the
 * caller's own number rather than whatever arrived in the URL.
 */
function MySubscriptionPageContent({ phone }: { phone: string }) {
  const router = useRouter()

  const [subscription, setSubscription] = useState<any>(null)
  /** Null while loading, and also when the read failed - the card just hides. */
  const [summary, setSummary] = useState<MembershipBookingSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRenewing, setIsRenewing] = useState(false)
  const [isBooking, setIsBooking] = useState(false)
  const [isBrowsingPlans, setIsBrowsingPlans] = useState(false)
  const [isBrowsingFood, setIsBrowsingFood] = useState(false)
  const [isViewingBookings, setIsViewingBookings] = useState(false)

  useEffect(() => {
    let cancelled = false

    const fetchSubscription = async () => {
      try {
        setIsLoading(true)
        // Neither takes an argument: the server resolves the customer from the
        // session. Requested together so the card and its summary arrive in one
        // render rather than the page reflowing under the reader.
        const [response, bookingSummary] = await Promise.all([
          getMySubscription(),
          getMembershipBookingSummary(),
        ])
        if (cancelled) return
        setSubscription(response.success && response.data ? response.data : null)
        setSummary(bookingSummary)
      } catch (error) {
        console.error('Error fetching subscription:', error)
        if (!cancelled) {
          setSubscription(null)
          setSummary(null)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchSubscription()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * "June 07" from a `YYYY-MM-DD`.
   *
   * Built from the date's own parts rather than `new Date(dateString)`, which
   * reads a bare date as *UTC* midnight and then renders it in the viewer's
   * zone - so a membership ending on the 17th showed as the 16th to anybody
   * west of Greenwich. `end_date` is a calendar date, not an instant; no zone
   * should get a say in which day it names.
   */
  const formatDate = (dateString: string) => {
    const date = parseLocalDate(dateString)
    if (!date) return ''
    return date.toLocaleDateString('en-US', { month: 'long', day: '2-digit' })
  }

  /** Whole rupees, grouped the Indian way: 1,20,000 rather than 120,000. */
  const rupees = (value: number) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`

  /**
   * "3h 30m" from a fractional hour count.
   *
   * Reuses the session formatter rather than printing "3.5 hrs": the same
   * durations are shown as hours and minutes everywhere else the arena counts
   * play, and two spellings of one number invite the reader to check them.
   */
  const formatHours = (hours: number) =>
    formatPlayedDuration(Math.round((Number(hours) || 0) * 60))

  // Loading State
  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#0d0a14] flex flex-col items-center justify-center">
        <BreakpointLoader size="lg" text="Loading your arena pass..." />
      </main>
    )
  }

  // Calculate dynamic progress values if subscription exists
  let daysRemaining = 0
  let progressPercentage = 0

  if (subscription) {
    /**
     * Whole days between calendar dates, on the arena's calendar.
     *
     * This used to subtract two `Date` objects: `end_date` parsed as UTC midnight
     * against `new Date()`, an instant on the viewer's clock. Mixing the two
     * makes the answer depend on what time of day the page is opened and where
     * from - the same membership reading 22 days to one customer and 21 to
     * another, and ticking over at midnight UTC rather than at the arena's.
     * Both sides are plain dates here, so the zone cancels out entirely.
     */
    const today = arenaToday()
    daysRemaining = Math.max(0, daysBetweenDates(today, subscription.end_date) ?? 0)
    const totalDays = daysBetweenDates(subscription.start_date, subscription.end_date) ?? 0

    // How much of the term has elapsed.
    if (totalDays > 0) {
      progressPercentage = Math.min(100, Math.max(0, Math.round(((totalDays - daysRemaining) / totalDays) * 100)))
    }
  }

  return (
    <main
      className="min-h-screen bg-[#0d0a14] text-white font-sans relative overflow-hidden pt-5"
    >
      {/* Animated background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-[#0d0a14] to-[#0d0a14] pointer-events-none" />
      <div className="absolute top-20 left-1/4 w-[600px] h-[600px] bg-gradient-to-r from-primary/10 to-amber-500/10 rounded-full blur-[150px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-20 right-1/4 w-[500px] h-[500px] bg-gradient-to-l from-orange-600/10 to-primary/10 rounded-full blur-[150px] animate-pulse pointer-events-none" style={{ animationDelay: '1.5s' }} />

      <div className="max-w-300 mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Breadcrumb */}
        <div className="animate-in fade-in slide-in-from-left-4 duration-500">
          <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My Subscription' }]} />
        </div>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          <div className="max-w-2xl">
            <h1 className="text-3xl md:text-[42px] font-black tracking-tight leading-tight mb-3 text-transparent bg-gradient-to-r from-white via-amber-100 to-white bg-clip-text">
              Your Subscription
            </h1>
            <p className="text-zinc-400 text-sm md:text-base leading-relaxed">
              Manage your elite gaming access and monitor your exclusive benefits across the Break
              Point Arena ecosystem.
            </p>
          </div>
          <div className="flex flex-row gap-3 md:gap-4 shrink-0">
            {subscription && (
              <button
                onClick={() => {
                  setIsRenewing(true)
                  router.push(`/subscription/${subscription.plan_id || subscription.plan?.id}`)
                }}
                disabled={isRenewing || isBooking}
                className="flex-1 md:flex-none bg-transparent border-2 border-primary hover:bg-primary/10 text-primary font-black py-3 px-6 rounded-xl transition-all text-sm uppercase tracking-wider hover:shadow-[0_0_20px_rgba(255,193,7,0.3)] flex items-center justify-center gap-2"
              >
                {isRenewing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Renew Now"}
              </button>
            )}
            <button
              onClick={() => {
                setIsBooking(true)
                router.push('/booking')
              }}
              disabled={isRenewing || isBooking}
              className="flex-1 md:flex-none bg-gradient-to-r from-primary via-amber-400 to-primary text-black font-black py-3 px-6 rounded-xl transition-all text-sm shadow-[0_0_20px_rgba(255,193,7,0.3)] hover:shadow-[0_0_40px_rgba(255,193,7,0.5)] hover:scale-[1.02] uppercase tracking-wider flex items-center justify-center gap-2"
            >
              {isBooking ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : "Book Slot"}
            </button>
          </div>
        </div>

        {/* The gate above has already verified the caller, so there is no phone
            search here any more - this is simply "you have no plan yet". */}
        {!subscription ? (
          <div className="space-y-6 max-w-xl mx-auto">
            <div className="bg-[#111111] border border-neutral-800 rounded-md p-10 text-center flex flex-col items-center glow-box-hover animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-neutral-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Active Subscription</h3>
              <p className="text-neutral-400 text-sm max-w-md mb-6">
                No active membership found for +91 {phone}. Subscribe to unlock elite benefits and arena discounts.
              </p>
              <button
                onClick={() => {
                  setIsBrowsingPlans(true)
                  router.push('/subscription')
                }}
                disabled={isBrowsingPlans}
                className="bg-primary hover:bg-primary-hover text-black font-black uppercase py-3 px-8 rounded-lg transition-all text-sm flex items-center justify-center gap-2"
              >
                {isBrowsingPlans ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : "Browse Plans"}
              </button>
            </div>
          </div>
        ) : (
          /* Centered Standalone Active Subscription Card Layout */
          <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            {/* DYNAMIC ACTIVE SUBSCRIPTION CARD */}
            <div className="bg-gradient-to-br from-zinc-900 via-[#131313] to-zinc-900 border border-primary/30 rounded-2xl p-6 md:p-10 relative overflow-hidden group hover:border-primary/60 transition-all duration-300 shadow-[0_4px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_4px_45px_rgba(255,193,7,0.15)]">
              {/* Animated gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-amber-400/5 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              {/* Scan line */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse pointer-events-none" />

              {/* Card Header */}
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <h3 className="text-primary text-xs font-black tracking-[0.2em] uppercase mb-2 drop-shadow-[0_0_10px_rgba(255,193,7,0.3)]">
                    Elite Membership
                  </h3>
                  <h2 className="text-2xl md:text-3.5xl font-black text-transparent bg-gradient-to-r from-white via-amber-100 to-white bg-clip-text">
                    {subscription.plan?.name || 'Unknown Plan'}
                  </h2>
                </div>
                <div className="bg-gradient-to-r from-green-900/30 to-green-950/30 border border-green-500/30 rounded-full px-4 py-2 flex items-center shadow-[0_0_20px_rgba(34,197,94,0.2)] backdrop-blur-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-2 shadow-[0_0_10px_rgba(34,197,94,0.8)] animate-pulse"></div>
                  <span className="text-green-400 text-xs font-black tracking-wider uppercase">
                    Active
                  </span>
                </div>
              </div>

              {/* Progress Bar Section */}
              <div className="mb-8 relative z-10">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-3 gap-2">
                  <div>
                    <div className="text-zinc-400 text-xs font-black uppercase tracking-wider mb-1">
                      Validity Status
                    </div>
                    <div className="text-white font-black text-base md:text-lg">
                      Valid until {formatDate(subscription.end_date)}{' '}
                      <span className="text-transparent bg-gradient-to-r from-primary to-amber-300 bg-clip-text text-sm ml-1 block sm:inline">
                        ({daysRemaining} days remaining)
                      </span>
                    </div>
                  </div>
                  <div className="text-zinc-400 text-xs font-black uppercase tracking-wider">{progressPercentage}% Complete</div>
                </div>
                {/* Bar with gaming effect */}
                <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden border border-zinc-800 shadow-inner">
                  <div
                    className="bg-gradient-to-r from-primary via-amber-400 to-primary h-3 rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                    style={{ width: `${progressPercentage}%` }}
                  >
                    {/* Animated shimmer */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  </div>
                </div>
              </div>

              {/* Perks Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                <div className="bg-gradient-to-br from-zinc-950 to-zinc-900 border border-primary/20 rounded-xl p-4 flex items-center group/card hover:border-primary/40 hover:shadow-[0_0_20px_rgba(255,193,7,0.1)] transition-all duration-300">
                  <div className="bg-gradient-to-br from-primary/20 to-amber-500/20 p-3 rounded-lg mr-4 shadow-[0_0_15px_rgba(255,193,7,0.2)]">
                    <Percent className="w-5 h-5 text-primary drop-shadow-[0_0_8px_rgba(255,193,7,0.5)]" />
                  </div>
                  <div>
                    <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1">
                      Loyalty Discount
                    </div>
                    <div className="text-transparent bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text font-black text-lg drop-shadow-[0_0_10px_rgba(255,193,7,0.3)]">
                      {subscription.plan?.discount_percentage || 0}% OFF
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-zinc-950 to-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center hover:border-zinc-700 transition-all duration-300">
                  <div className="bg-amber-500/10 p-3 rounded-lg mr-4">
                    <Gamepad2 className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1">Arena Pass</div>
                    <div className="text-white font-black text-lg">All Access</div>
                  </div>
                </div>
              </div>
            </div>

            {/* What the membership has actually done.
                The card above says which plan and until when, which answers
                nothing about whether it is paying for itself. Everything here is
                measured from the start of the current term, so a renewal starts
                the count again against the membership being shown. */}
            {summary && (
              <div className="mt-6 bg-gradient-to-br from-zinc-900 via-[#131313] to-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-10 relative overflow-hidden hover:border-primary/40 transition-all duration-300 shadow-[0_4px_30px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2 mb-8">
                  <div>
                    <h3 className="text-primary text-xs font-black tracking-[0.2em] uppercase mb-2 drop-shadow-[0_0_10px_rgba(255,193,7,0.3)]">
                      Booking Summary
                    </h3>
                    <h2 className="text-xl md:text-2xl font-black text-transparent bg-gradient-to-r from-white via-amber-100 to-white bg-clip-text">
                      Since {formatDate(summary.since)}
                    </h2>
                  </div>
                  {summary.bookings > 0 && (
                    <button
                      onClick={() => {
                        setIsViewingBookings(true)
                        router.push('/retrieve')
                      }}
                      disabled={isViewingBookings}
                      className="text-primary hover:text-amber-300 text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2 self-start sm:self-auto"
                    >
                      {isViewingBookings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      View all bookings
                    </button>
                  )}
                </div>

                {summary.bookings === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-14 h-14 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Ticket className="w-7 h-7 text-zinc-600" />
                    </div>
                    <p className="text-white font-bold mb-1">No bookings on this membership yet</p>
                    <p className="text-zinc-500 text-sm">
                      Your {subscription.plan?.discount_percentage || 0}% discount is applied
                      automatically at checkout.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Four figures, the third being the point of the card: what
                        the membership took off the bill, against what was paid. */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                      {[
                        { label: 'Bookings', value: String(summary.bookings), icon: Ticket, accent: false },
                        { label: 'Hours Played', value: formatHours(summary.hoursPlayed), icon: History, accent: false },
                        { label: 'Saved With Membership', value: rupees(summary.saved), icon: Percent, accent: true },
                        { label: 'Paid', value: rupees(summary.spent), icon: Wallet, accent: false },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className={`bg-gradient-to-br from-zinc-950 to-zinc-900 border rounded-xl p-4 transition-all duration-300 ${stat.accent
                            ? 'border-primary/30 hover:border-primary/50 hover:shadow-[0_0_20px_rgba(255,193,7,0.1)]'
                            : 'border-zinc-800 hover:border-zinc-700'
                            }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <stat.icon className={`w-4 h-4 ${stat.accent ? 'text-primary' : 'text-zinc-500'}`} />
                            <span className="text-zinc-400 text-[11px] font-bold uppercase tracking-wider">
                              {stat.label}
                            </span>
                          </div>
                          <div
                            className={`font-black text-xl ${stat.accent
                              ? 'text-transparent bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text drop-shadow-[0_0_10px_rgba(255,193,7,0.3)]'
                              : 'text-white'
                              }`}
                          >
                            {stat.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Anything still owed is stated rather than folded into the
                        Paid tile, which would make a part-paid booking look
                        settled. */}
                    {summary.outstanding > 0 && (
                      <div className="flex items-center gap-3 bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 mb-8">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <p className="text-amber-200/80 text-xs leading-relaxed">
                          <span className="font-black text-amber-300">{rupees(summary.outstanding)}</span>
                          {' '}is still outstanding across these bookings. Settle it at the counter on
                          your next visit.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-zinc-400 text-xs font-black uppercase tracking-wider mb-3">
                        Recent Bookings
                      </div>
                      {summary.recent.map((booking) => (
                        <div
                          key={booking.id}
                          className="bg-gradient-to-br from-zinc-950 to-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 hover:border-zinc-700 transition-all duration-300"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Monitor className="w-4 h-4 text-primary shrink-0" />
                              <span className="text-white font-black text-sm truncate">
                                {booking.deviceType || 'Booking'}
                              </span>
                              <span className="text-zinc-600 text-xs font-mono">
                                #{booking.bookingNumber}
                              </span>
                            </div>
                            <div className="text-zinc-500 text-xs mt-1">
                              {formatDate(booking.date)}
                              {booking.startTime ? ` · ${formatDbTime(booking.startTime)}` : ''}
                              {booking.durationHours > 0 ? ` · ${formatHours(booking.durationHours)}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-white font-black text-sm">{rupees(booking.charged)}</div>
                            {booking.saved > 0 ? (
                              <div className="text-primary text-[11px] font-bold">
                                saved {rupees(booking.saved)}
                              </div>
                            ) : booking.outstanding > 0 ? (
                              <div className="text-amber-500 text-[11px] font-bold">
                                {rupees(booking.outstanding)} due
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

export default function MySubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <BreakpointLoader size="lg" />
        </div>
      }
    >
      <main className="min-h-screen bg-[#0d0a14] py-12 px-4">
        <CustomerAuthGate
          title="View Your Arena Pass"
          description="Verify your number to see your subscription."
        >
          {(phone) => <MySubscriptionPageContent phone={phone} />}
        </CustomerAuthGate>
      </main>
    </Suspense>
  );
}
