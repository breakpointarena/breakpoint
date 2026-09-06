"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require-admin";

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
}

interface DBSubscriptionPlan {
  id: string;
  name: string;
}

export async function getLiveCustomerRegistryAction() {
  await requireStaff();

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
  ] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("id, name, phone, email, date_of_birth,created_at")
      .order("name", { ascending: true }),

    supabaseAdmin
      .from("subscriptions")
      .select("id, customer_id, subscription_plan_id, status, end_date"),

    supabaseAdmin.from("subscription_plans").select("id, name"),
  ]);

  // Reported in the same order as before, so the message a failure produces is
  // unchanged.
  if (customerError) {
    return { data: [], error: customerError.message };
  }

  if (!customersData || customersData.length === 0) {
    return { data: [], error: null };
  }

  if (subscriptionsError) {
    return { data: [], error: subscriptionsError.message };
  }

  if (plansError) {
    return { data: [], error: plansError.message };
  }

  const formattedCustomers = (customersData as DBCustomer[]).map((customer: DBCustomer) => {
    const customerSubscriptions = (subscriptionsData as DBSubscription[] || []).filter(
      (sub: DBSubscription) => sub.customer_id === customer.id
    );
    const sortedSubscriptions = customerSubscriptions.sort(
      (a: DBSubscription, b: DBSubscription) =>
        new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
    );

    const latestSubscription = sortedSubscriptions[0] || null;

    let matchedPlanName: string | null = null;
    if (latestSubscription && latestSubscription.subscription_plan_id) {
      const planMatch = (plansData as DBSubscriptionPlan[] || []).find(
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
    };
  });

  return { data: formattedCustomers, error: null };
}