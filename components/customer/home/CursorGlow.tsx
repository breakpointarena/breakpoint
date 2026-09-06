'use client'

import { useEffect, useRef } from 'react'

/**
 * The glow that follows the pointer across the landing page.
 *
 * This used to be a `useState` on the landing page itself, written on every
 * `mousemove`. That made the whole page a client component, and - far worse -
 * re-rendered the entire tree beneath it (the hero carousel, the device grid,
 * the food menu, the testimonials, the footer) at pointer-event rate, none of
 * which is memoised. Moving a mouse across the page was re-rendering several
 * hundred nodes dozens of times a second to move one gradient.
 *
 * The position is written straight to the element as two custom properties
 * instead. React renders this once and never again; the browser composites the
 * gradient on the values it finds. The listener is passive because it never
 * calls preventDefault, which lets the browser keep scrolling off the main
 * thread while the pointer moves.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    let x = 0
    let y = 0

    /**
     * Coalesced to one write per frame.
     *
     * `mousemove` fires as fast as the pointer reports - 125Hz on an ordinary
     * gaming mouse, more on a trackpad - while the screen can only show one
     * position per frame. Writing on every event meant several style
     * recalculations per painted frame, all but the last of them discarded
     * before anybody saw them. Storing the position and writing it inside a
     * frame gives the same glow for a fraction of the work.
     */
    const paint = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      el.style.setProperty('--cursor-x', `${x}px`)
      el.style.setProperty('--cursor-y', `${y}px`)
    }

    const onMove = (event: MouseEvent) => {
      x = event.clientX
      y = event.clientY
      // Only schedule when no frame is already pending, so a burst of events
      // between two paints costs one callback rather than one each.
      if (!frame) frame = requestAnimationFrame(paint)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      // A frame still queued after unmount would run against a detached ref.
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 transition-opacity duration-300"
      style={{
        // Starts off-screen rather than centred, so the glow does not sit in the
        // middle of the page for anyone who never moves a pointer - a touch
        // device, or a reader arriving by keyboard.
        background:
          'radial-gradient(600px circle at var(--cursor-x, -100%) var(--cursor-y, -100%), rgba(255, 193, 7, 0.15), transparent 40%)',
      }}
    />
  )
}

export default CursorGlow
