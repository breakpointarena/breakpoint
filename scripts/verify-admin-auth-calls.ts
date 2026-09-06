/**
 * How many times the admin shell asks the auth server who is signed in.
 *
 *   npm run test:admin-auth
 *
 * `supabase.auth.getUser()` is a round trip to the auth server on every call -
 * it validates the token there rather than decoding whatever is in storage,
 * which is the whole reason to prefer it over `getSession()`. Three components
 * want the answer in the same mount tick: the sidebar filters its nav by role,
 * the topbar shows the name and the role badge, and the reports page guards on
 * it. That opened the admin shell with three identical `/auth/v1/user` requests
 * on every navigation, and the client noticed.
 *
 * This drives the real module with the network call stubbed out and counts it.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'fs'

// `lib/supabase/client.ts` builds its client at module load and needs these, so
// they have to be in place before the dynamic import below.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (match) process.env[match[1]] ||= match[2].replace(/^["']|["']$/g, '')
}

let failures = 0

/**
 * Awaits `run` rather than calling it and moving on. Half these assertions are
 * async, and a sync runner would print PASS before they had a chance to fail -
 * the failure then arriving as an unhandled rejection with the exit code
 * already set to zero.
 */
async function check(name: string, run: () => void | Promise<void>) {
  try {
    await run()
    console.log(`  PASS  ${name}`)
  } catch (err: any) {
    failures++
    console.error(`  FAIL  ${name}\n        ${err.message}`)
  }
}

async function main() {
  const { supabase } = await import('../lib/supabase/client')
  const { getAuthUser, getUserRole, roleFromUser } = await import('../lib/auth/roles')

  let calls = 0
  const stubUser = {
    id: 'u1',
    email: 'admin@example.com',
    app_metadata: { role: 'admin' },
    user_metadata: {},
  }

  // Stand in for the network round trip, with a tick of latency so concurrent
  // callers genuinely overlap the way three mount effects do.
  ;(supabase.auth as any).getUser = async () => {
    calls++
    await new Promise((resolve) => setTimeout(resolve, 10))
    return { data: { user: stubUser }, error: null }
  }

  console.log('\nThe admin shell mounting')

  calls = 0
  // Exactly what the shell does: sidebar wants the role, topbar wants the user,
  // the reports guard wants the role - all in the same tick.
  const [sidebarRole, topbarUser, reportsRole] = await Promise.all([
    getUserRole(),
    getAuthUser(),
    getUserRole(),
  ])

  await check('three simultaneous callers make one request', () => {
    assert.equal(calls, 1, `expected 1 auth call, got ${calls}`)
  })

  await check('and they all get the right answer', () => {
    assert.equal(sidebarRole, 'admin')
    assert.equal(reportsRole, 'admin')
    assert.equal(topbarUser?.email, 'admin@example.com')
  })

  await check('the topbar derives the role without a second round trip', () => {
    assert.equal(roleFromUser(topbarUser), 'admin')
  })

  console.log('\nNothing is cached between bursts')

  calls = 0
  await getAuthUser()
  await getAuthUser()

  await check('a later caller re-checks rather than trusting a stale answer', () => {
    // Sequential, so the first has settled and released the slot. Two calls is
    // the point: an expiry or a sign-out must be noticed as promptly as before.
    assert.equal(calls, 2, `expected 2 auth calls, got ${calls}`)
  })

  console.log('\nA failing auth server')

  ;(supabase.auth as any).getUser = async () => {
    calls++
    return { data: { user: null }, error: new Error('auth unreachable') }
  }

  await check('resolves to no user rather than throwing into a mount effect', async () => {
    assert.equal(await getAuthUser(), null)
    assert.equal(await getUserRole(), null)
  })

  ;(supabase.auth as any).getUser = async () => {
    throw new Error('network down')
  }

  await check('a thrown request is caught, not left unhandled', async () => {
    assert.equal(await getAuthUser(), null)
  })

  console.log(
    failures === 0
      ? '\nAll admin auth-call checks passed.\n'
      : `\n${failures} check(s) failed.\n`
  )

  process.exit(failures === 0 ? 0 : 1)
}

void main()
