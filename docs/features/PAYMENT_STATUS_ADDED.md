# Payment Status Column - Admin Bookings List

## ✅ **Feature Added**

Added **Payment Status** column to the admin bookings list table to show payment state of each booking.

---

## 📊 **What Was Changed**

### **1. Created PaymentStatusBadge Component**
**File**: `components/admin/bookings/PaymentStatusBadge.tsx`

**Badge Types**:
| Status | Color | Label |
|--------|-------|-------|
| **paid** | 🟢 Green | Paid |
| **pending** | 🟡 Amber | Pending |
| **partial** | 🟠 Orange | Partial |
| **failed** | 🔴 Red | Failed |
| **refunded** | 🔵 Blue | Refunded |

**Sizes**: `sm`, `md`, `lg`

**Styling**:
- Golden/amber for pending payments
- Green for fully paid
- Orange for partial payments
- Red for failed transactions
- Blue for refunded amounts

---

### **2. Updated Bookings Table**
**File**: `app/(admin)/admin/bookings/page.tsx`

**Table Structure**:
```
Booking # | Customer | Device | Date & Time | Amount | Payment | Status | Actions
```

**New Column** (added between Amount and Status):
- **Payment** - Shows payment status badge

**Display Logic**:

#### **Parent Row (Customer Summary)**:
- **Single Booking**: Shows payment status of that booking
- **Multiple Bookings**: Shows all unique payment statuses as small badges

#### **Child Rows (Expanded View)**:
- Each individual booking shows its payment status badge

**Example**:
```
┌─────────────┬──────────┬─────────┬──────────┬─────────┬─────────┬──────────┬─────────┐
│ Booking #   │ Customer │ Device  │ Date     │ Amount  │ Payment │ Status   │ Actions │
├─────────────┼──────────┼─────────┼──────────┼─────────┼─────────┼──────────┼─────────┤
│ BP-001      │ John Doe │ PS5     │ 14 Jun   │ ₹1,500  │ [PAID]  │ Confirmed│   ...   │
│ BP-002      │ Jane     │ Xbox    │ 15 Jun   │ ₹2,000  │ [PENDING] │ Active │   ...   │
│ BP-003      │ Mike     │ PC      │ 16 Jun   │ ₹1,200  │ [PARTIAL] │ Checked-In │ ... │
└─────────────┴──────────┴─────────┴──────────┴─────────┴─────────┴──────────┴─────────┘
```

---

## 🔧 **Technical Implementation**

### **Badge Component**:
```tsx
<PaymentStatusBadge 
  status={booking.payment_status || 'pending'} 
  size="md" 
/>
```

### **Status Configuration**:
```tsx
const statusConfig = {
  paid: {
    label: "Paid",
    bgClass: "bg-green-500/20 border-green-500/40 text-green-400",
  },
  pending: {
    label: "Pending",
    bgClass: "bg-amber-500/20 border-amber-500/40 text-amber-400",
  },
  partial: {
    label: "Partial",
    bgClass: "bg-orange-500/20 border-orange-500/40 text-orange-400",
  },
  // ... more statuses
}
```

### **Fallback**:
- If `payment_status` is null/undefined, defaults to `'pending'`
- Unknown statuses display as gray badge with the raw status text

---

## 📋 **Payment Status Values**

From database schema (`bookings.payment_status`):

| Value | Meaning | When Used |
|-------|---------|-----------|
| **paid** | Fully paid | Customer paid full amount upfront |
| **pending** | Unpaid | Admin added items after booking |
| **partial** | Partially paid | Some amount paid, balance due |
| **failed** | Payment failed | Transaction unsuccessful |
| **refunded** | Refunded | Booking cancelled, amount returned |

---

## 🎨 **Visual Design**

### **Badge Styling**:
- Semi-transparent background (`/20` opacity)
- Colored border (`/40` opacity)
- Bright text for readability
- Uppercase text
- Font: Black weight
- Border radius: Medium (`rounded-md`)

### **Size Variants**:
- **sm**: `text-[9px] px-2 py-0.5` - For multiple status badges
- **md**: `text-[10px] px-2.5 py-1` - Default size
- **lg**: `text-xs px-3 py-1.5` - For emphasis

---

## 📊 **Use Cases**

### **For Admins**:
1. **Quick Payment Overview** - See which bookings have pending payments
2. **Filter Priority** - Identify bookings that need payment follow-up
3. **Customer Context** - Know payment state before calling customer
4. **Checkout Preparation** - See if balance is due before checkout

### **Scenarios**:

#### **Scenario 1: Food Added After Booking**
```
Booking: BP-001
Payment: [PENDING] ← Food added by admin, not yet paid
Status: Checked-In
```

#### **Scenario 2: Full Payment Upfront**
```
Booking: BP-002
Payment: [PAID] ← Customer paid everything at booking
Status: Confirmed
```

#### **Scenario 3: Partial Payment**
```
Booking: BP-003
Payment: [PARTIAL] ← Paid ₹1000 out of ₹1500 total
Status: Completed
```

---

## 🔄 **Data Flow**

1. **Booking Created** → `payment_status: 'paid'` (customer pays upfront)
2. **Admin Adds Food** → `payment_status: 'pending'` (unpaid items added)
3. **Customer Pays Balance** → `payment_status: 'paid'` (all settled)
4. **Booking Cancelled** → `payment_status: 'refunded'` (money returned)

---

## ✨ **Benefits**

1. ✅ **Visibility** - Payment status visible at a glance
2. ✅ **Context** - Admins know if payment is pending
3. ✅ **Workflow** - Easy to identify bookings needing payment
4. ✅ **Consistency** - Matches checkout modal payment breakdown
5. ✅ **Color Coding** - Intuitive color scheme (green = good, amber = pending)
6. ✅ **Multi-Booking Support** - Shows all payment statuses for grouped bookings

---

## 🎯 **Result**

Admins can now:
- **See payment status** directly in the bookings list
- **Identify pending payments** quickly (amber badges)
- **Track partial payments** (orange badges)
- **Verify paid bookings** (green badges)
- **Handle refunds** (blue badges)

No more opening each booking detail to check payment status! 🎉
