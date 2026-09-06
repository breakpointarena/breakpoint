import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/server'
import { effectiveDeviceStatus, getOccupiedDeviceIds } from '@/lib/devices/occupancy'

/**
 * Every station, with what the floor actually looks like right now.
 *
 * A plain async function, deliberately *not* a Server Function. Next refuses to
 * run a `"use server"` export during a server render - "Server Functions cannot
 * be called during initial render. This would create a fetch waterfall" - which
 * is the whole reason the landing page could not simply await the action it had
 * been calling from a `useEffect`.
 *
 * So the query lives here and has two callers: the landing page, which is a
 * Server Component and calls it directly while it renders, and `getDevices` in
 * `app/(customer)/home/device/action.ts`, which is the Server Function the
 * standalone /home/device route still calls from the browser. One query, one
 * behaviour, reachable from both sides of the boundary.
 */
export async function fetchStations() {
  const [{ data, error }, occupied] = await Promise.all([
    supabaseAdmin
      .from('devices')
      .select(`
        *,
        device_type:device_types(*)
      `)
      .order('station_number', { ascending: true }),
    getOccupiedDeviceIds(),
  ])

  if (error) {
    console.error('Error fetching devices:', error.message)
    return []
  }

  /**
   * `effective_status` is what the floor actually looks like; `status` is only
   * ever what an admin last typed into the device form. This page counted the
   * latter, so every station read "Available" while people were playing on them.
   *
   * Added alongside rather than overwriting `status`, so the admin device
   * screens can still show and edit the stored value.
   */
  return (data || []).map((device: any) => ({
    ...device,
    effective_status: effectiveDeviceStatus(device.status, occupied.has(device.id)),
  }))
}
