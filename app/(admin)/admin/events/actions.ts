'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin, requireStaff } from '@/lib/auth/require-admin'
import { supabaseAdmin } from '@/lib/supabase/server'

function text(form: FormData, key: string): string {
  return String(form.get(key) || '').trim()
}

function arenaDateTime(value: string): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00+05:30`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function parsePrizeDescriptions(value: string) {
  const prizes: Array<string | null> = [null, null, null]
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    const labelled = line.match(/^(1st|first|1|2nd|second|2|3rd|third|3)(?:\s+place)?\s*[:\-]\s*(.+)$/i)
    const index = labelled
      ? /^(1st|first|1)$/i.test(labelled[1]) ? 0 : /^(2nd|second|2)$/i.test(labelled[1]) ? 1 : 2
      : prizes.findIndex((prize) => prize === null)
    if (index >= 0 && index < prizes.length) prizes[index] = labelled ? labelled[2].trim() : line
  }
  return prizes
}

function eventFields(form: FormData) {
  const title = text(form, 'title')
  const startsAt = arenaDateTime(text(form, 'starts_at'))
  const endsRaw = text(form, 'ends_at')
  const opensRaw = text(form, 'registration_opens_at')
  const closesRaw = text(form, 'registration_closes_at')
  const endsAt = endsRaw ? arenaDateTime(endsRaw) : null
  const opensAt = opensRaw ? arenaDateTime(opensRaw) : null
  const closesAt = closesRaw ? arenaDateTime(closesRaw) : null
  const entryFee = Number(text(form, 'entry_fee') || 0)
  const serviceFeePercent = Number(text(form, 'service_fee_percent') || 0)
  const capacityRaw = text(form, 'capacity')
  const capacity = capacityRaw ? Number(capacityRaw) : null
  const teamSize = Number(text(form, 'team_size') || 1)
  const [firstPlacePrize, secondPlacePrize, thirdPlacePrize] = parsePrizeDescriptions(text(form, 'prizes'))

  if (!title || !startsAt) throw new Error('Add an event title and valid start time.')
  if (endsRaw && !endsAt) throw new Error('The event end time is invalid.')
  if (opensRaw && !opensAt) throw new Error('The registration opening time is invalid.')
  if (closesRaw && !closesAt) throw new Error('The registration closing time is invalid.')
  if (!Number.isFinite(entryFee) || entryFee < 0) throw new Error('Entry fee must be zero or more.')
  if (!Number.isFinite(serviceFeePercent) || serviceFeePercent < 0 || serviceFeePercent > 2) throw new Error('Service charge must be from 0% to 2%.')
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) throw new Error('Capacity must be a positive whole number.')
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 20) throw new Error('Team size must be between 1 and 20.')
  if (endsAt && endsAt <= startsAt) throw new Error('Event end time must be after its start time.')
  if (opensAt && closesAt && closesAt < opensAt) throw new Error('Registration must close after it opens.')

  return {
    title,
    event_type: text(form, 'event_type') || 'tournament',
    description: text(form, 'description'),
    cover_image_url: text(form, 'cover_image_url') || null,
    venue: text(form, 'venue') || 'Breakpoint Arena',
    starts_at: startsAt,
    ends_at: endsAt,
    registration_opens_at: opensAt,
    registration_closes_at: closesAt,
    entry_fee: entryFee,
    service_fee_percent: serviceFeePercent,
    capacity,
    registration_mode: text(form, 'registration_mode') === 'team' ? 'team' : 'individual',
    team_size: teamSize,
    first_place_prize_description: firstPlacePrize,
    second_place_prize_description: secondPlacePrize,
    third_place_prize_description: thirdPlacePrize,
  }
}

function revalidateEvents() {
  revalidatePath('/events')
  revalidatePath('/admin/events')
}

export async function createEvent(form: FormData) {
  const actor = await requireStaff()
  const fields = eventFields(form)
  const baseSlug = slugify(text(form, 'slug') || fields.title) || `event-${Date.now()}`
  let slug = baseSlug
  let suffix = 2
  while (true) {
    const { data, error } = await supabaseAdmin.from('events').select('id').eq('slug', slug).maybeSingle()
    if (error) throw error
    if (!data) break
    slug = `${baseSlug}-${suffix++}`
  }

  const { data, error } = await supabaseAdmin.from('events').insert({
    ...fields,
    slug,
    created_by: actor.userId,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message || 'Could not create the event.')

  revalidateEvents()
  redirect(`/admin/events/${data.id}`)
}

export async function updateEvent(form: FormData) {
  await requireStaff()
  const id = text(form, 'event_id')
  if (!id) throw new Error('Event not found.')
  const fields = eventFields(form)
  const requestedSlug = slugify(text(form, 'slug') || fields.title)

  const { data: collision, error: collisionError } = await supabaseAdmin
    .from('events').select('id').eq('slug', requestedSlug).neq('id', id).maybeSingle()
  if (collisionError) throw collisionError
  if (collision) throw new Error('That event URL is already in use.')

  const { error } = await supabaseAdmin.from('events').update({
    ...fields,
    slug: requestedSlug,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
  revalidateEvents()
  revalidatePath(`/admin/events/${id}`)
  revalidatePath(`/events/${requestedSlug}`)
}

export async function setEventStatus(form: FormData) {
  await requireStaff()
  const id = text(form, 'event_id')
  const status = text(form, 'status')
  if (!id || !['draft', 'published', 'cancelled', 'completed'].includes(status)) {
    throw new Error('Invalid event status.')
  }
  const { error } = await supabaseAdmin.from('events').update({
    status,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
  revalidateEvents()
  revalidatePath(`/admin/events/${id}`)
}

export async function adminRegisterForEvent(form: FormData) {
  const actor = await requireStaff()
  const eventId = text(form, 'event_id')
  const name = text(form, 'customer_name')
  const phone = text(form, 'customer_phone').replace(/\D/g, '').slice(-10)
  const email = text(form, 'customer_email') || null
  const teamName = text(form, 'team_name') || null
  const participants = text(form, 'participant_names').split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
  const method = text(form, 'payment_method')
  const isComped = form.get('comped') === 'on'

  if (!eventId || !name || !/^\d{10}$/.test(phone)) throw new Error('Enter a customer name and valid 10-digit phone number.')
  if (!isComped && method && !['cash', 'card', 'upi'].includes(method)) throw new Error('Choose a valid payment method.')

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events').select('entry_fee, service_fee_percent, registration_mode, team_size, status').eq('id', eventId).maybeSingle()
  if (eventError) throw eventError
  if (!event || event.status !== 'published') throw new Error('Only published events accept registrations.')
  if (event.registration_mode === 'team' && !teamName) throw new Error('Enter a team name for this event.')
  if (event.registration_mode === 'individual' && teamName) throw new Error('This event uses individual registration.')
  if (event.registration_mode === 'team' && participants.length !== Number(event.team_size)) {
    throw new Error(`Enter all ${event.team_size} participant names.`)
  }

  const fee = Number(event.entry_fee)
  const serviceCharge = isComped || fee === 0 ? 0 : Number((fee * Number(event.service_fee_percent || 0) / 100).toFixed(2))
  const totalDue = fee + serviceCharge
  const amountPaid = isComped ? 0 : (form.get('amount_paid') === null ? 0 : Number(text(form, 'amount_paid') || 0))
  if (!Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > totalDue) throw new Error('Amount collected must be between zero and the total due.')
  if (amountPaid > 0 && !method) throw new Error('Choose how the payment was collected.')
  const paymentStatus = fee === 0 ? 'not_required' : isComped ? 'comped' : amountPaid >= totalDue ? 'paid' : amountPaid > 0 ? 'partial' : 'pending'

  const { error } = await supabaseAdmin.rpc('create_event_registration', {
    p_event_id: eventId,
    p_customer_name: name,
    p_customer_phone: phone,
    p_customer_email: email,
    p_team_name: teamName,
    p_participant_names: participants,
    p_registration_status: 'registered',
    p_payment_status: paymentStatus,
    p_amount_paid: amountPaid,
    p_payment_method: amountPaid > 0 ? method : null,
    p_registration_source: 'admin',
    p_created_by: actor.userId,
    p_reservation_expires_at: null,
    p_service_charge_amount: serviceCharge,
  })
  if (error) throw new Error(error.message.includes('full') ? 'This event has no spots left.' : error.message)

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/events`)
}

