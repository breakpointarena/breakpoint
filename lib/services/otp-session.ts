/**
 * OTP Session Management
 *
 * Phone verification via MSG91, and the short-lived session a customer holds
 * afterwards.
 *
 * Two rules govern everything here:
 *
 *  1. A session is proven by presenting its token, never by naming a phone
 *     number. Anything that accepts a phone as proof lets a stranger ride along
 *     on someone else's verification.
 *  2. Nothing reusable is stored. The OTP is kept only as a keyed hash and the
 *     session token only as a digest, so a database read cannot impersonate a
 *     customer.
 */

import 'server-only';

import { supabaseAdmin } from '@/lib/supabase/server';
import {
  generateOTP,
  sendOTPViaSMS,
  validatePhoneNumber,
  type SendFailureCode,
} from './msg91';
import { formatClockTime12h } from '@/lib/utils/dates';
import crypto from 'crypto';

/**
 * A positive whole number from the environment, or the fallback.
 *
 * `parseInt` alone is not safe for any of these. Every one of them is now passed
 * into SQL as a parameter, and `parseInt('')`, `parseInt('off')` or a stray
 * comma all yield NaN - which `JSON.stringify` sends to PostgREST as `null`, and
 * `x >= NULL` in plpgsql is NULL, so the comparison is simply skipped. A
 * mistyped variable therefore did not fall back to the default; it removed the
 * ceiling altogether. That is the wrong direction to fail for a limit whose job
 * is to cap spending on SMS and to cap guesses against a six-digit code.
 *
 * Zero and negatives are rejected for the same reason: a ceiling of 0 or -1
 * would either lock every customer out or, once it reaches SQL, behave as no
 * ceiling at all.
 */
function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(
      `[OTP] ${name}="${raw}" is not a positive whole number. Using ${fallback}.`
    );
    return fallback;
  }

  return parsed;
}

const OTP_EXPIRY_MINUTES = positiveIntFromEnv('OTP_EXPIRY_MINUTES', 5);
/**
 * How long a customer stays signed in after verifying.
 *
 * Twelve hours covers a full trading day, so someone who books in the morning
 * can order food and check their booking that evening without paying for
 * another SMS. The trade is that a session on a shared or public device stays
 * usable for the rest of the day - which is what the sign-out button is for.
 */
const SESSION_EXPIRY_MINUTES = positiveIntFromEnv('CUSTOMER_SESSION_MINUTES', 12 * 60);
const MAX_OTP_ATTEMPTS = positiveIntFromEnv('OTP_MAX_ATTEMPTS', 3);
/**
 * Both ceilings come from the same setting, as they did before.
 *
 * The hourly limit used to be hardcoded to 3 inside check_otp_rate_limit while
 * the resend ceiling read this variable, so the two could silently disagree.
 * They are now passed together into begin_otp_session, which applies them.
 */
const MAX_REQUESTS_PER_HOUR = positiveIntFromEnv('OTP_MAX_REQUESTS_PER_PHONE', 3);
const MAX_RESEND_COUNT = MAX_REQUESTS_PER_HOUR;
const RESEND_COOLDOWN_SECONDS = 60;

export interface OTPSessionResult {
  success: boolean;
  message: string;
  expiresAt?: string;
  canResend?: boolean;
  nextResendAt?: string;
  /**
   * Short handle for the attempt, shown to the customer when a send fails and
   * written on the otp_sessions row.
   *
   * A failed send used to leave nothing behind but one console line with no
   * phone number on it, so "the site said failed to send" could not be traced to
   * anything. Quoting this reference now finds the exact row.
   */
  reference?: string;
}

export interface VerifyOTPResult {
  success: boolean;
  message: string;
  /** Plaintext token. Returned once, for the caller to put in an httpOnly cookie. */
  sessionToken?: string;
  phone?: string;
  sessionExpiresAt?: string;
}

