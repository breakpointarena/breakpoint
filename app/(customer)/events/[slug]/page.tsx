import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { ArrowLeft, CalendarDays, Clock3, Gamepad2, MapPin, Trophy, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EventRegistrationForm } from '@/components/customer/events/EventRegistrationForm'
import { getPublishedEventBySlug } from '@/lib/events/data'

export const dynamic = 'force-dynamic'

function arenaDate(value: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublishedEventBySlug(slug)
  if (!event) notFound()

  const start = arenaDate(event.starts_at)
  const end = arenaDate(event.ends_at)
  const typeLabel = event.event_type === 'gaming' ? 'Gaming event' : event.event_type === 'community' ? 'Community' : event.event_type === 'other' ? 'Event' : 'Tournament'

  return (
    <div className="w-full space-y-6 pt-6 md:pt-8">
      <Link
        href="/events"
        prefetch
        className="relative z-20 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#111114]/90 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" /> All events
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-[#231a07] via-[#111114] to-[#09090b] p-7 sm:p-10">
            {event.cover_image_url && <img src={event.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            {event.cover_image_url && <div className="absolute inset-0 bg-black/65" />}
            <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">{event.event_type === 'tournament' ? <Trophy className="h-4 w-4" /> : <Gamepad2 className="h-4 w-4" />}{typeLabel}</div>
            <h1 className="relative mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">{event.title}</h1>
            <p className="relative mt-4 max-w-2xl whitespace-pre-line text-sm leading-7 text-secondary-content sm:text-base">{event.description || 'Join us for an event at Breakpoint Arena.'}</p>
            {(event.first_place_prize_description || event.second_place_prize_description || event.third_place_prize_description || event.public_prize_description) && (
              <div className="relative mt-5 rounded-xl border border-primary/20 bg-black/20 p-4">
                <h2 className="flex items-center gap-2 text-sm font-black text-primary"><Trophy className="h-4 w-4" />Prizes</h2>
                {event.public_prize_description && <p className="mt-3 text-sm text-secondary-content">{event.public_prize_description}</p>}
                <ol className="mt-3 space-y-2 text-sm text-white">
                  {event.first_place_prize_description && <li><span className="mr-2 text-primary">1st place</span>{event.first_place_prize_description}</li>}
                  {event.second_place_prize_description && <li><span className="mr-2 text-primary">2nd place</span>{event.second_place_prize_description}</li>}
                  {event.third_place_prize_description && <li><span className="mr-2 text-primary">3rd place</span>{event.third_place_prize_description}</li>}
                </ol>
              </div>
            )}
          </section>

          <Card className="border-white/10 bg-[#111114]/90 p-5 sm:p-7">
            <h2 className="text-lg font-black text-white">Event details</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Detail icon={<CalendarDays className="h-4 w-4" />} label="Starts" value={start || 'Date to be announced'} />
              {end && <Detail icon={<Clock3 className="h-4 w-4" />} label="Ends" value={end} />}
              <Detail icon={<MapPin className="h-4 w-4" />} label="Venue" value={event.venue} />
              <Detail icon={<Users className="h-4 w-4" />} label="Registration" value={event.registration_mode === 'team' ? `Teams of ${event.team_size}` : 'Individual entry'} />
            </div>
            {event.registration_closes_at && <p className="mt-5 border-t border-white/10 pt-4 text-xs text-secondary-content">Registration closes {arenaDate(event.registration_closes_at)}.</p>}
          </Card>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <EventRegistrationForm event={event} />
        </aside>
      </div>
    </div>
  )
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-primary">{icon}</span><div><p className="text-[10px] font-bold uppercase tracking-widest text-secondary-content">{label}</p><p className="mt-1 text-sm font-semibold text-white">{value}</p></div></div>
}
