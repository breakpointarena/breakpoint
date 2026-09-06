# Deployment Guide
**Date:** 2026-07-08  
**Commit:** 591c89d

---

## ✅ STEP 1: Code Deployment - COMPLETE

```bash
✅ Committed: 591c89d
✅ Pushed to: origin/main
✅ Build: Successful
```

---

## ⚠️ STEP 2: Database Verification - ACTION REQUIRED

### Your database migrations already exist from previous deployments!

All schema is defined in these migration files:
- `20260602114615_add_happy_hour_promotions.sql` - happy_hour_rules table
- `20260613000000_create_booking_line_items.sql` - happy_hour_discount column
- `20260603074817_add_booking_source_to_bookings.sql` - booking_source column

### Action: Verify Production Database

**Login to your Supabase Dashboard and run this SQL:**

```sql
-- Verify all required schema exists
SELECT 
  'happy_hour_rules table' as item,
  CASE WHEN EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'happy_hour_rules'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'bookings.happy_hour_discount',
  CASE WHEN EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'happy_hour_discount'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 
  'bookings.booking_source',
  CASE WHEN EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'booking_source'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 
  'booking_food_items.special_instructions',
  CASE WHEN EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'booking_food_items' AND column_name = 'special_instructions'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END;
```

**Expected Result:** All 4 items should show ✅ EXISTS

**If any show ❌ MISSING:**
Run the migration files manually in SQL Editor or use `npx supabase db push`

---

## 🚀 STEP 3: Deploy Application

Your hosting platform will auto-deploy from GitHub, or manually deploy:

```bash
# If using Vercel/Netlify - auto-deploys from main
# Or manually:
npm run build
# ... deploy per your platform
```

---

## ✅ STEP 4: Post-Deployment Testing

Test these features after deployment:

### Walk-In Bookings:
- [ ] Admin → Bookings → Walk-in button
- [ ] Select Food or Device
- [ ] Create device walk-in booking
- [ ] Create food-only walk-in booking

### Happy Hours (Optional):
- [ ] Create happy hour rule in admin
- [ ] Set to "LIVE" status
- [ ] Verify discount shows on eligible time slots
- [ ] Verify discount applies to booking

### Customer Flow:
- [ ] Customer booking flow
- [ ] Retrieve bookings
- [ ] Food checkout
- [ ] Discounts apply correctly

---

## 📊 Summary

✅ **Code:** Deployed to GitHub  
⚠️ **Database:** Verify schema exists in production  
⬜ **App:** Deploy to hosting  
⬜ **Test:** Verify features work  

**Risk:** 🟢 Low - Tested & validated

---

## Need Help?

All database schema already exists in migration files. If database checks fail, you just need to apply the existing migrations to production.
