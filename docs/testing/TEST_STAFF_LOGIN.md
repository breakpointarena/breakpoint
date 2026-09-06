# Testing Staff Login Feature

## Quick Test Guide

Follow these steps to verify the staff login implementation works correctly.

---

## Prerequisites

1. **Supabase is running**
   ```bash
   npx supabase start
   ```

2. **Development server is running**
   ```bash
   npm run dev
   ```

---

## Test 1: Create Users

### Step 1: Create Admin User
```bash
npm run seed:admin
```

**Expected Output:**
```
🌱 Seeding admin user...
✅ Admin user created successfully!
📧 Email: admin@breakpointarena.com
🔑 Password: <ADMIN_PASSWORD>
👤 User ID: [some-uuid]
```

### Step 2: Create Staff User
```bash
npm run seed:staff
```

**Expected Output:**
```
🌱 Seeding staff user...
✅ Staff user created successfully!
📧 Email: staff@breakpointarena.com
🔑 Password: <STAFF_PASSWORD>
👤 User ID: [some-uuid]
🚫 Restricted: Cannot access Reports page
```

---

## Test 2: Admin Login (Full Access)

### Step 1: Login as Admin
1. Navigate to: `http://localhost:3000/admin/login`
2. Enter credentials:
   - Email: `admin@breakpointarena.com`
   - Password: `<ADMIN_PASSWORD>`
3. Click "Sign In"

### Step 2: Verify Admin Access
✅ **Check TopBar (Top Right)**
   - User name should be displayed
   - Gold/amber badge should show "ADMIN" with shield icon
   - Hover tooltip: "Full access including Reports"

✅ **Check Sidebar (Left Menu)**
   - All menu items should be visible
   - Reports should be listed at the bottom

✅ **Navigate to Reports**
   - Click "Reports" in sidebar
   - Reports page should load successfully
   - Should see: "REPORTS & ANALYTICS" header
   - Should see tabs: Overview, Profit & Loss, Food Reports, etc.

✅ **Navigate Other Pages**
   - Try Dashboard, Bookings, Devices, Food, etc.
   - All pages should be accessible

### ✅ Test 2 PASSED if:
- Admin badge shows in TopBar
- Reports menu item is visible
- Reports page loads successfully
- No "Access Denied" messages

---

## Test 3: Staff Login (Limited Access)

### Step 1: Logout Admin
1. Click logout button (top right)
2. Should redirect to login page

### Step 2: Login as Staff
1. Navigate to: `http://localhost:3000/admin/login`
2. Enter credentials:
   - Email: `staff@breakpointarena.com`
   - Password: `<STAFF_PASSWORD>`
3. Click "Sign In"

### Step 3: Verify Staff Restrictions
✅ **Check TopBar (Top Right)**
   - User name should be displayed
   - Blue badge should show "STAFF" with user icon
   - Hover tooltip: "Limited access - no Reports"

✅ **Check Sidebar (Left Menu)**
   - Most menu items should be visible
   - ❌ Reports should NOT be listed
   - All other items should be present

✅ **Try Accessing Reports Directly**
   - Manually navigate to: `http://localhost:3000/admin/reports`
   - Should see "Access Denied" page with:
     - Red shield icon
     - "ACCESS DENIED" header
     - Message: "You don't have permission to view reports"
     - "Go to Dashboard" button
   - Should auto-redirect to dashboard after 2 seconds

✅ **Navigate Other Pages**
   - Try Dashboard, Bookings, Devices, Food, etc.
   - All pages should be accessible
   - Should be able to:
     - View bookings
     - Check in/out customers
     - Add food orders
     - Manage devices
     - Create promo codes
     - Configure happy hours

### ✅ Test 3 PASSED if:
- Staff badge shows in TopBar
- Reports menu item is NOT visible
- Direct access to Reports shows "Access Denied"
- All other pages are accessible

---

## Test 4: Role Persistence

### Step 1: Refresh Page
1. While logged in as Staff
2. Press F5 or Cmd+R to refresh
3. Role badge should persist

### Step 2: Navigate Between Pages
1. Click through different pages
2. Role badge should remain visible
3. Reports should stay hidden

