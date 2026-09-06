# 👥 Admin & Staff Login Credentials

## 🔐 Admin Login Credentials

### Admin Account (Full Access)
```
Email: admin@breakpoint.com
Password: <ADMIN_PASSWORD>
Role: Admin (Owner)
Access: Full access to all features including Reports
```

---

## 👨‍💼 Staff Login Credentials

### Staff Account 1 (Limited Access)
```
Email: staff@breakpoint.com
Password: <STAFF_PASSWORD>
Role: Staff
Access: Limited - Cannot access Reports page
```

### Staff Account 2 (Limited Access)
```
Email: staff2@breakpoint.com  
Password: <STAFF_PASSWORD>
Role: Staff
Access: Limited - Cannot access Reports page
```

---

## 🎯 Access Levels

### Admin (Owner/Manager):
✅ Dashboard - Full access
✅ Bookings - Full access (create, edit, check-in, checkout, payments)
✅ Customers - Full access
✅ Devices - Full access
✅ Food Menu - Full access
✅ **Reports - FULL ACCESS** 📊
✅ Promo Codes - Full access
✅ Happy Hours - Full access
✅ Subscriptions - Full access
✅ Expenses - Full access
✅ All financial data

### Staff:
✅ Dashboard - View only
✅ Bookings - Full access (create, edit, check-in, checkout, payments)
✅ Customers - Full access
✅ Devices - View only
✅ Food Menu - View only
❌ **Reports - NO ACCESS** 🚫
❌ Promo Codes - No access
❌ Happy Hours - No access
❌ Subscriptions - No access
❌ Expenses - No access
❌ Financial data restricted

---

## 🔄 How to Create New Staff Users

### Option 1: Using Admin Seeding Script
```bash
npm run seed:staff
```

### Option 2: Manual SQL (Supabase Dashboard)
```sql
-- Create a new staff user
INSERT INTO admin_users (username, password_hash, full_name, role, is_active)
VALUES (
  'newstaff@breakpoint.com',
  crypt('NewPassword@123', gen_salt('bf', 10)),
  'New Staff Name',
  'staff',
  true
);
```

### Option 3: Via Admin Panel (Future Enhancement)
Currently not available via UI. Use SQL or seeding script.

---

## 🛡️ Security Notes

### Password Requirements:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character

### Default Passwords:
⚠️ **IMPORTANT**: Change default passwords after first login!

### Password Hashing:
- Passwords are hashed using bcrypt with salt rounds = 10
- Never stored in plain text
- Secure against rainbow table attacks

---

## 📝 Login URL

**Admin Panel**: `https://your-domain.com/admin/login`

---

## 🔧 Testing Accounts

For testing purposes, use these credentials to verify:

1. **Admin Access**:
   - Login as: admin@breakpoint.com
   - Go to: Admin → Reports
   - Expected: ✅ Full access to all reports

2. **Staff Access**:
   - Login as: staff@breakpoint.com
   - Go to: Admin → Reports
   - Expected: ❌ "Access Denied" message

---

## 🔑 Password Reset (Emergency)

If you forget a password, reset via SQL:

```sql
-- Reset admin password
UPDATE admin_users
SET password_hash = crypt('NewPassword@123', gen_salt('bf', 10))
WHERE username = 'admin@breakpoint.com';

-- Reset staff password
UPDATE admin_users
SET password_hash = crypt('NewPassword@123', gen_salt('bf', 10))
WHERE username = 'staff@breakpoint.com';
```

---

## ⚠️ IMPORTANT SECURITY REMINDERS

1. **Change Default Passwords**: Always change default passwords in production
2. **Use Strong Passwords**: Follow password requirements strictly
3. **Limit Staff Access**: Only give staff role to trusted employees
4. **Monitor Login Activity**: Check `last_login_at` column regularly
5. **Deactivate Unused Accounts**: Set `is_active = false` for former employees

---

**Last Updated**: 2026-07-13  
**Status**: Active  
**Security Level**: Production Ready ✅
