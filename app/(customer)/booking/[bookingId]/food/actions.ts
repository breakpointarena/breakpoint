"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { getVerifiedCustomerPhone } from "@/lib/auth/customer-session";

export async function getMenuItems() {
  try {
    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .select("*")
      .eq("status", "available")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    return { success: true, items: data || [] };
  } catch (err: any) {
    console.error("Error fetching menu items:", err);
    return { success: false, error: err.message, items: [] };
  }
}

export async function addFoodToBooking(
  bookingId: string,
  foodItems: Array<{
    menu_item_id: string;
    item_name: string;
    item_category: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>
) {
  try {
    // Get booking details first
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("customer_phone, food_subtotal, device_subtotal, total_amount")
      .eq("id", bookingId)
      .single();

    if (bookingError) throw bookingError;

    // The booking id comes from the URL, so it identifies a booking but proves
    // nothing about who is asking. Without this, anyone holding (or guessing) an
    // id could load another customer's tab with food they would be billed for.
    const verifiedPhone = await getVerifiedCustomerPhone();

    if (!verifiedPhone || verifiedPhone !== booking.customer_phone) {
      return {
        success: false,
        error: "Please verify your mobile number to add food to this booking.",
        verificationRequired: true,
      };
    }

    // Insert food items
    const foodItemsToInsert = foodItems.map(item => ({
      booking_id: bookingId,
      ...item,
      status: "pending"
    }));

    const { error: insertError } = await supabaseAdmin
      .from("booking_food_items")
      .insert(foodItemsToInsert);

    if (insertError) throw insertError;

    // Calculate new food subtotal
    const newFoodSubtotal = (booking.food_subtotal || 0) + foodItems.reduce((sum, item) => sum + item.line_total, 0);
    const newTotalAmount = (booking.device_subtotal || 0) + newFoodSubtotal;

    // Update booking totals
    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        food_subtotal: newFoodSubtotal,
        total_amount: newTotalAmount
      })
      .eq("id", bookingId);

    if (updateError) throw updateError;

    return { success: true, phone: booking.customer_phone };
  } catch (err: any) {
    console.error("Error adding food to booking:", err);
    return { success: false, error: err.message };
  }
}
