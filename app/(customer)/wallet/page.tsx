'use client'

import { useCallback, useEffect, useState } from 'react'
import { CustomerAuthGate } from '@/components/auth/CustomerAuthGate'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { openRazorpayCheckout, RazorpayDismissedError, RazorpayFailedError } from '@/lib/razorpay/checkout'
import { toast } from 'sonner'
import {
  confirmWalletTopUpPayment,
  createWalletTopUpPaymentOrder,
  getMyWalletOverview,
} from './actions'

interface WalletOffer {
  id: string
  name: string
  price: number
  paid_credits: number
  bonus_credits: number
  bonus_validity_days: number | null
}

interface WalletOverview {
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

function formatRupees(amount: number) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function WalletContent() {
  const [overview, setOverview] = useState<WalletOverview | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [loading, setLoading] = useState(true)
  const [purchasingOffer, setPurchasingOffer] = useState<string | null>(null)

  const loadWallet = useCallback(async () => {
    setLoading(true)
    const result = await getMyWalletOverview()
    if (!result.success) {
      toast.error('Could not load wallet', { description: result.error })
      setOverview(null)
    } else {
      setOverview(result as WalletOverview)
      if (result.customerName) setCustomerName(result.customerName)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadWallet()
  }, [loadWallet])

  const purchase = async (offer: WalletOffer) => {
    if (purchasingOffer) return
    setPurchasingOffer(offer.id)

    try {
      const order = await createWalletTopUpPaymentOrder({
        offerId: offer.id,
        customerName,
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
        prefill: { name: customerName },
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

  return (
    <main className="min-h-screen bg-[#0d0a14] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Wallet' }]} />
        <header>
          <h1 className="text-3xl font-black tracking-tight">Your Wallet</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Use wallet credit for gaming and food. Choose how much to apply at checkout.
          </p>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-400">
            Loading wallet…
          </div>
        ) : overview ? (
          <>
            <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6">
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
            </section>

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-black">Add wallet credit</h2>
                <p className="mt-1 text-sm text-zinc-400">Paid credit does not expire. Offer bonus expiry is shown before purchase.</p>
              </div>
              {!overview.customerId && (
                <div className="max-w-md space-y-2">
                  <Label htmlFor="wallet-customer-name">Name for your wallet</Label>
                  <Input
                    id="wallet-customer-name"
                    value={customerName}
                    onChange={event => setCustomerName(event.target.value)}
                    maxLength={100}
                    placeholder="Your name"
                  />
                </div>
              )}
              {overview.offers.length === 0 ? (
                <p className="rounded-xl border border-zinc-800 p-5 text-sm text-zinc-400">
                  Wallet offers are temporarily unavailable.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {overview.offers.map(offer => (
                    <article key={offer.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                      <h3 className="font-black">{offer.name}</h3>
                      <p className="mt-2 text-sm text-zinc-300">
                        Pay {formatRupees(offer.price)} · receive {formatRupees(offer.paid_credits)}
                      </p>
                      {offer.bonus_credits > 0 && (
                        <p className="mt-1 text-xs text-amber-300">
                          Includes {formatRupees(offer.bonus_credits)} bonus
                          {offer.bonus_validity_days ? ` · expires in ${offer.bonus_validity_days} days` : ' · never expires'}
                        </p>
                      )}
                      <Button
                        className="mt-4 w-full"
                        disabled={purchasingOffer !== null || (!overview.customerId && !customerName.trim())}
                        onClick={() => void purchase(offer)}
                      >
                        {purchasingOffer === offer.id ? 'Processing…' : `Buy for ${formatRupees(offer.price)}`}
                      </Button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
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
            </section>
          </>
        ) : (
          <p className="rounded-xl border border-red-900 bg-red-950/30 p-5 text-sm text-red-300">
            Wallet information is temporarily unavailable. Please try again later.
          </p>
        )}
      </div>
    </main>
  )
}

export default function WalletPage() {
  return (
    <CustomerAuthGate
      title="View Your Wallet"
      description="Verify your number to view your balance and wallet offers."
    >
      {() => <WalletContent />}
    </CustomerAuthGate>
  )
}
