import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Both key formats Supabase issues, and nothing about their length.
 *
 * This used to demand at least 100 characters, which was really a JWT test
 * wearing a length check. Supabase now issues `sb_secret_...` keys that are a
 * third of that, so a new project's perfectly valid key tripped a startup error
 * telling the reader to expect "a JWT token with length ~160 characters" - and
 * the client was then built with it anyway, so the real failure arrived later
 * and somewhere else.
 *
 * What actually matters is that the value is a secret key rather than the
 * publishable one, which is a mistake worth catching loudly: `sb_publishable_`
 * and the anon JWT both parse, connect, and then quietly fail every RLS-guarded
 * read as though the data were missing.
 */
const KEY_SHAPES = [
  { prefix: 'sb_secret_', label: 'secret key' },
  { prefix: 'eyJ', label: 'service_role JWT' },
] as const

const keyShape = KEY_SHAPES.find((shape) => supabaseServiceKey?.startsWith(shape.prefix))

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set.')
} else if (supabaseServiceKey.startsWith('sb_publishable_')) {
  // Named explicitly because the two sit next to each other on the dashboard
  // and the wrong one fails as "no rows", never as "wrong key".
  console.error(
    '❌ SUPABASE_SERVICE_ROLE_KEY holds the PUBLISHABLE key. ' +
      'Server code needs the secret key (Settings > API Keys > Secret keys).'
  )
} else if (!keyShape) {
  console.error(
    '❌ SUPABASE_SERVICE_ROLE_KEY does not look like a Supabase key ' +
      '(expected sb_secret_... or a service_role JWT beginning eyJ).'
  )
} else {
  console.log(`✅ SUPABASE_SERVICE_ROLE_KEY loaded (${keyShape.label})`)
}

// Server-side client with service role key (full access)
// Use only in Server Actions and API routes
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
