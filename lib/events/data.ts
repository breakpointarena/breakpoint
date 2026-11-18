import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/server'

export interface PublicEvent {
  id: string
  slug: string
  title: string
  event_type: string
  description: string
  venue: string
  starts_at: string
  ends_at: string | null
  registration_opens_at: string | null
  registration_closes_at: string | null
  entry_fee: number
  service_fee_percent: number
  capacity: number | null
  registration_mode: 'individual' | 'team'
  team_size: number
  public_prize_description: string | null
  first_place_prize_description: string | null
  second_place_prize_description: string | null
  third_place_prize_description: string | null
  cover_image_url: string | null
  registered_count: number
  spots_left: number | null
  registration_open: boolean
}

type PublicEventRow = Omit<PublicEvent, 'registered_count' | 'spots_left' | 'registration_open'>
type RegistrationRow = {
  event_id: string
  registration_status: string
  reservation_expires_at: string | null
}

const PUBLIC_EVENT_FIELDS = [
  'id', 'slug', 'title', 'event_type', 'description', 'venue', 'starts_at', 'ends_at',
  'registration_opens_at', 'registration_closes_at', 'entry_fee', 'service_fee_percent', 'capacity',
  'registration_mode', 'team_size', 'public_prize_description',
  'first_place_prize_description', 'second_place_prize_description', 'third_place_prize_description',
  'cover_image_url',
].join(', ')

function withAvailability(event: PublicEventRow, registrations: RegistrationRow[]): PublicEvent {
  const now = Date.now()
  const registeredCount = registrations.filter((row) =>
    row.registration_status === 'registered' || row.registration_status === 'checked_in' ||
    (row.registration_status === 'pending_payment' && row.reservation_expires_at &&
      new Date(row.reservation_expires_at).getTime() > now)
  ).length
  const spotsLeft = event.capacity == null ? null : Math.max(0, Number(event.capacity) - registeredCount)
  const opensAt = event.registration_opens_at ? new Date(event.registration_opens_at).getTime() : 0
  const closesAt = event.registration_closes_at ? new Date(event.registration_closes_at).getTime() : Infinity
  const hasGamingRegistrationDeadline = event.event_type === 'gaming' && event.registration_closes_at !== null

  return {
    ...event,
    entry_fee: Number(event.entry_fee || 0),
    service_fee_percent: Number(event.service_fee_percent ?? 2),
    capacity: event.capacity == null ? null : Number(event.capacity),
    team_size: Number(event.team_size || 1),
    registered_count: registeredCount,
    spots_left: spotsLeft,
    registration_open: now >= opensAt && now <= closesAt &&
      (hasGamingRegistrationDeadline || now < new Date(event.starts_at).getTime()) &&
      (spotsLeft == null || spotsLeft > 0),
  }
}

async function registrationsFor(eventIds: string[]): Promise<RegistrationRow[]> {
  if (eventIds.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from('event_registrations')
    .select('event_id, registration_status, reservation_expires_at')
    .in('event_id', eventIds)

  if (error) throw error
  return (data || []) as RegistrationRow[]
}

export async function getPublishedEvents(): Promise<PublicEvent[]> {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('events')
    .select(PUBLIC_EVENT_FIELDS)
    .eq('status', 'published')
    .or(`starts_at.gte.${now},ends_at.gte.${now}`)
    .order('starts_at', { ascending: true })

  if (error) throw error
  const events = (data || []) as PublicEventRow[]
  const registrations = await registrationsFor(events.map((event) => event.id))
  return events.map((event) => withAvailability(
    event,
    registrations.filter((row) => row.event_id === event.id)
  ))
}

export async function getPublishedEventBySlug(slug: string): Promise<PublicEvent | null> {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select(PUBLIC_EVENT_FIELDS)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  const registrations = await registrationsFor([data.id])
  return withAvailability(data as PublicEventRow, registrations)
}
