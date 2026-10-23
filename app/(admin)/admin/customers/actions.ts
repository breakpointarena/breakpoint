"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "@/lib/auth/require-admin";
import { addMonthsToDateString, arenaToday } from "@/lib/utils/dates";
import type { AssignableSubscriptionPlan } from "@/lib/types/customers";
import { addWalletCredits } from "@/lib/wallet/server";

export async function addCustomerWalletCreditAction(input: {
  customerId: string;
  amount: number;
  walletCredits?: number;
  creditType: "paid" | "bonus";
  paymentMethod?: "cash" | "card" | "upi";
  bonusExpiryDays?: number | null;
  reason: string;
  idempotencyKey: string;
}) {
  const actor = await requireAdmin();

  const customerId = String(input.customerId || "").trim();
  const amount = Number(input.amount);
  const reason = String(input.reason || "").trim();
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  const creditType = input.creditType;
  const paymentMethod = input.paymentMethod;
  const bonusExpiryDays = input.bonusExpiryDays === undefined
    ? undefined
    : input.bonusExpiryDays === null ? null : Number(input.bonusExpiryDays);
  const walletCredits = creditType === "paid" ? Number(input.walletCredits ?? amount) : 0;
  const bonusAmount = creditType === "paid" ? Math.round((walletCredits - amount) * 100) / 100 : amount;

  if (!customerId) return { success: false as const, error: "Choose a customer." };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-7) {
    return { success: false as const, error: "Enter a credit amount from ₹0.01 to ₹10,00,000, with up to two decimals." };
  }
  if (creditType !== "paid" && creditType !== "bonus") {
    return { success: false as const, error: "Choose a wallet sale or bonus adjustment." };
  }
  if (creditType === "paid" && !["cash", "card", "upi"].includes(String(paymentMethod))) {
    return { success: false as const, error: "Choose how the customer paid for the wallet credit." };
  }
  if (creditType === "paid" && (!Number.isFinite(walletCredits) || walletCredits < amount || walletCredits > 1000000 || Math.abs(Math.round(walletCredits * 100) - walletCredits * 100) > 1e-7)) {
    return { success: false as const, error: "Wallet credits must be at least the amount paid, with up to two decimals." };
  }
  if (reason.length < 3 || reason.length > 200) {
    return { success: false as const, error: "Enter a reason between 3 and 200 characters." };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return { success: false as const, error: "The credit request is invalid. Close the dialog and try again." };
  }
  if (bonusAmount > 0 && bonusExpiryDays === undefined) {
    return { success: false as const, error: "Choose an expiry for bonus credits or mark them never to expire." };
  }
  if (bonusAmount > 0 && typeof bonusExpiryDays === "number" && (!Number.isInteger(bonusExpiryDays) || bonusExpiryDays < 1 || bonusExpiryDays > 3650)) {
    return { success: false as const, error: "Bonus expiry must be never or 1 to 3650 days." };
  }

  const { data: customer, error: customerError } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError) return { success: false as const, error: customerError.message };
  if (!customer) return { success: false as const, error: "Customer not found." };

  const isBonus = creditType === "bonus";
  const bonusExpiresAt = bonusAmount > 0 && bonusExpiryDays != null
    ? new Date(Date.now() + bonusExpiryDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  try {
    if (isBonus) {
      await addWalletCredits({
        customerId,
        paidAmount: 0,
        bonusAmount: amount,
        bonusExpiresAt,
        kind: "adjustment",
        description: `Admin wallet bonus: ${reason}`,
        source: "admin_wallet_adjustment",
        idempotencyKey: `admin-wallet-adjustment:${idempotencyKey}`,
        createdBy: actor.userId,
      });
    } else {
      const { error: saleError } = await supabaseAdmin.rpc("wallet_add_admin_sale", {
        p_customer_id: customerId,
        p_amount: amount,
        p_wallet_credits: walletCredits,
        p_bonus_expires_at: bonusExpiresAt,
        p_description: `Admin wallet sale: ${reason}`,
        p_payment_method: paymentMethod,
        p_idempotency_key: `admin-wallet-sale:${idempotencyKey}`,
        p_created_by: actor.userId,
      });
      if (saleError) throw saleError;
    }
    return { success: true as const, amount, walletCredits: isBonus ? amount : walletCredits, bonusAmount, creditType };
  } catch (error) {
    console.error("Admin wallet credit adjustment failed:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not add wallet credit.",
    };
  }
}

interface DBCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  date_of_birth: string;
  created_at: string;
}

