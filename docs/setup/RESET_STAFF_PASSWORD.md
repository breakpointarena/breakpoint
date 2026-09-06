# 🔑 Reset Staff Password - Quick Guide

## Option 1: Supabase Dashboard (EASIEST)

1. Go to: **Supabase Dashboard** → **Authentication** → **Users**

2. Find user: `staff@breakpointarena.com`

3. Click the **"..."** menu → **Reset Password**

4. Set new password: `<STAFF_PASSWORD>`

5. Save and try logging in

---

## Option 2: SQL Editor (if user doesn't exist)

Go to: **Supabase Dashboard** → **SQL Editor** → **New Query**

Paste and run this:

```sql
-- Check if staff user exists
SELECT id, email, raw_user_meta_data 
FROM auth.users 
WHERE email = 'staff@breakpointarena.com';

-- If user exists, you'll see their ID
-- Then use Dashboard UI to reset password

-- If user DOESN'T exist, you need to create it via:
-- Dashboard → Authentication → Users → Invite User
-- Email: staff@breakpointarena.com
-- Password: <STAFF_PASSWORD>
-- User Metadata: {"role": "staff", "full_name": "Arena Staff"}
```

---

## Option 3: Check Admin User (Works)

Try logging in with Admin first to verify the system works:

```
Email: admin@breakpointarena.com
Password: <ADMIN_PASSWORD>
```

If admin works but staff doesn't, then staff user might have wrong password or doesn't exist.

---

## 🔍 Troubleshooting

### If you get "Invalid credentials":

1. **Check if user exists**:
   - Supabase Dashboard → Authentication → Users
   - Search for: `staff@breakpointarena.com`

2. **If user doesn't exist**:
   - Click "Invite User"
   - Email: `staff@breakpointarena.com`
   - Auto-generate password OR set: `<STAFF_PASSWORD>`
   - Click "Invite user"

3. **If user exists but password wrong**:
   - Click on the user
   - Click "Send password recovery"
   - OR use "Reset Password" option

4. **Check user metadata**:
   - Make sure user has: `{"role": "staff"}`
   - In raw_user_meta_data column

---

## 📝 Current Credentials

### Admin (Full Access):
```
Email: admin@breakpointarena.com
Password: <ADMIN_PASSWORD>
```

### Staff (Limited Access):
```
Email: staff@breakpointarena.com
Password: <STAFF_PASSWORD>
```

---

## ⚠️ Note About Local vs Production

Your `.env.local` file shows:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

This is **LOCAL Supabase**, not production!

For **PRODUCTION**:
1. Update `.env.local` to production URL
2. OR use Supabase Dashboard directly for production

---

## 🚀 Quick Fix

**EASIEST WAY**: Use Supabase Dashboard UI

1. Open Supabase Dashboard
2. Go to Authentication → Users
3. If `staff@breakpointarena.com` exists → Reset password
4. If doesn't exist → Invite user with those credentials
5. Done!

No SQL, no scripts needed. Just use the UI! 👍
