/**
 * Fails if any menu item is being offered with nothing left to sell.
 *
 * `menu_items` holds the same fact twice - `quantity`, what is on the shelf, and
 * `status`, which is what most queries actually filter on. The customer home
 * page and the in-booking menu both select on `status = 'available'` alone, so a
 * row at zero stock still marked available is an item customers can order and
 * pay for and nobody can serve.
 *
 * Migration 20260817000000 puts a trigger on the table to hold the two in step.
 * This is the check that it is really there and really working: run it after
 * applying the migration, and any time the menu looks wrong.
 *
 * Read-only. It changes nothing, so it is safe against production.
 *
 * Run: npm run check:stock
 */

import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

if (!existsSync('.env.local')) {
  console.error('\n  .env.local is missing. Run `npm run check:env` first.\n')
  process.exit(1)
}

// Next loads .env.local automatically; this script does not, so read it here.
// The `\s*` before the anchor is load-bearing on Windows - see check-env.ts.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (!match) continue
  const [, key, raw] = match
  if (process.env[key] === undefined) {
    process.env[key] = raw.trim().replace(/^["']|["']$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('\n  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type MenuItem = { id: string; name: string; quantity: number; status: string }

async function main() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, quantity, status')
    .order('name', { ascending: true })

  if (error) {
    console.error(`\n  Could not read menu_items: ${error.message}\n`)
    process.exit(1)
  }

  const items = (data ?? []) as MenuItem[]

  // The failure: sellable on paper, empty in fact.
  const offeredButEmpty = items.filter(
    (item) => item.quantity <= 0 && item.status === 'available'
  )

  /**
   * Not a failure. Staff mark a well-stocked item out of stock for reasons the
   * count cannot see - the kitchen is out of buns, the machine is broken - and
   * the toggle in the admin menu grid exists for exactly that. Listed only so a
   * puzzling gap in the menu has somewhere to be explained.
   */
  const heldBackByHand = items.filter(
    (item) => item.quantity > 0 && item.status === 'out_of_stock'
  )

  console.log(`\n  ${items.length} menu item(s) checked.`)

  if (heldBackByHand.length > 0) {
    console.log('\n  Off the menu by hand, with stock on the shelf:')
    for (const item of heldBackByHand) {
      console.log(`    ${item.name} - ${item.quantity} in stock, marked out_of_stock`)
    }
  }

  if (offeredButEmpty.length === 0) {
    console.log('\n  No item is being offered with zero stock.\n')
    return
  }

  console.error('\n  Offered to customers with nothing left to sell:')
  for (const item of offeredButEmpty) {
    console.error(`    ${item.name} - quantity ${item.quantity}, status ${item.status}`)
  }
  console.error(
    '\n  The trigger from migration 20260817000000 should make this impossible.' +
      '\n  Apply it if it has not been applied:' +
      '\n      npx supabase migration up --local     (local database)' +
      '\n      npx supabase db push                  (the linked remote)' +
      '\n  If it has been applied, something is writing menu_items in a way that' +
      '\n  bypasses it - which is worth finding, because the rows above are orders' +
      '\n  the arena cannot fulfil.\n'
  )
  process.exit(1)
}

main().catch((err) => {
  console.error('Failed:', err?.message ?? err)
  process.exit(1)
})
