'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addEventPrizeExpense, adminRegisterForEvent, recordEventRegistrationPayment, recordEventRegistrationRefund } from '@/app/(admin)/admin/events/actions'

export function AdminRegistrationForm({ eventId, entryFee, registrationMode, teamSize }: {
  eventId: string; entryFee: number; registrationMode: 'individual' | 'team'; teamSize: number
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const submit = async (form: FormData) => {
    if (pending) return
    setPending(true)
    try {
      await adminRegisterForEvent(form)
      toast.success('Registration added')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add registration')
    } finally { setPending(false) }
  }

  return (
    <form action={submit} className="grid gap-4 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-2">
      <input type="hidden" name="event_id" value={eventId} />
      <div className="space-y-2"><Label>Customer / team contact</Label><Input name="customer_name" required maxLength={120} /></div>
      <div className="space-y-2"><Label>Mobile number</Label><Input name="customer_phone" type="tel" inputMode="numeric" required maxLength={16} /></div>
      <div className="space-y-2"><Label>Email (optional)</Label><Input name="customer_email" type="email" /></div>
      {registrationMode === 'team' && <>
        <div className="space-y-2"><Label>Team name</Label><Input name="team_name" required maxLength={100} /></div>
        <div className="space-y-2 md:col-span-2"><Label>Players (one name per line, {teamSize} total)</Label><textarea name="participant_names" rows={teamSize} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-primary" /></div>
      </>}
      <div className="space-y-2"><Label>Amount collected (max ₹{entryFee.toLocaleString('en-IN')})</Label><Input name="amount_paid" type="number" min="0" max={entryFee} step="0.01" defaultValue="0" /></div>
      <div className="space-y-2"><Label>Payment method</Label><select name="payment_method" className="h-10 w-full rounded-lg border border-white/10 bg-[#111114] px-3 text-sm text-white"><option value="">Unpaid / not collected</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></div>
      {entryFee > 0 && <label className="flex items-center gap-2 text-sm text-secondary-content md:col-span-2"><input type="checkbox" name="comped" className="accent-primary" /> Waive entry fee (complimentary entry)</label>}
      <div className="md:col-span-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Register customer</Button></div>
    </form>
  )
}

export function EventPrizeExpenseForm({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const submit = async (form: FormData) => {
    if (pending) return
    setPending(true)
    try {
      await addEventPrizeExpense(form)
      toast.success('Prize expense recorded')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record prize expense')
    } finally { setPending(false) }
  }

  return (
    <form action={submit} className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:grid-cols-[1fr_150px_150px_auto] sm:items-end">
      <input type="hidden" name="event_id" value={eventId} />
      <div className="space-y-2"><Label>Prize / payout note</Label><Input name="description" placeholder="1st place payout" required maxLength={180} /></div>
      <div className="space-y-2"><Label>Amount</Label><Input name="amount" type="number" min="0.01" step="0.01" required /></div>
      <div className="space-y-2"><Label>Date paid</Label><Input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div>
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record expense</Button>
    </form>
  )
}

export function RegistrationRefundForm({ eventId, registrationId, amountPaid }: {
  eventId: string; registrationId: string; amountPaid: number
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  if (amountPaid <= 0) return null

  const submit = async (form: FormData) => {
    if (pending) return
    setPending(true)
    try {
      await recordEventRegistrationRefund(form)
      toast.success('Refund recorded and removed from event revenue')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record refund')
    } finally { setPending(false) }
  }

  return (
    <form action={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="registration_id" value={registrationId} />
      <Input name="amount" type="number" min="0.01" max={amountPaid} step="0.01" placeholder="Refund amount" required className="h-8 w-28 text-xs" />
      <select name="payment_method" required className="h-8 rounded-md border border-white/10 bg-[#111114] px-2 text-xs text-white"><option value="">Refund method</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="online">Online</option></select>
      <Input name="payment_reference" placeholder="Reference (optional)" className="h-8 w-36 text-xs" />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-8">{pending ? 'Saving…' : 'Record refund'}</Button>
    </form>
  )
}

export function RegistrationPaymentForm({ eventId, registrationId, amountDue }: {
  eventId: string; registrationId: string; amountDue: number
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  if (amountDue <= 0) return null

  const submit = async (form: FormData) => {
    if (pending) return
    setPending(true)
    try {
      await recordEventRegistrationPayment(form)
      toast.success('Payment recorded in event revenue')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record payment')
    } finally { setPending(false) }
  }

  return (
    <form action={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="registration_id" value={registrationId} />
      <Input name="amount" type="number" min="0.01" max={amountDue} step="0.01" defaultValue={amountDue} placeholder="Amount received" required className="h-8 w-28 text-xs" />
      <select name="payment_method" required className="h-8 rounded-md border border-white/10 bg-[#111114] px-2 text-xs text-white"><option value="">Payment method</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select>
      <Input name="payment_reference" placeholder="Reference (optional)" className="h-8 w-36 text-xs" />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-8">{pending ? 'Saving…' : 'Record payment'}</Button>
    </form>
  )
}
