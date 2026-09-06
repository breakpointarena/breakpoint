/**
 * The rule that keeps menu_items.status honest about stock.
 *
 * Unlike the other verify scripts, this one cannot be pure: the rule is a
 * trigger, and a trigger can only be asserted by writing to a table and reading
 * back what the database made of it. So it creates one throwaway menu item, puts
 * it through every transition the rule cares about, and deletes it again.
 *
 *   npm run test:stock
 *
 * LOCAL ONLY. Refuses to run against a remote Supabase URL - it writes to
 * menu_items, and the arena's real menu is not a fixture.
 */

import assert from 'node:assert/strict'
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error(`\n  Refusing to run: NEXT_PUBLIC_SUPABASE_URL is not local.\n    ${url}`)
  console.error('  This script writes to menu_items and is for development only.\n')
  process.exit(1)
}

if (!serviceKey) {
  console.error('\n  SUPABASE_SERVICE_ROLE_KEY is not set.\n')
  process.exit(1)
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let failures = 0

async function check(name: string, run: () => Promise<void>) {
  try {
    await run()
    console.log(`  PASS  ${name}`)
  } catch (err: any) {
    failures++
    console.error(`  FAIL  ${name}\n        ${err.message}`)
  }
}

/** The name is deliberately unmistakable, so a leaked row is obvious on the menu. */
const FIXTURE_NAME = '__stock-status-fixture__'

let itemId = ''

/**
 * Put the fixture into the state a check starts from.
 *
 * There is no way round the rule to do this - the trigger is on the table, so
 * every write here goes through it too. Which means a setup can be quietly
 * rewritten on its way in, and a check that looks like it is asserting something
 * ends up asserting nothing. So the state is read back and insisted on.
 */
async function given(quantity: number, status: string) {
  const { error } = await db.from('menu_items').update({ quantity, status }).eq('id', itemId)
  if (error) throw new Error(error.message)

  const row = await read()
  assert.deepEqual(
    { quantity: row.quantity, status: row.status },
    { quantity, status },
    `setup did not hold: asked for ${quantity}/${status}, got ${row.quantity}/${row.status}`
  )
}

async function read(): Promise<{ quantity: number; status: string }> {
  const { data, error } = await db
    .from('menu_items')
    .select('quantity, status')
    .eq('id', itemId)
    .single()
  if (error) throw new Error(error.message)
  return data as { quantity: number; status: string }
}

async function main() {
  // Any leftover from a run that died before its cleanup.
  await db.from('menu_items').delete().eq('name', FIXTURE_NAME)

  const { data: created, error: createError } = await db
    .from('menu_items')
    .insert({
      name: FIXTURE_NAME,
      category: 'Snacks',
      price: 1,
      quantity: 3,
      status: 'available',
      description: 'Temporary row created by npm run test:stock. Safe to delete.',
    })
    .select('id, quantity, status')
    .single()

  if (createError) {
    console.error(`\n  Could not create the fixture item: ${createError.message}\n`)
    process.exit(1)
  }

  itemId = (created as any).id

  try {
    console.log('\nSelling the last of something')

    await check('three sold out of three leaves it out of stock', async () => {
      await given(3, 'available')
      const { error } = await db.rpc('decrement_menu_item_quantity', {
        item_id: itemId,
        decrement_by: 3,
      })
      assert.equal(error, null)
      const row = await read()
      assert.equal(row.quantity, 0)
      assert.equal(row.status, 'out_of_stock')
    })

    await check('one sold out of three leaves it available', async () => {
      await given(3, 'available')
      await db.rpc('decrement_menu_item_quantity', { item_id: itemId, decrement_by: 1 })
      const row = await read()
      assert.equal(row.quantity, 2)
      assert.equal(row.status, 'available')
    })

    await check('an admin editing the count down to zero counts too', async () => {
      // The Edit Food form writes the row directly rather than through the RPC,
      // which is the reason the rule lives on the table and not in the function.
      await given(5, 'available')
      const { error } = await db
        .from('menu_items')
        .update({ quantity: 0, status: 'available' })
        .eq('id', itemId)
      assert.equal(error, null)
      assert.equal((await read()).status, 'out_of_stock')
    })

    await check('a new item created empty is never offered', async () => {
      const { data, error } = await db
        .from('menu_items')
        .insert({
          name: `${FIXTURE_NAME}-2`,
          category: 'Snacks',
          price: 1,
          quantity: 0,
          status: 'available',
        })
        .select('status')
        .single()
      assert.equal(error, null)
      assert.equal((data as any).status, 'out_of_stock')
      await db.from('menu_items').delete().eq('name', `${FIXTURE_NAME}-2`)
    })

    console.log('\nPutting it back')

    await check('restocking from empty puts it back on the menu', async () => {
      await given(0, 'out_of_stock')
      const { error } = await db.rpc('increment_menu_item_quantity', {
        item_id: itemId,
        increment_by: 10,
      })
      assert.equal(error, null)
      const row = await read()
      assert.equal(row.quantity, 10)
      assert.equal(row.status, 'available')
    })

    await check('and so does typing a new count into the form', async () => {
      await given(0, 'out_of_stock')
      await db.from('menu_items').update({ quantity: 12 }).eq('id', itemId)
      assert.equal((await read()).status, 'available')
    })

    console.log('\nDecisions the count has no business overruling')

    await check('an item held back by hand stays held back', async () => {
      // Marked out of stock with stock on the shelf - the kitchen is out of buns.
      // Editing anything else about the row must not put it back on the menu.
      await given(8, 'out_of_stock')
      await db.from('menu_items').update({ price: 99 }).eq('id', itemId)
      assert.equal((await read()).status, 'out_of_stock')
    })

    await check('restocking one held back by hand does not un-hold it', async () => {
      await given(8, 'out_of_stock')
      await db.rpc('increment_menu_item_quantity', { item_id: itemId, increment_by: 5 })
      const row = await read()
      assert.equal(row.quantity, 13)
      assert.equal(row.status, 'out_of_stock')
    })

    await check('a hidden item stays hidden when it empties', async () => {
      await given(4, 'hidden')
      await db.rpc('decrement_menu_item_quantity', { item_id: itemId, decrement_by: 4 })
      const row = await read()
      assert.equal(row.quantity, 0)
      assert.equal(row.status, 'hidden')
    })

    await check('and stays hidden when it is restocked', async () => {
      await given(0, 'hidden')
      await db.rpc('increment_menu_item_quantity', { item_id: itemId, increment_by: 6 })
      assert.equal((await read()).status, 'hidden')
    })
  } finally {
    await db.from('menu_items').delete().eq('name', FIXTURE_NAME)
    await db.from('menu_items').delete().eq('name', `${FIXTURE_NAME}-2`)
  }

  console.log(
    failures === 0
      ? '\nAll menu stock status checks passed.\n'
      : `\n${failures} check(s) failed.\n`
  )

  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (err) => {
  await db.from('menu_items').delete().eq('name', FIXTURE_NAME)
  console.error('Failed:', err?.message ?? err)
  process.exit(1)
})
