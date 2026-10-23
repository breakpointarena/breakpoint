export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  date_of_birth: string;
  created_at: string;
  subscription_name: string | null;
  subscription_status: "active" | "expired" | null;
  expiry_date: string | null;
  wallet_balance: number;
  hour_packs: Array<{
    id: string;
    name: string;
    device_type_name: string | null;
    remaining_minutes: number;
    hours_included: number;
    end_date: string;
  }>;
}

export interface AssignableSubscriptionPlan {
  id: string;
  name: string;
  plan_type: "membership" | "hour_pack";
  price: number;
  duration_months: number;
  hours_included: number | null;
  device_type_name: string | null;
}
