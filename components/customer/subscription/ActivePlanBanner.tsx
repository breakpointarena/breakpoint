import Link from 'next/link'
import { BadgeCheck, ChevronRight } from 'lucide-react'
import type { ActivePlanSummary } from '@/app/(customer)/my-subscription/action'
import { formatDateForDisplay } from '@/lib/utils/dates'

/**
 * What the customer is already on, shown above what they could buy.
 *
 * Somebody arriving at the plans page while already on a plan is usually
 * checking their own benefit or thinking about what happens when it runs out -
 * not starting from scratch. Without this they were shown the same grid of
 * offers as a stranger, with nothing to say they had already paid for one.
 *
 * It also heads off a purchase the arena would have to unpick: buying a second
 * membership supersedes the first, because a customer can only point at one at a
 * time. The purchase flow refuses that outright now, and this is the part that
 * explains why before they get that far.
 */
export function ActivePlanBanner({ plan }: { plan: ActivePlanSummary }) {
  /**
   * Zero days left means it ends today, not that it has expired - the summary
   * only returns plans whose end date has not passed, so "0" is the last day of
   * a membership that is still perfectly usable.
   */
  const remaining =
    plan.daysRemaining === 0
      ? 'Last day'
      : `${plan.daysRemaining} day${plan.daysRemaining === 1 ? '' : 's'} left`

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-amber-400/5 to-transparent px-5 py-4 backdrop-blur-sm sm:flex-row sm:items-center">
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary/15">
        <BadgeCheck className="h-6 w-6 text-primary" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
          Your active plan
        </p>
        <h2 className="mt-0.5 truncate text-lg font-black tracking-tight text-white">
          {plan.planName}
          {plan.discountPercentage > 0 && (
            <span className="ml-2 text-sm font-bold text-primary">
              {plan.discountPercentage}% off bookings
            </span>
          )}
        </h2>
        <p className="mt-0.5 text-sm text-zinc-400">
          Valid until {formatDateForDisplay(plan.endDate)} · {remaining}
        </p>
      </div>

      <Link
        href="/my-subscription"
        className="inline-flex flex-shrink-0 items-center gap-1 rounded-xl border border-primary/40 px-4 py-2 text-xs font-black uppercase tracking-wide text-primary transition-colors hover:bg-primary/10"
      >
        View plan
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

export default ActivePlanBanner
