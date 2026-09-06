import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/server'

export interface MenuResult {
  success: boolean
  menuItems: any[]
  error?: string
}

/**
 * What the kitchen can actually serve, for the customer-facing menu.
 *
 * A plain async function rather than a Server Function, for the same reason as
 * `fetchStations`: Next will not run a `"use server"` export during a server
 * render, so the landing page cannot await the action directly. The action in
 * `app/(customer)/home/food/action.ts` now delegates here, which keeps the
 * standalone /home/food route working from the browser exactly as before.
 */
export async function fetchMenu(): Promise<MenuResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('menu_items')
      .select('*')
      .eq('status', 'available')
      // Stock as well as status. The trigger on menu_items keeps the two in step,
      // so this is saying the same thing twice - deliberately, because it is the
      // count that decides whether the kitchen can actually serve it, and this
      // query should not start offering sold-out food on a database where that
      // trigger has not been applied yet.
      .gt('quantity', 0)
      .order('created_at', { ascending: false })

    if (error) throw error

    return {
      success: true,
      menuItems: data || [],
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      menuItems: [],
    }
  }
}
