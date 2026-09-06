'use client'

import { memo } from 'react'

function AnimatedBackground() {
  return (
    <>
      {/* Base gradient overlay */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-[#0d0a14] to-[#0d0a14] pointer-events-none z-0" />

      {/*
        * Golden blobs. The pulse and the full 100px blur are desktop-only.
        *
        * A blurred layer this size is rasterised into an offscreen buffer, and
        * animating its opacity makes the compositor redraw that buffer every
        * frame. On iOS that is expensive on its own and ruinous underneath a
        * full-screen overlay - the slot picker's bottom sheets sit directly on
        * top of these two, which is why choosing a duration or a start time
        * crawled on older iPhones. Phones get a smaller, static blob; desktop
        * keeps the animation it was written for.
        */}
      <div
        className="fixed top-20 left-1/4 w-[320px] h-[320px] md:w-[600px] md:h-[600px] bg-gradient-to-r from-primary/10 to-amber-500/10 rounded-full blur-[60px] md:blur-[100px] md:motion-safe:animate-pulse pointer-events-none z-0"
        style={{ animationDuration: '4s' }}
      />
      <div
        className="fixed bottom-20 right-1/4 w-[280px] h-[280px] md:w-[500px] md:h-[500px] bg-gradient-to-l from-orange-600/10 to-primary/10 rounded-full blur-[60px] md:blur-[100px] md:motion-safe:animate-pulse pointer-events-none z-0"
        style={{ animationDelay: '2s', animationDuration: '4s' }}
      />
    </>
  )
}

// Memoize to prevent unnecessary re-renders
export default memo(AnimatedBackground)
