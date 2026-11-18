import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { ArrowLeft, ExternalLink, IndianRupee, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AdminRegistrationForm, EventPrizeExpenseForm, RegistrationPaymentForm, RegistrationRefundForm } from '@/components/admin/events/AdminEventForms'
import { getAdminEvent, setEventStatus, setRegistrationStatus, updateEvent } from '@/app/(admin)/admin/events/actions'
import { requireStaff } from '@/lib/auth/require-admin'

export const dynamic = 'force-dynamic'

function inputDateTime(value: string | null) {
  if (!value) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

function displayDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value)) : '—'
}

export default async function AdminEventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireStaff()
  const { eventId } = await params
  const data = await getAdminEvent(eventId)
  if (!data) notFound()
  const { event, registrations, prizeExpenses } = data
  const collected = registrations.reduce((sum: number, registration: any) => sum + (registration.event_registration_payments || [])
    .reduce((payments: number, payment: any) => payments + (payment.entry_type === 'refund' ? -1 : 1) * Number(payment.amount), 0), 0)
  const prizeTotal = prizeExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount), 0)

  return (
    <div className="mx-auto w-full max-w-7xl space-y-7 p-4 sm:p-6 lg:p-8">
      <Link href="/admin/events" className="inline-flex items-center gap-2 text-sm text-secondary-content hover:text-white"><ArrowLeft className="h-4 w-4" /> Events</Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Event management</p><h1 className="mt-1 text-3xl font-black text-white">{event.title}</h1><p className="mt-2 text-sm text-secondary-content">{displayDate(event.starts_at)} · {event.venue}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold uppercase text-secondary-content">{event.status}</span>
          {event.status === 'published' && <Link href={`/events/${event.slug}`} target="_blank" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white hover:border-primary/40">Public page <ExternalLink className="h-3.5 w-3.5" /></Link>}
          <form action={setEventStatus}><input type="hidden" name="event_id" value={event.id} /><input type="hidden" name="status" value={event.status === 'published' ? 'draft' : 'published'} /><Button variant={event.status === 'published' ? 'outline' : 'default'}>{event.status === 'published' ? 'Unpublish' : 'Publish'}</Button></form>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={<Users className="h-4 w-4" />} label="Registrations" value={String(registrations.filter((r: any) => ['registered', 'checked_in'].includes(r.registration_status)).length)} />
        <Metric icon={<IndianRupee className="h-4 w-4" />} label="Collected entry revenue" value={`₹${collected.toLocaleString('en-IN')}`} />
        {data.userRole === 'admin' && <Metric icon={<IndianRupee className="h-4 w-4" />} label="Prize expenses" value={`₹${prizeTotal.toLocaleString('en-IN')}`} />}
      </div>

      <Card className="border-white/10 bg-[#111114] p-5 sm:p-7">
        <h2 className="mb-5 text-lg font-black text-white">Event settings</h2>
        <form action={updateEvent} className="space-y-5">
          <input type="hidden" name="event_id" value={event.id} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2"><Label>Title</Label><Input name="title" defaultValue={event.title} required /></div>
            <div className="space-y-2"><Label>Type</Label><select name="event_type" defaultValue={event.event_type} className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="tournament">Tournament</option><option value="gaming">Gaming event</option><option value="community">Community</option><option value="other">Other</option></select></div>
            <div className="space-y-2"><Label>Starts (India time)</Label><Input name="starts_at" type="datetime-local" defaultValue={inputDateTime(event.starts_at)} required /></div>
            <div className="space-y-2"><Label>Entry fee (₹)</Label><Input name="entry_fee" type="number" min="0" step="0.01" defaultValue={event.entry_fee} required /></div>
          </div>
          <details className="rounded-xl border border-white/10 bg-black/20 p-4">
            <summary className="cursor-pointer list-none text-sm font-bold text-primary">More options <span className="ml-1 text-xs font-normal text-secondary-content">(venue, registration, team settings, prizes)</span></summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2"><Label>Slug</Label><Input name="slug" defaultValue={event.slug} required /></div>
          <div className="space-y-2"><Label>Ends</Label><Input name="ends_at" type="datetime-local" defaultValue={inputDateTime(event.ends_at)} /></div>
          <div className="space-y-2"><Label>Venue</Label><Input name="venue" defaultValue={event.venue} /></div>
          <div className="space-y-2"><Label>Registration opens</Label><Input name="registration_opens_at" type="datetime-local" defaultValue={inputDateTime(event.registration_opens_at)} /></div>
          <div className="space-y-2"><Label>Registration closes</Label><Input name="registration_closes_at" type="datetime-local" defaultValue={inputDateTime(event.registration_closes_at)} /></div>
          <div className="space-y-2"><Label>Capacity (blank = unlimited)</Label><Input name="capacity" type="number" min="1" defaultValue={event.capacity || ''} /></div>
          <div className="space-y-2"><Label>Entry type</Label><select name="registration_mode" defaultValue={event.registration_mode} className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"><option value="individual">Individual</option><option value="team">Team</option></select></div>
          <div className="space-y-2"><Label>Team size</Label><Input name="team_size" type="number" min="1" max="20" defaultValue={event.team_size} /></div>
          <div className="space-y-2 sm:col-span-2 xl:col-span-3"><Label>Description (optional)</Label><textarea name="description" rows={3} defaultValue={event.description} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-primary" /></div>
          <div className="space-y-2 sm:col-span-2 xl:col-span-3">
            <Label>Prizes shown publicly (optional)</Label>
            <textarea name="prizes" rows={3} defaultValue={[event.first_place_prize_description ? `1st place: ${event.first_place_prize_description}` : '', event.second_place_prize_description ? `2nd place: ${event.second_place_prize_description}` : '', event.third_place_prize_description ? `3rd place: ${event.third_place_prize_description}` : ''].filter(Boolean).join('\n')} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-primary" placeholder={'1st place: ...\n2nd place: ...\n3rd place: ...'} />
            <p className="text-xs text-secondary-content">One prize per line. Payout costs are recorded separately in admin-only expenses.</p>
          </div>
            </div>
          </details>
          <Button type="submit">Save event</Button>
        </form>
      </Card>
      {event.status !== 'cancelled' && <form action={setEventStatus} className="-mt-4 flex justify-end"><input type="hidden" name="event_id" value={event.id} /><input type="hidden" name="status" value="cancelled" /><Button type="submit" variant="outline" className="border-red-500/30 text-red-300">Cancel event</Button></form>}

      {data.userRole === 'admin' && <section className="space-y-4">
        <div><h2 className="text-xl font-black text-white">Register on behalf of a customer</h2><p className="mt-1 text-sm text-secondary-content">Entry fee: ₹{Number(event.entry_fee).toLocaleString('en-IN')} per entry. Collected payments are counted as event revenue.</p></div>
        <AdminRegistrationForm eventId={event.id} entryFee={Number(event.entry_fee)} registrationMode={event.registration_mode} teamSize={Number(event.team_size)} />
      </section>}

      <section className="space-y-4">
        <h2 className="text-xl font-black text-white">Registrations <span className="ml-2 text-sm font-medium text-secondary-content">{registrations.length}</span></h2>
        {registrations.length === 0 ? <Card className="border-white/10 bg-[#111114] p-8 text-sm text-secondary-content">No registrations yet.</Card> : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-secondary-content"><tr><th className="p-3">Registrant</th><th className="p-3">Code</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3">Registered</th><th className="p-3">Actions</th></tr></thead>
              <tbody>{registrations.map((registration: any) => (
                <tr key={registration.id} className="border-t border-white/5 align-top">
                  <td className="p-3"><p className="font-bold text-white">{registration.customer_name}{registration.team_name ? ` · ${registration.team_name}` : ''}</p><p className="text-xs text-secondary-content">{registration.customer_phone}{registration.customer_email ? ` · ${registration.customer_email}` : ''}</p>{registration.participant_names?.length > 0 && <p className="mt-1 text-xs text-secondary-content">{registration.participant_names.join(', ')}</p>}</td>
                  <td className="p-3 font-mono text-primary">{registration.registration_code}</td>
                  <td className="p-3 capitalize text-white">{registration.registration_status.replace('_', ' ')}</td>
                  <td className="p-3"><p className="capitalize text-white">{registration.payment_status.replace('_', ' ')}</p><p className="text-xs text-secondary-content">₹{Number(registration.amount_paid).toLocaleString('en-IN')} / ₹{Number(registration.entry_fee).toLocaleString('en-IN')}</p></td>
                  <td className="p-3 text-secondary-content">{displayDate(registration.created_at)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {registration.registration_status === 'registered' && <StatusAction eventId={event.id} registrationId={registration.id} status="checked_in" label="Check in" />}
                      {registration.registration_status === 'waitlisted' && <StatusAction eventId={event.id} registrationId={registration.id} status="registered" label="Confirm" />}
                      {registration.registration_status !== 'cancelled' && registration.registration_status !== 'checked_in' && <StatusAction eventId={event.id} registrationId={registration.id} status="cancelled" label="Cancel" />}
                    </div>
                    {data.userRole === 'admin' && ['registered', 'checked_in'].includes(registration.registration_status) && <RegistrationPaymentForm eventId={event.id} registrationId={registration.id} amountDue={Math.max(0, Number(registration.entry_fee) - Number(registration.amount_paid))} />}
                    {data.userRole === 'admin' && <RegistrationRefundForm eventId={event.id} registrationId={registration.id} amountPaid={Number(registration.amount_paid)} />}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {data.userRole === 'admin' && <section className="space-y-4">
        <div><h2 className="text-xl font-black text-white">Prize expenses <span className="text-sm font-medium text-secondary-content">· Admin only</span></h2><p className="mt-1 text-sm text-secondary-content">Record each prize payout after it is paid. It appears in the existing expenses and profit reports.</p></div>
        <EventPrizeExpenseForm eventId={event.id} />
        {prizeExpenses.length > 0 && <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-secondary-content"><tr><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{prizeExpenses.map((expense: any) => <tr key={expense.id} className="border-t border-white/5"><td className="p-3 text-secondary-content">{expense.date}</td><td className="p-3 text-white">{expense.description}</td><td className="p-3 text-right font-bold text-red-300">₹{Number(expense.amount).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div>}
      </section>}
    </div>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <Card className="border-white/10 bg-[#111114] p-5"><div className="flex items-center gap-2 text-primary">{icon}<span className="text-xs font-bold uppercase tracking-wide text-secondary-content">{label}</span></div><p className="mt-3 text-2xl font-black text-white">{value}</p></Card>
}

function StatusAction({ eventId, registrationId, status, label }: { eventId: string; registrationId: string; status: string; label: string }) {
  return <form action={setRegistrationStatus}><input type="hidden" name="event_id" value={eventId} /><input type="hidden" name="registration_id" value={registrationId} /><input type="hidden" name="registration_status" value={status} /><Button size="sm" variant="outline" className="h-8">{label}</Button></form>
}
