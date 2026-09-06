# Flexible Booking System

**Implemented:** 2026-06-02  
**Updated:** 2026-06-02 (24-hour operation)
**Feature:** Users can now book from 30 minutes to 5 hours in a single booking

---

## Overview

The system now supports flexible duration bookings with **24-hour operation**:
- **Minimum Duration:** 30 minutes
- **Maximum Duration:** 5 hours  
- **Intervals:** 30-minute increments
- **Start Times:** Every 30 minutes (12:00 AM to 11:30 PM) - **24/7 operation**
- **Pricing:** Hourly rate × duration (e.g., ₹300/hr × 2.5hrs = ₹750)
- **Smart Filtering:** Only shows future time slots for today (no past bookings)

---

## User Flow

### Step 1: Select Device Type
Same as before - user selects PS5, Xbox, etc.

### Step 2: Select Date  
User picks a date from the calendar

### Step 3: Select Start Time
- Available times shown in 30-minute intervals (24-hour operation)
- **Past times are hidden** - only shows upcoming hours for today
- Unavailable times are grayed out when all devices are fully booked
- Examples: 12:00 AM, 12:30 AM, 01:00 AM... 11:00 PM, 11:30 PM
- **Overnight bookings supported** (e.g., 11:00 PM to 2:00 AM)

### Step 4: Select Duration
- Options: 30 min, 1 hour, 1.5 hours, 2 hours, ... up to 5 hours
- Each option shows the calculated price
- System automatically filters out durations that would exceed business hours

### Step 5: Proceed to Checkout
Standard booking flow continues (auth, payment, confirmation)

---

## Technical Implementation

### New Files Created

#### `/lib/utils/timeSlots.ts`
Utility functions for time slot management:
- `generateStartTimes()` - All possible start times in 30-min intervals
- `generateDurationOptions()` - Duration options from 30 min to 5 hours
- `calculateEndTime()` - Calculate end time from start + duration
- `calculatePrice()` - Calculate price based on hourly rate × duration
- `isWithinBusinessHours()` - Validate time range is within 10 AM - 11 PM
- `getMaxDurationForStartTime()` - Max bookable duration for a given start time

#### `/app/(customer)/booking/slots-v2/page.tsx`
New flexible slot selection page:
- 4-step progress indicator (Date → Start Time → Duration → Summary)
- Real-time availability checking
- Dynamic pricing display
- Responsive desktop and mobile layouts
- Player count selection integrated in summary

### Updated Files

#### `/app/(customer)/booking/actions.ts`
Added new server action:
```typescript
export async function checkFlexibleAvailability(
  dateString: string,
  deviceTypeId: string,
  durationMinutes: number
): Promise<{ 
  success: boolean; 
  availableStartTimes: string[];
  totalDevices?: number;
  error?: string;
}>
```

**Logic:**
1. Get total available devices of the selected type
2. Fetch all bookings for that date
3. For each 30-minute start time:
   - Check if `[start, start + duration]` overlaps with existing bookings
   - Count conflicts
   - If conflicts < total devices, mark as available
4. Return array of available start times

Updated `initializeSoftLockReservation()` to accept optional `durationMinutes` parameter for flexible bookings.

#### `/app/(customer)/booking/page.tsx`
Changed router push from `/booking/slots` to `/booking/slots-v2`

---

## Availability Logic

### How It Works

**Example:** 3 PS5 devices, User wants 2-hour booking starting 10:00 AM

1. System checks: Is 10:00 AM - 12:00 PM available?
2. Query all bookings that overlap with this time range
3. Count conflicts:
   - Device 1: Booked 09:00 AM - 11:00 AM (conflicts)
   - Device 2: Booked 11:30 AM - 01:30 PM (conflicts)  
   - Device 3: Free (no conflict)
4. Result: 1 device available → Booking allowed ✅

**If all 3 devices were busy during that time:**
- 3 conflicts = 3 total devices
- 0 available → Start time is grayed out ❌

