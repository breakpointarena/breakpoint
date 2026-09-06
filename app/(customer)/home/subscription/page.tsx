'use client'

import PlatformCard from '@/components/customer/home/subscription/SubscriptionCard'
import { motion, Variants } from 'framer-motion'
import { useEffect} from 'react'

const platforms = [
  {
    brand: 'SONY PLATFORM',
    name: 'PlayStation 5',
    price: 300,
    icon: (
      <svg viewBox="0 0 48 48" fill="currentColor" className="w-full h-full">
        <path d="M18.4 37.2V11.5l5.8 1.8v20.5l5.5 1.7V11.1c5.5 1 9.8 3.4 9.8 9.6 0 6.4-4.3 9.9-10.7 7.9l-.1 4.6c9.1 2.5 16.3-.5 16.3-12.3C45 9.6 38.3 6 26.5 4L8 8.8v32l10.4-3.6z" />
        <path d="M8 41l10.5-3.7-10.5-3V41z" />
      </svg>
    ),
    features: ['4K HDR Gaming', 'DualSense Controllers', 'Access to PS+ Deluxe'],
    accent: '#A855F7',
    accentDark: '#9333EA',
  },
  {
    brand: 'MICROSOFT PLATFORM',
    name: 'Xbox Series X',
    price: 250,
    icon: (
      <svg viewBox="0 0 48 48" fill="currentColor" className="w-full h-full">
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M10 14c2.5-3 9 4 14 10C29 18 35.5 11 38 14c2 3-4.5 14-14 20C14.5 28 8 17 10 14z" />
      </svg>
    ),
    features: ['120 FPS Gaming', 'Xbox Game Pass Ultimate', 'Ray Tracing Support'],
    accent: '#107C10',
    accentDark: '#0A5208',
  },
  {
    brand: 'NINTENDO PLATFORM',
    name: 'Switch OLED',
    price: 150,
    icon: (
      <svg viewBox="0 0 48 48" fill="currentColor" className="w-full h-full">
        <rect
          x="6"
          y="8"
          width="36"
          height="32"
          rx="6"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        <rect x="6" y="8" width="14" height="32" rx="6" fill="currentColor" opacity="0.3" />
        <circle cx="13" cy="20" r="3" fill="currentColor" />
        <rect x="26" y="22" width="12" height="2" rx="1" fill="currentColor" />
        <rect x="31" y="17" width="2" height="12" rx="1" fill="currentColor" />
      </svg>
    ),
    features: ['Handheld & TV Mode', 'Nintendo Switch Online', 'OLED Vivid Display'],
    accent: '#E60012',
    accentDark: '#B5000E',
  },
  {
    brand: 'PC PLATFORM',
    name: 'Gaming PC Pro',
    price: 400,
    icon: (
      <svg viewBox="0 0 48 48" fill="currentColor" className="w-full h-full">
        <rect
          x="8"
          y="8"
          width="32"
          height="24"
          rx="3"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        <path d="M16 36h16M24 32v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <rect x="14" y="14" width="8" height="6" rx="1" fill="currentColor" opacity="0.5" />
        <circle cx="30" cy="17" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    ),
    features: ['RTX 4080 Graphics', '240Hz Monitor', 'Unlimited Game Library'],
    accent: '#A855F7',
    accentDark: '#9333EA',
  },
]

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

export default function SubscriptionsCards() {
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen relative bg-[#0d0a14] flex items-center justify-center px-4 py-16 overflow-hidden">
      {/* Base gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/5 via-[#0d0a14] to-[#0d0a14] pointer-events-none" />

      {/* Animated golden blobs */}
      <div
        className="absolute top-20 left-1/4 w-[600px] h-[600px] bg-gradient-to-r from-amber-500/10 to-yellow-500/10 rounded-full blur-[100px] animate-pulse pointer-events-none"
        style={{ willChange: 'opacity' }}
      />
      <div
        className="absolute bottom-20 right-1/4 w-[500px] h-[500px] bg-gradient-to-l from-orange-600/10 to-amber-500/10 rounded-full blur-[100px] animate-pulse pointer-events-none"
        style={{ animationDelay: '1.5s', willChange: 'opacity' }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-amber-500/5 via-transparent to-yellow-500/5 rounded-full blur-[120px] animate-pulse pointer-events-none"
        style={{ animationDelay: '3s', willChange: 'opacity' }}
      />

      <div className="w-full max-w-6xl relative z-10">
        {/* Left Aligned Staggered Heading */}
        <div className="text-left mb-16 flex flex-col items-start">
          {/* Main Title  */}
          <motion.div
            initial={{ opacity: 0, y: 30, skewY: 4 }}
            whileInView={{ opacity: 1, y: 0, skewY: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative inline-block"
          >
            <div className="absolute -top-6 left-0 w-32 h-32 bg-[#A855F7]/10 blur-3xl rounded-full pointer-events-none" />
            <h1
              className="relative text-4xl md:text-5xl font-black text-white"
             
            >
              Today's Elite Pricing
            </h1>
          </motion.div>

          {/* Subtitle*/}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <p className="text-xs tracking-[0.3em] uppercase font-bold text-orange-600 mt-3">
              Premium performance for every platform. No hidden charges.
            </p>
          </motion.div>
        </div>

        {/* Cards Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {platforms.map((p, i) => (
            <PlatformCard key={p.name} platform={p} index={i} />
          ))}
        </motion.div>
      </div>
    </div>
  )
}
