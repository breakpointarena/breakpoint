# Happy Hours - Customer UI Guide

## 🎯 Where Customers See Happy Hour Discounts

Happy hours are visible in **3 main places** in the customer booking flow:

---

## 1️⃣ Slot Selection Page (`/booking/slots-v2`)

**URL:** `http://localhost:3000/booking/slots-v2`

**When visible:** After customer selects device type and date

### What Customers See:

#### A. **Happy Hour Banner** (Top of Page)
- **Location:** Right below the progress steps, before the main content
- **Appearance:**
  - Yellow/orange gradient background
  - Border with glow effect
  - ✨ Sparkles icon on the left
  - Rule name: "Smackdown" (or whatever rule name)
  - Discount text: "50% discount on eligible slots!"
- **Example:**
  ```
  ┌─────────────────────────────────────────────┐
  │ ✨  Smackdown                               │
  │     50% discount on eligible slots!         │
  └─────────────────────────────────────────────┘
  ```

#### B. **Pricing Breakdown** (Right Sidebar on Desktop, Bottom on Mobile)
**Desktop location:** Right side panel with "Total Payable"
**Mobile location:** Bottom of the screen (sticky footer area)

Shows:
```
Base Rate (2 Hours)           ₹500.00
Extra Players (1 × 2 Hours)   ₹100.00
✨ Happy Hour (50% OFF)        -₹300.00  [in yellow/gold color]
─────────────────────────────────────
TOTAL PAYABLE                 ₹300.00
```

**Key visual elements:**
- ✨ Sparkles icon before "Happy Hour"
- Yellow/gold text color (`text-yellow-400`)
- Shows percentage: "(50% OFF)"
- Shows discount amount with minus sign: "-₹300.00" in green
- Discount is clearly visible above the total line

---

## 2️⃣ Checkout/Auth Page (`/booking/auth`)

**URL:** `http://localhost:3000/booking/auth`

**When visible:** After customer clicks "Confirm & Continue" from slots page

### What Customers See:

#### **Price Breakdown Section** (Right sidebar or card)
Located in the pricing summary card, shows all line items:

```
Price Breakdown
─────────────────────────────────────
Device Booking (2h × ₹250):    ₹500.00
Extra Players (1 × 2h × ₹50):  ₹100.00

Subtotal:                      ₹600.00

✅ Subscription Discount (10%): -₹60.00   [if applicable, in green]
🏷️ Promo Discount (SAVE20):     -₹100.00  [if applicable, in primary color]
✨ Happy Hour Discount (Smackdown): -₹300.00  [in yellow color]
─────────────────────────────────────
Total Amount:                  ₹140.00
```

**Key visual elements:**
- ✨ Sparkles icon before "Happy Hour Discount"
- Shows rule name in parentheses: "(Smackdown)"
- Yellow text color (`text-yellow-400`)
- Negative amount showing savings: "-₹300.00"
- Stacks with other discounts (all visible together)

---

## 3️⃣ Booking Confirmation Receipt

**URL:** Wherever you display booking details after payment

**Database storage:**
- `bookings.happy_hour_discount` column stores the discount amount
- `booking_line_items` table has a separate line item:
  - `item_type: 'happy_hour_discount'`
  - `description: 'Happy Hour Discount'`
  - `line_total: -300.00` (negative amount)

**If you have a booking receipt/invoice page**, it will show:
```
Device Booking                 ₹500.00
Extra Players                  ₹100.00
Happy Hour Discount           -₹300.00
─────────────────────────────────────
Total Paid                     ₹300.00
```

---

## 📱 Responsive Design

### Desktop View (> 768px)
- **Banner:** Full width below progress steps
- **Pricing:** Right sidebar panel
- **All elements:** Clearly visible, good spacing

### Mobile View (< 768px)
- **Banner:** Full width card with padding
- **Pricing:** Sticky bottom card
- **Font sizes:** Slightly smaller but readable
- **Icons:** Properly sized for mobile

---

## 🎨 Visual Elements Used

### Colors
- **Banner background:** `bg-gradient-to-r from-yellow-500/10 to-orange-500/10`
- **Banner border:** `border-yellow-500/30`
- **Banner text:** `text-yellow-200` (title), `text-yellow-300/80` (subtitle)
- **Discount amount:** `text-green-400` (slots page), `text-yellow-400` (checkout)

### Icons
- **✨ Sparkles:** from `lucide-react` library
  - Size: `w-5 h-5` (banner), `w-3.5 h-3.5` (pricing), `w-3 w-3` (checkout)
  - Color: `text-yellow-400`

### Typography
- **Banner title:** `text-sm font-bold`
- **Banner subtitle:** `text-xs`
- **Discount line:** Matches surrounding text size, bold font

---

## 🔍 How to Test Each View

### Test 1: Slot Selection with Happy Hours
1. Go to: `http://localhost:3000/booking/slots-v2`
2. Select any device
3. Select **Friday** as the date
4. Look for the banner at the top (should appear immediately)
5. Select any slot between **6:00 PM - 10:00 PM**
6. Check pricing breakdown on the right (desktop) or bottom (mobile)
7. Verify:
   - ✅ Banner shows "Smackdown" + "50% discount"
   - ✅ Pricing shows "Happy Hour (50% OFF)" line
   - ✅ Total is reduced by 50%

