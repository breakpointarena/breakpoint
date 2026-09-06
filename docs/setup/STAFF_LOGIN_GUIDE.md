# Staff Login - Implementation Guide

## Overview

The Breakpoint Arena admin panel now supports **two roles**:
- **Admin**: Full access to all pages including Reports
- **Staff**: Access to all pages EXCEPT Reports

## Features

### 🔐 Role-Based Access Control
- Admin users can access all features including the Reports page
- Staff users are restricted from viewing Reports
- Both roles can manage bookings, devices, food, customers, subscriptions, promo codes, and happy hours

### 🎯 Implementation Details

#### 1. User Roles
User roles are stored in Supabase Auth user metadata:
- `user_metadata.role`: 'admin' or 'staff'
- `app_metadata.role`: 'admin' or 'staff' (fallback)

#### 2. Protected Pages
- **Reports page** (`/admin/reports`): Only accessible by admin role
  - Staff users attempting to access will see an "Access Denied" message
  - Automatically redirected to dashboard after 2 seconds

#### 3. Sidebar Navigation
- The sidebar dynamically hides the "Reports" menu item for staff users
- All other navigation items remain visible and functional

## Setup Instructions

### 1. Create Admin User (Full Access)
```bash
npm run seed:admin
# or
npx tsx scripts/seed-admin.ts
```

**Credentials:**
- Email: `admin@breakpointarena.com`
- Password: `<ADMIN_PASSWORD>`
- Role: `admin`
- Access: Full (including Reports)

### 2. Create Staff User (Limited Access)
```bash
npm run seed:staff
# or
npx tsx scripts/seed-staff.ts
```

**Credentials:**
- Email: `staff@breakpointarena.com`
- Password: `<STAFF_PASSWORD>`
- Role: `staff`
- Access: All pages except Reports

### 3. Login
Navigate to: `http://localhost:3000/admin/login`

Use the appropriate credentials based on the access level needed.

## Testing the Implementation

### Test Scenario 1: Admin Access
1. Login with admin credentials
2. Navigate through all pages including Reports
3. ✅ All pages should be accessible
4. ✅ Reports page shows full analytics

### Test Scenario 2: Staff Access
1. Login with staff credentials
2. Navigate through various pages (Dashboard, Bookings, Devices, etc.)
3. ✅ All pages except Reports should be accessible
4. ❌ Reports menu item should not appear in sidebar
5. ❌ Direct navigation to `/admin/reports` should show "Access Denied"
6. ✅ Should redirect to dashboard after 2 seconds

### Test Scenario 3: Role Verification
1. Login with admin credentials
2. Check welcome toast: "Welcome back, Admin!"
3. Logout and login with staff credentials
4. Check welcome toast: "Welcome back, Staff!"

## File Structure

### New Files
```
scripts/
├── seed-staff.ts           # Script to create staff user

lib/
└── auth/
    └── roles.ts            # Role utilities and access checks

STAFF_LOGIN_GUIDE.md        # This documentation
```

### Modified Files
```
components/admin/layout/
└── SideBar.tsx             # Dynamic sidebar filtering

app/(admin)/admin/
├── login/page.tsx          # Role display in welcome message
└── reports/page.tsx        # Access control implementation

scripts/
└── seed-admin.ts           # Updated comments

package.json                # Added seed:staff script
```

## API Reference

### `getUserRole()`
Returns the current user's role from Supabase Auth.

```typescript
import { getUserRole } from '@/lib/auth/roles'

const role = await getUserRole()
// Returns: 'admin' | 'staff' | null
```

### `canAccessReports(role)`
Checks if a role can access the Reports page.

```typescript
import { canAccessReports } from '@/lib/auth/roles'

const hasAccess = canAccessReports('staff')
// Returns: false
```

### `checkReportsAccess()`
Checks if the current user can access Reports.

```typescript
import { checkReportsAccess } from '@/lib/auth/roles'

const hasAccess = await checkReportsAccess()
// Returns: boolean
```

## Adding More Restricted Pages

To restrict additional pages for staff:

1. **Update the role check in the page component:**

```typescript
import { checkReportsAccess } from '@/lib/auth/roles'

export default function RestrictedPage() {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  
  useEffect(() => {
    checkReportsAccess().then(setHasAccess)
  }, [])
  
  if (!hasAccess) {
    return <AccessDeniedMessage />
  }
  
  // ... rest of component
}
```

2. **Hide from sidebar (if needed):**

```typescript
// In SideBar.tsx
const filteredNavItems = navItems.filter(item => {
  if (item.href === "/admin/your-page" && userRole === "staff") {
    return false
  }
  return true
})
```

## Security Notes

- ✅ Client-side role checks prevent UI access
- ✅ Server actions should also validate roles
- ✅ User roles are stored in Supabase Auth metadata
- ⚠️ For production: Add server-side RLS policies in Supabase
- ⚠️ For production: Validate roles in all API routes/server actions

## Creating Additional Users

### Via Supabase Dashboard
1. Go to Authentication → Users
2. Click "Add User"
3. Enter email and password
4. Add to `user_metadata`:
   ```json
   {
     "role": "staff",
     "full_name": "Staff Name"
   }
   ```

### Via Script (Recommended)
Modify `scripts/seed-staff.ts` to add more users:

```typescript
const staffUsers = [
  { email: 'staff1@breakpointarena.com', password: '<STAFF_PASSWORD>', name: 'Staff One' },
  { email: 'staff2@breakpointarena.com', password: '<STAFF_PASSWORD>', name: 'Staff Two' },
]

for (const user of staffUsers) {
  await supabaseAdmin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      full_name: user.name,
      role: 'staff',
    },
  })
}
```

## Troubleshooting

### Issue: Staff user can still see Reports
**Solution:** Clear browser cache and localStorage, then login again.

### Issue: "Access Denied" not showing
**Solution:** Ensure the role is set correctly in Supabase Auth metadata.

### Issue: Sidebar still shows Reports
**Solution:** Check browser console for role loading errors. Verify `getUserRole()` is working.

### Issue: Cannot create staff user
**Solution:** 
1. Check `.env.local` has correct Supabase credentials
2. Ensure Supabase is running (`npx supabase start`)
3. Check the service role key is correct

## Future Enhancements

- [ ] Add more granular permissions (edit vs view)
- [ ] Role management UI in admin panel
- [ ] Audit log for staff actions
- [ ] Custom role creation
- [ ] Permission presets

## Support

For issues or questions:
1. Check browser console for errors
2. Verify Supabase Auth is running
3. Check user role in Supabase dashboard
4. Review this documentation

---

**Last Updated:** 2026-07-12  
**Version:** 1.0.0
