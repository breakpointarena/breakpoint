"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/require-admin";

export async function getLivePromoListAction() {
  await requireStaff();

  const { data, error } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });

  return { data: data || [], error: error?.message || null };
}

export async function commitNewPromoAction(payload: {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
}) {
  await requireStaff();

  // Backend validation
  if (!payload.code || payload.code.trim().length === 0) {
    return { success: false, error: "Promo code is required" };
  }

  if (payload.discount_value <= 0) {
    return { success: false, error: "Discount value must be greater than 0" };
  }

  if (payload.discount_type === "percentage" && payload.discount_value > 100) {
    return { success: false, error: "Percentage discount cannot exceed 100%" };
  }

  const validFrom = new Date(payload.valid_from);
  const validUntil = new Date(payload.valid_until);

  if (validUntil <= validFrom) {
    return { success: false, error: "End date must be after start date" };
  }

  const { error } = await supabaseAdmin
    .from("promo_codes")
    .insert([
      {
        code: payload.code.toUpperCase().trim(),
        description: payload.description,
        discount_type: payload.discount_type,
        discount_value: payload.discount_value,
        valid_from: payload.valid_from,
        valid_until: payload.valid_until,
        is_active: payload.is_active,
      },
    ]);

  if (!error) revalidatePath("/admin/promo-code");
  return { success: !error, error: error?.message || null };
}

export async function updateExistingPromoAction(
  id: number,
  payload: {
    code: string;
    description: string;
    discount_type: "percentage" | "fixed";
    discount_value: number;
    valid_from: string;
    valid_until: string;
    is_active: boolean;
  }
) {
  await requireStaff();

  // Backend validation
  if (!payload.code || payload.code.trim().length === 0) {
    return { success: false, error: "Promo code is required" };
  }

  if (payload.discount_value <= 0) {
    return { success: false, error: "Discount value must be greater than 0" };
  }

  if (payload.discount_type === "percentage" && payload.discount_value > 100) {
    return { success: false, error: "Percentage discount cannot exceed 100%" };
  }

  const validFrom = new Date(payload.valid_from);
  const validUntil = new Date(payload.valid_until);

  if (validUntil <= validFrom) {
    return { success: false, error: "End date must be after start date" };
  }

  const { error } = await supabaseAdmin
    .from("promo_codes")
    .update({
      code: payload.code.toUpperCase().trim(),
      description: payload.description,
      discount_type: payload.discount_type,
      discount_value: payload.discount_value,
      valid_from: payload.valid_from,
      valid_until: payload.valid_until,
      is_active: payload.is_active,
    })
    .eq("id", id);

  if (!error) revalidatePath("/admin/promo-code");
  return { success: !error, error: error?.message || null };
}

export async function executePromoDeletionAction(id: number) {
  await requireStaff();

  const { error } = await supabaseAdmin
    .from("promo_codes")
    .delete()
    .eq("id", id);

  if (!error) revalidatePath("/admin/promo-code");
  return { success: !error, error: error?.message || null };
}