# Production Deployment Checklist

## Pre-Deployment (Required)

### 1. Database Backup ✅
- [ ] Create full backup of production database
- [ ] Test restore procedure on staging
- [ ] Document backup location and timestamp

### 2. Staging Testing ✅
- [ ] Deploy to staging environment
- [ ] Run new migration: `20260702000000_add_quantity_constraint.sql`
- [ ] Verify migration successful (no errors)
- [ ] Test the following scenarios:

#### Test Scenarios:
- [ ] **Concurrent Orders**: 2+ users order same food item simultaneously
  - Expected: One succeeds, others fail gracefully
  - Verify: Stock doesn't go negative

- [ ] **Pending Payment Flow**:
  1. Create booking with food items
  2. Attempt checkout → should show pending payment warning
  3. Select payment method (cash/card/UPI)
  4. Mark as paid → verify success message
  5. Verify food items status → should be "preparing"

- [ ] **Stock Management**:
  1. Set item quantity to 3
  2. Add 3 items to cart → should succeed
  3. Try to add 4th item → should show error
  4. Complete order
  5. Verify item is hidden from menu (quantity = 0)
  6. Verify item status is "unavailable"

- [ ] **Timeline Display**:
  - Verify timeline cards show device names (not booking IDs)

### 3. Rollback Plan ✅
- [ ] Review `ROLLBACK_20260702000000.sql`
- [ ] Review `ROLLBACK_INVENTORY_FUNCTIONS.sql`
- [ ] Test rollback on staging environment
- [ ] Document rollback procedure steps (see below)

### 4. Monitoring Setup ✅
- [ ] Set up error alerts for:
  - Database constraint violations
  - Failed inventory decrements
  - Payment marking failures
- [ ] Configure logging for:
  - `decrement_menu_item_quantity` failures
  - `markBookingAsPaid` errors

---

## Deployment Steps

### Step 1: Pre-Deployment
**Time:** 30 minutes before deploy

1. Announce maintenance window (if applicable)
2. Take final database backup
3. Verify staging tests passed
4. Have rollback scripts ready

### Step 2: Deploy Code
**Time:** During low-traffic window (recommended: 2-4 AM)

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install dependencies (if needed)
npm install

# 3. Build production bundle
npm run build

# 4. Deploy to hosting platform
# (Your deployment command here)
```

### Step 3: Run Migrations

```bash
# 1. Apply new migration
npx supabase db push

# Or manually run:
# - 20260702000000_add_quantity_constraint.sql

# 2. Verify migration applied
psql -c "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'menu_items' AND constraint_name = 'check_quantity_non_negative';"
```

### Step 4: Smoke Tests
**Time:** Immediately after deployment

- [ ] Admin login works
- [ ] Food menu loads (only in-stock items visible)
- [ ] Can add items to cart (stock validation works)
- [ ] Checkout flow works
- [ ] Pending payment warning shows correctly
- [ ] Mark as paid works (all payment methods)
- [ ] Timeline displays correctly

### Step 5: Monitor (First 2 Hours)

Watch for:
- Database errors in logs
- Failed orders
- Customer complaints
- Inventory sync issues

---

## Rollback Procedure (If Needed)

### When to Rollback:
- Critical bugs affecting orders
- Database performance degradation
- Data inconsistencies
- Customer-facing errors

### Rollback Steps:

#### Option 1: Code-Only Rollback (Safest)
```bash
# 1. Revert to previous commit
git revert HEAD~3  # Reverts last 3 commits
git push origin main

# 2. Redeploy previous version
npm run build
# Deploy...
```

#### Option 2: Full Rollback (Code + Database)
```bash
# 1. Revert code (as above)

# 2. Run rollback migrations
psql -f supabase/migrations/ROLLBACK_20260702000000.sql
psql -f supabase/migrations/ROLLBACK_INVENTORY_FUNCTIONS.sql

# 3. Fix any items marked unavailable incorrectly
psql -c "UPDATE menu_items SET status = 'available' WHERE status = 'unavailable' AND quantity > 0;"
```

---

## Post-Deployment

### First 24 Hours ✅
- [ ] Monitor error logs hourly
- [ ] Check order success rate
- [ ] Verify inventory is syncing correctly
- [ ] Review customer support tickets

### First Week ✅
- [ ] Analyze order patterns
- [ ] Check for edge cases
- [ ] Gather user feedback
- [ ] Document any issues found

---

## Known Limitations

1. **Payment Method in Quick-Pay**: Now has selector (fixed)
2. **Race Conditions**: Database constraint prevents negative stock (fixed)
3. **Food Status**: Auto-updates to "preparing" on payment (implemented)

---

## Support Contacts

- **Tech Lead**: [Your Name]
- **Database Admin**: [DBA Name]
- **On-Call Engineer**: [Phone/Slack]

---

## Success Criteria

Deployment is considered successful when:
- ✅ All smoke tests pass
- ✅ No critical errors in logs (first 2 hours)
- ✅ Order success rate > 95%
- ✅ No customer complaints about stock/payment issues
- ✅ Kitchen receives "preparing" status correctly

---

## Rollback Decision Matrix

| Issue | Severity | Action |
|-------|----------|--------|
| Orders failing completely | 🔴 CRITICAL | Immediate rollback |
| Stock going negative | 🔴 CRITICAL | Immediate rollback |
| Payment not recording | 🔴 CRITICAL | Immediate rollback |
| Food status not updating | 🟡 MEDIUM | Monitor, fix forward |
| Timeline display issue | 🟢 LOW | Fix forward |
| Minor UI glitch | 🟢 LOW | Fix forward |

---

## Notes

- Migration file `20260702000000_add_quantity_constraint.sql` is **idempotent** (can run multiple times safely)
- Function updates use `CREATE OR REPLACE` (safe to re-run)
- Database constraint is **atomic** (either applies completely or not at all)
- All changes are **backwards compatible** with existing data
