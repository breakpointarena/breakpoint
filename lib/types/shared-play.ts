export interface SharedPlayCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface SharedPlayParticipant {
  id: string;
  name: string;
  customer_id: string | null;
  customer: SharedPlayCustomer | null;
  billed_amount: number | null;
  checked_out_at?: string | null;
  settled_amount?: number | null;
  wallet_amount?: number | null;
  shared_play_periods: Array<{
    id: string;
    started_at: string;
    ended_at: string | null;
    amount?: number | null;
  }>;
}

export interface HourPackCustomerChoice extends SharedPlayCustomer {
  remaining_minutes: number;
  pack_name: string;
  device_type_name: string | null;
  end_date: string;
}
