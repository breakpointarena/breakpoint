/**
 * MSG91 SMS and OTP Service
 *
 * Handles OTP sending via MSG91 API
 * Documentation: https://docs.msg91.com/p/tf9GTextN/e/Oq3uX4zUm/MSG91
 */

import crypto from 'crypto';
import { isTestMode, isLiveSmsAllowed, sendOTPViaTestMode } from './msg91-test';

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'BRKPNT';
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID_OTP;
const MSG91_BASE_URL = 'https://control.msg91.com/api/v5';
const USE_SENDOTP_API = process.env.MSG91_USE_SENDOTP_API === 'true'; // Toggle between Flow API and SendOTP API

/**
 * How long to wait on MSG91 before giving up.
 *
 * There was no limit at all, and `fetch` does not impose one. A hung MSG91
 * connection held the server action open until the platform killed it, which
 * showed the customer a failure for a message MSG91 had very likely already
 * queued - the "it said failed but the OTP arrived" report. Ten seconds is well
 * past MSG91's normal response and short enough that the retry is still the
 * customer's own idea.
 */
const MSG91_TIMEOUT_MS = Number(process.env.MSG91_TIMEOUT_MS) || 10_000;

/**
 * Why a send failed, in a form the caller can branch on.
 *
 * Every failure used to arrive at the caller as prose, so the OTP service could
 * only ever repeat one generic sentence and no log said which of four unrelated
 * problems had occurred.
 */
export type SendFailureCode =
  | 'not_configured'
  | 'invalid_recipient'
  | 'provider_rejected'
  | 'provider_unreachable';

interface SendOTPResponse {
  success: boolean;
  message: string;
  code?: SendFailureCode;
  type?: string;
  request_id?: string;
}

/**
 * A phone number, reduced for logging.
 *
 * Logs travel further than the database does, so they carry enough of the
 * number to recognise it and not enough to dial it. The full number is on the
 * otp_sessions row that every failure now writes.
 */
function maskPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

/**
 * POST to MSG91 and normalise whatever comes back.
 *
 * The three send branches below each had their own copy of this, which is how
 * they ended up logging different things - one recorded the response body, none
 * recorded the HTTP status, and the branch that rejected a number outright
 * logged nothing whatsoever.
 */
async function postToMsg91(
  url: string,
  body: Record<string, unknown>,
  context: { label: string; phone: string }
): Promise<SendOTPResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: MSG91_AUTH_KEY as string,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MSG91_TIMEOUT_MS),
  });

  // MSG91 answers a gateway error with HTML, and response.json() throws on it.
  // Reading the text first keeps the status and the body in the log either way.
  const raw = await response.text();
  let data: { type?: string; message?: string; request_id?: string } = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    console.error(
      `[MSG91] ${context.label}: non-JSON response for ${context.phone}`,
      { status: response.status, body: raw.slice(0, 500) }
    );
    return {
      success: false,
      message: 'Failed to send OTP',
      code: 'provider_rejected',
    };
  }

  if (response.ok && data.type === 'success') {
    console.log(
      `[MSG91] ${context.label}: sent to ${context.phone}`,
      { request_id: data.request_id }
    );
    return {
      success: true,
      message: 'OTP sent successfully',
      request_id: data.request_id,
      type: data.type,
    };
  }

  console.error(
    `[MSG91] ${context.label}: rejected for ${context.phone}`,
    { status: response.status, type: data.type, message: data.message }
  );
  return {
    success: false,
    message: data.message || 'Failed to send OTP',
    code: 'provider_rejected',
    type: data.type,
  };
}

/**
 * Generate a 6-digit OTP.
 *
 * crypto.randomInt, not Math.random: Math.random is a seeded PRNG whose output
 * is predictable from prior values, which is not a property you want in the only
 * thing standing between a stranger and someone else's phone number.
 */
