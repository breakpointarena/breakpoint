'use client'

import { WalletSection } from '@/components/customer/account/WalletSection'

export function WalletCreditPlans() {
  return (
    <section className="px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="mb-7 text-center">
        <h2 className="text-2xl font-black text-white md:text-3xl">Choose a wallet pack</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">
          Add credit for bookings and food. Available packs and bonus details are shown below.
        </p>
      </div>
      <WalletSection showBreadcrumb={false} showHeader={false} showBalance={false} showHistory={false} />
    </section>
  )
}