export async function addEventPrizeExpense(form: FormData) {
  const actor = await requireAdmin()
  const eventId = text(form, 'event_id')
  const description = text(form, 'description')
  const amount = Number(text(form, 'amount'))
  const date = text(form, 'date')
  if (!eventId || !description || !date || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Add a date, description, and positive prize amount.')
  }

  const { data: event, error: eventError } = await supabaseAdmin.from('events')
    .select('title').eq('id', eventId).maybeSingle()
  if (eventError) throw eventError
  if (!event) throw new Error('Event not found.')

  const { error } = await supabaseAdmin.from('expenses').insert({
    event_id: eventId,
    expense_type: 'event_prize',
    date,
    category: 'operational',
    description: `Prize payout · ${event.title} · ${description}`,
    amount,
    created_by: actor.userId,
  })
  if (error) throw error

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath('/admin/reports')
}

export async function setRegistrationStatus(form: FormData) {
  await requireStaff()
  const eventId = text(form, 'event_id')
  const registrationId = text(form, 'registration_id')
  const status = text(form, 'registration_status')
  if (!eventId || !registrationId || !['registered', 'waitlisted', 'cancelled', 'checked_in'].includes(status)) {
    throw new Error('Invalid registration status.')
  }

  const { error } = await supabaseAdmin.from('event_registrations').update({
    registration_status: status,
    reservation_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', registrationId).eq('event_id', eventId)
  if (error) throw error
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath('/events')
}

export async function recordEventRegistrationPayment(form: FormData) {
  const actor = await requireAdmin()
  const eventId = text(form, 'event_id')
  const registrationId = text(form, 'registration_id')
  const amount = Number(text(form, 'amount'))
  const paymentMethod = text(form, 'payment_method')
  const paymentReference = text(form, 'payment_reference')

  if (!eventId || !registrationId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a positive payment amount.')
  }
  if (!['cash', 'card', 'upi'].includes(paymentMethod)) {
    throw new Error('Choose cash, card, or UPI as the payment method.')
  }

  const { error } = await supabaseAdmin.rpc('record_event_registration_payment', {
    p_registration_id: registrationId,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_payment_reference: paymentReference || null,
    p_created_by: actor.userId,
  })
  if (error) {
    if (error.message.includes('exceeds')) throw new Error('Payment cannot exceed the remaining entry fee.')
    throw new Error(error.message)
  }

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath('/admin/reports')
}

export async function recordEventRegistrationRefund(form: FormData) {
  const actor = await requireAdmin()
  const eventId = text(form, 'event_id')
  const registrationId = text(form, 'registration_id')
  const amount = Number(text(form, 'amount'))
  const paymentMethod = text(form, 'payment_method')
  const paymentReference = text(form, 'payment_reference')
  if (!eventId || !registrationId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a positive refund amount.')
  }

  const { error } = await supabaseAdmin.rpc('record_event_registration_refund', {
    p_registration_id: registrationId,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_payment_reference: paymentReference || null,
    p_created_by: actor.userId,
  })
  if (error) throw new Error(error.message.includes('exceeds') ? 'Refund cannot exceed the amount collected.' : error.message)
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath('/admin/reports')
}

export async function getAdminEvent(eventId: string) {
  const actor = await requireStaff()
  const { data: event, error } = await supabaseAdmin.from('events').select('*').eq('id', eventId).maybeSingle()
  if (error) throw error
  if (!event) return null

  const [{ data: registrations, error: registrationError }, { data: expenses, error: expenseError }] = await Promise.all([
    supabaseAdmin.from('event_registrations')
      .select('*, event_registration_payments(id, amount, entry_type, payment_method, payment_reference, paid_at)')
      .eq('event_id', eventId).order('created_at', { ascending: false }),
    actor.role === 'admin'
      ? supabaseAdmin.from('expenses').select('id, date, description, amount, category, expense_type')
        .eq('event_id', eventId).eq('expense_type', 'event_prize').order('date', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])
  if (registrationError) throw registrationError
  if (expenseError) throw expenseError

  return { event, registrations: registrations || [], prizeExpenses: expenses || [], userRole: actor.role }
}

export async function getAdminEvents() {
  await requireStaff()
  const { data, error } = await supabaseAdmin.from('events').select('*').order('starts_at', { ascending: false })
  if (error) throw error
  return data || []
}
