"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Gamepad2, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/customer/layout/NavBar';

interface SlideData {
  id: number;
  image?: string;
  video?: string;
  title: string;
  subtitle: string;
  price: string;
}

const slides: SlideData[] = [
  {
    id: 1,
    video: "/hero_video.mp4",
    title: "WELCOME TO BREAK POINT ARENA",
    subtitle: "Experience the ultimate gaming destination with cutting-edge technology and unmatched performance.",
    price: "9.99"
  },
  {
    id: 2,
    video: "/ps5_hero.mp4",
    title: "PLAYSTATION 5 GAMING",
    subtitle: "Immerse yourself in next-gen gaming with our PlayStation 5 stations. Experience lightning-fast loading and stunning visuals.",
    price: "12.99"
  }
];

// --- Animation Variants ---
const slideVariants: Variants = {
  enter: (direction: number) => {
    return {
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0
    };
  },
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1
  },
  exit: (direction: number) => {
    return {
      zIndex: 0,
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0
    };
  }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.4 }
  }
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" }
  }
};

export default function HeroCarousel() {
  const router = useRouter();
  const [[page, direction], setPage] = useState([0, 0]);

  // Wrap around index safely using modulo
  const currentIndex = ((page % slides.length) + slides.length) % slides.length;

  const paginate = (newDirection: number) => {
    setPage([page + newDirection, newDirection]);
  };

  /**
   * Auto-play, but only for a tab somebody is actually looking at.
   *
   * Every rotation mounts a fresh <video> and hands the outgoing one to
   * AnimatePresence to animate away. Exit animations are driven by
   * requestAnimationFrame, which browsers freeze in a background tab - so the
   * exit never completed, the node was never removed, and a landing page left
   * open in another tab accumulated one video element every ten seconds with no
   * upper bound. Measured against a production build: 10 elements growing to 14
   * over 36 seconds and still climbing, each one holding a multi-megabyte clip.
   *
   * Skipping while hidden fixes that at the source, and not rotating a carousel
   * nobody can see is right anyway - the same rule the admin notification
   * poller follows. Returning to the tab resumes it, and any half-finished exit
   * completes as soon as frames are being produced again.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      paginate(1);
    }, 10000);

    return () => clearInterval(timer);
  }, [page]);

  return (
    <div className="relative w-full h-[100dvh] bg-[#0d0a14] overflow-hidden selection:bg-[var(--primary)] selection:text-black font-Oxanium">
      <Navbar />

      {/* Carousel Content */}
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={page}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.4 }
          }}
          className="absolute inset-0 w-full h-full"
        >
          {/* Zooming Background Image or Video */}
          {slides[currentIndex].video ? (
            <video
              key={slides[currentIndex].video}
              className="absolute inset-0 w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
            >
              <source src={slides[currentIndex].video} type="video/mp4" />
            </video>
          ) : (
            <motion.div
              className="absolute inset-0 w-full h-full bg-cover bg-center"
              style={{ backgroundImage: `url(${slides[currentIndex].image})` }}
              initial={{ scale: 1 }}
              animate={{ scale: 1.15 }}
              transition={{ duration: 10, ease: "linear" }}
            />
          )}

          {/* Lighter gradient overlays to show more background */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d0a14]/85 via-[#0d0a14]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0a14]/70 via-transparent to-[#0d0a14]/50" />

          {/* Desktop Layout - centered */}
          <div className="hidden md:flex absolute inset-0 items-center px-20 lg:px-40">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="max-w-3xl pt-20"
            >
              <motion.h1
                variants={fadeUp}
                className="font-Oxanium text-5xl lg:text-6xl tracking-wide bg-gradient-to-b from-white via-[#f0f0f0] to-[#a0a0a0] text-transparent bg-clip-text mb-4 leading-tight"
                style={{ textShadow: "0 10px 30px rgba(0,0,0,0.5)" }}
              >
                {slides[currentIndex].title}
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="font-Oxanium text-secondary-content text-base leading-relaxed mb-10 max-w-2xl font-light"
              >
                {slides[currentIndex].subtitle}
              </motion.p>

              <motion.div variants={fadeUp}>
                <button
                  onClick={() => router.push('/booking')}
                  className="w-fit bg-gradient-primary text-[var(--button-text)] font-black px-10 py-4 rounded-xl uppercase tracking-widest text-sm transition-all duration-300 hover:scale-[1.02]"
                >
                  Book Slot
                </button>
              </motion.div>
            </motion.div>
          </div>

          {/* Mobile Layout - text at 25%, button at 80% */}
          <div className="md:hidden absolute inset-0 px-6 sm:px-10">
            {/* Text at 25% from top */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="absolute w-full left-0 px-6 sm:px-10 max-w-2xl"
              style={{ top: '25%' }}
            >
              <motion.h1
                variants={fadeUp}
                className="font-Oxanium text-2xl sm:text-3xl tracking-wide bg-gradient-to-b from-white via-[#f0f0f0] to-[#a0a0a0] text-transparent bg-clip-text mb-2 leading-tight"
                style={{ textShadow: "0 10px 30px rgba(0,0,0,0.5)" }}
              >
                {slides[currentIndex].title}
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="font-Oxanium text-secondary-content text-xs sm:text-sm leading-relaxed max-w-xl font-light"
              >
                {slides[currentIndex].subtitle}
              </motion.p>
            </motion.div>

            {/* Button at 74% of screen height */}
            <motion.div
              variants={fadeUp}
              className="absolute w-full left-0 px-6 sm:px-10"
              style={{ top: '70%' }}
            >
              <button
                onClick={() => router.push('/booking')}
                className="w-full bg-gradient-primary text-[var(--button-text)] font-black px-6 py-3 rounded-xl uppercase tracking-widest text-xs transition-all duration-300 active:scale-[0.98]"
              >
                Book Slot
              </button>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Arrows */}
      <div className="absolute top-1/2 -translate-y-1/2 left-2 md:left-4 z-40">
        <button
          onClick={() => paginate(-1)}
          className="p-1 md:p-3 text-primary hover:scale-110 transition-all duration-300 rounded-full group"
        >
          <ChevronLeft className="w-8 h-8 sm:w-10 sm:h-10 md:w-16 md:h-16 stroke-[1.5] group-hover:stroke-2" />
        </button>
      </div>
      <div className="absolute top-1/2 -translate-y-1/2 right-2 md:right-4 z-40">
        <button
          onClick={() => paginate(1)}
          className="p-1 md:p-3 text-primary hover:scale-110 transition-all duration-300 rounded-full group"
        >
          <ChevronRight className="w-8 h-8 sm:w-10 sm:h-10 md:w-16 md:h-16 stroke-[1.5] group-hover:stroke-2" />
        </button>
      </div>

      {/* Bottom Controls */}
      {/* Changed `bottom-6` to `bottom-28` for mobile to ensure it's lifted above mobile browser taskbars */}
      <div className="absolute bottom-16 md:bottom-8 left-6 md:left-12 right-6 md:right-12 flex justify-center md:justify-end items-end z-40 pointer-events-none">
        <div className="flex items-baseline gap-2 font-mono bg-black/40 md:bg-transparent px-4 py-2 md:p-0 rounded-full backdrop-blur-sm md:backdrop-blur-none pointer-events-auto">
          <motion.span
            key={currentIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl font-black text-white"
          >
            {currentIndex + 1}
          </motion.span>
          <span className="text-xl md:text-2xl font-bold text-muted-content">/ {slides.length}</span>
        </div>
      </div>
    </div>
  );
}