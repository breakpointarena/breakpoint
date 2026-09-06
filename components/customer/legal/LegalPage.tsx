import React from 'react'
import { Breadcrumb } from '@/components/ui/breadcrumb'

/**
 * The page chrome both legal pages share.
 *
 * They are the only long-prose pages on the site - everything else is a booking
 * step - so the reading measure and the heading rhythm live here rather than
 * being written twice and drifting apart.
 */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string
  /** One sentence saying what the document covers, above the sections. */
  summary: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen bg-[#0d0a14] text-white relative overflow-hidden pt-5">
      {/* The same glow the rest of the customer site sits on. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-[#0d0a14] to-[#0d0a14] pointer-events-none" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pb-20">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: title }]} />

        <header className="mb-10">
          <h1
            className="text-3xl md:text-[42px] font-black tracking-tight leading-tight mb-3 text-transparent bg-gradient-to-r from-white via-amber-100 to-white bg-clip-text"
            style={{ fontFamily: "'Oxanium', sans-serif" }}
          >
            {title}
          </h1>
          <p className="text-[#a1a1aa] text-sm md:text-base leading-relaxed">{summary}</p>
        </header>

        <div className="space-y-10">{children}</div>
      </div>
    </main>
  )
}

/** One numbered section of a policy. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}) {
  return (
    <section className="scroll-mt-24">
      <h2
        className="text-lg md:text-xl font-black text-white mb-3"
        style={{ fontFamily: "'Oxanium', sans-serif" }}
      >
        {heading}
      </h2>
      <div className="space-y-3 text-sm md:text-[15px] leading-relaxed text-[#a1a1aa]">
        {children}
      </div>
    </section>
  )
}

/** A bulleted list inside a section, styled once. */
export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A detail the arena has not filled in yet.
 *
 * Deliberately loud. A policy that quietly omits where to send a data request is
 * a policy that cannot be acted on, so an unfilled field says so on the page
 * instead of leaving a gap nobody notices.
 */
export function ToBeConfirmed({ what }: { what: string }) {
  return (
    <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-300">
      {what} to be confirmed
    </span>
  )
}
