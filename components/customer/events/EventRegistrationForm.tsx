'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, CalendarDays, Loader2, ShieldCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import OTPVerification from '@/components/auth/OTPVerification'
import { checkActiveSessionAction, resendOTPAction, sendOTPAction, verifyOTPAction } from '@/app/(customer)/booking/otp-actions'
import { createEventRegistrationOrder, confirmEventRegistrationPayment } from '@/app/(customer)/events/payment-actions'
import { openRazorpayCheckout, RazorpayDismissedError, RazorpayFailedError } from '@/lib/razorpay/checkout'

interface Props {
  event: {
    id: string
    title: string
    entry_fee: number
    registration_mode: 'individual' | 'team'
    team_size: number
    registration_open: boolean
  }
}

export function EventRegistrationForm({ event }: Props) {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null)
  const [showOtp, setShowOtp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [teamName, setTeamName] = useState('')
  const [participantNames, setParticipantNames] = useState('')
  const [loading, setLoading] = useState(false)
  const [registrationCode, setRegistrationCode] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    checkActiveSessionAction().then((session) => {
      if (active && session.isValid && session.phone) {
        setVerifiedPhone(session.phone)
        setPhone(session.phone)
      }
    })
    return () => { active = false }
  }, [])

  const participants = useMemo(() => participantNames.split(/\r?\n/).map((value) => value.trim()).filter(Boolean), [participantNames])

  const beginVerification = async () => {
    const normalized = phone.replace(/\D/g, '').slice(-10)
    if (!/^\d{10}$/.test(normalized)) {
      toast.error('Enter a valid 10-digit mobile number.')
      return
    }
    setPhone(normalized)
    setShowOtp(true)
  }

  const register = async () => {
    if (!event.registration_open || loading || !verifiedPhone) return
    if (!name.trim()) {
      toast.error('Enter the participant name.')
      return
    }
    if (event.registration_mode === 'team' && !teamName.trim()) {
      toast.error('Enter a team name.')
      return
    }
    if (event.registration_mode === 'team' && participants.length !== event.team_size) {
      toast.error(`Enter all ${event.team_size} participant names, one per line.`)
      return
    }

    setLoading(true)
    try {
      const order = await createEventRegistrationOrder({
        eventId: event.id,
        phone: verifiedPhone,
        name,
        email,
        teamName,
        participantNames: participants,
      })

      if (!order.success) {
        if (order.verificationRequired) {
          setVerifiedPhone(null)
          setShowOtp(true)
        }
        toast.error(order.error || 'Could not register for this event.')
        return
      }

      if (order.freeRegistration && order.registrationCode) {
        setRegistrationCode(order.registrationCode)
        toast.success('You are registered!')
        router.refresh()
        return
      }

      if (!order.orderId || !order.keyId || !order.amount) {
        toast.error('Payment could not be started. Please try again.')
        return
      }

      const payment = await openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amount: order.amount,
        name: 'Breakpoint Arena',
        description: `${event.title} registration`,
        prefill: { name, email: email || undefined, contact: verifiedPhone },
        notes: { registration: order.registrationCode || '' },
      })
      const confirmation = await confirmEventRegistrationPayment(payment)
      if (!confirmation.success) {
        toast.error(confirmation.error || 'Payment confirmation is still pending. Please contact the arena if you were charged.')
        return
      }
      setRegistrationCode(confirmation.registrationCode || order.registrationCode || null)
      toast.success('Payment received. You are registered!')
      router.refresh()
    } catch (error) {
      if (error instanceof RazorpayDismissedError) {
        toast('Payment window closed', { description: 'Your place is held for 15 minutes. You can try again from this page.' })
      } else if (error instanceof RazorpayFailedError) {
        toast.error(error.message)
      } else {
        console.error('Event registration failed:', error)
        toast.error('Could not complete registration. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (registrationCode) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-1 h-6 w-6 shrink-0 text-emerald-400" />
          <div>
            <h3 className="text-lg font-black text-white">Registration confirmed</h3>
            <p className="mt-1 text-sm text-secondary-content">Keep this code for event check-in.</p>
            <p className="mt-4 rounded-lg border border-emerald-500/20 bg-black/20 px-4 py-3 font-mono text-xl font-bold tracking-widest text-emerald-300">{registrationCode}</p>
          </div>
        </div>
      </Card>
    )
  }

  if (!event.registration_open) {
    return <Card className="border-white/10 bg-white/[0.03] p-6 text-sm text-secondary-content">Registration is closed or this event is full.</Card>
  }

  return (
    <Card className="border-white/10 bg-[#111114]/90 p-5 sm:p-7">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">Register for this event</h2>
          <p className="mt-1 text-sm text-secondary-content">{event.entry_fee > 0 ? `Entry fee: ₹${event.entry_fee.toLocaleString('en-IN')}` : 'Free registration'}</p>
        </div>
        <CalendarDays className="h-5 w-5 text-primary" />
      </div>

      {event.registration_mode === 'team' && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
          <Users className="h-4 w-4" /> Team entry · {event.team_size} participants
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="event-name">{event.registration_mode === 'team' ? 'Contact person' : 'Participant name'}</Label>
          <Input id="event-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-email">Email (optional)</Label>
          <Input id="event-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        {event.registration_mode === 'team' && (
          <>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="team-name">Team name</Label>
              <Input id="team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="participants">Participant names (one per line)</Label>
              <textarea id="participants" value={participantNames} onChange={(e) => setParticipantNames(e.target.value)} rows={event.team_size} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-primary" />
            </div>
          </>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <Label htmlFor="event-phone">Mobile number</Label>
        <div className="flex gap-2">
          <Input id="event-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setVerifiedPhone(null) }} maxLength={10} autoComplete="tel" disabled={Boolean(verifiedPhone)} />
          {verifiedPhone ? (
            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-500/20 px-3 text-xs font-bold text-emerald-300"><ShieldCheck className="h-4 w-4" /> Verified</div>
          ) : (
            <Button type="button" variant="outline" onClick={beginVerification} disabled={showOtp}>Verify</Button>
          )}
        </div>
        {showOtp && !verifiedPhone && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <OTPVerification
              phone={phone}
              onVerified={(value) => { setVerifiedPhone(value); setPhone(value); setShowOtp(false) }}
              onBack={() => setShowOtp(false)}
              onSendOTP={sendOTPAction}
              onVerifyOTP={verifyOTPAction}
              onResendOTP={resendOTPAction}
              autoSendOnMount
            />
          </div>
        )}
      </div>

      <Button className="mt-6 w-full" onClick={register} disabled={!verifiedPhone || loading}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</> : event.entry_fee > 0 ? `Pay ₹${event.entry_fee.toLocaleString('en-IN')} and register` : 'Complete free registration'}
      </Button>
      <p className="mt-3 text-center text-xs text-secondary-content">Your phone number is used for registration and event updates.</p>
    </Card>
  )
}
