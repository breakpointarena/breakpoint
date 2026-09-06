'use client';

import { supabase } from '@/lib/supabase/client';

/**
 * Signing out on purpose, told apart from a session running out.
 *
 * Supabase raises the same `SIGNED_OUT` event either way, so `SessionMonitor`
 * had no way to know which had happened and treated both as an expiry. Pressing
 * Log Out therefore produced two toasts at once - "Logged Out" from the button
 * and "Session Expired" from the monitor - which read as a failure at the exact
 * moment the thing had worked.
 *
 * Module-level rather than React state on purpose: the monitor and the button
 * live in different components, and the flag has to survive the navigation to
 * the login screen that follows. It is per browser tab, which is the same scope
 * as the session it describes.
 */
let deliberate = false;

/** True while a sign-out the user asked for is in progress. */
export function isDeliberateSignOut(): boolean {
  return deliberate;
}

/**
 * Forget the intent.
 *
 * Called when a session is established again, so that a genuine expiry later in
 * the same tab is still announced.
 */
export function clearDeliberateSignOut(): void {
  deliberate = false;
}

/**
 * Sign the current staff member out, recording that it was intentional.
 *
 * Every logout control should go through this rather than calling
 * `supabase.auth.signOut()` directly - a caller that forgets is exactly how the
 * duplicate toast came back.
 */
export async function signOutAdmin(): Promise<{ error: { message: string } | null }> {
  deliberate = true;

  const { error } = await supabase.auth.signOut();

  // Nothing was signed out, so nothing should be suppressed: a real expiry
  // arriving afterwards still deserves to be announced.
  if (error) clearDeliberateSignOut();

  return { error };
}
