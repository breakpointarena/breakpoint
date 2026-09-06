"use server";

import { headers } from "next/headers";
import {
  createOTPSession,
  verifyOTP,
  resendOTP,
} from "@/lib/services/otp-session";
import {
  clearCustomerSessionCookie,
  getVerifiedCustomerPhone,
  setCustomerSessionCookie,
} from "@/lib/auth/customer-session";

/** Best-effort client attribution for rate-limit forensics. */
async function requestContext() {
  const headerList = await headers();
  return {
    ip:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerList.get("x-real-ip") ||
      undefined,
    userAgent: headerList.get("user-agent") || undefined,
  };
}

export async function sendOTPAction(phone: string) {
  const { ip, userAgent } = await requestContext();
  return await createOTPSession(phone, ip, userAgent);
}

export async function verifyOTPAction(phone: string, otp: string) {
  const result = await verifyOTP(phone, otp);

  // The token is handed to the browser as an httpOnly cookie and never returned
  // to the page, so no script can read it back out.
  if (result.success && result.sessionToken && result.sessionExpiresAt) {
    await setCustomerSessionCookie(result.sessionToken, result.sessionExpiresAt);
  }

  return {
    success: result.success,
    message: result.message,
    phone: result.phone,
    sessionExpiresAt: result.sessionExpiresAt,
  };
}

export async function resendOTPAction(phone: string) {
  const { ip, userAgent } = await requestContext();
  return await resendOTP(phone, ip, userAgent);
}

/**
 * Whether THIS browser already holds a verified session, and for which number.
 *
 * Takes no phone argument by design. The old `checkActiveSessionAction(phone)`
 * answered for any number you passed it, so typing a stranger's number during
 * their active session window skipped verification altogether.
 */
export async function checkActiveSessionAction(): Promise<{
  isValid: boolean;
  phone?: string;
}> {
  const phone = await getVerifiedCustomerPhone();
  return phone ? { isValid: true, phone } : { isValid: false };
}

export async function signOutCustomerAction() {
  await clearCustomerSessionCookie();
  return { success: true };
}
