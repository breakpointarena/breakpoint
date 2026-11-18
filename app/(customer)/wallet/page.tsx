'use client'

import { CustomerAuthGate } from '@/components/auth/CustomerAuthGate'
import { WalletSection } from '@/components/customer/account/WalletSection'

export default function WalletPage() {
  return (
    <main className="min-h-screen bg-[#0d0a14] px-4 py-12 text-white">
      <CustomerAuthGate
        title="View Your Wallet"
        description="Verify your number to view your balance and wallet offers."
      >
        {() => <WalletSection />}
      </CustomerAuthGate>
    </main>
  )
}
