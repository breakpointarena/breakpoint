# Verifying the slot hold

The double-booking fix moves the moment a station is claimed from *after payment*
to *when the customer picks the slot*. The claim itself happens inside Postgres,
so the only meaningful test is against a real database. This is the procedure.

## 1. Apply the migration

```bash
supabase db push          # or: supabase migration up
```

`supabase/migrations/20260814000000_customer_slot_holds.sql` does four things:

| Change | Why |
| --- | --- |
| `bookings.hold_token` | A secret proving the browser owns a hold. |
| `customer_phone` nullable for `draft`/`locked`/`expired` | A hold is taken one screen before the customer types a phone number. Every other status still requires one, via a CHECK. |
| `assign_device_slot` treats a lapsed hold as free | Two of its clauses predate holds existing and read an abandoned one as still occupying the station. |
| `release_slot_hold(booking_id, token)` | Gives a station back before the ten minutes are up. |

Confirm it landed:

```sql
select column_name, is_nullable
from information_schema.columns
where table_name = 'bookings' and column_name in ('hold_token', 'customer_phone');

select proname from pg_proc where proname = 'release_slot_hold';
```

## 2. Reduce capacity to one station

The race only shows up when there is exactly one station left. Take every PS5 but
one out of service:

```sql
-- Remember what you changed so you can put it back.
select id, station_number, status from devices
where device_type_id = (select id from device_types where name = 'ps5');

update devices set status = 'maintenance'
where device_type_id = (select id from device_types where name = 'ps5')
  and station_number <> '<the one you are keeping>';
```

## 3. The two-tab test

1. Open the booking flow in two different browsers (or one normal + one private
   window — they must not share `sessionStorage`).
2. In both, pick **PS5**, the same date, and the same start time.
3. Press **Confirm** in tab A, then immediately in tab B.

**Expected:** tab A moves to the details screen with the countdown running. Tab B
stays on the picker with *"That slot has just been taken. Please choose a different
time."* — **before either customer has seen Razorpay.**

Check the database while A's countdown runs:

```sql
select b.id, b.status, b.lock_expires_at, b.customer_phone,
       s.slot_date, s.slot_start_time, s.slot_end_time, s.device_station_number
from bookings b
join booking_device_slots s on s.booking_id = b.id
where b.status = 'locked';
```

One row. `customer_phone` is null, `lock_expires_at` is ~10 minutes out.

## 4. The release paths

Each of these should free the station — verify by refreshing tab B's picker and
seeing the slot offered again.

| Do this in tab A | Expected |
| --- | --- |
| Press **← Choose alternative time slot** | Hold released immediately; row moves to `expired` |
| Go back to device selection (`/booking`) | Same |
| Pick a *different* slot on the picker | Old hold released, new one taken; only ever one `locked` row for that browser |
| Let the countdown reach 00:00 | Hold released, toast shown, redirected to `/booking` |
| Close the tab and walk away | Row stays `locked` but is ignored by every availability check the moment `lock_expires_at` passes; the next hold taken by anyone sweeps it to `expired` |
| Open Razorpay and dismiss it | **Hold is kept** — deliberately. The customer is still on the summary and will usually retry; releasing here would offer their slot to somebody else mid-retry. It lapses on its own. |

## 5. Payment converts the hold, it does not take a second station

Complete a booking normally in tab A, then:

```sql
select b.booking_number, b.status, b.payment_status, b.hold_token,
       b.lock_expires_at, b.created_at, count(s.id) as slot_rows
from bookings b
left join booking_device_slots s on s.booking_id = b.id
where b.booking_number = '<the number on the success screen>'
group by b.id;
```

**Expected:** `status = confirmed`, `payment_status = paid`, `hold_token` null,
`lock_expires_at` null, and **exactly one** slot row — the one the hold created.
Two rows, or a second `bookings` row for the same payment, would mean fulfilment
claimed a station instead of converting the reservation.

`created_at` is stamped at payment, not at hold time, so the staff notification
poll and the day's revenue bucket the booking when it was actually paid for.

## 6. Put the stations back

```sql
update devices set status = 'available'
where device_type_id = (select id from device_types where name = 'ps5');
```

## What is *not* covered here

- **Two payments landing in the same millisecond for the last station.** Still
  possible in principle, when both customers' holds have lapsed and they pay
  simultaneously. `assign_device_slot` decides it under the advisory lock and the
  loser is refunded — the pre-existing behaviour, now the rare path rather than
  the normal one.
- **A hold taken, then the same customer changing duration on the summary screen.**
  The hold is matched on date, start *and* end, so a changed window is simply not
  honoured: fulfilment claims a station outright instead, which re-checks the full
  range atomically.
