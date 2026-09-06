"use client";

import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useMotionValueEvent, animate, useInView, Variants } from 'framer-motion';
import { Star, Quote } from 'lucide-react';
import Image from 'next/image';

const testimonials = [
  {
    id: 1,
    name: "Aravind Kumar",
    role: "College Student",
    text: "Best gaming cafe in the area! The PS5 setups are incredible and the food is amazing. Tried their chicken sandwich while playing FIFA - perfect combo. Staff is super friendly too!",
    avatar: "https://i.pravatar.cc/150?u=aravind",
    rating: 5
  },
  {
    id: 2,
    name: "Priya Lakshmi",
    role: "Weekend Gamer",
    text: "Love coming here with friends! The snooker tables are well-maintained and the cafe vibes are great. Their coffee and snacks keep us going for hours. Happy hour deals are a steal!",
    avatar: "https://i.pravatar.cc/150?u=priya",
    rating: 5
  },
  {
    id: 3,
    name: "Karthi Selvam",
    role: "Esports Enthusiast",
    text: "Zero lag gaming experience! Booked a PS5 console for 3 hours and it was flawless. The food menu has great variety - tried the masala fries and cold coffee. Will definitely come back!",
    avatar: "https://i.pravatar.cc/150?u=karthi",
    rating: 5
  },
  {
    id: 4,
    name: "Divya Bharathi",
    role: "Birthday Host",
    text: "Hosted my brother's birthday party here and everyone loved it! Gaming stations were perfect for the group and the food was delicious. Staff helped with everything. Highly recommend for events!",
    avatar: "https://i.pravatar.cc/150?u=divya",
    rating: 5
  },
  {
    id: 5,
    name: "Naveen Raj",
    role: "Regular Visitor",
    text: "My go-to spot for weekend gaming sessions! Clean ambiance, comfortable seating, and the food ordering is seamless. Their subscription plans save me so much money. Worth every rupee!",
    avatar: "https://i.pravatar.cc/150?u=naveen",
    rating: 5
  }
];

// Scroll entrance variants
const sectionVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 }
  }
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] } }
};

