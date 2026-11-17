import Link from 'next/link'
import { CalendarDays, Gamepad2, MapPin, Trophy, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getPublishedEvents } from '@/lib/events/data'

export const dynamic = 'force-dynamic'

function eventDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function eventTypeLabel(value: string) {
  return value === 'gaming' ? 'Gaming event' : value === 'community' ? 'Community' : value === 'other' ? 'Event' : 'Tournament'
}

export default async function EventsPage() {
  const events = await getPublishedEvents()

  return (
    <div className="w-full space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-[#231a07] via-[#111114] to-[#09090b] px-6 py-10 sm:px-10 sm:py-14">
        <div className="absolute -right-12 -top-12 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <p className="relative text-xs font-black uppercase tracking-[0.28em] text-primary">Breakpoint Arena · Events</p>
        <h1 className="relative mt-3 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">Play for the moment.</h1>
        <p className="relative mt-4 max-w-2xl text-sm leading-6 text-secondary-content sm:text-base">Join tournaments and special gaming events at the arena. Find your event and save your place.</p>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Coming up</p>
            <h2 className="mt-1 text-2xl font-black text-white">Published events</h2>
          </div>
          <span className="text-sm text-secondary-content">{events.length} event{events.length === 1 ? '' : 's'}</span>
        </div>

        {events.length === 0 ? (
          <Card className="border-white/10 bg-white/[0.03] p-10 text-center">
            <CalendarDays className="mx-auto h-9 w-9 text-primary" />
            <h3 className="mt-4 text-lg font-bold text-white">No events published yet</h3>
            <p className="mt-1 text-sm text-secondary-content">Check back soon for tournaments and gaming events.</p>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <Card key={event.id} className="group flex flex-col overflow-hidden border-white/10 bg-[#111114]/90 transition hover:-translate-y-1 hover:border-primary/40">
                <div className="flex h-36 items-end bg-gradient-to-br from-primary/20 via-[#1b1710] to-[#111114] p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-black/30 text-primary">
                    {event.event_type === 'tournament' ? <Trophy className="h-6 w-6" /> : <Gamepad2 className="h-6 w-6" />}
                  </div>
                  <span className="ml-auto rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">{eventTypeLabel(event.event_type)}</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-xl font-black text-white">{event.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-secondary-content">{event.description || 'Join us for an event at Breakpoint Arena.'}</p>
                  <div className="mt-4 space-y-2 text-xs text-secondary-content">
                    <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{eventDate(event.starts_at)}</p>
                    <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{event.venue}</p>
                    <p className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />{event.spots_left === null ? 'Open registration' : `${event.spots_left} spot${event.spots_left === 1 ? '' : 's'} left`}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                    <p className="font-black text-white">{event.entry_fee > 0 ? `₹${event.entry_fee.toLocaleString('en-IN')}` : 'Free'}<span className="ml-1 text-xs font-medium text-secondary-content">entry</span></p>
                    <Link href={`/events/${event.slug}`} className="rounded-lg bg-primary px-4 py-2 text-xs font-black uppercase tracking-wide text-black transition hover:brightness-110">View event</Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
