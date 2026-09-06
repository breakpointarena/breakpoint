/**
 * Fails if server code reads a date or time from the host's clock.
 *
 * The arena runs on Asia/Kolkata and the servers run on UTC, so between midnight
 * and 05:30 IST the two disagree about what day it is - which is precisely when
 * this venue is busiest. Every instance of this bug has been invisible in
 * development, because a laptop in India *is* on the arena's clock, and has only
 * appeared once deployed.
 *
 * It has been found and fixed five separate times: walk-in checkout writing
 * `slot_date`, the dashboard's "next 2 hours" window, subscription start and end
 * dates, three SQL functions, and the Today filter losing walk-ins that had not
 * been checked in yet. This is the check that stops a sixth.
 *
 * Client components are not scanned: those run in a browser at the arena, which
 * is on the arena's clock by definition.
 *
 * Use `arenaToday`, `arenaDate`, `arenaClockTime` or `arenaDateOffset` from
 * `lib/utils/dates` instead. If a use really is host-relative - reading back a
 * Date the browser itself constructed, say - mark the line `arena-clock-ok`.
 *
 * Run: npm run check:clock
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOTS = ['app', 'lib']
const SUPPRESSION = 'arena-clock-ok'

/** Host-clock reads that silently mean "wherever this process happens to run". */
const BANNED: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /\.getFullYear\(\)/, hint: 'arenaDate(value)' },
  { pattern: /\.getMonth\(\)/, hint: 'arenaDate(value)' },
  { pattern: /\.getDate\(\)/, hint: 'arenaDate(value)' },
  { pattern: /\.getHours\(\)/, hint: 'arenaClockTime(value)' },
  { pattern: /\.getMinutes\(\)/, hint: 'arenaClockTime(value)' },
  { pattern: /\.getSeconds\(\)/, hint: 'arenaClockTime(value)' },
  { pattern: /\.toTimeString\(\)/, hint: 'arenaClockTime(value)' },
  { pattern: /\.toISOString\(\)\s*\.\s*(split\('T'\)\[0\]|slice\(0,\s*10\))/, hint: 'arenaDate(value)' },
  { pattern: /\bformatLocalDate\s*\(/, hint: 'arenaDate(value) — formatLocalDate reads the host clock' },
]

/**
 * Date arithmetic on a value the code built itself is fine - `setDate` on a
 * local-midnight Date is timezone-neutral, and only the *formatting* back out
 * matters. Skipping the setters keeps the check on the reads that actually leak.
 */
const IGNORED_LINE = /\.set(FullYear|Month|Date|Hours|Minutes|Seconds)\(/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** A file is client-side if it opts in, so anything else is treated as server. */
function isClientComponent(source: string): boolean {
  const head = source.slice(0, 200)
  return /^\s*['"]use client['"]/m.test(head)
}

type Finding = { file: string; line: number; text: string; hint: string }

const findings: Finding[] = []

for (const root of ROOTS) {
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf8')
    if (isClientComponent(source)) continue

    // The helpers themselves are where the host clock is legitimately read.
    if (file.replace(/\\/g, '/') === 'lib/utils/dates.ts') continue

    source.split('\n').forEach((text, index) => {
      if (text.includes(SUPPRESSION)) return
      if (IGNORED_LINE.test(text)) return

      for (const { pattern, hint } of BANNED) {
        if (pattern.test(text)) {
          findings.push({ file, line: index + 1, text: text.trim(), hint })
          return
        }
      }
    })
  }
}

if (findings.length > 0) {
  console.error(
    `\nFound ${findings.length} host-clock read${findings.length > 1 ? 's' : ''} in server code.\n` +
      `The arena is UTC+5:30 and the server is UTC, so these disagree about the\n` +
      `date between midnight and 05:30 IST - the arena's busiest hours.\n`
  )
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}`)
    console.error(`    ${f.text}`)
    console.error(`    use: ${f.hint}\n`)
  }
  console.error(`If a use really is host-relative, mark the line \`${SUPPRESSION}\`.\n`)
  process.exit(1)
}

console.log('No host-clock date reads in server code.')
