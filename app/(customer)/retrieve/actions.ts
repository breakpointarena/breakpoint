"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { getVerifiedCustomerPhone } from "@/lib/auth/customer-session";

/**
 * Booking retrieval, scoped to the caller's own number.
 *
 * These reads used to take a phone number as an argument and return everything
 * stored against it - name, email, date of birth, amounts paid, payment ids -
 * to anyone who typed ten digits. They run on the service role, so RLS offers
 * no protection either. The number is now taken from the verified session
 * instead of the request, so a caller can only ever read their own history.
 */

const NOT_VERIFIED = "Please verify your mobile number to view your bookings.";

const BOOKING_SELECT = `
  *,
  booking_device_slots (*),
  booking_food_items (*)
`;

export interface RetrieveResult<T> {
  success: boolean;
  error?: string;
  /** Tells the page to send the customer through OTP before retrying. */
  verificationRequired?: boolean;
  bookings?: T[];
  booking?: T | null;
}

/**
 * Every booking belonging to the verified caller.
 *
 * Deliberately takes no phone argument: accepting one would mean deciding
 * whether to trust it, and the answer is always no.
 */
export async function getMyBookings(): Promise<RetrieveResult<any>> {
  try {
    const phone = await getVerifiedCustomerPhone();

    if (!phone) {
      return { success: false, error: NOT_VERIFIED, verificationRequired: true, bookings: [] };
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("customer_phone", phone)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { success: true, bookings: data || [] };
  } catch (err: any) {
    console.error("Error fetching bookings:", err);
    return { success: false, error: "Failed to fetch bookings", bookings: [] };
  }
}

/**
 * A single booking by its number, provided it belongs to the caller.
 *
 * The ownership check is what makes the booking number safe to look up: it is
 * short, printed on receipts and shown in QR codes, so it is not a secret and
 * must not act as one.
 */
export async function getMyBookingByNumber(
  bookingNumber: string
): Promise<RetrieveResult<any>> {
  try {
    const phone = await getVerifiedCustomerPhone();

    if (!phone) {
      return { success: false, error: NOT_VERIFIED, verificationRequired: true, booking: null };
    }

    if (!bookingNumber || !bookingNumber.trim()) {
      return { success: false, error: "Booking number is required", booking: null };
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("booking_number", bookingNumber.trim().toUpperCase())
      // Scoped to the caller. A booking belonging to someone else reads as
      // "not found" rather than "not yours", so this cannot be used to test
      // whether a given booking number exists.
      .eq("customer_phone", phone)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return { success: false, error: "No booking found with this number", booking: null };
    }

    return { success: true, booking: data };
  } catch (err: any) {
    console.error("Error fetching booking:", err);
    return { success: false, error: "Failed to fetch booking", booking: null };
  }
}