export default function Testimonials() {
  const [singleSetWidth, setSingleSetWidth] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const [isHovering, setIsHovering] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [activeIndex, setActiveIndex] = useState(0);

  const x = useMotionValue(0);

  // useInView for scroll entrance
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  useEffect(() => {
    const updateWidth = () => {
      if (cardRef.current) {
        const cardWidth = cardRef.current.offsetWidth;
        const gap = 20;
        const setWidth = (cardWidth + gap) * testimonials.length;
        setSingleSetWidth(setWidth);
        x.jump(-setWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [x]);

  // --- NEW: Auto-play functionality ---
  useEffect(() => {
    if (singleSetWidth === 0 || isHovering) return;

    let animationFrameId: number;
    const speed = 0.9; // Adjust this value to change auto-play speed

    const play = () => {
      const currentX = x.get();
      x.set(currentX - speed);
      animationFrameId = requestAnimationFrame(play);
    };

    animationFrameId = requestAnimationFrame(play);

    return () => cancelAnimationFrame(animationFrameId);
  }, [singleSetWidth, isHovering, x]);
  // ------------------------------------

  useMotionValueEvent(x, "change", (latestX) => {
    if (singleSetWidth === 0) return;
    if (latestX > -singleSetWidth) {
      x.jump(latestX - singleSetWidth);
      return;
    } else if (latestX <= -singleSetWidth * 2) {
      x.jump(latestX + singleSetWidth);
      return;
    }
    const positionWithinSet = Math.abs(latestX + singleSetWidth);
    const scrollPercentage = positionWithinSet / singleSetWidth;
    let index = Math.round(scrollPercentage * testimonials.length);
    if (index >= testimonials.length) index = 0;
    setActiveIndex(index);
  });

  const handleDotClick = (index: number) => {
    if (singleSetWidth === 0) return;
    const itemWidth = singleSetWidth / testimonials.length;
    const targetX = -singleSetWidth - (index * itemWidth);
    animate(x, targetX, { type: "spring", stiffness: 220, damping: 28 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  const extendedTestimonials = [...testimonials, ...testimonials, ...testimonials];

  return (
    <section
      ref={sectionRef}
      className="w-full bg-[#0f0f0f] py-24 overflow-hidden relative"
    >
      {/* Custom cursor */}
      {isHovering && (
        <motion.div
          className="fixed top-0 left-0 w-16 h-16 bg-[var(--primary)] rounded-full flex items-center justify-center pointer-events-none z-50 shadow-2xl hidden md:flex gap-2"
          animate={{ x: mousePosition.x - 32, y: mousePosition.y - 32 }}
          transition={{ type: "tween", ease: "backOut", duration: 0.08 }}
        >
          <svg width="10" height="12" viewBox="0 0 12 14" fill="#0a0a0a">
            <path d="M12 14L0 7L12 0V14Z" />
          </svg>
          <svg width="10" height="12" viewBox="0 0 12 14" fill="#0a0a0a">
            <path d="M0 0L12 7L0 14V0Z" />
          </svg>
        </motion.div>
      )}

      <div className="max-w-[1400px] mx-auto px-6 md:px-12">

        {/* Header — scroll entrance */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="mb-14 flex flex-col md:flex-row md:items-end md:justify-between gap-6"
        >
          <div className="flex flex-col gap-4">
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-[var(--primary)] tracking-[0.18em] uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                Customer Reviews
              </span>
            </motion.div>

            <motion.h2
              variants={fadeUp}
              className="text-5xl md:text-6xl font-black text-white leading-none"
            >
              4.85{" "}
              <span className="text-2xl md:text-3xl font-bold text-zinc-400">out of 5</span>
            </motion.h2>
          </div>

          <motion.div variants={fadeUp} className="flex items-center gap-1.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-[var(--primary)] text-[var(--primary)]" />
            ))}
            <span className="ml-2 text-zinc-400 text-sm font-medium">Based on 2,400+ reviews</span>
          </motion.div>
        </motion.div>

        {/* Carousel */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden md:cursor-none select-none py-3"
          onPointerEnter={() => setIsHovering(true)}
          onPointerLeave={() => setIsHovering(false)}
          onMouseMove={handleMouseMove}
        >
          <motion.div
            drag="x"
            dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
            style={{ x }}
            className="flex gap-5 w-max"
          >
            {extendedTestimonials.map((t, idx) => (
              <div
                ref={idx === 0 ? cardRef : null}
                key={`${t.id}-${idx}`}
                className="w-[300px] md:w-[340px] flex-shrink-0 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group"
                style={{
                  background: "linear-gradient(160deg, #1c1c1c 0%, #161616 100%)",
                  border: "1px solid #272727",
                }}
              >
                {/* Subtle top accent line */}
                <div
                  className="absolute top-0 left-6 right-6 h-[1.5px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: "linear-gradient(90deg, transparent, var(--primary), transparent)" }}
                />

                {/* Quote icon */}
                <div className="absolute top-5 right-5 opacity-[0.06]">
                  <Quote className="w-14 h-14 text-[var(--primary)] fill-[var(--primary)]" />
                </div>

                <div className="relative z-10">
                  {/* Stars */}
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-[var(--primary)] text-[var(--primary)]" />
                    ))}
                  </div>

                  {/* Text */}
                  <p className="text-zinc-300 text-[13.5px] leading-relaxed font-light mb-6">
                    "{t.text}"
                  </p>
                </div>

                {/* Avatar + name */}
                <div className="relative z-10 flex items-center gap-3 pt-4 border-t border-white/5">
                  <div className="relative w-9 h-9">
                    <Image
                      src={t.avatar}
                      alt={t.name}
                      width={36}
                      height={36}
                      className="rounded-full object-cover ring-2 ring-[var(--primary)]/30"
                      draggable="false"
                      loading="lazy"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#1c1c1c]" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold leading-none mb-0.5">{t.name}</p>
                    <p className="text-zinc-400 text-xs font-medium">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-10 flex items-center justify-center gap-2"
        >
          {testimonials.map((_, idx) => (
            <button
              key={idx}
              onClick={() => handleDotClick(idx)}
              className="relative h-1.5 rounded-full transition-all duration-300 overflow-hidden"
              style={{
                width: activeIndex === idx ? 28 : 8,
                background: activeIndex === idx ? "var(--primary)" : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </motion.div>

      </div>
    </section>
  );
}