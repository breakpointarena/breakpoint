'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

const CTASection: React.FC = () => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleJoinElite = () => {
    setIsLoading(true)
    router.push('/subscription')
  }

  return (
    <section className="relative w-full max-w-300 mx-auto my-6 md:my-10 overflow-hidden rounded-3xl border border-white/10 bg-black px-4 sm:px-6 py-10 md:py-16 text-center flex flex-col items-center justify-center shadow-2xl">
      <div className="absolute inset-0 z-0">
        <img
          className="w-full h-full object-cover opacity-40 md:opacity-50"
          alt="Futuristic geometric background"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCFIKGeG2W9raLeDyuxdA9-PVKMcg3gGd30OuafHGO6cRvygZE1X1yb2QDWNvJMYIeuonRyPfymKfC69DyUaTfstYmffrR5GZR6zomB8a7o2dZn6pn_k-FJBA7lOD6wHKbh3uBhRSfZngbB2fq5-_XbFctoGCCoZdgmL9iQyXQ6cQEDm-tCNQSdiIlbRL4I6Z7lG8uvNQ4tnR_yDSF4sCCLZxiUR4GK80YjNc1I6hHuLGSx_TKeSVfzi1pZ23Q4htMWY6yGxtUHpQ"
        />
        {/* Radial/Linear gradients to seamlessly blend the image into the black background */}
        <div className="absolute inset-0 bg-linear-to-t from-black via-black/60 md:via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-b from-black via-transparent to-black" />
        <div className="absolute inset-0 hidden sm:block bg-linear-to-r from-black via-transparent to-black" />
      </div>

      {/* Foreground Content */}
      <div className="relative z-10 flex flex-col items-center max-w-3xl mx-auto w-full">
        <h2 className="text-4xl sm:text-5xl md:text-[64px] font-extrabold text-white mb-4 md:mb-6 tracking-tight leading-[1.1]">
          Ready to Start Saving?
        </h2>

        <p className="text-[#E2C48E] text-base sm:text-[17px] md:text-[19px] mb-8 md:mb-10 leading-relaxed font-medium px-2 max-w-[95%]">
          Choose a plan and unlock premium discounts on gaming, food, and add-ons.
          <br className="hidden sm:block" /> Join the elite rank today.
        </p>

        {/* Button with updated responsive padding and enhanced glowing shadow */}
        <button
          onClick={handleJoinElite}
          disabled={isLoading}
          className="bg-gradient-primary hover:bg-gradient-primary-hover text-[var(--button-text)] font-bold text-base md:text-[17px] py-3.5 md:py-4 px-8 md:px-12 rounded-full transition-all duration-300 hover:scale-105 shadow-[0_0_20px_rgba(184,134,11,0.25)] hover:shadow-[0_0_40px_rgba(184,134,11,0.45)] flex items-center justify-center gap-2"
        >
          {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
          Join Elite Now
        </button>
      </div>
    </section>
  )
}

export default CTASection
