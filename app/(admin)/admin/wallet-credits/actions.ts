'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { supabaseAdmin } from '@/lib/supabase/server'

export interface WalletOfferInput {
  id?: string
  name: string
  price: number
  paidCredits: number
  bonusCredits?: number
  bonusValidityDays: number | null
  displayOrder: number
  isActive: boolean
}

function validAmount(value: number, allowZero = false) {
  return Number.isFinite(value) && value <= 1_000_000 &&
    (allowZero ? value >= 0 : value > 0) &&
    Math.abs(Math.round(value * 100) - value * 100) < 1e-7
}

export async function getWalletOffersAction() {
  await requireAdmin()
  const { data, error } = await supabaseAdmin
    .from('wallet_offers')
    .select('id, name, price, paid_credits, bonus_credits, bonus_validity_days, display_order, is_active, created_at, updated_at')
    .order('display_order', { ascending: true })
    .order('price', { ascending: true })

  if (error) return { success: false as const, error: error.message, data: [] }
  return { success: true as const, data: data || [] }
}

export async function saveWalletOfferAction(input: WalletOfferInput) {
  await requireAdmin()

  const name = String(input.name || '').trim()
  const price = Number(input.price)
  const paidCredits = Number(input.paidCredits)
  const bonusCredits = Math.round((paidCredits - price) * 100) / 100
  const bonusValidityDays = input.bonusValidityDays == null
    ? null
    : Number(input.bonusValidityDays)
  const displayOrder = Number(input.displayOrder)

  if (name.length < 2 || name.length > 80) {
    return { success: false as const, error: 'Offer name must be between 2 and 80 characters.' }
  }
  if (!validAmount(price) || !validAmount(paidCredits)) {
    return { success: false as const, error: 'Price and paid wallet credits must be from ₹0.01 to ₹10,00,000, with up to two decimals.' }
  }
  if (paidCredits < price) {
    return { success: false as const, error: 'Paid wallet credits must be at least the price paid.' }
  }
  if (bonusCredits > 0 && bonusValidityDays !== null && (!Number.isInteger(bonusValidityDays) || Number(bonusValidityDays) < 1 || Number(bonusValidityDays) > 3650)) {
    return { success: false as const, error: 'Bonus expiry must be never or 1 to 3650 days.' }
  }
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1000) {
    return { success: false as const, error: 'Display order must be a whole number from 0 to 1000.' }
  }

  const payload = {
    name,
    price,
    paid_credits: paidCredits,
    bonus_credits: bonusCredits,
    bonus_validity_days: bonusCredits > 0 ? bonusValidityDays : null,
    display_order: displayOrder,
    is_active: input.isActive === true,
    updated_at: new Date().toISOString(),
  }

  let error
  if (input.id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)) {
      return { success: false as const, error: 'The selected wallet offer is invalid.' }
    }
    ({ error } = await supabaseAdmin.from('wallet_offers').update(payload).eq('id', input.id))
  } else {
    ({ error } = await supabaseAdmin.from('wallet_offers').insert(payload))
  }

  if (error) return { success: false as const, error: error.message }
  revalidatePath('/admin/wallet-credits')
  revalidatePath('/wallet')
  return { success: true as const }
}

export async function deleteWalletOfferAction(id: string) {
  await requireAdmin()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { success: false as const, error: 'The selected wallet offer is invalid.' }
  }
  const { error } = await supabaseAdmin.from('wallet_offers').delete().eq('id', id)
  if (error) return { success: false as const, error: error.message }
  revalidatePath('/admin/wallet-credits')
  revalidatePath('/wallet')
  return { success: true as const }
}

export async function setWalletOfferActiveAction(id: string, isActive: boolean) {
  await requireAdmin()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { success: false as const, error: 'The selected wallet offer is invalid.' }
  }

  const { error } = await supabaseAdmin
    .from('wallet_offers')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { success: false as const, error: error.message }

  revalidatePath('/admin/wallet-credits')
  revalidatePath('/wallet')
  return { success: true as const }
}
