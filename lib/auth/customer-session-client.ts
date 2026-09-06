/**
 * Browser only, and enforced rather than assumed.
 *
 * The module-level promise below belongs to a single tab, which is what makes
 * sharing it safe. Imported into a *server* component it would be shared across
 * every request the server handles - one customer's session answer could be
 * handed to the next - so this makes that a build error instead of a leak. The
 * same guard, for the same reason, as `lib/auth/roles.ts`.
 */
import 'client-only'

import {
  getCustomerHeaderState,
  type CustomerHeaderState,
} from '@/app/(customer)/my-subscription/action'

/**
 * The signed-in customer and their membership, with concurrent callers sharing
 * one request.
 *
 * Two components ask this in the same mount tick on the pages behind the gate:
 * `CustomerAuthGate`, which decides whether to show the page or ask for a code,
 * and `CustomerSessionMenu` in the navbar, which draws the account control. They
 * were asking separately - two Server Function round trips, each validating the
 * same session cookie, to answer one question. On /retrieve and
 * /my-subscription that was half the requests the page made.
 *
 * Only in-flight requests are shared, and the slot is released as soon as one
 * settles - so this collapses a simultaneous burst without ever handing back a
 * cached answer. A later caller still gets a fresh check, so signing out or a
 * session lapsing is noticed exactly as promptly as before.
 */
let pending: Promise<CustomerHeaderState> | null = null

/** Namespaced so it cannot collide with an event from anything else on window. */
const SESSION_CHANGED_EVENT = 'breakpoint:customer-session-changed'

export function getCustomerHeaderStateShared(): Promise<CustomerHeaderState> {
  if (pending) return pending

  const inflight = getCustomerHeaderState().catch((error) => {
    // Matches what the action itself returns on failure, so a caller cannot
    // tell the difference between a failed lookup and no session.
    console.error('Error getting customer session:', error)
    return { phone: null, plan: null }
  })

  pending = inflight

  // Released on settle rather than kept, so nothing here is ever stale - but
  // only by the request that still owns the slot. Clearing it unconditionally
  // let a slow earlier lookup release a newer one, so the next caller started a
  // duplicate instead of joining the request already in flight.
  void inflight.finally(() => {
    if (pending === inflight) pending = null
  })

  return inflight
}

/**
 * Broadcast that this browser's session changed: a customer just verified, or
 * signed out.
 *
 * Verifying does not navigate. Every login surface swaps a step in local state
 * on the page the customer is already on, so nothing re-rendered the navbar's
 * account control - it only re-read the session on a route change. A customer
 * with a membership therefore saw no plan in the header until they happened to
 * navigate or reload, which read as the plan not existing.
 *
 * A window event rather than a store: the consumers are unrelated components in
 * different trees (the navbar sits in the customer layout, the login form is
 * several levels down inside the page), and this is one bit of information they
 * all need at the same instant.
 */
export function notifyCustomerSessionChanged(): void {
  if (typeof window === 'undefined') return

  // Anything already in flight was asked before the change, so it can only
  // answer for the session that has just been replaced. Drop it rather than let
  // a listener reacting to this event join it.
  pending = null

  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
}

/**
 * Re-read the session whenever it changes. Returns the unsubscribe function, so
 * an effect can return it directly.
 */
export function subscribeToCustomerSession(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  window.addEventListener(SESSION_CHANGED_EVENT, listener)
  return () => window.removeEventListener(SESSION_CHANGED_EVENT, listener)
}
