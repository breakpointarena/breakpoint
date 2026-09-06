# 🔐 Admin Credentials & Setup

## Admin Login

**Email**: `admin@breakpointarena.com`  
**Password**: `<ADMIN_PASSWORD>`

**Login URL**: http://localhost:3000/admin/login

---

## ⚠️ Important: After Database Reset

When you reset the database (using `npx supabase db reset`), the admin user is **NOT automatically recreated**. You need to run the seed script:

### Create Admin User:

```bash
npm run seed:admin
```

Or:

```bash
npx tsx scripts/seed-admin.ts
```

**This script**:
- ✅ Creates admin user in Supabase Auth
- ✅ Email confirmed automatically
- ✅ Sets user metadata (full_name: "Arena Admin", role: "admin")
- ✅ Checks if user already exists (won't create duplicates)

---

## Why This Happens

**Database Reset Flow**:
1. `npx supabase db reset` → Drops all tables including `auth.users`
2. Migrations run → Tables recreated
3. `supabase/seed.sql` runs → Seeds data (devices, food, etc.)
4. **BUT** auth.users is NOT seeded by seed.sql

**Why?**
- Supabase Auth has special password hashing
- Direct SQL INSERT into `auth.users` doesn't work reliably
- Must use Supabase Admin API (`auth.admin.createUser()`)

---

## Automatic Seeding (Recommended)

Add this to your workflow after every database reset:

```bash
npx supabase db reset && npm run seed:admin
```

Or create an alias in `package.json`:

```json
{
  "scripts": {
    "db:reset": "npx supabase db reset && npm run seed:admin"
  }
}
```

Then use:

```bash
npm run db:reset
```

---

## Verify Admin User Exists

```bash
npx supabase db query "SELECT email, email_confirmed_at, created_at FROM auth.users"
```

Should return:
```
email: admin@breakpointarena.com
email_confirmed_at: <timestamp>
created_at: <timestamp>
```

---

## Troubleshooting

### "Invalid login credentials" after logout

**Problem**: Admin user doesn't exist in database

**Solution**:
```bash
npm run seed:admin
```

### "User already exists" error

**This is fine!** The script detected the user and skipped creation.

### Can't remember password

**Password is**: `<ADMIN_PASSWORD>`

To change it:
1. Log into Supabase Studio: http://localhost:54323
2. Go to Authentication → Users
3. Click on admin user → Reset password

---

## Session Timeout

Admin sessions last **12 hours** (43200 seconds).

Configured in `supabase/config.toml`:
```toml
[auth]
jwt_expiry = 43200  # 12 hours
```

---

## Quick Reference

| What | Command |
|------|---------|
| **Create admin user** | `npm run seed:admin` |
| **Check if admin exists** | `npx supabase db query "SELECT email FROM auth.users"` |
| **Reset DB + create admin** | `npx supabase db reset && npm run seed:admin` |
| **Open Supabase Studio** | http://localhost:54323 |
| **Admin login page** | http://localhost:3000/admin/login |

---

## 🎯 Remember

**After every `npx supabase db reset`**:
```bash
npm run seed:admin
```

Then you can log in with:
- Email: `admin@breakpointarena.com`
- Password: `<ADMIN_PASSWORD>`

✅ Problem solved!
