# Admin Access Guide

## 🔐 Admin Login Credentials

Yes! Your admin user is seeded and ready to use.

---

## Default Admin Credentials

```
Email: admin@breakpointarena.com
Password: <ADMIN_PASSWORD>
```

**⚠️ IMPORTANT: Change this password in production!**

---

## How to Seed the Admin User

If the admin user doesn't exist yet, run:

```bash
npm run seed:admin
```

Or directly:

```bash
npx tsx scripts/seed-admin.ts
```

This will:
- ✅ Create the admin user in Supabase Auth
- ✅ Set email as confirmed
- ✅ Add admin role metadata
- ✅ Skip if user already exists

---

## Admin Pages Available

Once logged in, you can access:

### 1. **Happy Hours Management**
```
http://localhost:3000/admin/happy-hours
```
- Create, edit, delete happy hour rules
- View dashboard statistics
- Manage rule status (LIVE/PAUSED/SCHEDULED)

### 2. **Bookings Management**
```
http://localhost:3000/admin/bookings
```
- View all bookings
- Filter and search
- View booking details

### 3. **Reports Dashboard**
```
http://localhost:3000/admin/reports
```
- Revenue reports
- Booking analytics
- Performance metrics

### 4. **Other Admin Pages** (if available)
Check the sidebar for additional admin features like:
- Customers management
- Devices management
- Menu/Food management
- Subscription plans
- Promo codes
- Expenses tracking

---

## Login Flow

1. **Navigate to admin login page**:
   ```
   http://localhost:3000/admin/login
   ```
   *(Or whatever your admin login route is)*

2. **Enter credentials**:
   - Email: `admin@breakpointarena.com`
   - Password: `<ADMIN_PASSWORD>`

3. **Access admin dashboard**:
   - You should be redirected to the admin panel
   - Sidebar will show all available admin pages

---

## How to Check if Admin User Exists

### Method 1: Run the seed script
```bash
npm run seed:admin
```

It will output:
- `✅ Admin user already exists` (if it exists)
- `✅ Admin user created successfully!` (if it was created)

### Method 2: Check Supabase Dashboard
1. Go to your Supabase project
2. Navigate to **Authentication → Users**
3. Look for `admin@breakpointarena.com`

### Method 3: Check via SQL
```sql
-- In Supabase SQL Editor or psql
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email = 'admin@breakpointarena.com';
```

---

## Troubleshooting

### "User not found" or "Invalid credentials"

**Solution 1: Seed the admin user**
```bash
npm run seed:admin
```

**Solution 2: Reset the password**
```bash
# Use Supabase dashboard to reset password
# Or recreate the user by deleting and re-seeding
```

### "Unauthorized" after login

**Check admin metadata:**
```sql
SELECT raw_user_meta_data, raw_app_meta_data
FROM auth.users
WHERE email = 'admin@breakpointarena.com';
```

Should contain:
```json
{
  "role": "admin",
  "full_name": "Arena Admin"
}
```

### "Cannot access admin pages"

Check your middleware or auth logic to ensure:
1. Admin routes are protected
2. User role is checked correctly
3. Session is valid (12-hour timeout configured)

---

## Session Configuration

The admin session is configured for **12 hours** (43,200 seconds).

This is set in `supabase/config.toml`:
```toml
[auth]
jwt_expiry = 43200  # 12 hours
```

After 12 hours, the admin will need to log in again.

---

## Security Best Practices

### For Development:
✅ Current credentials are fine
✅ Seed script is convenient

### For Production:
⚠️ **MUST CHANGE**:
1. Change the default password immediately
2. Use a strong, unique password
3. Enable 2FA if supported
4. Restrict admin access by IP if possible
5. Monitor admin activity logs

To change password in production:
1. Log in with default credentials
2. Go to profile/settings
3. Change password
4. Update your password manager
5. **Delete the seed script** or update it with placeholder values

---

## Creating Additional Admin Users

If you need more admin users, you can:

### Method 1: Via Supabase Dashboard
1. Go to **Authentication → Users**
2. Click "Add User"
3. Enter email and password
4. Set email confirmed: Yes
5. Add metadata:
   ```json
   {
     "role": "admin",
     "full_name": "Admin Name"
   }
   ```

### Method 2: Via Script (duplicate seed-admin.ts)
Create a new script based on `scripts/seed-admin.ts`:
```typescript
const email = 'manager@breakpointarena.com'
const password = 'SecurePassword123!'

// ... rest of the seed logic
```

### Method 3: Via Admin Panel (if you build it)
Create an admin user management page where admins can:
- Create new admin accounts
- Manage roles and permissions
- Deactivate users

---

## Testing Happy Hours as Admin

Now that you have admin access:

1. **Log in** with admin credentials
2. **Navigate to** `/admin/happy-hours`
3. **Create a test rule**:
   - Name: "Test Discount"
   - Discount: 20%
   - Devices: "All"
   - Schedule: "Everyday"
   - Time Range: Current time ± 2 hours (e.g., if it's 2 PM, use "12:00 PM - 04:00 PM")
   - Status: LIVE
4. **Open customer booking** in another tab/window
5. **Select a slot** during the happy hour time
6. **Verify** discount applies!

---

## Admin Dashboard Features

Your admin panel should have:

✅ **Happy Hours Management** (newly implemented)
- Create/Edit/Delete rules
- Real-time status management
- Dashboard statistics

✅ **Bookings Management**
- View all bookings
- Filter by date, device, customer
- See booking details including discounts

✅ **Reports & Analytics**
- Revenue tracking
- Booking trends
- Discount impact analysis

✅ **Customer Management**
- View customer list
- Manage subscriptions
- Customer history

✅ **Inventory Management**
- Devices
- Food menu
- Stock tracking

✅ **Financial Management**
- Expenses tracking
- Profit/loss reports
- Discount analysis

---

## Quick Reference

```bash
# Seed admin user
npm run seed:admin

# Start dev server
npm run dev

# Admin login
http://localhost:3000/admin/login

# Admin credentials
Email: admin@breakpointarena.com
Password: <ADMIN_PASSWORD>

# Happy Hours admin page
http://localhost:3000/admin/happy-hours
```

---

## 🎉 You're Ready!

Your admin user is seeded and ready to use. Log in and start managing your happy hours! 

**Remember to change the default password in production!** 🔒