export function generateOTP(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Send OTP via MSG91 SMS API
 * Using the Flow API for template-based OTP
 */
export async function sendOTPViaSMS(
  phone: string,
  otp: string
): Promise<SendOTPResponse> {
  try {
    // Check if we're in test mode
    if (isTestMode()) {
      return await sendOTPViaTestMode(phone, otp);
    }

    if (!MSG91_AUTH_KEY) {
      console.error('[MSG91] AUTH_KEY not configured');
      return {
        success: false,
        message: 'MSG91 configuration missing. Please contact support.',
        code: 'not_configured',
      };
    }

    /**
     * Normalise through the shared validator, NOT through a second regex.
     *
     * This line used to be `phone.replace(/^\+?91/, '')`, the same naive strip
     * that validatePhoneNumber was fixed to stop doing. The two then disagreed:
     * the validator correctly kept 9123456789 whole, this took the leading 91
     * off it, and the eight digits left over failed the length check that used
     * to sit here - so a customer on a 91xxxxxxxx number was told "Failed to
     * send OTP" by a
     * function that had not yet spoken to MSG91 at all. That is a live Indian
     * mobile prefix, so those customers could never log in, and nothing on the
     * MSG91 side recorded a thing because nothing was ever sent.
     */
    const validation = validatePhoneNumber(phone);

    if (!validation.isValid) {
      console.error(
        `[MSG91] Refusing to send to ${maskPhone(phone)}: ${validation.error}`
      );
      return {
        success: false,
        message: validation.error || 'Invalid phone number format.',
        code: 'invalid_recipient',
      };
    }

    const cleanPhone = validation.cleanPhone;

    // Allowlist check sits after validation and before the paid API call, so a
    // development run can exercise the whole flow while spending credits on one
    // handset only. No-op when MSG91_LIVE_SMS_NUMBERS is unset.
    if (!isLiveSmsAllowed(cleanPhone)) {
      return await sendOTPViaTestMode(cleanPhone, otp, 'not-allowlisted');
    }

    const masked = maskPhone(cleanPhone);

    // Choose API based on configuration. Without a template id the Flow API has
    // nothing to render, so SendOTP is the only option left.
    if (USE_SENDOTP_API || !MSG91_TEMPLATE_ID) {
      return await postToMsg91(
        `${MSG91_BASE_URL}/otp`,
        {
          mobile: `91${cleanPhone}`,
          otp: otp,
          otp_expiry: 5, // minutes
          template_id: MSG91_TEMPLATE_ID || undefined,
          /**
           * Only the OTP is passed. The MSG91 template briefly carried a second
           * variable, "##var1##", tacked on after the website URL that DLT had
           * insisted the content contain. DLT itself approved the URL as static
           * text, so that variable existed on MSG91's side and nowhere else - the
           * outbound message went out with the literal characters "##var1##" in it,
           * did not match the approved content, and was dropped.
           *
           * The template has since been corrected to end at the URL. Nothing here
           * should supply a variable the approved content does not define.
           */
        },
        { label: 'SendOTP', phone: masked }
      );
    }

    // Flow API (template-based SMS).
    return await postToMsg91(
      `${MSG91_BASE_URL}/flow`,
      {
        template_id: MSG91_TEMPLATE_ID,
        sender: MSG91_SENDER_ID,
        short_url: '0',
        mobiles: `91${cleanPhone}`, // MSG91 expects country code + number
        OTP: otp, // Variable that will be replaced in template
      },
      { label: 'Flow', phone: masked }
    );
  } catch (error) {
    // A timeout is called out separately because it is the one failure where
    // MSG91 may well have accepted the message anyway - the customer can be
    // holding the SMS while we report a failure, so the log has to say which
    // case this was.
    const timedOut = error instanceof Error && error.name === 'TimeoutError';

    console.error(
      `[MSG91] ${timedOut ? `Timed out after ${MSG91_TIMEOUT_MS}ms` : 'Exception'} sending OTP to ${maskPhone(phone)}`,
      error
    );

    return {
      success: false,
      message: timedOut
        ? 'The SMS provider did not respond in time.'
        : 'Failed to send OTP. Please try again.',
      code: 'provider_unreachable',
    };
  }
}

/**
 * Send SMS notification (non-OTP messages)
 * For booking confirmations, subscription confirmations, etc.
 */
export async function sendSMS(
  phone: string,
  message: string,
  templateId?: string
): Promise<SendOTPResponse> {
  try {
    if (!MSG91_AUTH_KEY) {
      console.error('[MSG91] AUTH_KEY not configured');
      return {
        success: false,
        message: 'MSG91 configuration missing',
        code: 'not_configured',
      };
    }

    // Same shared validator as the OTP path, for the same reason: the old
    // `replace(/^\+?91/, '')` here silently mangled every 91xxxxxxxx number, so
    // booking and subscription confirmations went to an eight-digit address.
    const validation = validatePhoneNumber(phone);

    if (!validation.isValid) {
      console.error(
        `[MSG91] Refusing to send SMS to ${maskPhone(phone)}: ${validation.error}`
      );
      return {
        success: false,
        message: validation.error || 'Invalid phone number format.',
        code: 'invalid_recipient',
      };
    }

    const cleanPhone = validation.cleanPhone;

    const response = await fetch(`${MSG91_BASE_URL}/flow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': MSG91_AUTH_KEY,
      },
      body: JSON.stringify({
        template_id: templateId || MSG91_TEMPLATE_ID,
        sender: MSG91_SENDER_ID,
        short_url: '0',
        mobiles: `91${cleanPhone}`,
        message: message,
      }),
      signal: AbortSignal.timeout(MSG91_TIMEOUT_MS),
    });

    const raw = await response.text();
    let data: { message?: string; request_id?: string } = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      console.error(`[MSG91] Non-JSON SMS response for ${maskPhone(cleanPhone)}`, {
        status: response.status,
        body: raw.slice(0, 500),
      });
      return { success: false, message: 'Failed to send SMS', code: 'provider_rejected' };
    }

    if (response.ok) {
      console.log(`[MSG91] SMS sent to ${maskPhone(cleanPhone)}`, {
        request_id: data.request_id,
      });
      return {
        success: true,
        message: 'SMS sent successfully',
        request_id: data.request_id,
      };
    } else {
      console.error(`[MSG91] Failed to send SMS to ${maskPhone(cleanPhone)}`, {
        status: response.status,
        message: data.message,
      });
      return {
        success: false,
        message: data.message || 'Failed to send SMS',
        code: 'provider_rejected',
      };
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    console.error(
      `[MSG91] ${timedOut ? `Timed out after ${MSG91_TIMEOUT_MS}ms` : 'Exception'} sending SMS to ${maskPhone(phone)}`,
      error
    );
    return {
      success: false,
      message: 'Failed to send SMS',
      code: 'provider_unreachable',
    };
  }
}

/**
 * Validate phone number format for India
 */
export function validatePhoneNumber(phone: string): {
  isValid: boolean;
  cleanPhone: string;
  error?: string;
} {
  // Remove spaces, dashes, and other characters
  let cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

  /**
   * Strip the country code, but only where it really is one.
   *
   * `replace(/^\+?91/, '')` took the leading 91 off any number that happened to
   * start with it, and 91 is a live Indian mobile prefix - 9123456789 became
   * 23456789 and was rejected as "must be 10 digits". Every customer on a
   * 91xxxxxxxx number was locked out of logging in.
   *
   * An explicit `+` is unambiguous. Without one, 91 is only a country code when
   * what follows it is a full 10-digit number.
   */
  if (cleanPhone.startsWith('+91')) {
    cleanPhone = cleanPhone.slice(3);
  } else if (/^91\d{10}$/.test(cleanPhone)) {
    cleanPhone = cleanPhone.slice(2);
  } else if (cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.slice(1);
  }

  // Check if it's exactly 10 digits
  if (!/^\d{10}$/.test(cleanPhone)) {
    return {
      isValid: false,
      cleanPhone: cleanPhone,
      error: 'Phone number must be 10 digits',
    };
  }

  // Check if it starts with valid Indian mobile prefix (6-9)
  if (!/^[6-9]/.test(cleanPhone)) {
    return {
      isValid: false,
      cleanPhone: cleanPhone,
      error: 'Invalid Indian mobile number',
    };
  }

  return {
    isValid: true,
    cleanPhone: cleanPhone,
  };
}
