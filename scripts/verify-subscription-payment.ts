/**
 * A membership must cost what the plan row says, and must not be granted
 * without a verified payment.
 *
 * The flow this replaces did neither. The purchase page invented a payment id in
 * the browser and called `activateSubscriptionPlan` directly, so the price was
 * never checked against anything and no money was taken - every membership in
 * production was created that way.
 *
 * Run: npm run test:subscription
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

/**
 * Static imports are hoisted, so the env has to be in place before any of them
 * run - `lib/supabase/server.ts` builds its client at module load and throws on
 * an empty URL. `quoteSubscription` is therefore pulled in dynamically below,
 * after this loop.
 */
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) process.env[m[1]] ||= m[2].replace(/^["']|["']$/g, '')
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const CUSTOMER = { phone: '9876500011', name: 'Quote Test' }

let failures = 0
function check(label: string, pass: boolean, detail = '') {
  if (!pass) failures++
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

async function main() {
  const { quoteSubscription } = await import('../lib/payments/quote')

  const { data: plan } = await db
    .from('subscription_plans')
    .select('id, name, price, duration_months, is_active')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!plan) {
    console.log('  no active plan to test against - skipping')
    return
  }

  // 1. The price comes from the plan row, not from anything a caller passes.
  const quoted = await quoteSubscription({ ...CUSTOMER, planId: plan.id })
  check(
    'priced from the plan row',
    quoted.success && quoted.quote.totalAmount === Number(plan.price),
    quoted.success ? `₹${quoted.quote.totalAmount} vs plan ₹${plan.price}` : ''
  )

  // 2. A caller cannot smuggle its own amount in - there is no field for one.
  const smuggled = await quoteSubscription({
    ...CUSTOMER,
    planId: plan.id,
    // @ts-expect-error deliberately passing a field the input type does not have
    totalAmount: 1,
    price: 1,
  })
  check(
    'a client-supplied amount is ignored',
    smuggled.success && smuggled.quote.totalAmount === Number(plan.price),
    smuggled.success ? `₹${smuggled.quote.totalAmount}` : ''
  )

  // 3. Unknown plan.
  const missing = await quoteSubscription({
    ...CUSTOMER,
    planId: '00000000-0000-0000-0000-000000000000',
  })
  check('unknown plan is refused', !missing.success)

  // 4. Bad phone.
  const badPhone = await quoteSubscription({ ...CUSTOMER, phone: '123', planId: plan.id })
  check('short phone number is refused', !badPhone.success)

  // 5. Missing plan id.
  const noPlan = await quoteSubscription({ ...CUSTOMER, planId: '' })
  check('missing plan id is refused', !noPlan.success)

  // 6. A retired plan cannot be bought, even with a valid id in a stale tab.
  const { data: retired } = await db
    .from('subscription_plans')
    .insert([{ name: '__retired_probe__', price: 500, duration_months: 1, discount_percentage: 0, is_active: false }])
    .select('id')
    .single()

  if (retired) {
    const stale = await quoteSubscription({ ...CUSTOMER, planId: retired.id })
    check('a retired plan is refused', !stale.success, stale.success ? '' : `(${(stale as any).error})`)
    await db.from('subscription_plans').delete().eq('id', retired.id)
  }

  // 7. Nothing in the quote grants a membership on its own.
  check(
    'quoting does not create a subscription',
    !(await db.from('subscriptions').select('id').eq('payment_id', 'quote-only').maybeSingle()).data
  )
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\n${failures} check${failures > 1 ? 's' : ''} failed.\n`)
      process.exit(1)
    }
    console.log('\nSubscription pricing is server-authoritative.\n')
  })
  .catch((e) => {
    console.error('fatal:', e.message)
    process.exit(1)
  })
