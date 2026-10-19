import React from 'react'
import Link from 'next/link'
import { Award } from 'lucide-react'
import { ComparisonTable } from '@/components/customer/subscription/ComparisonTable'
import SubscriptionPricingCard from '@/components/customer/subscription/SubscriptionPricingCard'
import { getPublicSubscriptionPlans } from './actions'
import { getMyActivePlanSummary } from '@/app/(customer)/my-subscription/action'
import { ActivePlanBanner } from '@/components/customer/subscription/ActivePlanBanner'

/**
 * Reads the session cookie to decide whether to show the customer's own plan, so
 * it cannot be prerendered. Without this Next tries to build it statically, the
 * cookie read throws, and the banner silently never appears for anyone.
 */
export const dynamic = 'force-dynamic'

export default async function SubscriptionPage() {
  /**
   * Two independent reads, so they go out together.
   *
   * Awaited one after the other this page paid two auth round trips end to end
   * before it could render a single plan; neither call feeds the other.
   *
   * activePlan is resolved from the session on the server, so a signed-in
   * customer is told what they already hold before being sold anything else.
   * Null covers both "no membership" and "not signed in", and the banner does
   * not render.
   */
  const [response, activePlan] = await Promise.all([
    getPublicSubscriptionPlans(),
    getMyActivePlanSummary(),
  ])
  const plansData = response.success && response.data ? response.data : []
  const membershipPlans = plansData.filter(plan => plan.plan_type === 'membership')
  const hourPacks = plansData.filter(plan => plan.plan_type === 'hour_pack')

  return (
    <main className="min-h-screen bg-[#0d0a14] text-white font-sans pt-12 pb-8 px-0 sm:px-6 lg:px-8 mt-5 relative overflow-hidden">
      {/* Animated background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-[#0d0a14] to-[#0d0a14] pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-r from-primary/10 to-amber-500/10 rounded-full blur-[150px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-l from-orange-600/10 to-primary/10 rounded-full blur-[150px] animate-pulse pointer-events-none" style={{ animationDelay: '1.5s' }} />

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMTkzLDcsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-40 pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-12 px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-primary/10 via-amber-400/10 to-primary/10 border border-primary/20 rounded-full px-5 py-2 mb-6 backdrop-blur-sm">
            <Award className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-primary text-xs font-black tracking-[0.2em] uppercase">
              Memberships & Hour Packs
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-gradient-to-r from-white via-amber-100 to-white bg-clip-text mb-6 tracking-tight leading-tight">
            Choose How You Play
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            Save on every booking with a membership, or prepay personal play hours that expire at the end of your chosen term.{' '}
            <span className="text-transparent bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text font-bold">elite gaming status</span>
            {' '}and arena-wide benefits.
          </p>
        </div>

        {/* What this customer already has, above what they could buy. */}
        {activePlan && (
          <div className="px-4 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <ActivePlanBanner plan={activePlan} />
          </div>
        )}

        {/* Pricing card */}
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
          <SubscriptionPricingCard initialPlans={membershipPlans} />
        </div>

        {/* Comparison table */}
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          <ComparisonTable plans={membershipPlans} />
        </div>

        {hourPacks.length > 0 && (
          <section className="mt-14 px-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
            <div className="mb-6 text-center">
              <h2 className="text-2xl md:text-3xl font-black text-white">Prepaid Play Hours</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Each pack is tied to one play category and one player. Unused hours expire at the end of the package term.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {hourPacks.map(plan => (
                <article key={plan.id} className="rounded-2xl border border-primary/30 bg-zinc-950/80 p-6 shadow-xl">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                    {plan.duration_months} month{plan.duration_months === 1 ? '' : 's'} validity
                  </p>
                  <h3 className="mt-3 text-2xl font-black text-white">{plan.name}</h3>
                  <p className="mt-1 text-sm font-bold text-amber-300">
                    For {plan.device_type_name}
                  </p>
                  <p className="mt-2 min-h-10 text-sm text-zinc-400">{plan.description}</p>
                  <p className="mt-5 text-3xl font-black text-primary">
                    ₹{plan.price.toLocaleString('en-IN')}
                    <span className="ml-2 text-base font-semibold text-zinc-500 line-through">
                      ₹{Number(plan.standard_value || plan.price).toLocaleString('en-IN')}
                    </span>
                  </p>
                  <p className="mt-1 text-sm font-bold text-emerald-400">
                    {plan.hours_included} personal hours · Save ₹{Math.max(0, Number(plan.standard_value || plan.price) - plan.price).toLocaleString('en-IN')}
                  </p>
                  <Link
                    href={`/subscription/${plan.id}`}
                    className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-black uppercase text-black transition hover:bg-amber-300"
                  >
                    Buy hour pack
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
