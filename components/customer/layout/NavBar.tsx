"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Gamepad2, Menu, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAppSelector } from '@/lib/redux/hooks';
import { CustomerSessionMenu } from '@/components/customer/layout/CustomerSessionMenu';

const navLinks = [
  { label: "Home", path: "/" },
  { label: "Subscriptions", path: "/subscription" },
  { label: "My Bookings", path: "/retrieve" },
  { label: "FOOD MENU", path: "/food" }
];

// Framer Motion variants
const mobileMenuVariants: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut" as const,
      staggerChildren: 0.1
    }
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: { duration: 0.2, ease: "easeIn" as const }
  }
};

const linkItemVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } }
};

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [hasActiveHold, setHasActiveHold] = useState(false);

  const slotLockExpiry = useAppSelector((state) => state.booking.slotLockExpiry);

  // Get the current route path
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Intercept fetch requests and track navigation transitions to show loading state
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let activeRequests = 0;
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      activeRequests++;
      setIsFetching(true);
      try {
        return await originalFetch(...args);
      } finally {
        activeRequests--;
        if (activeRequests <= 0) {
          activeRequests = 0;
          setIsFetching(false);
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    setIsFetching(true);
    const timer = setTimeout(() => {
      setIsFetching(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [pathname]);

  /**
   * Hold the page still behind the mobile menu.
   *
   * The overlay is `fixed` and covers the viewport, but a fixed element does not
   * stop the document underneath it from scrolling on touch - so the homepage
   * kept scrolling behind the nav links. Pinning the body at its current offset
   * blocks that, and restoring the scroll position on close is what stops the
   * page jumping back to the top when the menu shuts.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMobileMenuOpen) return;

    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isMobileMenuOpen]);

  // Track if slot hold is active
  useEffect(() => {
    if (!slotLockExpiry) {
      setHasActiveHold(false);
      return;
    }
    const checkHold = () => {
      // Mirrors the banner's own rule in the customer layout: it only renders on the
      // booking flow, so the nav must only make room for it there. Offsetting
      // everywhere left a 40px gap above the nav on pages with no banner.
      const bannerIsVisible = pathname === "/booking/auth";
      setHasActiveHold(bannerIsVisible && slotLockExpiry > Date.now());
    };
    checkHold();
    const interval = setInterval(checkHold, 1000);
    return () => clearInterval(interval);
  }, [slotLockExpiry, pathname]);

  return (
    <nav className={`fixed left-0 w-full z-[100] transition-all duration-500 ${(hasActiveHold && !scrolled) ? "top-10" : "top-0"
      } ${scrolled ? "bg-[#0a0a0a]/80 backdrop-blur-md py-4 shadow-xl" : "bg-transparent py-6"
      }`}>

      {/* Main Bar */}
      <div className="flex items-center justify-between px-6 md:px-12">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 cursor-pointer group">
          <motion.div
            animate={isFetching ? {
              rotate: 360,
              scale: [1, 1.15, 1],
            } : {
              rotate: 0,
              scale: 1
            }}
            transition={isFetching ? {
              rotate: { repeat: Infinity, duration: 1.5, ease: "linear" },
              scale: { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
            } : {
              duration: 0.3
            }}
            className="flex-shrink-0"
          >
            <Image
              src="/bp_logo.png"
              alt="Breakpoint Arena Logo"
              width={40}
              height={40}
              className="w-10 h-10 object-contain rounded-md"
              priority
            />
          </motion.div>
          <span className="text-2xl font-bold text-white tracking-wide uppercase">Break point Arena</span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden lg:flex items-center gap-10">
          {navLinks.map((link) => {
            const isActive = pathname === link.path; // Check if active

            return (
              <Link
                key={link.label}
                href={link.path}
                className="group cursor-pointer relative py-2"
              >
                <span className={`text-sm font-black transition-colors duration-300 uppercase tracking-widest ${isActive ? "text-white" : "text-gray-300 group-hover:text-white"
                  }`}>
                  {link.label}
                </span>
                {/* Underline: stays full width if active */}
                <span className={`absolute bottom-0 left-0 h-[2px] bg-[var(--primary)] transition-all duration-300 ${isActive ? "w-full" : "w-0 group-hover:w-full"
                  }`}></span>
              </Link>
            );
          })}
        </div>

        {/* CTA & Mobile Toggle */}
        <div className="flex items-center gap-4">
          {/* Renders nothing unless a session is live. */}
          <CustomerSessionMenu />

          <Link
            href="/booking"
            className="hidden lg:inline-block px-6 py-2.5 border-gradient-animated cursor-pointer font-bold text-xs tracking-widest uppercase hover:bg-[var(--primary)] text-black transition-all duration-300 text-center"
          >
            Book Slot
          </Link>

          <button
            className="lg:hidden text-white hover:text-[var(--primary)] transition-colors p-2 z-50"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? <X className="w-8 h-8" /> : <Menu className="w-8 h-8" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Full-Screen Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            variants={mobileMenuVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-0 left-0 w-full h-screen bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-8 gap-8 lg:hidden z-40"
          >
            <div className="flex flex-col items-center gap-6 w-full max-w-sm mt-10">
              {navLinks.map((link) => {
                const isActive = pathname === link.path; // Check if active

                return (
                  <motion.div
                    variants={linkItemVariants}
                    key={link.label}
                    className="w-full"
                  >
                    <Link
                      href={link.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="w-full flex items-center justify-center cursor-pointer group py-2"
                    >
                      <span className={`text-md md:text-sm font-bold transition-all duration-300 uppercase tracking-widest text-center flex items-center gap-3 ${isActive ? "text-white scale-105" : "text-gray-400 group-hover:text-white group-hover:scale-105"
                        }`}>
                        {link.label}
                        {/* Arrow: stays visible if active */}
                        <ArrowRight className={`w-6 h-6 text-[var(--primary)] transition-all duration-300 ${isActive ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0"
                          }`} />
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            {/* Mobile CTA Button */}
            <motion.div variants={linkItemVariants} className="w-full max-w-xs mt-8">
              <Link
                href="/booking"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full py-4 bg-gradient-primary text-black text-center font-extrabold text-sm tracking-widest uppercase rounded hover:scale-105 transition-transform duration-300 shadow-[0_0_20px_rgba(255,193,7,0.3)]"
              >
                Book Slot
              </Link>
            </motion.div>

            {/* Sign-out, mobile. Self-hides when there is no session. */}
            <motion.div variants={linkItemVariants} className="w-full max-w-xs mt-6">
              <CustomerSessionMenu compact />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};