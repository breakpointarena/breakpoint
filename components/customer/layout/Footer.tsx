import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Gamepad2, Facebook, Twitter, MessageSquare, Music, Youtube } from 'lucide-react';

export default function Footer() {
  // Fetch current year dynamically
  const currentYear = new Date().getFullYear();

  const footerLinks = [
    { label: 'HOME', path: '/' },
    { label: 'SUBSCRIPTIONS', path: '/subscription' },
    { label: 'Retrieve Booking', path: '/retrieve' },
    { label: 'Food Menu', path: '/food' },
    { label: 'Book Slot', path: '/booking' },
  ];

  return (
    <footer className="bg-[#121212] border-t border-white/5 pt-12 md:pt-16 pb-6 md:pb-8 overflow-hidden relative mt-auto">

      {/* Subtle background glow to match the dark theme */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-[#FFC107]/5 blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">

        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 md:gap-10 lg:gap-8 mb-10 md:mb-16">

          {/* Column 1: Brand & Description */}
          {/* On tablet (md), takes full width (col-span-2). On desktop (lg), takes 5 out of 12 columns */}
          <div className="md:col-span-2 lg:col-span-5 flex flex-col items-start">
            {/* Logo */}
            <div className="flex items-center gap-3 mb-6">
              <Image
                src="/bp_logo.png"
                alt="Breakpoint Arena Logo"
                width={40}
                height={40}
                className="w-10 h-10 object-contain rounded-md"
              />
              <span className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: "'Oxanium', sans-serif" }}>
                BREAK POINT ARENA
              </span>
            </div>
            {/* Description */}
            <p className="text-[#a1a1aa] text-sm leading-relaxed pr-0 lg:pr-8">
              Break Point Arena is the ultimate premium gaming destination, offering state-of-the-art gaming stations, console hubs, competitive tournaments, custom memberships, and a curated menu to fuel your sessions. Book your slot now and level up your gaming experience.
            </p>
          </div>

          {/* Column 2: Pages Links */}
          <div className="lg:col-span-3">
            <h3 className="text-white font-bold text-lg mb-6" style={{ fontFamily: "'Oxanium', sans-serif" }}>
              Pages
            </h3>
            <ul className="flex flex-col gap-4 uppercase">
              {footerLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.path} className="text-[#a1a1aa] text-sm hover:text-[#FFC107] transition-colors duration-300">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Newsletter & Socials */}
          <div className="lg:col-span-4 lg:pl-8">
            {/* Newsletter */}
            <div className="mb-10">
              <h3 className="text-white font-bold text-lg mb-4" style={{ fontFamily: "'Oxanium', sans-serif" }}>
                Newsletter
              </h3>
              <p className="text-[#a1a1aa] text-sm mb-4">
                Your email is safe with us. We don't spam.
              </p>
              {/* Optional: Add a simple email input field here if needed in the future */}
            </div>

            {/* Social Links */}
            <div>
              <h3 className="text-white font-bold text-lg mb-4" style={{ fontFamily: "'Oxanium', sans-serif" }}>
                Follow Us on
              </h3>
              <div className="flex flex-wrap gap-3">
                <SocialIcon Icon={Facebook} href="#" />
                <SocialIcon Icon={Twitter} href="#" />
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Copyright Bar */}
        {/* Center aligned on mobile, split left/right on tablet/desktop */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left text-sm text-[#a1a1aa]">
          <p>
            &copy; {currentYear} <span className="text-[#FFC107] hover:underline cursor-pointer">Break Point Arena</span>. All rights reserved by <span className="text-[#FFC107] hover:underline cursor-pointer">Break Point Arena</span>
          </p>
          <p>
            Powered By{' '}
            <a
              href="https://www.wnradvisory.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#FFC107] hover:underline transition-colors duration-300"
            >
              WnR Groups
            </a>
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/terms" className="hover:text-white transition-colors duration-300">Terms & Conditions</Link>
            <Link href="/privacy" className="hover:text-white transition-colors duration-300">Privacy Policy</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}

// --- Helper Component for Social Icons ---
function SocialIcon({ Icon, href }: { Icon: any; href: string }) {
  return (
    <a
      href={href}
      className="w-10 h-10 rounded-lg bg-[#1a1a1a] border border-white/5 flex items-center justify-center text-[#a1a1aa] hover:bg-[#FFC107] hover:text-[#0a0a0a] hover:border-[#FFC107] transition-all duration-300 hover:-translate-y-1"
    >
      <Icon className="w-4 h-4" />
    </a>
  );
}