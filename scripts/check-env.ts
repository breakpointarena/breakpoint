/**
 * Checks a local environment can actually run the app, and says what to do
 * about anything that cannot.
 *
 * Written because the failures here are all silent or cryptic. A missing
 * `OTP_HASH_SECRET` throws from inside the OTP service with no hint that it
 * came from a config file; an unapplied migration surfaces as a PostgREST error
 * about a missing relation; blank Razorpay keys look like a broken checkout
 * rather than a deliberate refusal. None of that is guessable by someone setting
 * the project up for the first time.
 *
 * Run: npm run check:env
 */

import { readFileSync, existsSync } from 'fs'

const LOCAL_PLACEHOLDER = 'local-development-only-do-not-use-in-production-0000'

type Check = { ok: boolean; label: string; fix?: string }
const checks: Check[] = []
const notes: string[] = []

function required(name: string, fix: string, minLength = 1) {
  const value = process.env[name]
  const ok = typeof value === 'string' && value.trim().length >= minLength
  checks.push({ ok, label: `${name} is set${minLength > 1 ? ` (>= ${minLength} chars)` : ''}`, fix })
}

// --- .env.local exists at all ----------------------------------------------
if (!existsSync('.env.local')) {
  console.error('\n  .env.local is missing.\n')
  console.error('  Create it from the starter, which is already filled in for local work:\n')
  console.error('      cp .env.local.starter .env.local\n')
  process.exit(1)
}

// Next loads .env.local automatically; this script does not, so read it here.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (!match) continue
  const [, key, raw] = match
  if (process.env[key] === undefined) {
    process.env[key] = raw.trim().replace(/^["']|["']$/g, '')
  }
}

// --- Supabase ---------------------------------------------------------------
required('NEXT_PUBLIC_SUPABASE_URL', 'Run `npx supabase start` and copy API_URL from `npx supabase status`.')
required('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Copy ANON_KEY from `npx supabase status`.')
required('SUPABASE_SERVICE_ROLE_KEY', 'Copy SERVICE_ROLE_KEY from `npx supabase status`.')

// --- OTP login --------------------------------------------------------------
const hashSecret = process.env.OTP_HASH_SECRET || process.env.SESSION_SECRET || ''
checks.push({
  ok: hashSecret.length >= 32,
  label: 'OTP_HASH_SECRET is set and >= 32 characters',
  fix: 'Without it, sending an OTP throws. The starter file has a working local value; for anything deployed, generate one with `openssl rand -hex 32`.',
})

const testMode = process.env.MSG91_TEST_MODE === 'true'
const hasAuthKey = Boolean(process.env.MSG91_AUTH_KEY?.trim())
checks.push({
  ok: testMode || hasAuthKey,
  label: 'OTP delivery is configured (test mode, or a real MSG91 key)',
  fix: 'Set MSG91_TEST_MODE=true to print the OTP to this terminal instead of sending an SMS.',
})

if (testMode) {
  notes.push('MSG91_TEST_MODE is on: OTPs print to the terminal running `npm run dev`, and no SMS is sent.')
  if (hasAuthKey) {
    notes.push('MSG91_AUTH_KEY is set but ignored while test mode is on.')
  }
} else {
  notes.push('MSG91_TEST_MODE is OFF: sending an OTP will spend real credits.')
  const allowlist = (process.env.MSG91_LIVE_SMS_NUMBERS || '').trim()
  notes.push(
    allowlist
      ? `Live SMS is restricted to: ${allowlist}`
      : 'No allowlist set, so EVERY number typed into the form gets a real SMS.'
  )
}

// --- Razorpay ---------------------------------------------------------------
const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim() || ''
const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || ''
const razorpayReady = /^rzp_(test|live)_/.test(keyId) && keySecret.length > 0 && !keySecret.startsWith('your-')

notes.push(
  razorpayReady
    ? `Razorpay is configured (${keyId.startsWith('rzp_live_') ? 'LIVE' : 'test'} keys).`
    : 'Razorpay is not configured. Login, food, subscriptions and Retrieve Booking all work; only paying at the end of a booking is blocked, which is deliberate.'
)

// --- Refuse the local placeholder outside local development -----------------
const usingPlaceholder = hashSecret === LOCAL_PLACEHOLDER
if (usingPlaceholder && process.env.NODE_ENV === 'production') {
  console.error('\n  REFUSING: the local development OTP_HASH_SECRET is in use with NODE_ENV=production.')
  console.error('  Generate a real one:  openssl rand -hex 32\n')
  process.exit(1)
}
if (usingPlaceholder) {
  notes.push('Using the shared local OTP secret. Fine here; never deploy it.')
}

// --- Report -----------------------------------------------------------------
const failed = checks.filter((c) => !c.ok)

console.log('')
for (const check of checks) {
  console.log(`  ${check.ok ? 'ok  ' : 'FAIL'}  ${check.label}`)
}

if (notes.length > 0) {
  console.log('')
  for (const note of notes) console.log(`  note  ${note}`)
}

if (failed.length > 0) {
  console.log('')
  for (const check of failed) {
    console.log(`  ${check.label}`)
    console.log(`      ${check.fix}\n`)
  }
  process.exit(1)
}

console.log('\n  Environment looks good. Next: npx supabase db reset, then npm run dev.\n')
