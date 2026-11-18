'use client'

import { useState, type ReactNode } from 'react'
import { Crown, Wallet } from 'lucide-react'

export function BrowsePlanTabs({ wallet, subscription }: { wallet: ReactNode; subscription: ReactNode }) {
  const [activeTab, setActiveTab] = useState<'wallet' | 'subscription'>('wallet')

  return (
    <section className="relative z-10 mx-auto max-w-7xl px-3 sm:px-0">
      <div role="tablist" aria-label="Plans and wallet credits" className="mx-auto mb-6 grid max-w-2xl grid-cols-2 rounded-2xl border border-zinc-800 bg-zinc-950/90 p-1.5 shadow-xl">
        <button
          id="wallet-plans-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'wallet'}
          aria-controls="wallet-plans-panel"
          onClick={() => setActiveTab('wallet')}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-wider transition sm:text-sm ${activeTab === 'wallet' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}
        >
          <Wallet className="h-4 w-4" /> Wallet Credits
        </button>
        <button
          id="subscription-plans-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'subscription'}
          aria-controls="subscription-plans-panel"
          onClick={() => setActiveTab('subscription')}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-wider transition sm:text-sm ${activeTab === 'subscription' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}
        >
          <Crown className="h-4 w-4" /> Memberships
        </button>
      </div>

      {activeTab === 'wallet' ? (
        <div id="wallet-plans-panel" role="tabpanel" aria-labelledby="wallet-plans-tab">{wallet}</div>
      ) : (
        <div id="subscription-plans-panel" role="tabpanel" aria-labelledby="subscription-plans-tab">{subscription}</div>
      )}
    </section>
  )
}
