'use server'

import { revalidatePath } from 'next/cache'
import { requireVerifiedPhone } from '@/lib/auth/customer-session'
import { createPaymentOrder } from '@/lib/payments/orders'
import type { EventRegistrationQuote } from '@/lib/payments/quote'
import { verifyAndFulfilPayment, type CheckoutResponse } from '@/lib/payments/verify'
import { getRazorpayKeyId, isRazorpayConfigured, describeRazorpayConfig } from '@/lib/razorpay/client'
import { supabaseAdmin } from '@/lib/supabase/server'

export interface EventRegistrationOrderResult {
  success: boolean
  error?: string
  verificationRequired?: boolean
  freeRegistration?: boolean
  registrationCode?: string
  registrationId?: string
  keyId?: string
  orderId?: string
  amount?: number
  eventTitle?: string
}

type RegistrationInput = {
  eventId: string
  phone: string
  name: string
  email?: string
  teamName?: string
  participantNames?: string[]
}

export async function createEventRegistrationOrder(input: RegistrationInput): Promise<EventRegistrationOrderResult> {
  try {
    const auth = await requireVerifiedPhone(input.phone)
    if (!auth.ok) return { success: false, error: auth.error, verificationRequired: true }

    const name = String(input.name || '').trim()
    const email = String(input.email || '').trim()
    const teamName = String(input.teamName || '').trim()
    const participantNames = Array.isArray(input.participantNames)
      ? input.participantNames.map((value) => String(value).trim()).filter(Boolean).slice(0, 20)
      : []
    if (!name || name.length > 120) return { success: false, error: 'Enter your name.' }
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
      return { success: false, error: 'Enter a valid email address.' }
    }

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id, slug, title, status, starts_at, registration_opens_at, registration_closes_at, entry_fee, service_fee_percent, registration_mode, team_size')
      .eq('id', input.eventId)
      .eq('status', 'published')
      .maybeSingle()
    if (eventError) throw eventError
    if (!event) return { success: false, error: 'This event is not accepting registrations.' }
    if (event.registration_mode === 'team' && !teamName) return { success: false, error: 'Enter your team name.' }
    if (event.registration_mode === 'individual' && teamName) return { success: false, error: 'This event uses individual registration.' }
    if (event.registration_mode === 'team' && participantNames.length !== Number(event.team_size)) {
      return { success: false, error: `Enter all ${event.team_size} participant names.` }
    }
    if (Number(event.entry_fee) > 0 && !isRazorpayConfigured()) {
      console.error(`Razorpay unusable: ${describeRazorpayConfig()}`)
      return { success: false, error: 'Online payments are unavailable. Please contact the arena.' }
    }

    const entryFee = Number(event.entry_fee)
    const serviceCharge = entryFee > 0
      ? Number((entryFee * Number(event.service_fee_percent || 0) / 100).toFixed(2))
      : 0
    const totalDue = entryFee + serviceCharge
    const isFree = entryFee === 0
    // Reuse a live checkout after a customer dismisses Razorpay or loses the
    // confirmation response. This keeps the same seat hold and prevents a
    // duplicate-registration error on retry.
    if (!isFree) {
      const { data: pendingRegistration, error: pendingError } = await supabaseAdmin
        .from('event_registrations')
        .select('id, registration_code, razorpay_order_id, reservation_expires_at, entry_fee, service_charge_amount')
        .eq('event_id', event.id)
        .eq('customer_phone', auth.phone)
        .eq('registration_status', 'pending_payment')
        .maybeSingle()
      if (pendingError) throw pendingError

      if (pendingRegistration?.reservation_expires_at &&
          new Date(pendingRegistration.reservation_expires_at).getTime() > Date.now() &&
          pendingRegistration.razorpay_order_id) {
        return {
          success: true,
          registrationId: pendingRegistration.id,
          registrationCode: pendingRegistration.registration_code,
          keyId: getRazorpayKeyId()!,
          orderId: pendingRegistration.razorpay_order_id,
          amount: Number(pendingRegistration.entry_fee) + Number(pendingRegistration.service_charge_amount || 0),
          eventTitle: event.title,
        }
      }

      if (pendingRegistration) {
        await supabaseAdmin.from('event_registrations')
          .update({ registration_status: 'cancelled', reservation_expires_at: null })
          .eq('id', pendingRegistration.id)
          .eq('registration_status', 'pending_payment')
      }
    }

    const { data: reserved, error: reserveError } = await supabaseAdmin.rpc('create_event_registration', {
      p_event_id: event.id,
      p_customer_name: name,
      p_customer_phone: auth.phone,
      p_customer_email: email || null,
      p_team_name: teamName || null,
      p_participant_names: participantNames,
      p_registration_status: isFree ? 'registered' : 'pending_payment',
      p_payment_status: isFree ? 'not_required' : 'pending',
      p_amount_paid: 0,
      p_payment_method: null,
      p_registration_source: 'customer',
      p_created_by: null,
      p_reservation_expires_at: isFree ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      p_service_charge_amount: serviceCharge,
    })
    if (reserveError) {
      const message = reserveError.message || ''
      return {
        success: false,
        error: message.toLowerCase().includes('full')
          ? 'This event is full.'
          : message.toLowerCase().includes('already has')
            ? 'This phone number already has a registration for this event.'
            : message.toLowerCase().includes('closed')
              ? 'Registration for this event is closed.'
              : 'We could not reserve your place. Please try again.',
      }
    }
    const registration = Array.isArray(reserved) ? reserved[0] : reserved
    if (!registration?.registration_id || !registration?.registration_code) {
      return { success: false, error: 'We could not reserve your place. Please try again.' }
    }

    if (isFree) {
      revalidatePath('/events')
      revalidatePath(`/events/${event.slug}`)
      return {
        success: true,
        freeRegistration: true,
        registrationId: registration.registration_id,
        registrationCode: registration.registration_code,
        eventTitle: event.title,
      }
    }

    const quote: EventRegistrationQuote = {
      kind: 'event_registration',
      registrationId: registration.registration_id,
      eventId: event.id,
      eventTitle: event.title,
      registrationCode: registration.registration_code,
      totalAmount: Number(registration.total_due),
      entryFee: Number(registration.entry_fee),
      serviceCharge: Number(registration.service_charge_amount || 0),
    }

    try {
      const order = await createPaymentOrder({
        purpose: 'event_registration',
        amount: quote.totalAmount,
        quote,
        customerPhone: auth.phone,
        notes: { event: event.title, registration: registration.registration_code },
      })

      const { error: updateError } = await supabaseAdmin.from('event_registrations')
        .update({ razorpay_order_id: order.razorpayOrderId })
        .eq('id', registration.registration_id)
        .eq('registration_status', 'pending_payment')
      if (updateError) throw updateError

      return {
        success: true,
        registrationId: registration.registration_id,
        registrationCode: registration.registration_code,
        keyId: getRazorpayKeyId()!,
        orderId: order.razorpayOrderId,
        amount: order.amount,
        eventTitle: event.title,
      }
    } catch (error) {
      await supabaseAdmin.from('event_registrations')
        .update({ registration_status: 'cancelled', reservation_expires_at: null })
        .eq('id', registration.registration_id)
        .eq('registration_status', 'pending_payment')
      throw error
    }
  } catch (error) {
    console.error('createEventRegistrationOrder error:', error)
    return { success: false, error: 'We could not start registration. Please try again.' }
  }
}

export async function confirmEventRegistrationPayment(response: CheckoutResponse) {
  const result = await verifyAndFulfilPayment(response, 'event_registration')
  if (!result.success) return { success: false, error: result.error }
  revalidatePath('/events')
  return {
    success: true,
    registrationId: result.eventRegistrationId,
    registrationCode: result.registrationCode,
    amountPaid: result.amountPaid,
  }
}
