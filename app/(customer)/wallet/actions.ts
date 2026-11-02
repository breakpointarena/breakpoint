'use server'

import { getVerifiedCustomerPhone } from '@/lib/auth/customer-session'
import { getRazorpayKeyId, isRazorpayConfigured, describeRazorpayConfig } from '@/lib/razorpay/client'
import { supabaseAdmin } from '@/lib/supabase/server'
import { createPaymentOrder } from '@/lib/payments/orders'
import { verifyAndFulfilPayment, type CheckoutResponse } from '@/lib/payments/verify'
import { getWalletBalance, getWalletTransactions } from '@/lib/wallet/server'

export async function getMyWalletOverview() {
  try {
    const phone = await getVerifiedCustomerPhone()
    if (!phone) {
      return { success: false as const, error: 'Please verify your mobile number to view your wallet.' }
    }

    const [
      { data: customer, error: customerError },
      { data: offers, error: offersError },
    ] = await Promise.all([
      supabaseAdmin.from('customers').select('id, name').eq('phone', phone).maybeSingle(),
      supabaseAdmin
        .from('wallet_offers')
        .select('id, name, price, paid_credits, bonus_credits, bonus_validity_days')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('price', { ascending: true }),
    ])
    if (customerError) throw customerError
    if (offersError) throw offersError

    if (!customer) {
      return {
        success: true as const,
        customerId: null,
        customerName: '',
        balance: { balance: 0, paidBalance: 0, bonusBalance: 0, reservedBalance: 0 },
        transactions: [],
        offers: offers || [],
        bonusExpiries: [],
      }
    }

    const [balance, transactions, { data: bonusLots, error: bonusLotsError }] = await Promise.all([
      getWalletBalance(customer.id),
      getWalletTransactions(customer.id),
      supabaseAdmin
        .from('wallet_credit_lots')
        .select('remaining_amount, expires_at')
        .eq('customer_id', customer.id)
        .eq('credit_type', 'bonus')
        .gt('remaining_amount', 0)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: true }),
    ])
    if (bonusLotsError) throw bonusLotsError

    return {
      success: true as const,
      customerId: customer.id,
      customerName: customer.name,
      balance,
      transactions,
      offers: offers || [],
      bonusExpiries: ((bonusLots || []) as Array<{
        remaining_amount: number
        expires_at: string
      }>).map(lot => ({
        amount: Number(lot.remaining_amount),
        expiresAt: lot.expires_at,
      })),
    }
  } catch (error) {
    console.error('Load customer wallet error:', error)
    return { success: false as const, error: 'Could not load your wallet right now.' }
  }
}

export async function createWalletTopUpPaymentOrder(input: {
  offerId: string
  customerName: string
}) {
  try {
    const phone = await getVerifiedCustomerPhone()
    if (!phone) {
      return { success: false as const, verificationRequired: true, error: 'Verify your mobile number to continue.' }
    }

    const customerName = String(input?.customerName || '').trim()
    const offerId = String(input?.offerId || '').trim()
    if (!customerName || customerName.length > 100) {
      return { success: false as const, error: 'Enter your name before purchasing wallet credit.' }
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(offerId)) {
      return { success: false as const, error: 'Choose a valid wallet offer.' }
    }

    const { data: customerId, error: customerError } = await supabaseAdmin.rpc('get_or_create_customer', {
      p_phone: phone,
      p_name: customerName,
      p_email: null,
      p_dob: null,
    })
    if (customerError) throw customerError

    const { data: offer, error: offerError } = await supabaseAdmin
      .from('wallet_offers')
      .select('id, name, price, paid_credits, bonus_credits, bonus_validity_days')
      .eq('id', offerId)
      .eq('is_active', true)
      .maybeSingle()
    if (offerError) throw offerError
    if (!offer) return { success: false as const, error: 'That wallet offer is no longer available.' }

    const price = Number(offer.price)
    const walletCredits = Number(offer.paid_credits)
    const paidCredits = price
    const bonusCredits = Math.round((walletCredits - price) * 100) / 100
    const bonusValidityDays = offer.bonus_validity_days == null
      ? null
      : Number(offer.bonus_validity_days)
    if (
      !Number.isFinite(price) || price <= 0 ||
      !Number.isFinite(walletCredits) || walletCredits < price ||
      !Number.isFinite(paidCredits) || paidCredits <= 0 ||
      !Number.isFinite(bonusCredits) || bonusCredits < 0 ||
      (bonusCredits > 0 && bonusValidityDays !== null && (!Number.isInteger(bonusValidityDays) || Number(bonusValidityDays) < 1))
    ) {
      throw new Error('This wallet offer is configured incorrectly.')
    }

    const quote = {
      kind: 'wallet_top_up' as const,
      customerId: String(customerId),
      customerPhone: phone,
      offerId: offer.id,
      offerName: offer.name,
      price,
      paidCredits,
      bonusCredits,
      bonusValidityDays,
      totalAmount: price,
    }

    if (!isRazorpayConfigured()) {
      console.error(`Razorpay unusable: ${describeRazorpayConfig()}`)
      return { success: false as const, error: 'Online payments are not available right now.' }
    }

    const order = await createPaymentOrder({
      purpose: 'wallet_top_up',
      amount: price,
      quote,
      customerPhone: phone,
      notes: { offer: offer.name },
    })

    return {
      success: true as const,
      keyId: getRazorpayKeyId()!,
      orderId: order.razorpayOrderId,
      amount: order.amount,
      offerName: offer.name,
      paidCredits,
      bonusCredits,
    }
  } catch (error) {
    console.error('Create wallet top-up order error:', error)
    return { success: false as const, error: 'Could not start the wallet purchase. Please try again.' }
  }
}

export async function confirmWalletTopUpPayment(response: CheckoutResponse) {
  const result = await verifyAndFulfilPayment(response, 'wallet_top_up')
  if (!result.success) return { success: false as const, error: result.error }
  return {
    success: true as const,
    amountPaid: result.amountPaid,
    walletTransactionId: result.walletTransactionId,
  }
}