### ✅ Test 4 PASSED if:
- Role persists across page refreshes
- Role persists across navigation

---

## Test 5: Session Expiry

### Step 1: Wait for Session to Expire
1. Login as Staff
2. Wait 12 hours OR clear browser cookies
3. Try to navigate

### Expected Behavior:
- Should see "Session Expired" toast
- Should redirect to login page

### ✅ Test 5 PASSED if:
- Session expiry is detected
- User is redirected to login

---

## Test 6: Multiple Browser Test

### Step 1: Open Two Browser Windows
1. Window 1: Login as Admin
2. Window 2: Login as Staff (use incognito/private mode)

### Step 2: Compare Views
1. Admin window: Reports visible
2. Staff window: Reports hidden

### ✅ Test 6 PASSED if:
- Both users can be logged in simultaneously
- Each sees appropriate UI for their role

---

## Visual Checklist

### Admin View
```
TopBar:
┌─────────────────────────────────────────────────┐
│  [Search]    [🔔]  │  Admin User  [ADMIN 🛡️]   │
└─────────────────────────────────────────────────┘

Sidebar:
┌──────────────┐
│ Dashboard    │
│ Bookings     │
│ Timeline     │
│ Devices      │
│ Food         │
│ Customers    │
│ Subscription │
│ Promo Codes  │
│ Happy Hours  │
│ Reports      │ ← VISIBLE
└──────────────┘
```

### Staff View
```
TopBar:
┌─────────────────────────────────────────────────┐
│  [Search]    [🔔]  │  Staff User  [STAFF 👤]   │
└─────────────────────────────────────────────────┘

Sidebar:
┌──────────────┐
│ Dashboard    │
│ Bookings     │
│ Timeline     │
│ Devices      │
│ Food         │
│ Customers    │
│ Subscription │
│ Promo Codes  │
│ Happy Hours  │
└──────────────┘ ← Reports NOT visible
```

---

## Troubleshooting

### Issue: "User already exists" error
**Solution:** User was already created. Try logging in with existing credentials or delete user from Supabase dashboard.

### Issue: Role badge not showing
**Solution:** 
1. Clear browser cache
2. Logout and login again
3. Check browser console for errors

### Issue: Reports still visible for staff
**Solution:**
1. Verify user role in Supabase dashboard
2. Check that `user_metadata.role` is set to "staff"
3. Clear browser localStorage
4. Login again

### Issue: Can't access any page after login
**Solution:**
1. Check Supabase is running
2. Check .env.local has correct credentials
3. Check browser console for errors

---

## Pass/Fail Criteria

### ✅ ALL TESTS PASSED if:
- [x] Admin user created successfully
- [x] Staff user created successfully
- [x] Admin can see Reports in sidebar
- [x] Admin can access Reports page
- [x] Staff cannot see Reports in sidebar
- [x] Staff gets "Access Denied" when accessing Reports
- [x] Staff can access all other pages
- [x] Role badges display correctly
- [x] Role persists across refreshes
- [x] Both roles can be logged in simultaneously

### ❌ TESTS FAILED if:
- [ ] Staff can access Reports page
- [ ] Reports menu item visible for staff
- [ ] Role badge not showing
- [ ] Access Denied not working

---

## Browser Console Verification

Open browser console (F12) and run:

```javascript
// Check current user role
const { data: { user } } = await supabase.auth.getUser()
console.log('Current role:', user?.user_metadata?.role)

// Expected output for Admin: "admin"
// Expected output for Staff: "staff"
```

---

## Next Steps After Testing

If all tests pass:
1. ✅ Feature is working correctly
2. ✅ Ready for production (after adding server-side validation)
3. ✅ Document any edge cases discovered
4. ✅ Update README with staff login info

If any tests fail:
1. ❌ Check console errors
2. ❌ Review implementation files
3. ❌ Verify Supabase configuration
4. ❌ Contact development team

---

**Test Date:** _________________  
**Tester Name:** _________________  
**Test Result:** ✅ Pass / ❌ Fail  
**Notes:** _________________________________

---

**Last Updated:** 2026-07-12
