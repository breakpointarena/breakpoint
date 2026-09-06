/**
 * Role-based access control utilities
 *
 * Roles:
 * - admin: Full access to all pages including Reports
 * - staff: Access to all pages EXCEPT Reports
 */

/**
 * Browser only, and enforced rather than assumed.
 *
 * `getAuthUser` below keeps a module-level promise so simultaneous callers share
 * one request. In a client bundle that state belongs to a single tab, which is
 * exactly what makes it safe. Imported into a *server* component it would be
 * shared across every request the server handles - one user's auth lookup could
 * be handed to the next - so this makes that a build error instead of a leak.
 * The server has its own guarded lookup in `require-admin.ts`.
 */
import 'client-only'

import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'staff' | null

/**
 * The signed-in user, with concurrent callers sharing one request.
 *
 * `supabase.auth.getUser()` is a round trip to the auth server every time - it
 * validates the token there rather than decoding what is in storage, which is
 * the whole reason to prefer it over `getSession()`. Three components ask for it
 * in the same mount tick (the sidebar's role filter, the topbar's name and
 * badge, and the reports guard), so the admin shell was opening with three
 * identical `/auth/v1/user` calls on every navigation.
 *
 * Only in-flight requests are shared, and the slot is released as soon as one
 * settles - so this collapses a simultaneous burst without ever handing back a
 * cached answer. A later caller still gets a fresh check, and a sign-out or an
 * expiry is noticed exactly as promptly as before. `require-admin.ts` memoises
 * the same call per request on the server for the same reason.
 */
let pendingUser: Promise<User | null> | null = null

export function getAuthUser(): Promise<User | null> {
  if (pendingUser) return pendingUser

  pendingUser = supabase.auth
    .getUser()
    .then(({ data, error }) => (error ? null : (data.user ?? null)))
    .catch((error) => {
      console.error('Error getting auth user:', error)
      return null
    })

  // Released on settle rather than kept, so nothing here is ever stale.
  void pendingUser.finally(() => {
    pendingUser = null
  })

  return pendingUser
}

/**
 * app_metadata ONLY. user_metadata is writable by the user themselves via
 * supabase.auth.updateUser({ data: { role: 'admin' } }), so reading it here
 * would let any signed-in staff member promote themselves.
 *
 * No default. This previously returned 'admin' for any account without role
 * metadata, which - combined with public signup - made every authenticated user
 * an administrator.
 */
export function roleFromUser(user: User | null): UserRole {
  const role = user?.app_metadata?.role

  if (role === 'admin' || role === 'staff') {
    return role as UserRole
  }

  return null
}

export async function getUserRole(): Promise<UserRole> {
  return roleFromUser(await getAuthUser())
}

export function canAccessReports(role: UserRole): boolean {
  return role === 'admin'
}

export async function checkReportsAccess(): Promise<boolean> {
  const role = await getUserRole()
  return canAccessReports(role)
}
