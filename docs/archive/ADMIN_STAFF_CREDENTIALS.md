# Admin & Staff Login Credentials

## Quick Reference

### 🔐 Admin Login (Full Access)
```
Email:    admin@breakpointarena.com
Password: <ADMIN_PASSWORD>
Role:     admin
Access:   ✅ All pages including Reports
```

**Setup Command:**
```bash
npm run seed:admin
```

---

### 👤 Staff Login (Limited Access)
```
Email:    staff@breakpointarena.com
Password: <STAFF_PASSWORD>
Role:     staff
Access:   ✅ All pages EXCEPT Reports
```

**Setup Command:**
```bash
npm run seed:staff
```

---

## Access Comparison

| Feature | Admin | Staff |
|---------|-------|-------|
| Dashboard | ✅ | ✅ |
| Bookings | ✅ | ✅ |
| Timeline | ✅ | ✅ |
| Devices | ✅ | ✅ |
| Food Menu | ✅ | ✅ |
| Customers | ✅ | ✅ |
| Subscriptions | ✅ | ✅ |
| Promo Codes | ✅ | ✅ |
| Happy Hours | ✅ | ✅ |
| **Reports** | ✅ | ❌ |

---

## First-Time Setup

1. **Start Supabase** (if not already running):
   ```bash
   npx supabase start
   ```

2. **Create Admin User**:
   ```bash
   npm run seed:admin
   ```

3. **Create Staff User**:
   ```bash
   npm run seed:staff
   ```

4. **Login**:
   - Navigate to: http://localhost:3000/admin/login
   - Use the appropriate credentials above

---

## Security Notes

⚠️ **IMPORTANT:** Change these default passwords in production!

- Admin password should be strong and unique
- Staff passwords should be individual per employee
- Store credentials securely (password manager recommended)

---

## Testing

To verify the implementation works:

1. Login as **Admin** → Navigate to Reports → ✅ Should work
2. Login as **Staff** → Try to access Reports → ❌ Should see "Access Denied"
3. Check sidebar as **Staff** → Reports menu item should be hidden

---

**Last Updated:** 2026-07-12