interface DBSubscription {
  id: string;
  customer_id: string | null;
  subscription_plan_id: string | null;
  status: string;
  end_date: string;
  start_date: string;
  hours_remaining_minutes: number | null;
}

interface DBSubscriptionPlan {
  id: string;
  name: string;
  plan_type: string;
  hours_included: number | null;
  device_type_id: string | null;
}

interface DBDeviceType {
  id: string;
  display_name: string;
}

interface DBAssignableSubscriptionPlan extends Omit<AssignableSubscriptionPlan, "plan_type" | "device_type_name"> {
  plan_type: string;
  device_type_id: string | null;
}

export async function getLiveCustomerRegistryAction() {
  const actor = await requireStaff();
  const canAdjustWallet = actor.role === "admin";

  /**
   * Three reads, together rather than one after the other.
   *
   * They ran in series, which read as a dependency chain but never was one:
   * neither the subscriptions query nor the plans query is filtered by anything
   * the customers query returns - they fetch the whole table and are joined in
   * JS below. So the page was paying three round trips end to end for three
   * questions that could all have been asked at once.
   */
  const [
    { data: customersData, error: customerError },
    { data: subscriptionsData, error: subscriptionsError },
    { data: plansData, error: plansError },
    { data: deviceTypesData, error: deviceTypesError },
    { data: walletBalancesData, error: walletBalancesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("id, name, phone, email, date_of_birth,created_at")
      .order("name", { ascending: true }),

    supabaseAdmin
      .from("subscriptions")
      .select("id, customer_id, subscription_plan_id, status, start_date, end_date, hours_remaining_minutes"),

    supabaseAdmin
      .from("subscription_plans")
      .select("id, name, plan_type, hours_included, device_type_id"),
    supabaseAdmin.from("device_types").select("id, display_name"),
    supabaseAdmin.from("customer_wallet_balances").select("customer_id,balance,reserved_balance"),
  ]);

  // Reported in the same order as before, so the message a failure produces is
  // unchanged.
  if (customerError) {
    return { data: [], error: customerError.message, canAdjustWallet };
  }

  if (!customersData || customersData.length === 0) {
    return { data: [], error: null, canAdjustWallet };
  }

  if (subscriptionsError) {
    return { data: [], error: subscriptionsError.message, canAdjustWallet };
  }

  if (plansError) {
    return { data: [], error: plansError.message, canAdjustWallet };
  }

  if (deviceTypesError) {
    return { data: [], error: deviceTypesError.message, canAdjustWallet };
  }

  if (walletBalancesError) {
    return { data: [], error: walletBalancesError.message, canAdjustWallet };
  }

  const walletBalances = new Map(
    (walletBalancesData || []).map((row: { customer_id: string; balance: number; reserved_balance: number }) => [
      row.customer_id,
      Math.max(0, Number(row.balance || 0) - Number(row.reserved_balance || 0)),
    ])
  );

  const formattedCustomers = (customersData as DBCustomer[]).map((customer: DBCustomer) => {
    const customerSubscriptions = (subscriptionsData as DBSubscription[] || []).filter(
      (sub: DBSubscription) => sub.customer_id === customer.id
    );
    const customerPlans = plansData as DBSubscriptionPlan[];
    const deviceTypeNames = new Map(
      (deviceTypesData as DBDeviceType[]).map((deviceType) => [deviceType.id, deviceType.display_name])
    );
    const planFor = (subscription: DBSubscription) =>
      customerPlans.find((plan) => plan.id === subscription.subscription_plan_id);
    const today = arenaToday();
    const activeHourPacks = customerSubscriptions
      .filter((sub) => {
        const plan = planFor(sub);
        return plan?.plan_type === "hour_pack" &&
          sub.status === "active" &&
          sub.start_date <= today &&
          sub.end_date >= today &&
          Number(sub.hours_remaining_minutes || 0) > 0;
      })
      .sort((a, b) => a.end_date.localeCompare(b.end_date))
      .map((sub) => ({
        id: sub.id,
        name: planFor(sub)?.name || "Hour pack",
        device_type_name: deviceTypeNames.get(planFor(sub)?.device_type_id || "") || null,
        remaining_minutes: Number(sub.hours_remaining_minutes || 0),
        hours_included: Number(planFor(sub)?.hours_included || 0),
        end_date: sub.end_date,
      }));
    const sortedSubscriptions = customerSubscriptions
      .filter((sub) => planFor(sub)?.plan_type !== "hour_pack")
      .sort(
      (a: DBSubscription, b: DBSubscription) =>
        new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
    );

    const latestSubscription = sortedSubscriptions[0] || null;

    let matchedPlanName: string | null = null;
    if (latestSubscription && latestSubscription.subscription_plan_id) {
      const planMatch = customerPlans.find(
        (plan: DBSubscriptionPlan) => plan.id === latestSubscription.subscription_plan_id
      );
      if (planMatch) {
        matchedPlanName = planMatch.name;
      }
    }

    let computedStatus: "active" | "expired" | null = null;
    if (latestSubscription) {
      const isExpiredByTime = new Date(latestSubscription.end_date).getTime() < Date.now();
      computedStatus = (latestSubscription.status === 'active' && !isExpiredByTime) ? "active" : "expired";
    }

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      date_of_birth: customer.date_of_birth,
      created_at: customer.created_at,
      subscription_name: matchedPlanName,
      subscription_status: computedStatus,
      expiry_date: latestSubscription?.end_date || null,
      hour_packs: activeHourPacks,
      wallet_balance: walletBalances.get(customer.id) || 0,
    };
  });

  return { data: formattedCustomers, error: null, canAdjustWallet };
}

