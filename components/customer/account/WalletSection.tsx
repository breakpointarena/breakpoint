'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { CustomerAuthGate } from '@/components/auth/CustomerAuthGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { openRazorpayCheckout, RazorpayDismissedError, RazorpayFailedError } from '@/lib/razorpay/checkout'
import { toast } from 'sonner'
import {
  confirmWalletTopUpPayment,
  createWalletTopUpPaymentOrder,
  getMyWalletOverview,
} from '@/app/(customer)/wallet/actions'

interface WalletOffer {
  id: string
  name: string
  price: number
  paid_credits: number
  bonus_credits: number
  bonus_validity_days: number | null
}

interface WalletOverview {
  verified: boolean
  customerId: string | null
  customerName: string
  balance: { balance: number; paidBalance: number; bonusBalance: number; reservedBalance: number }
  offers: WalletOffer[]
  transactions: Array<{
    id: string
    kind: string
    direction: 'credit' | 'debit'
    amount: number
    paid_amount: number
    bonus_amount: number
    description: string
    created_at: string
  }>
  bonusExpiries: Array<{ amount: number; expiresAt: string }>
}

function WalletPurchaseVerification({ onVerified }: { onVerified: () => void }) {
  const [complete, setComplete] = useState(false)
  useEffect(() => {
    if (complete) return
    setComplete(true)
    onVerified()
  }, [complete, onVerified])
  return <p className="p-4 text-center text-sm text-zinc-300">Number verified. Loading your wallet…</p>
}

