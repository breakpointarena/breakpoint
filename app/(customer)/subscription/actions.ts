'use server'

import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * The membership plans a customer is allowed to see.
 *
 * The plans page was reading `getSubscriptionPlans` from the admin actions, and
 * that gained a `requireStaff()` guard on 12 August when every admin action was
 * locked down. Staff have a session; customers do not, so the guard threw and
 * /subscription has returned a 500 to every visitor since - nine days of the
 * arena being unable to sell a membership at all.
 *
 * A customer-facing read rather than an exception to the guard: the admin action
 * returns `SELECT *` over every plan including retired ones, which is right for
 * the admin screen and wrong here. This returns the plans actually on sale, and
 * only the columns needed to display and buy one.
 */

export interface PublicSubscriptionPlan {
  id: string
  name: string
  description: string | null
  price: number
  duration_months: number
  discount_percentage: number
  /**
   * Always true - only active plans are returned. Carried anyway because the
   * pricing card and comparison table are typed against the full admin row, and
   * a shape that omits it would not satisfy them.
   */
  is_active: true
}

export async function getPublicSubscriptionPlans(): Promise<{
  success: boolean
  data: PublicSubscriptionPlan[]
  error?: string
}> {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, name, description, price, duration_months, discount_percentage')
      // A retired plan must not be offered. The purchase flow refuses one anyway
      // (`quoteSubscription` checks `is_active`), but a plan nobody can buy has
      // no business being on the page that sells them.
      .eq('is_active', true)
      .order('price', { ascending: true })

    if (error) throw new Error(error.message)

    return {
      success: true,
      data: (data || []).map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description ?? null,
        price: Number(plan.price ?? 0),
        duration_months: Number(plan.duration_months ?? 1),
        discount_percentage: Number(plan.discount_percentage ?? 0),
        is_active: true as const,
      })),
    }
  } catch (error: any) {
    console.error('getPublicSubscriptionPlans error:', error)
    // An empty list renders an honest "no plans available" rather than a 500 -
    // which is the failure this whole function exists because of.
    return { success: false, data: [], error: error.message || 'Failed to load plans' }
  }
}

/**
 * One plan, for the purchase page.
 *
 * Same problem as the list above: the purchase and success pages were calling
 * the admin `getSubscriptionPlanDetails`, which is staff-guarded. Being client
 * components they swallowed the authorization error and bounced the customer
 * back to /subscription - itself returning a 500 - so the whole purchase funnel
 * was unreachable rather than merely broken at the first step.
 *
 * A retired plan resolves to null here. Somebody holding an old link should be
 * told the plan is gone, not walked to a checkout that `quoteSubscription` will
 * refuse at the last moment.
 */
export async function getPublicSubscriptionPlan(id: string): Promise<{
  success: boolean
  data: PublicSubscriptionPlan | null
  error?: string
}> {
  try {
    if (!id) return { success: false, data: null, error: 'No plan requested.' }

    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, name, description, price, duration_months, discount_percentage')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return { success: false, data: null, error: 'That plan is no longer available.' }

    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        description: data.description ?? null,
        price: Number(data.price ?? 0),
        duration_months: Number(data.duration_months ?? 1),
        discount_percentage: Number(data.discount_percentage ?? 0),
        is_active: true as const,
      },
    }
  } catch (error: any) {
    console.error('getPublicSubscriptionPlan error:', error)
    return { success: false, data: null, error: error.message || 'Failed to load that plan' }
  }
}
