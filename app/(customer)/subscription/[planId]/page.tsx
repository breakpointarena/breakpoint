'use client'

import React, { useState, useEffect } from 'react'
import { CheckCircle2, ShieldCheck, Phone, User, Mail, Cake, ChevronRight , Loader2, BadgeCheck } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { BreakpointLoader } from '@/components/shared/BreakpointLoader'
import { toast } from 'sonner'
import { arenaToday, daysBetweenDates, formatDateForDB, formatDateForDisplay, handleDobInput, isValidDateDDMMYYYY, isValidDob, DOB_ERROR } from '@/lib/utils/dates'
import { allFilled, isPlausibleEmail } from '@/lib/utils/forms'

// Import server actions
import { getPublicSubscriptionPlan } from '@/app/(customer)/subscription/actions'
import {
  createSubscriptionPaymentOrder,
  confirmSubscriptionPayment,
} from './payment-actions'
import {
  openRazorpayCheckout,
  RazorpayDismissedError,
  RazorpayFailedError,
} from '@/lib/razorpay/checkout'
import { ConfirmingPaymentOverlay } from '@/components/customer/booking/ConfirmingPaymentOverlay'
import { checkCustomerExists } from '@/app/(customer)/booking/actions'
import {
  sendOTPAction,
  verifyOTPAction,
  resendOTPAction,
  checkActiveSessionAction,
} from '@/app/(customer)/booking/otp-actions'
import OTPVerification from '@/components/auth/OTPVerification'

type Step = 'phone' | 'otp' | 'details' | 'summary' | 'processing' | 'already-member'

/** The membership a customer turns out to already hold, as checkCustomerExists returns it. */
interface ExistingMembership {
  plan_id: string
  plan_name: string
  discount_percentage: number
  end_date: string
}

