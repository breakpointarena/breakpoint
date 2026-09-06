"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require-admin";

export async function getMenuItems() {
  await requireStaff();

  try {
    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return {
      success: true,
      menuItems: data || []
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      menuItems: []
    };
  }
}

export async function createMenuItem(formData: FormData) {
  await requireStaff();

  const { error } = await supabaseAdmin.from("menu_items").insert([{
    name: formData.get("name") as string,
    category: formData.get("category") as string,
    price: Number(formData.get("price") || 0),
    quantity: Math.max(0, parseInt(formData.get("quantity") as string || "0", 10)),
    status: formData.get("status") as string,
    description: formData.get("description") as string,
    image_url: (formData.get("image_url") as string) || null
  }]);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/food");
  return { success: true };
}

export async function updateMenuItem(formData: FormData) {
  await requireStaff();

  const id = formData.get("id") as string;

  const { error } = await supabaseAdmin.from("menu_items").update({
    name: formData.get("name") as string,
    category: formData.get("category") as string,
    price: Number(formData.get("price") || 0),
    quantity: Math.max(0, parseInt(formData.get("quantity") as string || "0", 10)),
    status: formData.get("status") as string,
    description: formData.get("description") as string,
    // An admin who removes the picture sends an empty string. Store the absence
    // as NULL rather than as "", so every `image_url ? ...` check and any
    // IS NULL query agree on what "this item has no picture" means.
    image_url: (formData.get("image_url") as string) || null,
    updated_at: new Date().toISOString()
  }).eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/food");
  return { success: true };
}

export async function deleteMenuItem(id: string) {
  await requireStaff();

  const { error } = await supabaseAdmin.from("menu_items").delete().eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/food");
  return { success: true };
}