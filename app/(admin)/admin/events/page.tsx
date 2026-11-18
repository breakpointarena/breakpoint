import Link from 'next/link'
import { CalendarDays, Plus, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createEvent, getAdminEvents } from '@/app/(admin)/admin/events/actions'
import { requireStaff } from '@/lib/auth/require-admin'

export const dynamic = 'force-dynamic'

export default async function AdminEventsPage() {
  await requireStaff()
  const events = await getAdminEvents()

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 p-4 sm:p-6 lg:p-8">
      <header className="flex items-start gap-4">
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-primary"><Trophy className="h-6 w-6" /></div>
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Arena operations</p><h1 className="mt-1 text-3xl font-black text-white">Events</h1><p className="mt-2 text-sm text-secondary-content">Publish events and manage registrations, fees, and prize expenses.</p></div>
      </header>

      <Card className="border-white/10 bg-[#111114] p-5 sm:p-7">
        <div className="mb-5 flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /><h2 className="text-lg font-black text-white">Create event</h2></div>
        <form action={createEvent} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2"><Label>Event title</Label><Input name="title" placeholder="8-ball Tournament" required maxLength={140} /></div>
          <div className="space-y-2"><Label>Type</Label><select name="event_type" className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="tournament">Tournament</option><option value="gaming">Gaming event</option><option value="community">Community</option><option value="other">Other</option></select></div>
          <div className="space-y-2"><Label>Starts (India time)</Label><Input name="starts_at" type="datetime-local" required /></div>
          <div className="space-y-2"><Label>Entry fee (₹)</Label><Input name="entry_fee" type="number" min="0" step="0.01" defaultValue="0" required /></div>
          </div>
          <details className="rounded-xl border border-white/10 bg-black/20 p-4">
            <summary className="cursor-pointer list-none text-sm font-bold text-primary">More options <span className="ml-1 text-xs font-normal text-secondary-content">(venue, registration, team settings, prizes)</span></summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2"><Label>Ends (optional)</Label><Input name="ends_at" type="datetime-local" /></div>
          <div className="space-y-2"><Label>Venue</Label><Input name="venue" defaultValue="Breakpoint Arena" /></div>
          <div className="space-y-2"><Label>Registration opens (optional)</Label><Input name="registration_opens_at" type="datetime-local" /></div>
          <div className="space-y-2"><Label>Registration closes (optional)</Label><Input name="registration_closes_at" type="datetime-local" /></div>
          <div className="space-y-2"><Label>Capacity (blank = unlimited)</Label><Input name="capacity" type="number" min="1" step="1" /></div>
          <div className="space-y-2"><Label>Entry type</Label><select name="registration_mode" className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="individual">Individual</option><option value="team">Team</option></select></div>
          <div className="space-y-2"><Label>Players per team</Label><Input name="team_size" type="number" min="1" max="20" defaultValue="1" /></div>
          <div className="space-y-2 sm:col-span-2 xl:col-span-3"><Label>Description (optional)</Label><textarea name="description" rows={3} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-primary" placeholder="Rules and details for participants" /></div>
          <div className="space-y-2 sm:col-span-2 xl:col-span-3">
            <Label>Prizes shown publicly (optional)</Label>
            <textarea name="prizes" rows={3} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-primary" placeholder={'1st place: ...\n2nd place: ...\n3rd place: ...'} />
            <p className="text-xs text-secondary-content">One prize per line. Payout costs are recorded separately in admin-only expenses.</p>
          </div>
            </div>
          </details>
          <Button type="submit"><CalendarDays className="mr-2 h-4 w-4" />Save draft</Button>
        </form>
      </Card>

      <section className="space-y-4">
        <h2 className="text-xl font-black text-white">All events <span className="ml-2 text-sm font-medium text-secondary-content">{events.length}</span></h2>
        {events.length === 0 ? <Card className="border-white/10 bg-[#111114] p-8 text-sm text-secondary-content">No events have been created.</Card> : (
          <div className="space-y-3">{events.map((event: any) => (
            <Link key={event.id} href={`/admin/events/${event.id}`} className="block rounded-xl border border-white/10 bg-[#111114] p-4 transition hover:border-primary/40 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-bold text-white">{event.title}</p><p className="mt-1 text-xs text-secondary-content">{new Date(event.starts_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} · {event.venue}</p></div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${event.status === 'published' ? 'bg-emerald-500/10 text-emerald-300' : event.status === 'cancelled' ? 'bg-red-500/10 text-red-300' : 'bg-white/5 text-secondary-content'}`}>{event.status}</span>
              </div>
            </Link>
          ))}</div>
        )}
      </section>
    </div>
  )
}