export interface SessionValidationResult {
  isValid: boolean;
  phone?: string;
  sessionExpiresAt?: string;
  message?: string;
}

/**
 * Secret for keying OTP hashes.
 *
 * Required, and deliberately loud when missing. The previous implementation
 * appended `process.env.SESSION_SECRET` straight into a SHA-256 - so an unset
 * variable silently became the literal string "undefined", turning every stored
 * hash into a plain unsalted digest of a six-digit number that any database
 * reader could reverse by trying all million.
 */
function getOtpSecret(): string {
  const secret = process.env.OTP_HASH_SECRET || process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'OTP_HASH_SECRET is missing or too short (needs >= 32 chars). ' +
        'Refusing to hash OTPs with a weak or absent key.'
    );
  }

  return secret;
}

/** Keyed hash of an OTP. HMAC, so the digest cannot be precomputed offline. */
function hashOTP(otp: string): string {
  return crypto.createHmac('sha256', getOtpSecret()).update(otp).digest('hex');
}

/** Session tokens are high-entropy, so a plain digest is enough to look them up. */
function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** A phone number reduced for logging. The full number is on the row. */
function maskPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

/**
 * What to tell the customer when the SMS does not go out.
 *
 * Every one of these used to be the single sentence "Failed to send OTP. Please
 * try again." - a misconfigured auth key, a number the provider will not accept,
 * a rejection and a timeout were indistinguishable to the person reading the
 * toast and to whoever they then called. The reference makes any of them
 * traceable to a row.
 */
function messageForSendFailure(
  code: SendFailureCode | undefined,
  reference: string
): string {
  switch (code) {
    case 'invalid_recipient':
      return 'That mobile number cannot receive SMS. Please check the number and try again.';
    case 'not_configured':
      return `OTP delivery is not configured. Please contact support and quote reference ${reference}.`;
    case 'provider_unreachable':
      return `Our SMS provider is not responding. Please try again in a moment (reference ${reference}).`;
    case 'provider_rejected':
    default:
      return `We could not send the OTP. Please try again, or quote reference ${reference} to support.`;
  }
}

/**
 * Issue a code: reserve the session, then send it.
 *
 * The order matters and it used to be the other way round. The SMS went out
 * first, then every earlier session was retired, then the row was inserted - so
 * a failed insert left the customer holding a live code that no row backed,
 * with their previous session already cancelled.
 *
 * begin_otp_session now settles the rate limit, the cooldown, the retirement of
 * the old code and the insert of the new one in a single transaction behind a
 * per-phone lock. Only once that row exists is the SMS attempted, and the row is
 * marked with what happened either way.
 */
