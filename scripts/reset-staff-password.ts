/**
 * Reset Staff User Password
 *
 * Resets the staff user's password to STAFF_NEW_PASSWORD from the environment.
 * Run: npx tsx scripts/reset-staff-password.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function resetStaffPassword() {
  console.log('🔑 Resetting staff password...')

  const email = 'staff@breakpointarena.com'
  const newPassword = process.env.STAFF_NEW_PASSWORD

  if (!newPassword) {
    console.error('STAFF_NEW_PASSWORD is not set. Choose a password rather than resetting to a known one.')
    process.exit(1)
  }

  try {
    // Get staff user
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      console.error('❌ Error listing users:', listError.message)
      process.exit(1)
    }

    const staffUser = users?.users.find(u => u.email === email)

    if (!staffUser) {
      console.error('❌ Staff user not found:', email)
      console.log('💡 Creating staff user instead...')

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: newPassword,
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
      console.log('🔑 Password:', newPassword)
      console.log('👤 User ID:', data.user?.id)
      return
    }

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      staffUser.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('❌ Error updating password:', updateError.message)
      process.exit(1)
    }

    console.log('✅ Staff password reset successfully!')
    console.log('📧 Email:', email)
    console.log('🔑 New Password:', newPassword)
    console.log('👤 User ID:', staffUser.id)
    console.log('')
    console.log('🔐 You can now login with these credentials')
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

resetStaffPassword()
