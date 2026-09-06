/**
 * Customer session, held in an httpOnly cookie.
 *
 * The token lives in a cookie the browser cannot read, so page scripts (and
 * anything injected into them) cannot lift it, and it rides along automatically
 * on every server action call. React state was the previous home for this, which
 * meant the "session" was only ever a hint to the UI - the server never saw it,
 * so nothing was actually verified.
 */

import 'server-only';

import { cookies } from 'next/headers';
import { validateSession } from '@/lib/services/otp-session';

const SESSION_COOKIE = 'bp_customer_session';

export async function setCustomerSessionCookie(
  token: string,
  expiresAt: string
): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // 'lax' still sends the cookie on top-level navigations back from the
    // Razorpay checkout, while keeping it off cross-site POSTs.
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearCustomerSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * The phone number this browser has verified, or null.
 *
 * Every caller that acts on a customer's behalf should start here rather than
 * trusting a phone number sent up from the page.
 */
export async function getVerifiedCustomerPhone(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const result = await validateSession(token);

  return result.isValid && result.phone ? result.phone : null;
}

export type PhoneCheck =
  | { ok: true; phone: string }
  | { ok: false; error: string };

/**
 * Confirms the caller has verified the phone number they are claiming.
 *
 * Server actions are ordinary HTTP endpoints - anyone can POST to them with any
 * payload - so a phone number in the request body is a claim, not a fact. This
 * turns it back into a fact, and rejects a verified customer trying to act as
 * somebody else.
 */
export async function requireVerifiedPhone(claimedPhone: string): Promise<PhoneCheck> {
  const verifiedPhone = await getVerifiedCustomerPhone();

  if (!verifiedPhone) {
    return {
      ok: false,
      error: 'Your verification has expired. Please verify your mobile number again.',
    };
  }

  const claimed = (claimedPhone || '').replace(/\D/g, '').slice(-10);

  if (verifiedPhone !== claimed) {
    console.warn(
      `[auth] Session for ${verifiedPhone} attempted to act as ${claimed || '(empty)'}`
    );
    return {
      ok: false,
      error: 'This booking does not match your verified mobile number.',
    };
  }

  return { ok: true, phone: verifiedPhone };
}