### Overlapping Check

Two time ranges overlap if:
```
booking.start < requestEnd AND booking.end > requestStart
```

Examples:
- Booking: 10:00-11:00, Request: 10:30-11:30 → **Overlaps** ✓
- Booking: 10:00-11:00, Request: 11:00-12:00 → **No overlap** ✗ (end times touch but don't overlap)
- Booking: 09:00-10:00, Request: 10:00-11:00 → **No overlap** ✗

---

## Pricing Examples

**Hourly Rate:** ₹300/hour

| Duration | Calculation | Price |
|----------|-------------|-------|
| 30 min | ₹300 × 0.5 | ₹150 |
| 1 hour | ₹300 × 1 | ₹300 |
| 1.5 hours | ₹300 × 1.5 | ₹450 |
| 2 hours | ₹300 × 2 | ₹600 |
| 2.5 hours | ₹300 × 2.5 | ₹750 |
| 3 hours | ₹300 × 3 | ₹900 |
| 5 hours | ₹300 × 5 | ₹1500 |

**Additional Charges:**
- Extra players: Still charged per player as before
- Add-ons: Still available (if applicable)

**Total = Base Rate (duration × hourly rate) + Extra Players + Add-ons**

---

## Business Rules

### Time Constraints
- **Business Hours:** 24/7 - Open all day, every day
- **Last Start Time:** Any time (supports overnight bookings)
  - Example: Start at 11:00 PM, end at 2:00 AM next day
- **Today's Bookings:** Only shows time slots that are at least 30 minutes in the future
  - If current time is 3:45 PM, earliest available slot is 4:30 PM

### Duration Limits
- **Minimum:** 30 minutes
- **Maximum:** 5 hours per booking
- **Increments:** 30 minutes only

### Availability
- System checks real-time availability for the exact time range
- Expired soft locks are automatically excluded
- Availability updates when date or duration changes

---

## Database Schema

No schema changes required! The flexible booking system uses the existing structure:

### `booking_device_slots` Table
```sql
- slot_date (date)
- slot_start_time (time) -- 10:00:00
- slot_end_time (time)   -- 12:00:00 (now can be any duration)
- device_id (uuid)
- booking_id (uuid)
```

### Backward Compatibility
The old fixed-slot page (`/booking/slots`) still exists and works. To revert:
```typescript
// In /app/(customer)/booking/page.tsx
router.push("/booking/slots");  // Old fixed slots
router.push("/booking/slots-v2"); // New flexible slots
```

---

## Testing Checklist

- [ ] Can book 30-minute slot
- [ ] Can book 5-hour slot
- [ ] Cannot book past 11:00 PM
- [ ] Pricing calculates correctly for all durations
- [ ] Unavailable times are grayed out
- [ ] Availability updates when changing duration
- [ ] Multiple users can book same device type at different times
- [ ] Overlapping time ranges show as unavailable
- [ ] Player count adjustments work
- [ ] Mobile and desktop layouts work
- [ ] Booking flow completes successfully
- [ ] Walk-in bookings (admin) still work

---

## Future Enhancements

1. **Duration-based Discounts**
   - 3+ hours: 10% discount
   - 5 hours: 15% discount

2. **Peak Hour Pricing**
   - 6 PM - 10 PM: 1.2× multiplier
   - Weekends: 1.5× multiplier

3. **Bulk Time Blocks**
   - Pre-defined packages (Morning: 10AM-2PM, Evening: 6PM-10PM)

4. **Recurring Bookings**
   - Book same time slot for multiple days

5. **Admin Override**
   - Allow admin to book longer than 5 hours if needed

---

## Rollback Plan

If issues arise, simply revert the router push:

```typescript
// File: app/(customer)/booking/page.tsx line 65
router.push("/booking/slots"); // Revert to old system
```

Old fixed-slot system remains fully functional.

---

**Status:** ✅ Implemented and Ready for Testing