function formatRupees(amount: number) {
  return `\u20B9${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export function WalletSection({
  showBreadcrumb = true,
  showHeader = true,
  showBalance = true,
  showHistory = true,
}: { showBreadcrumb?: boolean; showHeader?: boolean; showBalance?: boolean; showHistory?: boolean } = {}) {
  const [overview, setOverview] = useState<WalletOverview | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [loading, setLoading] = useState(true)
  const [purchasingOffer, setPurchasingOffer] = useState<string | null>(null)
  const [showPurchaseVerification, setShowPurchaseVerification] = useState(false)
  const [showPurchaseReview, setShowPurchaseReview] = useState(false)
  const [pendingOffer, setPendingOffer] = useState<WalletOffer | null>(null)

  const loadWallet = useCallback(async () => {
    setLoading(true)
    const result = await getMyWalletOverview()
    if (!result.success) {
      toast.error('Could not load wallet', { description: result.error })
      setOverview(null)
      setLoading(false)
      return null
    } else {
      setOverview(result as WalletOverview)
      if (result.customerName) setCustomerName(result.customerName)
      setLoading(false)
      return result as WalletOverview
    }
  }, [])

  useEffect(() => {
    void loadWallet()
  }, [loadWallet])

  const purchase = async (offer: WalletOffer, name = customerName) => {
    if (purchasingOffer) return
    setPurchasingOffer(offer.id)

    try {
      const order = await createWalletTopUpPaymentOrder({
        offerId: offer.id,
        customerName: name,
      })
      if (!order.success) {
        toast.error('Wallet purchase failed', { description: order.error })
        return
      }

      const payment = await openRazorpayCheckout({
        keyId: order.keyId!,
        orderId: order.orderId!,
        amount: order.amount!,
        name: 'Break Point Arena',
        description: `Wallet top-up: ${order.offerName}`,
        prefill: { name },
      })
      const confirmation = await confirmWalletTopUpPayment(payment)
      if (!confirmation.success) {
        toast.error('Payment confirmation pending', {
          description: confirmation.error || 'Check your wallet shortly or contact the arena.',
        })
        return
      }

      toast.success('Wallet topped up', {
        description: `${formatRupees(order.paidCredits + order.bonusCredits)} credit added.`,
      })
      setShowPurchaseReview(false)
      setPendingOffer(null)
      await loadWallet()
    } catch (error) {
      if (error instanceof RazorpayDismissedError) {
        toast.info('Payment cancelled', { description: 'No wallet credit was added.' })
      } else if (error instanceof RazorpayFailedError) {
        toast.error('Payment failed', { description: error.message })
      } else {
        console.error('Wallet top-up checkout error:', error)
        toast.error('Wallet purchase failed', { description: 'Please try again.' })
      }
    } finally {
      setPurchasingOffer(null)
    }
  }

  const continueAfterVerification = async () => {
    setShowPurchaseVerification(false)
    const refreshed = await loadWallet()
    if (refreshed && pendingOffer) setShowPurchaseReview(true)
  }

  return (
    <>
    <div className="mx-auto max-w-5xl space-y-8">
        {showBreadcrumb && <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Wallet' }]} />}
        {showHeader && <header>
          <h1 className="text-3xl font-black tracking-tight">Your Wallet</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Use wallet credit for gaming and food. Choose how much to apply at checkout.
          </p>
        </header>}

        {loading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-400">
            Loading walletâ€¦
          </div>
        ) : overview ? (
          <>
            {showBalance && <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Available balance</p>
              <p className="mt-2 text-4xl font-black text-primary">{formatRupees(overview.balance.balance)}</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-300">
                <span>Paid credit: {formatRupees(overview.balance.paidBalance)}</span>
                <span>Bonus credit: {formatRupees(overview.balance.bonusBalance)}</span>
                {overview.balance.reservedBalance > 0 && (
                  <span>Reserved for pending payment: {formatRupees(overview.balance.reservedBalance)}</span>
                )}
              </div>
              {overview.bonusExpiries.length > 0 && (
                <ul className="mt-4 space-y-1 text-xs text-amber-300">
                  {overview.bonusExpiries.map((item, index) => (
                    <li key={`${item.expiresAt}-${index}`}>
                      {formatRupees(item.amount)} bonus expires {new Date(item.expiresAt).toLocaleDateString('en-IN')}
                    </li>
                  ))}
                </ul>
              )}
            </section>}

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-black">Add wallet credit</h2>
                <p className="mt-1 text-sm text-zinc-400">Paid credit does not expire. Offer bonus expiry is shown before purchase.</p>
              </div>
              {overview.offers.length === 0 ? (
                <p className="rounded-xl border border-zinc-800 p-5 text-sm text-zinc-400">
                  Wallet offers are temporarily unavailable.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {overview.offers.map(offer => (
                    <article key={offer.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 font-sans">
                      <h3 className="text-lg font-bold leading-tight text-white">{offer.name}</h3>
                      <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                        Pay {formatRupees(offer.price)} {'\u00B7'} receive {formatRupees(offer.paid_credits)}
                      </p>
                      {offer.bonus_credits > 0 && (
                        <p className="mt-1 text-xs text-amber-300">
                          Includes {formatRupees(offer.bonus_credits)} bonus
                          {offer.bonus_validity_days ? ` · expires in ${offer.bonus_validity_days} days` : ' · never expires'}
                        </p>
                      )}
                      <Button
                        className="mt-4 w-full"
                        disabled={purchasingOffer !== null}
                        onClick={() => {
                          setPendingOffer(offer)
                          if (!overview.verified) setShowPurchaseVerification(true)
                          else if (!overview.customerId) setShowPurchaseReview(true)
                          else void purchase(offer, overview.customerName || customerName)
                        }}
                      >
                        {purchasingOffer === offer.id ? 'Processing…' : overview.verified ? `Buy for ${formatRupees(offer.price)}` : 'Verify to buy'}
                      </Button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {showHistory && <section className="space-y-3">
              <h2 className="text-xl font-black">Wallet history</h2>
              {overview.transactions.length === 0 ? (
                <p className="rounded-xl border border-zinc-800 p-5 text-sm text-zinc-400">No wallet transactions yet.</p>
              ) : (
                <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-950">
                  {overview.transactions.map(transaction => (
                    <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-semibold">{transaction.description}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {new Date(transaction.created_at).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <p className={`font-black ${transaction.direction === 'credit' ? 'text-emerald-400' : 'text-zinc-200'}`}>
                        {transaction.direction === 'credit' ? '+' : '−'}{formatRupees(transaction.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>}
          </>
        ) : (
          <p className="rounded-xl border border-red-900 bg-red-950/30 p-5 text-sm text-red-300">
            Wallet information is temporarily unavailable. Please try again later.
          </p>
        )}
    </div>
      {showPurchaseVerification && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4" onMouseDown={event => { if (event.target === event.currentTarget) { setShowPurchaseVerification(false); setPendingOffer(null) } }}><div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#111018] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-white">Verify to purchase</h2><button type="button" onClick={() => { setShowPurchaseVerification(false); setPendingOffer(null) }} aria-label="Close verification" className="text-zinc-400 hover:text-white">×</button></div><CustomerAuthGate title="Verify your mobile number" description="Your number is needed to add wallet credit securely.">{() => <WalletPurchaseVerification onVerified={() => void continueAfterVerification()} />}</CustomerAuthGate></div></div>}
      {showPurchaseReview && pendingOffer && overview?.verified && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4" onMouseDown={event => { if (event.target === event.currentTarget) { setShowPurchaseReview(false); setPendingOffer(null) } }}><section role="dialog" aria-modal="true" aria-labelledby="wallet-review-title" className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#111018] p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Phone verified</p><h2 id="wallet-review-title" className="mt-1 text-xl font-black text-white">Review your wallet top-up</h2></div><button type="button" onClick={() => { setShowPurchaseReview(false); setPendingOffer(null) }} aria-label="Close purchase review" className="text-zinc-400 hover:text-white">×</button></div><div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><h3 className="font-bold text-white">{pendingOffer.name}</h3><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-4 text-zinc-300"><span>You pay</span><strong className="text-white">{formatRupees(pendingOffer.price)}</strong></div><div className="flex justify-between gap-4 text-zinc-300"><span>Wallet credit</span><strong className="text-emerald-300">{formatRupees(pendingOffer.paid_credits)}</strong></div>{pendingOffer.bonus_credits > 0 && <div className="flex justify-between gap-4 text-zinc-300"><span>Bonus credit</span><strong className="text-amber-300">{formatRupees(pendingOffer.bonus_credits)}</strong></div>}</div>{pendingOffer.bonus_credits > 0 && pendingOffer.bonus_validity_days && <p className="mt-3 text-xs text-zinc-500">Bonus expires in {pendingOffer.bonus_validity_days} days.</p>}</div>{!overview.customerId && <div className="mt-4 space-y-2"><Label htmlFor="wallet-review-name">Name for your wallet</Label><Input id="wallet-review-name" value={customerName} onChange={event => setCustomerName(event.target.value)} maxLength={100} placeholder="Your name" autoComplete="name"/></div>}<div className="mt-5 flex gap-3"><Button variant="outline" className="flex-1" onClick={() => { setShowPurchaseReview(false); setPendingOffer(null) }}>Cancel</Button><Button className="flex-1" disabled={!overview.customerId && !customerName.trim()} onClick={() => void purchase(pendingOffer, overview.customerName || customerName)}>Continue to payment</Button></div></section></div>}
    </>
  )
}


