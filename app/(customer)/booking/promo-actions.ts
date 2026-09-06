"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/utils/sqlPattern";

export async function validatePromoCode(code: string) {
  try {
    if (!code || code.trim() === "") {
      return {
        success: false,
        error: "Please enter a promo code",
      };
    }

    // Fetch promo code (case-insensitive)
    const { data: promo, error: promoError } = await supabaseAdmin
      .from("promo_codes")
      .select("*")
      // Escaped: `%` in a LIKE pattern would otherwise match an arbitrary code,
      // and this action returns promo.code, so it would leak them one by one.
      .ilike("code", escapeLikePattern(code.trim()))
      .single();

    if (promoError || !promo) {
      return {
        success: false,
        error: "Invalid promo code",
      };
    }

    // Check if active
    if (!promo.is_active) {
      return {
        success: false,
        error: "This promo code is no longer active",
      };
    }

    // Check date validity.
    // Both bounds are inclusive instants, not calendar days: the admin modals
    // store `valid_from` as the start of its day and `valid_until` as the end of
    // its day (23:59:59.999), so a code set to run "until 11 Aug" is redeemable
    // for the whole of 11 Aug. Comparing with < / > rather than <= / >= keeps
    // those boundary instants valid.
    const now = new Date();
    const validFrom = new Date(promo.valid_from);
    const validUntil = new Date(promo.valid_until);

    if (now < validFrom) {
      return {
        success: false,
        error: "This promo code is not yet valid",
      };
    }

    if (now > validUntil) {
      return {
        success: false,
        error: "This promo code has expired",
      };
    }

    // Redemption cap. Mirrors resolvePromoDiscount() in lib/payments/quote.ts -
    // if this preview accepted a code the quote then drops, the customer would be
    // charged more than the summary screen showed them.
    if (promo.max_uses !== null && Number(promo.uses_count) >= Number(promo.max_uses)) {
      return {
        success: false,
        error: "This promo code has been fully redeemed",
      };
    }

    // Return valid promo details
    return {
      success: true,
      promo: {
        id: promo.id,
        code: promo.code,
        discount_type: promo.discount_type,
        discount_value: Number(promo.discount_value),
        description: promo.description,
      },
    };
  } catch (error: any) {
    console.error("Promo validation error:", error);
    return {
      success: false,
      error: "Failed to validate promo code",
    };
  }
}

export async function calculatePromoDiscount(
  subtotal: number,
  discountType: string,
  discountValue: number
): Promise<number> {
  if (discountType === "percentage") {
    return (subtotal * discountValue) / 100;
  } else if (discountType === "fixed") {
    return Math.min(discountValue, subtotal); // Can't discount more than subtotal
  }
  return 0;
}