export async function createCustomerAction(input: {
  name: string;
  phone: string;
  email?: string;
  date_of_birth?: string;
}) {
  await requireStaff();

  const name = String(input?.name || "").trim();
  const phoneDigits = String(input?.phone || "").replace(/\D/g, "");
  const phone = phoneDigits.length === 12 && phoneDigits.startsWith("91")
    ? phoneDigits.slice(-10)
    : phoneDigits;
  const email = String(input?.email || "").trim() || null;
  const dateOfBirth = String(input?.date_of_birth || "").trim() || null;

  if (!name || name.length > 100) {
    return { success: false as const, error: "Enter a customer name up to 100 characters." };
  }
  if (!/^\d{10}$/.test(phone)) {
    return { success: false as const, error: "Enter a valid 10-digit mobile number." };
  }
  if (email && (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { success: false as const, error: "Enter a valid email address up to 100 characters." };
  }
  if (dateOfBirth) {
    const parsedDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== dateOfBirth
    ) {
      return { success: false as const, error: "Enter a valid date of birth." };
    }
  }

  try {
    const { data: existingCustomer, error: lookupError } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existingCustomer) {
      return { success: false as const, error: "A customer with this mobile number already exists." };
    }

    const { data: createdCustomer, error: insertError } = await supabaseAdmin
      .from("customers")
      .insert({
        name,
        phone,
        email,
        date_of_birth: dateOfBirth,
      })
      .select("id, name, phone, email")
      .single();
    if (insertError?.code === "23505") {
      return { success: false as const, error: "A customer with this mobile number already exists." };
    }
    if (insertError) throw insertError;

    return { success: true as const, customer: createdCustomer };
  } catch (error: any) {
    console.error("Create customer error:", error);
    return { success: false as const, error: error.message || "Could not create customer." };
  }
}

export async function getAssignableSubscriptionPlansAction() {
  await requireStaff();

  const [
    { data: plans, error: plansError },
    { data: deviceTypes, error: deviceTypesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("subscription_plans")
      .select("id, name, plan_type, price, duration_months, hours_included, device_type_id")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("device_types")
      .select("id, display_name")
      .eq("is_active", true),
  ]);

  if (plansError) {
    console.error("Could not load assignable subscription plans:", plansError);
    return { success: false as const, error: plansError.message, data: [] };
  }
  if (deviceTypesError) {
    console.error("Could not load active device categories for subscription plans:", deviceTypesError);
    return { success: false as const, error: deviceTypesError.message, data: [] };
  }

  const deviceTypeNames = new Map(
    (deviceTypes || []).map((deviceType: DBDeviceType) => [deviceType.id, deviceType.display_name])
  );

  const data: AssignableSubscriptionPlan[] = (plans || [])
    .filter((plan: DBAssignableSubscriptionPlan) =>
      plan.plan_type !== "hour_pack" || deviceTypeNames.has(plan.device_type_id || "")
    )
    .map((plan: DBAssignableSubscriptionPlan) => ({
      id: plan.id,
      name: plan.name,
      plan_type: plan.plan_type === "hour_pack" ? "hour_pack" : "membership",
      price: Number(plan.price),
      duration_months: Number(plan.duration_months),
      hours_included: plan.hours_included === null ? null : Number(plan.hours_included),
      device_type_name: deviceTypeNames.get(plan.device_type_id || "") || null,
    }));

  return { success: true as const, data };
}

