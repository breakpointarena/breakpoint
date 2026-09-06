'use client'
import { Food } from '@/app/(customer)/home/food/page'
import { useInView, motion } from 'framer-motion'
import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'

export function FoodCard({
  food,
  index,
  isFiltering,
}: {
  food: Food
  index: number
  isFiltering: boolean
}) {
  const ref = useRef(null)
  const router = useRouter()
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const prefersReducedMotion = useReducedMotion()

  const handleClick = () => {
    router.push('/food')
  }

  const getInitial = () => {
    if (prefersReducedMotion) return { opacity: 0 }
    return isFiltering ? { opacity: 0, scale: 0, x: 0 } : { opacity: 0, x: 60, scale: 1 }
  }

  const getAnimate = () => {
    if (prefersReducedMotion) return { opacity: 1 }
    if (isFiltering) {
      return {
        opacity: 1,
        scale: 1,
        x: 0,
        transition: { duration: 0.4, ease: [0, 0.55, 0.45, 1] as const, delay: index * 0.055 },
      }
    }
    if (inView) {
      return {
        opacity: 1,
        x: 0,
        scale: 1,
        transition: { duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] as const, delay: index * 0.08 },
      }
    }
    return { opacity: 0, x: 60, scale: 1 }
  }

  const getExit = () => {
    if (prefersReducedMotion) return { opacity: 0 }
    return {
      opacity: 0,
      scale: 0,
      transition: { duration: 0.3, ease: [0.55, 0, 1, 0.45] as const, delay: index * 0.03 },
    }
  }

  return (
    <motion.div
      ref={ref}
      layout
      initial={getInitial()}
      animate={getAnimate()}
      exit={getExit()}
      onClick={handleClick}
      className="group relative rounded-xl overflow-hidden cursor-pointer flex flex-col sm:block bg-[#121212] sm:bg-transparent border border-white/5 sm:border-0 h-full sm:h-auto aspect-auto sm:aspect-[301/401]"
    >
      {/*  Image Layer */}
      <div className="relative w-full aspect-square sm:aspect-auto sm:absolute sm:inset-0 sm:z-0 overflow-hidden">
        <Image
          src={food.image}
          alt={food.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 300px"
          className="object-cover transition-transform duration-700 ease-[cubic-bezier(.25,.46,.45,.94)] sm:group-hover:scale-110"
          loading="lazy"
          quality={85}
        />
        <div className="hidden sm:block absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-500 z-10" />
      </div>

      {/*  Desktop Bottom Gradient */}
      <div
        className="hidden sm:block absolute bottom-0 left-0 right-0 h-[70%] z-10 pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)',
        }}
      />

      {/*Text & Action Content */}
      <div className="relative z-20 flex flex-col flex-grow p-3 sm:p-4 sm:absolute sm:bottom-0 sm:left-0 sm:right-0 sm:flex-none sm:block sm:transition-transform sm:duration-500 sm:ease-[cubic-bezier(.25,.46,.45,.94)] sm:group-hover:-translate-y-12">
        {/* Title */}
        <h4
          className="text-white font-bold text-[13px] sm:text-base leading-snug sm:leading-tight mb-1 sm:mb-1 transition-colors duration-300 sm:group-hover:text-primary line-clamp-1"
          style={{ fontFamily: "'Oxanium', sans-serif" }}
        >
          {food.title}
        </h4>

        {/* Description  */}
        <p className="text-[#a1a1aa] text-xs leading-snug mb-2 sm:mb-3 line-clamp-2">
          {food.description}
        </p>

        {/* Price & Mobile ADD Button */}
        <div className="flex items-center justify-between mt-auto sm:mt-0 sm:block">
          <span className="text-[#ADB7BE] text-xs sm:text-[12px] font-medium block">
            <span className="hidden sm:inline">Price </span>
            <span className="text-white font-bold text-[14px] sm:text-[15px]">{food.price}</span>
          </span>

          {/* BUY Button  */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleClick()
            }}
            className="sm:hidden px-4 py-1.5 rounded-md text-xs font-bold tracking-widest text-[#0a0a0a] shadow-lg active:scale-95 transition-transform bg-gradient-primary">
            BUY
          </button>
        </div>
      </div>

      {/* Desktop Order Now Button */}
      <div className="hidden sm:block absolute bottom-4 left-4 right-4 z-20 translate-y-8 opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-[cubic-bezier(.25,.46,.45,.94)]">
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleClick()
          }}
          className="w-full py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-widest text-[#0a0a0a] transition-transform duration-300 hover:brightness-110 active:scale-95 shadow-lg bg-gradient-primary">
          Order Now
        </button>
      </div>

      {/* Thick Hover Border Overlay */}
      <div className="absolute inset-0 border-[4px] border-transparent group-hover:border-primary rounded-xl z-50 pointer-events-none transition-colors duration-300" />
    </motion.div>
  )
}
