/**
 * Server-side authorization for admin server actions.
 *
 * Server actions are ordinary HTTP endpoints. Middleware guards *page*
 * navigations, but it is not a substitute for checking the caller inside the
 * action itself: any bug or gap in the matcher, and every admin operation is
 * exposed. These guards are the layer that actually decides.
 *
 * Roles come from `app_metadata`, never `user_metadata` - see resolveRole().
 */

import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export type StaffRole = 'admin' | 'staff';

export class AuthorizationError extends Error {
  constructor(message = 'Not authorised to perform this action.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Reads the caller's role from a verified Supabase session.
 *
 * getUser() rather than getSession(): getSession() decodes whatever is in the
 * cookie without guaranteeing it is revalidated against the auth server, so it
 * must not be the basis of an access decision.
 *
 * The role is read from `app_metadata` only. `user_metadata` is writable by the
 * user themselves via supabase.auth.updateUser(), so trusting it would let any
 * signed-in staff member promote themselves to admin.
 *
 * Memoised per request: getUser() is a network call to the auth server, so an
 * action that checks more than once - directly or through a helper - should not
 * pay for it twice.
 */
const resolveRole = cache(async function resolveRole(): Promise<{
  userId: string;
  role: StaffRole;
} | null> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        /**
         * Server actions can write cookies, so a token refreshed here is kept.
         *
         * This matters because the middleware deliberately skips server-action
         * requests (see proxy.ts) - if the refresh were dropped, an admin whose
         * access token expired while sitting on a page would start getting
         * failures from every action until they happened to navigate.
         */
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Refresh is then the middleware's job on the next navigation.
          }
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const role = user.app_metadata?.role;

  // No default. An account without an explicit staff role is not staff -
  // the previous "default to admin for backward compatibility" meant any
  // authenticated user was an administrator.
  if (role !== 'admin' && role !== 'staff') return null;

  return { userId: user.id, role };
});

/** Any staff member (admin or staff). Throws if the caller is neither. */
export async function requireStaff(): Promise<{ userId: string; role: StaffRole }> {
  const actor = await resolveRole();

  if (!actor) {
    throw new AuthorizationError('You must be signed in as staff to do that.');
  }

  return actor;
}

/** Administrators only - used for revenue and other owner-level data. */
export async function requireAdmin(): Promise<{ userId: string; role: StaffRole }> {
  const actor = await resolveRole();

  if (!actor) {
    throw new AuthorizationError('You must be signed in as staff to do that.');
  }

  if (actor.role !== 'admin') {
    throw new AuthorizationError('This action is restricted to administrators.');
  }

  return actor;
}