export default function PlanDetailsPage() {
  const router = useRouter()
  const params = useParams()

  const [plan, setPlan] = useState<any>(null)
  const [step, setStep] = useState<Step>('phone')

  // Customer data
  const [mobileNumber, setMobileNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerDob, setCustomerDob] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerExists, setCustomerExists] = useState(false)
  /**
   * Set the moment we discover this customer is already a member, which is the
   * moment the purchase stops being possible. Held in state because the screen
   * that says so needs the plan name and end date, and re-asking the server for
   * something we have just been told would be a round trip for nothing.
   */
  const [existingMembership, setExistingMembership] = useState<ExistingMembership | null>(null)

  // Loading states
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  /** True only between Razorpay returning and the membership being written. */
  const [isConfirming, setIsConfirming] = useState(false)

  /**
   * Keep the membership the customer turns out to hold, for the screen that
   * tells them about it.
   *
   * Shared by the three places that can discover one - resuming a session,
   * verifying a number, and the server refusing the order - so the same fields
   * are read the same way each time.
   */
  const rememberMembership = (subscription: {
    plan_id?: string | number | null
    plan_name?: string | null
    discount_percentage?: number | null
    end_date?: string | null
  }) => {
    setExistingMembership({
      plan_id: String(subscription.plan_id ?? ''),
      plan_name: subscription.plan_name || 'Membership',
      discount_percentage: Number(subscription.discount_percentage || 0),
      end_date: String(subscription.end_date || ''),
    })
  }

  // Fetch the plan data on mount
  useEffect(() => {
    const fetchPlan = async () => {
      try {
        setIsLoading(true)
        const planId = Array.isArray(params.planId) ? params.planId[0] : params.planId

        if (planId) {
          const response = await getPublicSubscriptionPlan(planId)
          if (response.success && response.data) {
            setPlan(response.data)
          } else {
            toast.error('Plan Not Found', {
              description: 'Unable to load subscription plan details'
            })
            router.push('/subscription')
          }
        }
      } catch (error) {
        console.error('Error fetching plan:', error)
        toast.error('Error', { description: 'Failed to load plan' })
      } finally {
        setIsLoading(false)
      }
    }

    fetchPlan()
  }, [params.planId, router])

  /**
   * Resume a session the customer already has, rather than asking again.
   *
   * Somebody who signed in to book a slot an hour ago is still signed in; making
   * them retype their number and wait for another SMS is both an irritation and a
   * wasted credit. The phone step still exists for everyone else, and the OTP
   * step still guards the purchase itself - `createSubscriptionPaymentOrder`
   * re-checks the session server-side, so skipping the form here grants nothing.
   */
  useEffect(() => {
    let cancelled = false

    const resume = async () => {
      const session = await checkActiveSessionAction()
      if (cancelled || !session.isValid || !session.phone) return

      setMobileNumber(session.phone)

      const result = await checkCustomerExists(session.phone)
      if (cancelled) return

      if (result.success && result.exists && result.customer) {
        setCustomerName(result.customer.name || '')
        setCustomerEmail(result.customer.email || '')
        setCustomerDob(
          result.customer.date_of_birth ? formatDateForDisplay(result.customer.date_of_birth) : ''
        )
        setCustomerId(result.customer.id)
        setCustomerExists(true)

        // A member who is already signed in has to be stopped here too. This
        // path skipped the subscription entirely and went straight to review, so
        // somebody still inside their term could fill in a whole purchase before
        // the payment refused it.
        if (result.subscription) {
          rememberMembership(result.subscription)
          setStep('already-member')
          return
        }

        // Straight to review: everything the summary needs is already known.
        setStep('summary')
      } else {
        // Verified, but we have never met them - collect the details, not the OTP.
        setStep('details')
      }
    }

    resume()
    return () => {
      cancelled = true
    }
  }, [])

  // Handle phone submission
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!mobileNumber.trim() || mobileNumber.length < 10) {
      toast.error('Invalid Number', { description: 'Please enter a valid 10-digit mobile number.' })
      return
    }

    setIsSubmitting(true)

    // Verify before looking anyone up. checkCustomerExists returns name, email
    // and date of birth, so it must sit behind proof of the number - and
    // activating a plan changes what every future booking costs.
    const session = await checkActiveSessionAction()

    if (!session.isValid || session.phone !== mobileNumber) {
      setStep('otp')
      setIsSubmitting(false)
      return
    }

    await proceedAfterVerification()
  }

  const handleOTPVerified = async () => {
    setIsSubmitting(true)
    await proceedAfterVerification()
  }

  const proceedAfterVerification = async () => {
    const result = await checkCustomerExists(mobileNumber)

    if (result.exists && result.customer) {
      /**
       * Already a member: stop here, on a screen that says so.
       *
       * Both halves of this used to be dead ends. Holding *this* plan raised a
       * toast and returned, leaving the customer on the OTP step - a screen
       * whose only remaining action was to re-enter a code that could no longer
       * work, because verifying had already consumed that OTP session. Holding a
       * *different* plan merely warned and carried on to the summary, so they
       * filled in a purchase that `createSubscriptionPaymentOrder` was always
       * going to refuse, and found out at the payment.
       *
       * One active membership at a time is the server's rule
       * (payment-actions.ts, `activeMembershipFor`), and it exists because a new
       * term starts today rather than extending the old one - so a second
       * purchase would cost the customer the days they have left. Neither case
       * can proceed, so neither pretends to.
       */
      if (result.subscription) {
        rememberMembership(result.subscription)
        setStep('already-member')
        setIsSubmitting(false)
        return
      }

      // Customer exists
      setCustomerExists(true)
      setCustomerId(result.customer.id)
      setCustomerName(result.customer.name)
      setCustomerEmail(result.customer.email || '')
      if (result.customer.date_of_birth) {
        setCustomerDob(formatDateForDisplay(result.customer.date_of_birth))
      }

      toast.success('Welcome back!', { description: `Hey ${result.customer.name}!` })
      setStep('summary')
    } else {
      // New customer
      toast.info('New Customer', { description: 'Please provide your details.' })
      setStep('details')
    }

    setIsSubmitting(false)
  }

  // Handle details submission
  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!customerName.trim()) {
      toast.error('Required Field', { description: 'Please provide your name.' })
      return
    }

    // isValidDob covers both the DD-MM-YYYY shape and the accepted year range.
    if (!customerDob || !isValidDob(customerDob)) {
      toast.error(DOB_ERROR)
      return
    }

    toast.success('Details Saved', { description: 'Review your purchase.' })
    setStep('summary')
  }

  /**
   * Pay for the membership, then let the server grant it.
   *
   * This used to invent a payment id in the browser and call
   * `activateSubscriptionPlan` directly, so a membership appeared whether or not
   * any money moved - every membership in production was created that way. Now
   * the price comes from the plan row on the server, Razorpay takes the money,
   * and the membership is only written once the signature has been verified.
   */
  const handleActivatePlan = async () => {
    try {
      setIsActivating(true)

      const order = await createSubscriptionPaymentOrder({
        phone: mobileNumber,
        name: customerName,
        email: customerEmail,
        dateOfBirth: customerDob ? formatDateForDB(customerDob) : undefined,
        planId: plan.id,
      })

      if (!order.success) {
        // A lapsed session sends them back to the OTP step rather than to an
        // error they cannot act on.
        if (order.verificationRequired) {
          toast.error('Please verify your number', { description: order.error })
          setStep('otp')
          setIsActivating(false)
          return
        }

        /**
         * The server refusing a membership that began somewhere else - another
         * tab, or a purchase made between resuming this page and paying. The
         * checks before this one make it rare rather than impossible, so it ends
         * on the same screen rather than a toast over a summary the customer can
         * no longer act on. The toast below still covers a failed re-read.
         */
        if (order.alreadySubscribed) {
          const current = await checkCustomerExists(mobileNumber)
          if (current.success && current.subscription) {
            rememberMembership(current.subscription)
            setStep('already-member')
            setIsActivating(false)
            return
          }
        }

        toast.error(order.alreadySubscribed ? 'Already a member' : 'Could not start payment', {
          description: order.error,
        })
        setIsActivating(false)
        return
      }

      const response = await openRazorpayCheckout({
        keyId: order.keyId!,
        orderId: order.orderId!,
        amount: order.amount!,
        name: 'Break Point Arena',
        description: `${order.summary?.planName || 'Membership'} · ${order.summary?.durationMonths || 1} month(s)`,
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: mobileNumber,
        },
      })

      // Between here and the reply the money has moved but the membership does
      // not exist yet, which is the one moment the customer must not close the tab.
      setIsConfirming(true)

      const confirmed = await confirmSubscriptionPayment(response)

      if (confirmed.success) {
        toast.success('Membership active', {
          description: `${confirmed.planName || plan.name} is now on your account.`,
        })
        if (typeof window !== 'undefined') {
          localStorage.setItem('customerPhone', mobileNumber)
        }
        router.push(`/subscription/${params.planId}/success`)
        return
      }

      toast.error('Payment taken, membership not activated', {
        description: confirmed.error || 'Please contact the arena with your payment id.',
      })
      setIsConfirming(false)
      setIsActivating(false)
    } catch (error) {
      if (error instanceof RazorpayDismissedError) {
        toast.info('Payment cancelled', { description: 'Your membership has not been purchased.' })
      } else if (error instanceof RazorpayFailedError) {
        toast.error('Payment failed', { description: error.message })
      } else {
        console.error('Subscription purchase error:', error)
        toast.error('Something went wrong', { description: 'Please try again.' })
      }
      setIsConfirming(false)
      setIsActivating(false)
    }
  }

  // Gates the details submit: every starred field must be filled.
  const detailsComplete =
    allFilled(customerName, customerDob) &&
    isValidDateDDMMYYYY(customerDob) &&
    isPlausibleEmail(customerEmail)

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = handleDobInput(e.target.value)
    setCustomerDob(formatted)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0a14]">
        <BreakpointLoader size="lg" />
      </div>
    )
  }

  if (!plan) {
    return null
  }

  /**
   * Already a member - the end of this journey, and deliberately a screen.
   *
   * A toast was the wrong shape for this. It fades, it leaves nothing behind,
   * and it was raised on the OTP step, so the customer was left looking at a
   * verification form seconds after their verification had succeeded. Nothing on
   * that screen could take them anywhere.
   *
   * The framing is deliberate too. Verifying did not fail and neither did
   * anything else - they came here to get a member's discount and they already
   * have one, so this is confirmation rather than an error, and the first thing
   * offered is the thing the discount is for.
   */
  if (step === 'already-member' && existingMembership) {
    const daysLeft = Math.max(
      0,
      daysBetweenDates(arenaToday(), existingMembership.end_date) ?? 0
    )
    const remaining = daysLeft === 0 ? 'Last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
    const isSamePlan = existingMembership.plan_id === String(plan.id)

    return (
      <div className="min-h-screen bg-[#0d0a14] text-white py-12 px-4">
        <div className="max-w-xl mx-auto">
          <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                  <BadgeCheck className="h-8 w-8 text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-black uppercase text-white tracking-tight">
                You&apos;re already a member
              </h3>
              <p className="text-sm text-zinc-400">
                {isSamePlan
                  ? `${existingMembership.plan_name} is already on your account.`
                  : `You're on ${existingMembership.plan_name}, so ${plan.name} can't be added on top.`}
              </p>
            </div>

            {/* The same facts the plans page and the header show, in the same order. */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-2 glow-box-strong">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Plan:</span>
                <span className="text-white font-bold">{existingMembership.plan_name}</span>
              </div>
              {existingMembership.discount_percentage > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Benefit:</span>
                  <span className="text-primary font-bold">
                    {existingMembership.discount_percentage}% off bookings
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-zinc-800 pt-2">
                <span className="text-zinc-400">Valid until:</span>
                <span className="text-white font-black">
                  {formatDateForDisplay(existingMembership.end_date)} · {remaining}
                </span>
              </div>
            </div>

            {/* Why they cannot buy, said as what it would cost them rather than as
                a rule. A term starts the day it is bought, so a second membership
                replaces the first instead of extending it. */}
            <p className="text-xs text-zinc-500 leading-relaxed text-center">
              {daysLeft > 0
                ? `Buying another plan now would replace this one, and the ${remaining.toLowerCase()} on it would be lost. You can buy again once it ends.`
                : 'This plan is on its last day. You can buy your next one from tomorrow.'}
            </p>

            <div className="space-y-2">
              {/* The discount is already live, so using it comes first. */}
              <Button
                variant="gradient"
                onClick={() => router.push('/booking')}
                className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-1.5"
              >
                BOOK A SLOT <ChevronRight className="h-4 w-4 stroke-[3]" />
              </Button>
              <p className="text-[11px] text-zinc-600 text-center">
                Your {existingMembership.discount_percentage > 0
                  ? `${existingMembership.discount_percentage}% discount`
                  : 'member price'} is applied automatically at checkout.
              </p>

              <Button
                type="button"
                onClick={() => router.push('/my-subscription')}
                variant="ghost"
                className="w-full border border-primary/40 text-primary hover:bg-primary/10 font-black uppercase text-sm h-11 rounded-xl"
              >
                VIEW MY PLAN
              </Button>
              <Button
                type="button"
                onClick={() => router.push('/subscription')}
                variant="ghost"
                className="w-full border border-zinc-900 text-zinc-400 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl"
              >
                ← BACK TO PLANS
              </Button>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  // OTP Step - proves the number before any profile is fetched or plan activated
  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-[#0d0a14] text-white py-12 px-4">
        <div className="max-w-xl mx-auto">
          <OTPVerification
            phone={mobileNumber}
            onVerified={handleOTPVerified}
            onBack={() => setStep('phone')}
            onSendOTP={sendOTPAction}
            onVerifyOTP={verifyOTPAction}
            onResendOTP={resendOTPAction}
          />
        </div>
      </div>
    )
  }

  // Phone Step
  if (step === 'phone') {
    return (
      <div className="min-h-screen bg-[#0d0a14] text-white py-12 px-4">
        <div className="max-w-xl mx-auto">
          <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
            <div className="border-b border-zinc-900 pb-4">
              <h3 className="text-lg font-black uppercase text-white tracking-tight">Purchase {plan.name}</h3>
              <p className="text-xs text-zinc-400 font-medium mt-1">Enter your mobile number to continue</p>
            </div>

            {/* Plan Summary */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-2 glow-box-strong">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Plan:</span>
                <span className="text-white font-bold">{plan.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Duration:</span>
                <span className="text-white font-bold">{plan.duration_months} {plan.duration_months === 1 ? 'Month' : 'Months'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Discount:</span>
                <span className="text-primary font-bold">{plan.discount_percentage}% off bookings</span>
              </div>
              <div className="flex justify-between text-base border-t border-zinc-800 pt-2 font-black">
                <span className="text-white">Amount:</span>
                <span className="text-primary text-lg">₹{plan.price}</span>
              </div>
            </div>

            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="h-3 w-3 text-zinc-600" /> MOBILE NUMBER <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-400 border-r border-zinc-900 pr-2">+91</span>
                  <Input
                    id="phone"
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="Enter 10-digit phone number"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                    className="bg-zinc-950 border-zinc-900 h-12 pl-12 text-sm text-white focus-visible:ring-primary font-mono tracking-wide"
                  />
                </div>
              </div>

              <div className="pt-4 space-y-2">
                <Button variant="gradient" type="submit" disabled={isSubmitting || mobileNumber.length < 10} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-1.5">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'CONTINUE'} <ChevronRight className="h-4 w-4 stroke-[3]" />
                </Button>
                <Button type="button" onClick={() => router.back()} variant="ghost" className="w-full border border-zinc-900 text-zinc-400 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl">
                  ← BACK TO PLANS
                </Button>
              </div>
            </form>

            <div className="pt-2 flex gap-2 items-center text-xs text-zinc-400 justify-center border-t border-zinc-950">
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-700" />
              <span>Your data is stored securely</span>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  // Details Step (for new customers)
  if (step === 'details') {
    return (
      <div className="min-h-screen bg-[#0d0a14] text-white py-12 px-4">
        <div className="max-w-xl mx-auto">
          <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
            <div className="border-b border-zinc-900 pb-4">
              <h3 className="text-lg font-black uppercase text-white tracking-tight">Customer Details</h3>
              <p className="text-xs text-zinc-400 font-medium mt-1">Please provide your information</p>
            </div>

            <form onSubmit={handleDetailsSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3 w-3 text-zinc-600" /> FULL NAME <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  required
                  placeholder="Enter your full name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-zinc-950 border-zinc-900 h-12 text-sm text-white focus-visible:ring-primary"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="h-3 w-3 text-zinc-600" /> EMAIL ADDRESS <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="bg-zinc-950 border-zinc-900 h-12 text-sm text-white focus-visible:ring-primary"
                />
              </div>

              {/* DOB */}
              <div className="space-y-2">
                <Label htmlFor="dob" className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Cake className="h-3 w-3 text-zinc-600" /> DATE OF BIRTH <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="dob"
                  type="text"
                  required
                  placeholder="DD-MM-YYYY"
                  value={customerDob}
                  onChange={handleDobChange}
                  maxLength={10}
                  className="bg-zinc-950 border-zinc-900 h-12 text-sm text-white focus-visible:ring-primary font-mono tracking-wide"
                />
              </div>

              <div className="pt-4 space-y-2">
                <Button variant="gradient" type="submit" disabled={!detailsComplete} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl disabled:opacity-50 disabled:pointer-events-none">
                  CONTINUE <ChevronRight className="h-4 w-4 ml-1 stroke-[3]" />
                </Button>
                <Button type="button" onClick={() => setStep('phone')} variant="ghost" className="w-full border border-zinc-900 text-zinc-400 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl">
                  ← BACK
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    )
  }

  // Summary Step
  if (step === 'summary') {
    return (
      <>
      {/* Only this step takes money, so this is the only step that can be
          caught between Razorpay returning and the membership being written. */}
      <ConfirmingPaymentOverlay show={isConfirming} />
      <div className="min-h-screen bg-[#0d0a14] text-white py-12 px-4">
        <div className="max-w-xl mx-auto">
          <Card className="bg-[#111] border border-zinc-900 p-6 shadow-2xl rounded-2xl space-y-6 glow-box-hover">
            <div className="border-b border-zinc-900 pb-4">
              <h3 className="text-lg font-black uppercase text-white tracking-tight">Purchase Summary</h3>
              <p className="text-xs text-zinc-400 font-medium mt-1">Review your subscription details</p>
            </div>

            {/* Customer Info */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 glow-box-hover">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Customer Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Name:</span>
                  <span className="text-white font-bold">{customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Phone:</span>
                  <span className="text-primary font-bold">+91 {mobileNumber}</span>
                </div>
                {customerEmail && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Email:</span>
                    <span className="text-white font-bold text-right truncate ml-4">{customerEmail}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Plan Details */}
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-3 glow-box-strong">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">Subscription Plan</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Plan:</span>
                  <span className="text-white font-bold">{plan.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Duration:</span>
                  <span className="text-white font-bold">{plan.duration_months} {plan.duration_months === 1 ? 'Month' : 'Months'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Booking Discount:</span>
                  <span className="text-primary font-bold">{plan.discount_percentage}% off</span>
                </div>
                <div className="flex justify-between border-t border-zinc-800 pt-2 font-black text-base">
                  <span className="text-white">Amount:</span>
                  <span className="text-primary text-lg">₹{plan.price}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Button variant="gradient" onClick={handleActivatePlan} disabled={isActivating} className="w-full text-black font-black uppercase text-sm h-12 rounded-xl flex items-center justify-center gap-1.5">
                {isActivating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ACTIVATE PLAN'} <CheckCircle2 className="h-4 w-4" />
              </Button>
              <Button type="button" onClick={() => customerExists ? setStep('phone') : setStep('details')} variant="ghost" className="w-full border border-zinc-900 text-zinc-400 hover:text-zinc-300 font-bold uppercase text-sm h-11 rounded-xl">
                ← BACK
              </Button>
            </div>
          </Card>
        </div>
      </div>
      </>
    )
  }

  return null
}
