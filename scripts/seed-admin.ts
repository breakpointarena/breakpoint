/**
 * Seed Admin User Script
 *
 * Creates admin user in Supabase Auth
 * Email: admin@breakpointarena.com
 * Password: taken from SEED_ADMIN_PASSWORD (required)
 *
 * Run: npx tsx scripts/seed-admin.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n' +
      'Refusing to run against an unknown project.'
  )
  process.exit(1)
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function seedAdmin() {
  console.log('🌱 Seeding admin user...')

  const email = 'admin@breakpointarena.com'
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!password) {
    console.error('SEED_ADMIN_PASSWORD is not set. Choose a password rather than seeding a known one.')
    process.exit(1)
  }

  try {
    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const userExists = existingUsers?.users.some(user => user.email === email)

    if (userExists) {
      console.log('✅ Admin user already exists:', email)
      return
    }

    // Create admin user with full access (including Reports)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Arena Admin',
        role: 'admin',
      },
      app_metadata: {
        role: 'admin',
        provider: 'email',
      },
    })

    if (error) {
      console.error('❌ Error creating admin user:', error.message)
      process.exit(1)
    }

    console.log('✅ Admin user created successfully!')
    console.log('📧 Email:', email)
    console.log('🔑 Password:', password)
    console.log('👤 User ID:', data.user?.id)
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

seedAdmin()