async function issueOTP(
  phone: string,
  isResend: boolean,
  ipAddress?: string,
  userAgent?: string
): Promise<OTPSessionResult> {
  try {
    const validation = validatePhoneNumber(phone);
    if (!validation.isValid) {
      return { success: false, message: validation.error || 'Invalid phone number' };
    }

    const cleanPhone = validation.cleanPhone;
    const masked = maskPhone(cleanPhone);
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const { data, error } = await supabaseAdmin.rpc('begin_otp_session', {
      p_phone: cleanPhone,
      p_otp_hash: hashOTP(otp),
      p_otp_expires_at: otpExpiresAt.toISOString(),
      p_max_per_hour: MAX_REQUESTS_PER_HOUR,
      p_cooldown_seconds: RESEND_COOLDOWN_SECONDS,
      p_max_resends: MAX_RESEND_COUNT,
      p_is_resend: isResend,
      p_ip_address: ipAddress ?? null,
      p_user_agent: userAgent ?? null,
    });

    if (error || !data?.length) {
      // Fail closed. A rate limiter that opens up when the database hiccups is
      // an invitation to pump SMS charges.
      console.error(`[OTP] begin_otp_session failed for ${masked}:`, error);
      return { success: false, message: 'Could not send OTP right now. Please try again.' };
    }

    const reservation = data[0];

    if (reservation.outcome === 'rate_limited') {
      /**
       * The arena's clock, not the host's.
       *
       * This read `new Date(...).toLocaleTimeString()`, which formats in
       * whatever zone the process happens to be in. It runs inside a server
       * action, so that is UTC on a deployed host - the customer was told to
       * come back at a time five and a half hours off, in a message whose only
       * purpose is to name a time they can act on. `formatClockTime12h` is the
       * helper the rest of the app already uses for exactly this.
       */
      const retryAt = formatClockTime12h(reservation.next_allowed_at);

      return {
        success: false,
        message: retryAt
          ? `Too many OTP requests. Please try again after ${retryAt}.`
          : 'Too many OTP requests. Please try again later.',
        canResend: false,
        nextResendAt: reservation.next_allowed_at,
      };
    }

    if (reservation.outcome === 'cooldown') {
      return {
        success: false,
        message: `Please wait ${reservation.seconds_remaining} seconds before requesting a new OTP`,
        canResend: false,
        nextResendAt: reservation.next_allowed_at,
      };
    }

    if (reservation.outcome === 'resend_limit') {
      return {
        success: false,
        message: 'Maximum resend limit reached. Please try again later.',
        canResend: false,
      };
    }

    const sessionId: string = reservation.session_id;
    const reference = sessionId.slice(0, 8);

    const smsResult = await sendOTPViaSMS(cleanPhone, otp);

    if (!smsResult.success) {
      // Retire the reservation. A failed row is not redeemable and does not
      // count against the hourly ceiling, so one provider outage cannot lock a
      // customer out for an hour.
      const { error: markError } = await supabaseAdmin
        .from('otp_sessions')
        .update({
          is_active: false,
          send_status: 'failed',
          send_error: smsResult.code ?? 'unknown',
        })
        .eq('id', sessionId);

      if (markError) {
        console.error(`[OTP] ref=${reference} could not mark send failed:`, markError);
      }

      console.error(
        `[OTP] ref=${reference} send failed for ${masked}`,
        { code: smsResult.code ?? 'unknown', detail: smsResult.message, isResend }
      );

      return {
        success: false,
        message: messageForSendFailure(smsResult.code, reference),
        reference,
      };
    }

    // Bookkeeping only. Verification accepts a row that is still 'pending', so
    // losing this write cannot strand a customer holding a code that did arrive.
    const { error: confirmError } = await supabaseAdmin
      .from('otp_sessions')
      .update({
        send_status: 'sent',
        msg91_request_id: smsResult.request_id ?? null,
      })
      .eq('id', sessionId);

    if (confirmError) {
      console.error(`[OTP] ref=${reference} could not mark send confirmed:`, confirmError);
    }

    console.log(
      `[OTP] ref=${reference} OTP sent to ${masked}`,
      { request_id: smsResult.request_id ?? null, isResend }
    );

    return {
      success: true,
      message: 'OTP sent successfully to your mobile number',
      expiresAt: reservation.expires_at,
      canResend: true,
      reference,
    };
  } catch (error) {
    console.error('[OTP] issueOTP failed:', error);
    return { success: false, message: 'An error occurred. Please try again.' };
  }
}

/**
 * Create an OTP session and send the code by SMS.
 */
export async function createOTPSession(
  phone: string,
  ipAddress?: string,
  userAgent?: string
): Promise<OTPSessionResult> {
  return issueOTP(phone, false, ipAddress, userAgent);
}

/**
 * Verify an OTP and mint a session token.
 *
 * The attempt counter is consumed inside the database under a row lock, so two
 * concurrent guesses cannot share one attempt.
 */
