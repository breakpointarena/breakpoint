import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/server'

export interface WalletBalance {
  balance: number
  paidBalance: number
  bonusBalance: number
  reservedBalance: number
}

export interface WalletTransaction {
  id: string
  kind: string
  direction: 'credit' | 'debit'
  amount: number
  paid_amount: number
  bonus_amount: number
  description: string
  created_at: string
}

function numeric(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getWalletBalance(customerId: string): Promise<WalletBalance> {
  const { data, error } = await supabaseAdmin.rpc('wallet_get_balance', {
    p_customer_id: customerId,
  })
  if (error) throw new Error(`Could not load wallet balance: ${error.message}`)

  const row = Array.isArray(data) ? data[0] : data
  return {
    balance: numeric(row?.balance),
    paidBalance: numeric(row?.paid_balance),
    bonusBalance: numeric(row?.bonus_balance),
    reservedBalance: numeric(row?.reserved_balance),
  }
}

export async function addWalletCredits(input: {
  customerId: string
  paidAmount: number
  bonusAmount: number
  bonusExpiresAt: string | null
  kind: 'top_up' | 'refund' | 'adjustment'
  description: string
  source: string
  referenceId?: string | null
  idempotencyKey: string
  createdBy?: string | null
}): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('wallet_add_credits', {
    p_customer_id: input.customerId,
    p_paid_amount: input.paidAmount,
    p_bonus_amount: input.bonusAmount,
    p_bonus_expires_at: input.bonusExpiresAt,
    p_kind: input.kind,
    p_description: input.description,
    p_source: input.source,
    p_reference_id: input.referenceId || null,
    p_idempotency_key: input.idempotencyKey,
    p_created_by: input.createdBy || null,
  })
  if (error) throw new Error(`Could not add wallet credits: ${error.message}`)
  return String(data)
}

export async function spendWalletCredits(input: {
  customerId: string
  amount: number
  referenceId?: string | null
  idempotencyKey: string
  reservationId?: string | null
}): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('wallet_spend_credits', {
    p_customer_id: input.customerId,
    p_amount: input.amount,
    p_reference_id: input.referenceId || null,
    p_idempotency_key: input.idempotencyKey,
    p_reservation_id: input.reservationId || null,
  })
  if (error) throw new Error(`Could not apply wallet credit: ${error.message}`)
  return String(data)
}

export async function reserveWalletCredits(input: {
  customerId: string
  amount: number
  purpose: 'device_booking' | 'food_order' | 'booking_food'
  referenceId?: string | null
  idempotencyKey: string
  expiryMinutes?: number
}): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('wallet_reserve_credits', {
    p_customer_id: input.customerId,
    p_amount: input.amount,
    p_purpose: input.purpose,
    p_reference_id: input.referenceId || null,
    p_idempotency_key: input.idempotencyKey,
    p_expiry_minutes: input.expiryMinutes || 30,
  })
  if (error) throw new Error(`Could not reserve wallet credit: ${error.message}`)
  return String(data)
}

export async function releaseWalletReservation(reservationId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('wallet_release_reservation', {
    p_reservation_id: reservationId,
  })
  if (error) throw new Error(`Could not release wallet reservation: ${error.message}`)
}

export async function commitWalletReservation(input: {
  customerId: string
  amount: number
  reservationId: string
  referenceId?: string | null
  idempotencyKey: string
}): Promise<string> {
  return spendWalletCredits({
    customerId: input.customerId,
    amount: input.amount,
    referenceId: input.referenceId,
    idempotencyKey: input.idempotencyKey,
    reservationId: input.reservationId,
  })
}

export async function refundWalletSpend(
  transactionId: string,
  idempotencyKey: string,
  description?: string
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('wallet_refund_spend', {
    p_transaction_id: transactionId,
    p_idempotency_key: idempotencyKey,
    p_description: description || 'Wallet credit restored',
  })
  if (error) throw new Error(`Could not restore wallet credit: ${error.message}`)
  return String(data)
}

export async function getWalletTransactions(
  customerId: string,
  limit = 30
): Promise<WalletTransaction[]> {
  const { data, error } = await supabaseAdmin
    .from('wallet_transactions')
    .select('id, kind, direction, amount, paid_amount, bonus_amount, description, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Could not load wallet history: ${error.message}`)

  return ((data || []) as Array<{
    id: string
    kind: string
    direction: 'credit' | 'debit'
    amount: number | string
    paid_amount: number | string
    bonus_amount: number | string
    description: string
    created_at: string
  }>).map(row => ({
    id: row.id,
    kind: row.kind,
    direction: row.direction,
    amount: numeric(row.amount),
    paid_amount: numeric(row.paid_amount),
    bonus_amount: numeric(row.bonus_amount),
    description: row.description,
    created_at: row.created_at,
  }))
}
