/**
 * Seed Staff User Script
 *
 * Creates staff user in Supabase Auth
 * Email: staff@breakpointarena.com
 * Password: taken from SEED_STAFF_PASSWORD (required)
 *
 * Staff has access to all pages EXCEPT Reports
 *
 * Run: npx tsx scripts/seed-staff.ts
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

async function seedStaff() {
  console.log('🌱 Seeding staff user...')

  const email = 'staff@breakpointarena.com'
  const password = process.env.SEED_STAFF_PASSWORD

  if (!password) {
    console.error('SEED_STAFF_PASSWORD is not set. Choose a password rather than seeding a known one.')
    process.exit(1)
  }

  try {
    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const userExists = existingUsers?.users.some(user => user.email === email)

    if (userExists) {
      console.log('✅ Staff user already exists:', email)
      return
    }

    // Create staff user
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Arena Staff',
        role: 'staff',
      },
      app_metadata: {
        role: 'staff',
        provider: 'email',
      },
    })

    if (error) {
      console.error('❌ Error creating staff user:', error.message)
      process.exit(1)
    }

    console.log('✅ Staff user created successfully!')
    console.log('📧 Email:', email)
    console.log('🔑 Password:', password)
    console.log('👤 User ID:', data.user?.id)
    console.log('🚫 Restricted: Cannot access Reports page')
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

seedStaff()
