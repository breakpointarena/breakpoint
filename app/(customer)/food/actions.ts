"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { getVerifiedCustomerPhone } from "@/lib/auth/customer-session";

export interface MenuItemFilters {
  category?: string;
  searchQuery?: string;
  availableOnly?: boolean;
}

export async function getMenuItems(filters?: MenuItemFilters) {
  try {
    let query = supabaseAdmin
      .from("menu_items")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (filters?.availableOnly) {
      query = query.eq("status", "available");
    }

    if (filters?.category && filters.category !== "all") {
      query = query.eq("category", filters.category);
    }

    if (filters?.searchQuery) {
      query = query.ilike("name", `%${filters.searchQuery}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, menuItems: data || [] };
  } catch (err: any) {
    console.error("Get menu items error:", err);
    return { success: false, error: err.message, menuItems: [] };
  }
}
// validate menu items stock and availability before adding to cart
export async function validateMenuItems(
  items: Array<{ menu_item_id: string; quantity: number }>
) {
  try {
    const itemIds = items.map((item) => item.menu_item_id);

    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .select("id, name, price, quantity, status")
      .in("id", itemIds);

    if (error) throw error;

    const unavailableItems: string[] = [];
    const insufficientStock: string[] = [];

    items.forEach((orderItem) => {
      const menuItem = data?.find((item: any) => item.id === orderItem.menu_item_id);

      if (!menuItem) {
        // The row is gone, so there is no name to show. Never surface the raw id -
        // it means nothing to a customer.
        unavailableItems.push("An item that is no longer on the menu");
        return;
      }

      if (menuItem.status !== "available") {
        unavailableItems.push(menuItem.name);
        return;
      }

      if (menuItem.quantity < orderItem.quantity) {
        insufficientStock.push(
          `${menuItem.name} (Available: ${menuItem.quantity})`
        );
      }
    });

    if (unavailableItems.length > 0 || insufficientStock.length > 0) {
      // Stock can change between adding to the cart and checking out, so name the
      // item that is the problem and say what to do about it. "Some items are
      // unavailable" left the customer with nothing to act on. The structured lists
      // stay on the response for any caller that wants to highlight rows.
      const parts: string[] = [];
      if (unavailableItems.length > 0) {
        parts.push(
          `${unavailableItems.join(", ")} ${unavailableItems.length === 1 ? "is" : "are"} out of stock`
        );
      }
      if (insufficientStock.length > 0) {
        parts.push(`we only have ${insufficientStock.join(", ")}`);
      }

      return {
        success: false,
        error: `${parts.join(", and ")}. Please remove or reduce the item in your cart, then try again.`,
        unavailableItems,
        insufficientStock,
      };
    }

    return { success: true, validatedItems: data };
  } catch (err: any) {
    console.error("Validate menu items error:", err);
    return { success: false, error: err.message };
  }
}

export async function addFoodOrderToBooking(
  bookingId: string,
  items: Array<{
    menu_item_id: string;
    name: string;
    category: string;
    quantity: number;
    price: number;
  }>
) {
  try {
    // First, get the booking to ensure it exists
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, customer_phone, food_subtotal, device_subtotal, total_amount, amount_paid, subscription_discount, promo_discount, happy_hour_discount"
      )
      .eq("id", bookingId)
      .single();

    if (bookingError) throw bookingError;

    // The booking id arrives from client state, so it names a booking but says
    // nothing about who is asking. This food goes on someone's tab to be paid at
    // the counter, so an unverified caller could otherwise run up a stranger's
    // bill using an id they happened to hold.
    const verifiedPhone = await getVerifiedCustomerPhone();

    if (!verifiedPhone || verifiedPhone !== booking.customer_phone) {
      return {
        success: false,
        error: "Please verify your mobile number to add food to this booking.",
        verificationRequired: true,
      };
    }

    // Create food order line items
    const foodItems = items.map((item) => ({
      booking_id: bookingId,
      menu_item_id: item.menu_item_id,
      item_name: item.name,
      item_category: item.category,
      quantity: item.quantity,
      unit_price: item.price,
      line_total: item.price * item.quantity,
      status: "pending",
    }));

    const { data: createdItems, error: foodError } = await supabaseAdmin
      .from("booking_food_items")
      .insert(foodItems)
      .select();

    if (foodError) throw foodError;

    // Update inventory quantities
    for (const item of items) {
      const { data: success, error: inventoryError } = await supabaseAdmin.rpc(
        "decrement_menu_item_quantity",
        {
          item_id: item.menu_item_id,
          decrement_by: item.quantity,
        }
      );

      if (inventoryError || !success) {
        console.error("Inventory update error:", inventoryError);
        // Log for monitoring but don't fail the order
        // (validation already happened, this is just audit trail)
      }
    }

    // Calculate new totals. Discounts apply to the device charge only, never to
    // food, but they still have to come off the total - leaving them out would
    // bill the customer for a discount they already received.
    const additionalAmount = foodItems.reduce(
      (sum, item) => sum + item.line_total,
      0
    );
    const newFoodSubtotal = Number(booking.food_subtotal || 0) + additionalAmount;
    const amountPaid = Number(booking.amount_paid || 0);
    const newTotal =
      Number(booking.device_subtotal || 0) +
      newFoodSubtotal -
      Number(booking.subscription_discount || 0) -
      Number(booking.promo_discount || 0) -
      Number(booking.happy_hour_discount || 0);

    // Mirror the admin add-food flow: record the audit trail so this food shows
    // up in the billing breakdown as unpaid.
    const { data: existingLineItems } = await supabaseAdmin
      .from("booking_line_items")
      .select("display_order")
      .eq("booking_id", bookingId)
      .order("display_order", { ascending: false })
      .limit(1);

    const startingOrder = (existingLineItems?.[0]?.display_order || 0) + 1;

    const { error: lineItemsError } = await supabaseAdmin
      .from("booking_line_items")
      .insert(
        items.map((item, index) => ({
          booking_id: bookingId,
          item_type: "food",
          description: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          line_total: item.price * item.quantity,
          reference_id: item.menu_item_id,
          reference_type: "menu_item",
          added_by: "customer",
          is_paid: false, // Goes on the tab; settled at the counter.
          display_order: startingOrder + index,
        }))
      );

    if (lineItemsError) {
      console.error("Failed to insert booking line items:", lineItemsError);
    }

    // This food has NOT been paid for - it is settled at the counter. A booking
    // whose device charge was paid online is still sitting at 'paid', so without
    // this it would keep showing "Paid" to both the customer and the front desk
    // while money is owed, and staff could check the session out for free.
    let newPaymentStatus: "pending" | "partial" | "paid";
    if (amountPaid >= newTotal - 0.01) {
      newPaymentStatus = "paid";
    } else if (amountPaid > 0) {
      newPaymentStatus = "partial";
    } else {
      newPaymentStatus = "pending";
    }

    // Update booking totals
    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        food_subtotal: newFoodSubtotal,
        total_amount: newTotal,
        payment_status: newPaymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId);

    if (updateError) throw updateError;

    return {
      success: true,
      foodItems: createdItems,
      newFoodSubtotal,
      newTotal,
      paymentStatus: newPaymentStatus,
      balanceDue: Math.max(0, newTotal - amountPaid),
    };
  } catch (err: any) {
    console.error("Add food to booking error:", err);
    return { success: false, error: err.message };
  }
}

// NOTE: createStandaloneFoodOrder() was removed when customer food orders moved
// behind Razorpay. Standalone orders are now created by lib/payments/fulfil.ts,
// which only runs after a payment is verified.

export async function getMenuCategories(): Promise<{
  success: boolean;
  categories: string[];
  error?: string;
}> {
  try {
    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .select("category")
      .eq("status", "available");

    if (error) throw error;

    const categories = Array.from(
      new Set(data?.map((item: any) => item.category) || [])
    ).sort() as string[];

    return { success: true, categories };
  } catch (err: any) {
    console.error("Get menu categories error:", err);
    return { success: false, error: err.message, categories: [] };
  }
}