export async function assignSubscriptionToCustomerAction(input: {
  customerId: string;
  planId: string;
}) {
  await requireStaff();

  const customerId = typeof input?.customerId === "string" ? input.customerId.trim() : "";
  const planId = typeof input?.planId === "string" ? input.planId.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(customerId)) {
    return { success: false as const, error: "Choose a valid customer." };
  }
  if (!uuidPattern.test(planId)) {
    return { success: false as const, error: "Choose a valid subscription plan." };
  }

  const [
    { data: customer, error: customerError },
    { data: plan, error: planError },
  ] = await Promise.all([
    supabaseAdmin.from("customers").select("id").eq("id", customerId).maybeSingle(),
    supabaseAdmin
      .from("subscription_plans")
      .select("id, name, price, duration_months, plan_type, hours_included, device_type_id, is_active")
      .eq("id", planId)
      .maybeSingle(),
  ]);

  if (customerError) {
    console.error("Could not verify customer for subscription assignment:", customerError);
    return { success: false as const, error: customerError.message };
  }
  if (!customer) {
    return { success: false as const, error: "Customer was not found." };
  }
  if (planError) {
    console.error("Could not load subscription plan for assignment:", planError);
    return { success: false as const, error: planError.message };
  }
  if (!plan || !plan.is_active) {
    return { success: false as const, error: "This subscription plan is no longer available." };
  }

  const price = Number(plan.price);
  const durationMonths = Number(plan.duration_months);
  if (!Number.isFinite(price) || price <= 0) {
    return { success: false as const, error: "This plan has an invalid price and cannot be assigned." };
  }
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 60) {
    return { success: false as const, error: "This plan has an invalid validity period and cannot be assigned." };
  }

  const isHourPack = plan.plan_type === "hour_pack";
  const hoursIncluded = Number(plan.hours_included);
  if (isHourPack) {
    if (!Number.isInteger(hoursIncluded) || hoursIncluded <= 0 || !plan.device_type_id) {
      return { success: false as const, error: "This hour pack is missing valid hours or a device category." };
    }

    const { data: activeDeviceType, error: deviceTypeError } = await supabaseAdmin
      .from("device_types")
      .select("id")
      .eq("id", plan.device_type_id)
      .eq("is_active", true)
      .maybeSingle();
    if (deviceTypeError) {
      console.error("Could not verify hour-pack category for assignment:", deviceTypeError);
      return { success: false as const, error: deviceTypeError.message };
    }
    if (!activeDeviceType) {
      return { success: false as const, error: "This hour pack's device category is no longer active." };
    }
  }

  const startDate = arenaToday();
  const endDate = addMonthsToDateString(startDate, durationMonths);
  const { error: insertError } = await supabaseAdmin.from("subscriptions").insert({
    customer_id: customerId,
    subscription_plan_id: plan.id,
    start_date: startDate,
    end_date: endDate,
    payment_id: null,
    amount_paid: price,
    status: "active",
    ...(isHourPack ? { hours_remaining_minutes: hoursIncluded * 60 } : {}),
  });

  if (insertError) {
    console.error("Could not assign subscription to customer:", insertError);
    return { success: false as const, error: insertError.message };
  }

  return { success: true as const, planName: plan.name };
}

export async function removeCustomerHourPackAction(input: {
  customerId: string;
  subscriptionId: string;
}) {
  await requireStaff();

  const customerId = typeof input?.customerId === "string" ? input.customerId.trim() : "";
  const subscriptionId = typeof input?.subscriptionId === "string" ? input.subscriptionId.trim() : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(customerId) || !uuidPattern.test(subscriptionId)) {
    return { success: false as const, error: "Choose a valid customer hour pack." };
  }

  const { data: subscription, error: lookupError } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status, subscription_plan_id, subscription_plans(plan_type)")
    .eq("id", subscriptionId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (lookupError) {
    console.error("Could not verify customer hour pack before removal:", lookupError);
    return { success: false as const, error: lookupError.message };
  }
  if (!subscription) {
    return { success: false as const, error: "This customer hour pack was not found." };
  }

  const joinedPlan = subscription.subscription_plans;
  const plan = Array.isArray(joinedPlan) ? joinedPlan[0] : joinedPlan;
  if (plan?.plan_type !== "hour_pack") {
    return { success: false as const, error: "Only hour packs can be removed from this view." };
  }
  if (subscription.status !== "active") {
    return { success: false as const, error: "This hour pack is no longer active." };
  }

  const { data: removed, error: updateError } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "cancelled", hours_remaining_minutes: 0 })
    .eq("id", subscriptionId)
    .eq("customer_id", customerId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("Could not remove customer hour pack:", updateError);
    return { success: false as const, error: updateError.message };
  }
  if (!removed) {
    return { success: false as const, error: "This hour pack was already removed or is no longer active." };
  }

  return { success: true as const };
}
