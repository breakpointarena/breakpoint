/**
 * MSG91 Test Mode - For Development Without Real SMS
 *
 * This allows testing OTP flow without MSG91 credentials
 * In test mode, OTP is logged to console instead of sent via SMS
 */

const IS_TEST_MODE = process.env.MSG91_TEST_MODE === 'true';

/**
 * Numbers allowed to receive a real SMS while MSG91_TEST_MODE is off.
 *
 * Testing the whole flow needs live delivery to at least one handset, but not
 * to every number typed into the form - each of those is a paid credit, and
 * during development most are typos or throwaways. With this set, only the
 * listed numbers reach MSG91; everything else falls back to the console.
 *
 * Empty (the production default) means no allowlist: every number is live.
 * Comma-separated, last-10-digits compared, so +91/spaces/dashes are fine.
 */
const LIVE_SMS_ALLOWLIST = (process.env.MSG91_LIVE_SMS_NUMBERS || '')
  .split(',')
  .map((entry) => entry.replace(/\D/g, '').slice(-10))
  .filter((entry) => entry.length === 10);

/**
 * Whether this number should get a real SMS, given the allowlist.
 *
 * Deliberately opt-in: an unset variable changes nothing, so production cannot
 * accidentally inherit a developer's allowlist and silently stop sending.
 */
export function isLiveSmsAllowed(phone: string): boolean {
  if (LIVE_SMS_ALLOWLIST.length === 0) return true;
  return LIVE_SMS_ALLOWLIST.includes((phone || '').replace(/\D/g, '').slice(-10));
}

export function describeAllowlist(): string {
  return LIVE_SMS_ALLOWLIST.length === 0
    ? '(none - all numbers live)'
    : LIVE_SMS_ALLOWLIST.join(', ');
}

interface SendOTPResponse {
  success: boolean;
  message: string;
  type?: string;
  request_id?: string;
}

// OTP generation lives in ./msg91 (crypto-backed). This module only handles the
// no-SMS development path, so it must not ship a second, weaker generator.

/**
 * Send OTP in Test Mode (logs to console)
 */
export async function sendOTPViaTestMode(
  phone: string,
  otp: string,
  reason: 'test-mode' | 'not-allowlisted' = 'test-mode'
): Promise<SendOTPResponse> {
  const heading =
    reason === 'not-allowlisted'
      ? '📱 OTP NOT SENT - number is not on MSG91_LIVE_SMS_NUMBERS'
      : '📱 MSG91 TEST MODE - OTP NOT SENT TO REAL PHONE';

  console.log('='.repeat(60));
  console.log(heading);
  console.log('='.repeat(60));
  console.log(`Phone: +91 ${phone}`);
  console.log(`OTP:   ${otp}`);
  if (reason === 'not-allowlisted') {
    console.log(`Live numbers: ${describeAllowlist()}`);
  }
  console.log('='.repeat(60));

  return {
    success: true,
    message: `OTP sent successfully (TEST MODE)`,
    type: 'success',
    request_id: `test-${Date.now()}`,
  };
}

/**
 * Check if we're in test mode
 */
export function isTestMode(): boolean {
  return IS_TEST_MODE;
}
