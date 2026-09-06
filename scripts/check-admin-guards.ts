/**
 * Fails if any admin server action is missing its authorization guard.
 *
 * The middleware deliberately skips server-action requests (see proxy.ts), so
 * requireStaff()/requireAdmin() inside the action is the only thing deciding
 * who may run it. That makes a forgotten guard a silent hole rather than a
 * caught one - this is the check that catches it instead.
 *
 * Run: npm run check:guards
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ADMIN_DIR = 'app/(admin)/admin'
const GUARDS = ['requireStaff', 'requireAdmin']
/** Lines to look ahead from the signature - enough for a long parameter list. */
const LOOKAHEAD = 35

function findActionFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...findActionFiles(full))
    else if (entry === 'actions.ts') out.push(full)
  }
  return out
}

const unguarded: string[] = []
let total = 0

for (const file of findActionFiles(ADMIN_DIR)) {
  const lines = readFileSync(file, 'utf8').split('\n')

  lines.forEach((line, i) => {
    const match = line.match(/^export async function (\w+)/)
    if (!match) return

    total++
    const window = lines.slice(i, i + LOOKAHEAD).join('\n')
    if (!GUARDS.some((g) => window.includes(g))) {
      unguarded.push(`${file} :: ${match[1]}`)
    }
  })
}

if (unguarded.length > 0) {
  console.error(`\n${unguarded.length} admin server action(s) missing an authorization guard:\n`)
  unguarded.forEach((u) => console.error(`  ${u}`))
  console.error(
    `\nEvery admin action must call requireStaff() (or requireAdmin() for` +
      ` owner-level data) as its first statement.\n` +
      `The middleware does not gate server actions - see proxy.ts.\n`
  )
  process.exit(1)
}

console.log(`All ${total} admin server actions are guarded.`)
