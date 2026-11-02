'use client'

import { useCallback, useEffect, useState, useTransition, type FormEvent } from 'react'
import { Gift, Pencil, PlusCircle, Trash2, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BreakpointLoader } from '@/components/shared/BreakpointLoader'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  getWalletOffersAction,
  deleteWalletOfferAction,
  saveWalletOfferAction,
  setWalletOfferActiveAction,
  type WalletOfferInput,
} from './actions'

type WalletOffer = WalletOfferInput & {
  id: string
  bonusCredits: number
  created_at: string
}

const currency = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function WalletCreditsPage() {
  const [offers, setOffers] = useState<WalletOffer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingOffer, setEditingOffer] = useState<WalletOffer | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deletingOffer, setDeletingOffer] = useState<WalletOffer | null>(null)
  const [pricePreview, setPricePreview] = useState(0)
  const [walletCreditsPreview, setWalletCreditsPreview] = useState(0)
  const [isPending, startTransition] = useTransition()

  const loadOffers = useCallback(async () => {
    setIsLoading(true)
    const result = await getWalletOffersAction()
    if (!result.success) {
      toast.error('Could not load wallet offers', { description: result.error })
    } else {
      setOffers(result.data.map((row: any) => ({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        paidCredits: Number(row.paid_credits),
        bonusCredits: Number(row.bonus_credits),
        bonusValidityDays: row.bonus_validity_days == null ? null : Number(row.bonus_validity_days),
        displayOrder: Number(row.display_order),
        isActive: row.is_active === true,
        created_at: row.created_at,
      })))
    }
    setIsLoading(false)
  }, [])

  useEffect(() => { void loadOffers() }, [loadOffers])

  const openNewOffer = () => {
    setEditingOffer(null)
    setPricePreview(0)
    setWalletCreditsPreview(0)
    setIsFormOpen(true)
  }

  const openEditOffer = (offer: WalletOffer) => {
    setEditingOffer(offer)
    setPricePreview(offer.price)
    setWalletCreditsPreview(offer.paidCredits)
    setIsFormOpen(true)
  }

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const input: WalletOfferInput = {
      id: editingOffer?.id,
      name: String(form.get('name') || ''),
      price: Number(form.get('price')),
      paidCredits: Number(form.get('paid_credits')),
      bonusValidityDays: form.get('bonus_never_expires') === 'on' ? null : Number(form.get('bonus_validity_days')),
      displayOrder: Number(form.get('display_order') || 0),
      isActive: form.get('is_active') === 'on',
    }

    startTransition(async () => {
      const result = await saveWalletOfferAction(input)
      if (!result.success) {
        toast.error('Could not save wallet offer', { description: result.error })
        return
      }
      toast.success(editingOffer ? 'Wallet offer updated' : 'Wallet offer created')
      setIsFormOpen(false)
      await loadOffers()
    })
  }

  const toggleOffer = (offer: WalletOffer) => {
    startTransition(async () => {
      const result = await setWalletOfferActiveAction(offer.id, !offer.isActive)
      if (!result.success) {
        toast.error('Could not update wallet offer', { description: result.error })
        return
      }
      toast.success(offer.isActive ? 'Offer removed from the customer page' : 'Offer is live on the customer page')
      await loadOffers()
    })
  }

  const deleteOffer = () => {
    if (!deletingOffer) return
    startTransition(async () => {
      const result = await deleteWalletOfferAction(deletingOffer.id)
      if (!result.success) {
        toast.error('Could not delete wallet offer', { description: result.error })
        return
      }
      toast.success('Wallet offer deleted')
      setDeletingOffer(null)
      await loadOffers()
    })
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-[var(--background)] p-4 text-white animate-in fade-in duration-500 sm:p-8">
      <header className="flex flex-col items-start justify-between gap-4 border-b border-zinc-900 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
            <WalletCards className="h-6 w-6 text-primary" /> Wallet Credits
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary-content">
            Configure the credit packs customers can buy from their wallet page.
          </p>
        </div>
        <Button onClick={openNewOffer} variant="gradient" className="h-11 gap-2 rounded-lg px-5 text-sm font-black uppercase tracking-wider">
          <PlusCircle className="h-4 w-4" /> Add Wallet Offer
        </Button>
      </header>

      <Card className="border-zinc-900 bg-[var(--surface)] p-4 text-sm text-zinc-400">
        <span className="font-bold text-white">Price</span> is what the customer pays.{' '}
        <span className="font-bold text-white">Wallet credits</span> are the total value customers receive. The amount above the price paid is shown as bonus and can expire.
        Paid wallet sales appear in Revenue. Free admin adjustments do not.
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-zinc-900 bg-[var(--surface)] py-12 text-xs font-black uppercase tracking-wider text-muted-content">
          <BreakpointLoader size="sm" /> Loading wallet offers
        </div>
      ) : offers.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-zinc-900 bg-[var(--surface)] px-6 py-14 text-center">
          <Gift className="h-8 w-8 text-primary" />
          <p className="font-bold text-white">No wallet offers yet</p>
          <p className="text-sm text-zinc-500">Add an offer to show a credit pack on the customer wallet page.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-xl border-zinc-900 bg-[var(--surface)] p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-zinc-900 bg-[var(--background)]/40 text-xs font-black uppercase tracking-wider text-muted-content">
                <tr>
                  <th className="px-5 py-4">Offer</th>
                  <th className="px-5 py-4">Price</th>
                  <th className="px-5 py-4">Wallet Credits</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/60">
                {offers.map(offer => (
                  <tr key={offer.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <p className="font-black text-white">{offer.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">Display order {offer.displayOrder}</p>
                    </td>
                    <td className="px-5 py-4 font-mono font-bold text-white">{currency(offer.price)}</td>
                    <td className="px-5 py-4">
                      <p className="font-mono font-bold text-white">{currency(offer.paidCredits)} total wallet value</p>
                      {offer.bonusCredits > 0 && (
                        <p className="mt-1 text-xs font-semibold text-emerald-400">
                          +{currency(offer.bonusCredits)} bonus · {offer.bonusValidityDays ? `expires in ${offer.bonusValidityDays} days` : 'never expires'}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${offer.isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
                        {offer.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" disabled={isPending} onClick={() => openEditOffer(offer)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" disabled={isPending} onClick={() => toggleOffer(offer)}>
                          {offer.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button variant="outline" size="sm" disabled={isPending} onClick={() => setDeletingOffer(offer)} aria-label={`Delete ${offer.name}`}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={isFormOpen} onOpenChange={open => !isPending && setIsFormOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
          <div className="space-y-2">
            <DialogTitle className="text-lg font-black">{editingOffer ? 'Edit wallet offer' : 'Add wallet offer'}</DialogTitle>
            <DialogDescription className="text-zinc-400">Set the amount paid and the wallet value customers receive.</DialogDescription>
          </div>
          <form key={editingOffer?.id || 'new'} onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-offer-name">Offer name</Label>
              <Input id="wallet-offer-name" name="name" required minLength={2} maxLength={80} defaultValue={editingOffer?.name || ''} placeholder="Weekend wallet pack" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wallet-offer-price">Price paid (₹)</Label>
                <Input id="wallet-offer-price" name="price" type="number" min="0.01" max="1000000" step="0.01" required defaultValue={editingOffer?.price ?? ''} onChange={event => setPricePreview(Number(event.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wallet-offer-paid">Paid wallet credits (₹)</Label>
                <Input id="wallet-offer-paid" name="paid_credits" type="number" min="0.01" max="1000000" step="0.01" required defaultValue={editingOffer?.paidCredits ?? ''} onChange={event => setWalletCreditsPreview(Number(event.target.value) || 0)} />
              </div>
            </div>
            <Card className="border-zinc-800 bg-zinc-900/60 p-3 text-sm">
              <p className="font-bold text-white">Bonus for the customer: {currency(Math.max(0, Math.round((walletCreditsPreview - pricePreview) * 100) / 100))}</p>
              <p className="mt-1 text-xs text-zinc-400">That is {walletCreditsPreview > 0 ? ((Math.max(0, walletCreditsPreview - pricePreview) / walletCreditsPreview) * 100).toFixed(1) : '0.0'}% off the total wallet value.</p>
            </Card>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wallet-offer-expiry">Bonus credit expiry</Label>
                <Input id="wallet-offer-expiry" name="bonus_validity_days" type="number" min="1" max="3650" step="1" defaultValue={editingOffer?.bonusValidityDays ?? 90} />
                <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" name="bonus_never_expires" defaultChecked={editingOffer?.bonusCredits ? editingOffer.bonusValidityDays === null : false} className="accent-primary" /> Bonus never expires</label>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wallet-offer-order">Display order</Label>
                <Input id="wallet-offer-order" name="display_order" type="number" min="0" max="1000" step="1" defaultValue={editingOffer?.displayOrder ?? offers.length + 1} />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-zinc-300">
                <input type="checkbox" name="is_active" defaultChecked={editingOffer?.isActive ?? true} className="h-4 w-4 accent-primary" />
                Show on customer wallet page
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" variant="gradient" disabled={isPending}>{isPending ? 'Saving…' : 'Save offer'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog isOpen={!!deletingOffer} onClose={() => !isPending && setDeletingOffer(null)} onConfirm={deleteOffer} title="Delete wallet offer?" description={`“${deletingOffer?.name || ''}” will be removed from the customer wallet page. Past wallet transactions remain in customer history.`} confirmText="Delete offer" />
    </div>
  )
}
