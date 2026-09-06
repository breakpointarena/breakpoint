import { useState } from "react";
import { motion, Variants } from 'framer-motion'
import { CheckIcon } from "lucide-react";

type Platform = {
  brand: string;
  name: string;
  price: number;
  icon: React.ReactNode;
  features: string[];
  accent: string;
  accentDark: string;
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.55,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
}

const featureVariants: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.08 + 0.3,
      duration: 0.35,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  }),
}

export default function PlatformCard({ platform, index }: { platform: Platform; index: number }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -8 }} // Smooth Lift Effect
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="relative flex flex-col rounded-2xl overflow-hidden cursor-pointer select-none h-full"
      style={{
        background: 'linear-gradient(160deg, #1c1c1c 0%, #111111 100%)',
        border: `1.5px solid ${hovered ? platform.accent : '#2a2a2a'}`,
        boxShadow: hovered
          ? `0 0 32px ${platform.accent}33, 0 8px 40px rgba(0,0,0,0.6)`
          : '0 4px 24px rgba(0,0,0,0.4)',
        transition: 'border-color 0.35s ease, box-shadow 0.35s ease',
      }}
    >
      {/* Top accent bar */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-[2px] z-20"
        style={{
          background: `linear-gradient(90deg, ${platform.accentDark}, ${platform.accent})`,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.35s ease',
        }}
      />

      {/* Glassy Light Sweep Effect */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-10"
        initial={{ x: '-100%', opacity: 0 }}
        animate={{
          x: hovered ? '200%' : '-100%',
          opacity: hovered ? 1 : 0,
        }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        style={{
          background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)`,
          width: '50%',
          transform: 'skewX(-20deg)',
        }}
      />

      {/* Expanding Glow blob */}
      <motion.div
        className="absolute -top-12 -right-12 w-36 h-36 rounded-full pointer-events-none z-0"
        animate={{ scale: hovered ? 1.6 : 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          background: platform.accent,
          filter: 'blur(60px)',
          opacity: hovered ? 0.15 : 0,
        }}
      />

      <div className="relative z-20 p-6 flex flex-col h-full gap-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p
              className="text-xs font-black tracking-[0.2em] uppercase mb-1"
              style={{ color: platform.accent }}
            >
              {platform.brand}
            </p>
            <h2
              className="text-white font-black text-xl leading-tight"
             
            >
              {platform.name}
            </h2>
          </div>

          {/* Icon */}
          <motion.div
            className="w-10 h-10 flex-shrink-0"
            style={{ color: hovered ? platform.accent : '#555' }}
            animate={{ rotate: hovered ? 8 : 0, scale: hovered ? 1.12 : 1 }}
            transition={{
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
            }}
          >
            {platform.icon}
          </motion.div>
        </div>

        {/* Price */}
        <div className="flex items-end gap-1">
          <span
            className="text-4xl font-black text-white leading-none"
           
          >
            <span className="text-2xl align-top leading-tight">₹</span>
            {platform.price}
          </span>
          <span className="text-zinc-400 text-sm mb-[3px]">/hr</span>
        </div>

        {/* Divider */}
        <div className="h-px w-full" style={{ background: '#2a2a2a' }} />

        {/* Features */}
        <ul className="flex flex-col gap-3 flex-1">
          {platform.features.map((f, i) => (
            <motion.li
              key={f}
              custom={i}
              variants={featureVariants}
              className="flex items-center gap-2.5 text-zinc-300 text-sm font-medium"
            >
              <CheckIcon color={platform.accent} />
              {f}
            </motion.li>
          ))}
        </ul>

        {/* CTA Button */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="relative w-full py-3 rounded-xl font-black text-sm tracking-[0.12em] uppercase overflow-hidden mt-4"
          style={{
            background: `linear-gradient(135deg, ${platform.accentDark} 0%, ${platform.accent} 100%)`,
            color: platform.accent === '#FFC107' ? '#0a0a0a' : '#ffffff',
          }}
        >
          <motion.span
            className="absolute inset-0"
            style={{
              background: 'rgba(255,255,255,0.15)',
              opacity: 0,
            }}
            whileHover={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
          Select Platform
        </motion.button>
      </div>
    </motion.div>
  )
}