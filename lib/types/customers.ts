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
}