/**
 * Clear OTP rate-limit state so a number can be tested again immediately.
 *
 * Testing the OTP flow runs into its own defences within minutes: three sends
 * per phone per hour, a sixty-second resend cooldown, and three verification
 * attempts per code. Those limits are worth having and worth testing - this
 * just resets them between runs rather than making them weaker.
 *
 * Run: npx tsx scripts/reset-otp-limit.ts 9876543210
 *      npx tsx scripts/reset-otp-limit.ts --all
 *
 * LOCAL ONLY. Refuses to run against a remote Supabase URL, because deleting
 * live sessions would sign real customers out mid-booking.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const isLocal = /127\.0\.0\.1|localhost/.test(supabaseUrl)

if (!isLocal) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local.\n  ${supabaseUrl}`)
  console.error('This script deletes OTP sessions and is intended for development only.')
  process.exit(1)
}

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const arg = process.argv[2]

  if (!arg) {
    console.error('Usage: npx tsx scripts/reset-otp-limit.ts <10-digit-phone> | --all')
    process.exit(1)
  }

  if (arg === '--all') {
    const { error, count } = await supabase
      .from('otp_sessions')
      .delete({ count: 'exact' })
      .not('id', 'is', null)

    if (error) throw error
    console.log(`Cleared ${count ?? 0} OTP session(s). Every number can send again.`)
    return
  }

  const phone = arg.replace(/\D/g, '').slice(-10)

  if (phone.length !== 10) {
    console.error(`"${arg}" is not a 10-digit phone number.`)
    process.exit(1)
  }

  const { error, count } = await supabase
    .from('otp_sessions')
    .delete({ count: 'exact' })
    .eq('phone', phone)

  if (error) throw error

  console.log(`Cleared ${count ?? 0} OTP session(s) for ${phone}.`)
  console.log('Rate limit, resend cooldown and attempt counter are all reset.')
  console.log('Note: this also drops any live session, so the next booking re-verifies.')
}

main().catch((err) => {
  console.error('Failed:', err.message ?? err)
  process.exit(1)
})