export async function verifyOTP(phone: string, otp: string): Promise<VerifyOTPResult> {
  try {
    const validation = validatePhoneNumber(phone);
    if (!validation.isValid) {
      return { success: false, message: validation.error || 'Invalid phone number' };
    }

    if (!/^\d{6}$/.test((otp || '').trim())) {
      return { success: false, message: 'Please enter the 6-digit code.' };
    }

    const cleanPhone = validation.cleanPhone;

    const { data, error } = await supabaseAdmin.rpc('consume_otp_attempt', {
      p_phone: cleanPhone,
      p_otp_hash: hashOTP(otp.trim()),
      p_max_attempts: MAX_OTP_ATTEMPTS,
    });

    if (error || !data?.length) {
      console.error('[OTP] consume_otp_attempt failed:', error);
      return { success: false, message: 'An error occurred during verification. Please try again.' };
    }

    const result = data[0];

    if (result.outcome === 'no_session') {
      return { success: false, message: 'OTP expired or invalid. Please request a new OTP.' };
    }

    if (result.outcome === 'too_many_attempts') {
      return { success: false, message: 'Maximum OTP attempts exceeded. Please request a new OTP.' };
    }

    if (result.outcome === 'invalid') {
      const remaining = Math.max(0, result.attempts_remaining);
      return {
        success: false,
        message: remaining > 0
          ? `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
          : 'Maximum OTP attempts exceeded. Please request a new OTP.',
      };
    }

    const sessionToken = generateSessionToken();
    const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000);
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('otp_sessions')
      .update({
        is_verified: true,
        otp_verified_at: nowIso,
        session_token_hash: hashSessionToken(sessionToken),
        session_created_at: nowIso,
        session_expires_at: sessionExpiresAt.toISOString(),
        session_last_activity: nowIso,
      })
      .eq('id', result.session_id);

    if (updateError) {
      console.error('[OTP] Failed to open session:', updateError);
      return { success: false, message: 'Failed to create session. Please try again.' };
    }

    return {
      success: true,
      message: 'OTP verified successfully',
      sessionToken,
      phone: cleanPhone,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
    };
  } catch (error) {
    console.error('[OTP] verifyOTP failed:', error);
    return { success: false, message: 'An error occurred during verification. Please try again.' };
  }
}

/**
 * Resolve a session token to the phone number it verified.
 *
 * This is the ONLY way to establish who a customer is. There is deliberately no
 * lookup by phone number: the removed `getActiveSessionByPhone()` returned a live
 * session to anyone who typed the right digits, so entering someone else's number
 * inside their active session window skipped verification entirely.
 */
export async function validateSession(
  sessionToken: string
): Promise<SessionValidationResult> {
  try {
    if (!sessionToken) {
      return { isValid: false, message: 'No session token provided' };
    }

    const { data, error } = await supabaseAdmin.rpc('validate_session_token', {
      p_session_token_hash: hashSessionToken(sessionToken),
    });

    if (error || !data?.length || !data[0].is_valid) {
      return {
        isValid: false,
        message: 'Session expired. Please verify your phone number again.',
      };
    }

    return {
      isValid: true,
      phone: data[0].phone,
      sessionExpiresAt: data[0].session_expires_at,
    };
  } catch (error) {
    console.error('[OTP] validateSession failed:', error);
    return { isValid: false, message: 'Failed to validate session' };
  }
}

/**
 * Resend the OTP for a phone number.
 *
 * The ceiling, the counter and the increment all live in begin_otp_session now.
 * They had to: this function used to read the newest session, call
 * createOTPSession (which retired that session and inserted a replacement
 * starting at resend_count 0), and then write the incremented count back to the
 * row it had just retired - so the counter never advanced on any row anyone
 * would go on to read, and the resend ceiling never actually bit.
 */
export async function resendOTP(
  phone: string,
  ipAddress?: string,
  userAgent?: string
): Promise<OTPSessionResult> {
  return issueOTP(phone, true, ipAddress, userAgent);
}

export async function cleanupExpiredSessions(): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('cleanup_expired_otp_sessions');
  if (error) {
    console.error('[OTP] cleanup failed:', error);
    return 0;
  }
  return (data as number) ?? 0;
}