### Test 2: Checkout Page
1. From slot selection, click "Confirm & Continue"
2. On auth/checkout page, scroll to "Price Breakdown"
3. Verify:
   - ✅ Line item shows "Happy Hour Discount (Smackdown)"
   - ✅ Amount shows "-₹XXX.00" in yellow
   - ✅ Total reflects the discount

### Test 3: Booking Completion
1. Complete a test booking with happy hours
2. Check database:
   ```sql
   SELECT happy_hour_discount, total_amount 
   FROM bookings 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```
3. Verify discount is saved

---

## 🚫 When Happy Hours Are NOT Visible

Customers will **NOT see** happy hour discounts when:

### ❌ No Active Rules
- No rules with status = 'LIVE' in database
- All rules are PAUSED or SCHEDULED

### ❌ Time Doesn't Match
- Selected slot is **outside** the happy hour time range
- Example: Rule is 6 PM - 10 PM, but customer selects 2 PM slot
- **Strict validation:** Entire slot must be within happy hour range

### ❌ Day Doesn't Match
- Selected date doesn't match the rule's schedule
- Example: Rule is for "Fri", customer books on Monday

### ❌ Device Doesn't Match
- Selected device type not in rule's devices list
- Example: Rule is for "PS5, Xbox", customer books PC
- Note: "All" matches any device

### ❌ Partial Overlap
- Slot **partially** overlaps with happy hour range
- Example: Rule is 6 PM - 10 PM, slot is 9 PM - 11 PM
- System uses **strict validation** - entire slot must be within range

---

## 🎯 Customer Journey Summary

```
1. Landing/Home Page
   └─> Customer clicks "Book Now"

2. Device Selection (/booking/slots-v2)
   └─> Selects device type
   └─> Selects date
   └─> 🎉 HAPPY HOUR BANNER APPEARS (if rule matches)
   └─> Selects duration
   └─> Views available slots
   └─> Selects time slot
   └─> 💰 PRICING SHOWS DISCOUNT (if slot matches)
   └─> Clicks "Confirm & Continue"

3. Checkout Page (/booking/auth)
   └─> Enters phone number
   └─> Enters name, email, DOB
   └─> 💵 PRICE BREAKDOWN SHOWS DISCOUNT
   └─> Can stack with subscription discount
   └─> Can stack with promo code
   └─> Clicks "Proceed to Payment"

4. Payment & Confirmation
   └─> Completes payment
   └─> Receives confirmation
   └─> 📊 Discount saved to database
```

---

## 📊 Example Scenarios

### Scenario 1: Perfect Match ✅
- **Rule:** Friday, 6 PM - 10 PM, All devices, 50% off, LIVE
- **Customer:** Books PS5 on Friday at 8:00 PM - 10:00 PM
- **Result:** 
  - ✅ Banner visible
  - ✅ Discount applied
  - ✅ Shows "Smackdown - 50% OFF"

### Scenario 2: Wrong Day ❌
- **Rule:** Friday, 6 PM - 10 PM, All devices, 50% off, LIVE
- **Customer:** Books PS5 on Saturday at 8:00 PM - 10:00 PM
- **Result:**
  - ❌ No banner
  - ❌ No discount
  - Normal pricing

### Scenario 3: Wrong Time ❌
- **Rule:** Friday, 6 PM - 10 PM, All devices, 50% off, LIVE
- **Customer:** Books PS5 on Friday at 2:00 PM - 4:00 PM
- **Result:**
  - ❌ No banner (or banner shows but says "Select 6 PM - 10 PM slots")
  - ❌ No discount on this slot
  - Normal pricing

### Scenario 4: Multiple Discounts Stack ✅
- **Customer:** Has active subscription (10% off)
- **Uses promo code:** SAVE20 (₹100 off)
- **Happy hour active:** Smackdown (50% off device)
- **Base:** ₹600 device booking
- **Result:**
  ```
  Device Booking:             ₹600.00
  Happy Hour (50%):          -₹300.00
  Subscription (10% of ₹600):-₹60.00
  Promo Code:                -₹100.00
  ─────────────────────────────────
  Total:                     ₹140.00
  ```
  All three discounts visible and stacked!

---

## 💡 Pro Tips for Testing

1. **Test in incognito/private mode** - Fresh session each time
2. **Use browser dev tools** - Check console for any errors
3. **Test on mobile device** - Real phone, not just browser resize
4. **Clear cache** - If UI doesn't update after code changes
5. **Check time zones** - Ensure your local time matches test scenarios
6. **Test edge cases:**
   - Slot starts exactly at happy hour start time
   - Slot ends exactly at happy hour end time
   - Booking at 11:59 PM (day boundary)
   - Midnight-crossing happy hours (not recommended but should handle gracefully)

---

## 🎉 That's Everything!

Happy hours are visible and functional in:
- ✅ Slot selection page (banner + pricing)
- ✅ Checkout page (price breakdown)
- ✅ Database (for receipts/invoices)

The UI is:
- 🎨 Visually distinct (yellow/gold theme)
- 📱 Fully responsive (mobile + desktop)
- ✨ Clear and obvious (sparkles icon, bold text)
- 💰 Transparent (shows percentage and amount)
- 📊 Persistent (saved to database)

Start testing with your "Smackdown" rule on Fridays from 6 PM - 10 PM! 🚀
