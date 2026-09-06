# Verifying the walk-in session flow

A walk-in is now created empty, checked in when the customer arrives, and billed
at checkout from the time between those two server timestamps. The lifecycle is
enforced in Postgres, so the meaningful test is against a real database.

## 1. Apply the migration

```bash
supabase db push          # or: supabase migration up --local
```

`20260814100000_walkin_actual_time_billing.sql` adds `billed_on_actual_time` and
the `walk_in_*` intent columns, widens `duration_hours` so an overnight session
fits, and adds `checkin_walkin_session` / `checkout_walkin_session`.

`20260826000000_walkin_manual_start_time.sql` then replaces
`checkin_walkin_session` with a version taking `p_started_clock` — see section 7.
It **drops** the eight-argument function before recreating it, because a
defaulted ninth argument would otherwise leave two overloads that a call naming
the original eight matches ambiguously. Until it is applied, the new Session
Start control on the form fails with `PGRST202`.

If PostgREST returns `PGRST204` for a new column, reload its cache:

```sql
NOTIFY pgrst, 'reload schema';
```

## 2. The worked example

1. **Admin → Bookings → New walk-in.** Leave the toggle on **Walk-in now**.
2. Pick a device type, enter the customer, create it. Note the time — call it 8:55.
3. The booking appears as **Not checked in · booked 8:55**, with a Check In action
   and no station, no duration and no price anywhere on it.
4. Wait, then press **Check In** — call it 9:00. It becomes **Playing 0m · since
   9:00** and is given a station.
5. Leave it running. The card counts up.
6. Press **Check Out** at 11:45.

**Expected:** the toast reads *"Checked out — 2h 45m played"*, and the bill is
2.75 × the hourly rate. The 8:55 creation time appears nowhere in it.

```sql
select b.booking_number, b.status,
       b.created_at, b.checked_in_at, b.completed_at,
       round(extract(epoch from (b.completed_at - b.checked_in_at))/60) as billed_minutes,
       s.slot_start_time, s.slot_end_time, s.duration_hours,
       b.device_subtotal, b.total_amount
from bookings b
join booking_device_slots s on s.booking_id = b.id
where b.booking_number = '<the number>';
```

`slot_start_time` must equal the **check-in** time, not the creation time, and
`duration_hours` must match `billed_minutes / 60`.

## 3. Invalid actions

Each of these is refused server-side, not only in the UI. The quickest way to
prove it is to call the functions directly.

| Attempt | Expected |
| --- | --- |
| Check out a booking that was never checked in | "This customer has not checked in yet" |
| Check out twice | "This session has already been checked out" |
| Check in twice | "This customer is already checked in" |
| Check in a cancelled booking | "A cancelled booking cannot be checked in" |
| Use the fixed-slot Check Out on a session | "Use Check Out on the session so the bill is calculated from the time played" |
| Use the session Check In on an online booking | "not an open-ended walk-in session" |

## 4. Device allocation

The station is claimed at **check-in**, not at creation — so two walk-ins can be
created for the last PS5 and whoever checks in first gets it.

1. Fill every station of a type (check walk-ins in until none are left).
2. Create one more walk-in for that type and press **Check In**.

**Expected:** *"Every PS5 Console is in use right now."* The booking stays in
**Not checked in** — it is not left half-started — and no second booking is ever
given an occupied station.

```sql
-- Must return no rows: one station, one live session.
select s.device_id, count(*)
from booking_device_slots s
join bookings b on b.id = s.booking_id
where b.status = 'checked_in'
group by s.device_id having count(*) > 1;
```

## 5. Edge cases

| Case | Expected |
| --- | --- |
| 9:00 → 9:30 | 30m, half the hourly rate |
| 9:00 → 11:45 | 2h 45m, 2.75 × rate |
| 9:00 → past midnight | Billed across the date boundary; the slot keeps its start date |
| Checked in, never checked out | Stays **Playing**; the station stays occupied until staff close it |
| Cancelled before check-in | Nothing to release — no station was ever claimed |
| Session longer than 5 hours | Prices correctly. The station was provisionally held for 5h, so a booking taken for later in the day could overlap the tail — see the assumption below |

## 6. Billing and discounts

`Checkout & Billing` prices from the recomputed `total_amount`. Settle the payment
there as normal; the checkout guard refuses to close a session that has not been
checked in.

Both discounts are resolved **at checkout**, against the hours actually played:

| Discount | Rule on a session |
| --- | --- |
| Subscription | The customer's active membership percentage, applied to the device subtotal (play + extra players, never food). Resolved from their phone at checkout, so a membership that lapsed mid-session does not apply. |
| Happy hour | The existing rule, unchanged and strict: `isSlotWithinTimeRange` requires the **whole** session to sit inside the rule's hours. A customer who plays past the end of a happy hour loses it entirely — the same thing that happens to a fixed booking that does not fit. A session crossing midnight never qualifies. |

Combined discounts are capped at the device subtotal, so play can never come out
negative. Both write their own line item, so the receipt shows why the number moved.

**To test:** give the customer an active subscription, create a happy hour rule
covering the next hour for that device type, then run a short session inside the
window and check the breakdown:

```sql
select item_type, description, line_total
from booking_line_items
where booking_id = '<id>'
order by display_order;

select device_subtotal, subscription_discount, happy_hour_discount, total_amount
from bookings where id = '<id>';
```

Then run a second session that deliberately overruns the happy hour window and
confirm `happy_hour_discount` comes back as 0.

## 7. Starting a session from a time typed in

The default above bills from the moment `Check In` is pressed, which is right
only when the desk is free at the moment the customer sits down. **Admin →
Bookings → New walk-in → Confirm** now has a **Session Start** control with a
second option for the rest of the time:

| Option | What it does |
| --- | --- |
| **On check-in** | The flow in section 2, unchanged. No time, no station, billing starts when someone presses Check In. |
| **Set start time** | A time of day is entered. The booking is created *and checked in* in one go, a station is claimed immediately, and the bill runs from the time entered. |

The time is entered through `TimeOfDayField` — the same hour / minute / AM-PM
selects the happy hour forms use, for the same reason: `<input type="time">`
renders 24-hour on the machines here.

### The worked example

1. A customer has been on a PS5 since 7:15 PM. It is now 7:35 and the desk is
   free for the first time.
2. Create the walk-in as usual. On **Confirm**, choose **Set start time** and
   set 07:15 PM. The field is seeded with the current time rounded down to five
   minutes, so this is a few clicks back rather than a time built from scratch.
3. The panel reads *"Starts checked in — the clock starts at 07:15 PM, not now"*,
   and the line under the field reads *"20m of play so far"*.
4. Confirm. The booking appears as **Playing 20m · since 7:15 PM**, with a
   station.

```sql
select b.booking_number, b.status, b.checked_in_at, b.updated_at,
       s.slot_date, s.slot_start_time
from bookings b
join booking_device_slots s on s.booking_id = b.id
where b.booking_number = '<the number>';
```

`checked_in_at` and `slot_start_time` must both read 19:15. `updated_at` must
read the real time the row was written — it records when the row was touched, not
when the customer started, and backdating it would falsify the audit trail to fix
the bill.

### Which day the time belongs to

Only a time of day is entered; the date is worked out, and this arena is open
through midnight. A reading **later in the day than right now** cannot have
happened yet today, so it is taken as last night.

| Now | Entered | Read as |
| --- | --- | --- |
| 7:35 PM | 07:15 PM | 20 minutes ago |
| 12:30 AM | 11:45 PM | 45 minutes ago — *yesterday* |
| 12:30 AM | 12:15 AM | 15 minutes ago — today |
| 7:35 PM | 07:40 PM | ~24 hours ago, and therefore refused |

That last row is why "not in the future" needs no separate rule: the same shift
turns a mistyped future time into something a day old, which the ceiling refuses.

### The ceiling

A start may not be more than `MAX_BACKDATED_START_HOURS` (6) hours back. That is
half of `MAX_LIVE_SESSION_HOURS`, deliberately: a session older than the live
window is one the dashboard, `lib/devices/occupancy.ts` and the attention list
have already stopped counting, so a backdate reaching it would create a session
that is stale the moment it exists.

It also catches the error this control is most exposed to. There is no such thing
as an invalid AM/PM, so the wrong half of the day is a plausible twelve-hour
error in the bill that nothing else would notice:

| Now | Meant | Typed | Result |
| --- | --- | --- | --- |
| 8:00 PM | 07:15 PM | 07:15 **AM** | 12h45m back — refused, *"check the AM/PM"* |
| 8:00 AM | 07:15 AM | 07:15 **PM** | Not reached today, so last night — 12h45m back, refused |

Both ends are pinned by `npm run test:walkin-start`, which also runs the same
assertion under three host time zones. The reading comes off the arena clock, not
the server's — this is the bug that has bitten `slot_start_time` before.

### Invalid actions

| Attempt | Expected |
| --- | --- |
| A start time over the ceiling | Confirm is disabled and the field says so; the action refuses it too, before any row is written |
| A start time with no station free | The booking is still created, **waiting** — a full floor must not lose the customer's details. The toast reads *"Booked, but not started"* and the time entered is not used |
| Backdating onto a station somebody else was on | Refused as a full floor. The provisional block runs from the real start, so `assign_device_slot` sees the overlap in the past and will not double-book it |
| Calling the RPC with a start over `p_max_backdate_hours` | `check_violation` — the app validates first so the desk gets a sentence, but SQL is the backstop |

The existing **Check In** button on the bookings list is untouched: it passes no
time and the database clock is used, exactly as before.

## Assumptions worth confirming

1. ~~The station is held for a provisional 5 hours from check-in.~~ **Resolved
   2026-08-26** — this was not hypothetical. The slot row's placeholder end said
   the station was free after 5 hours while `lib/devices/occupancy.ts` still
   showed a customer at it for 12, so between those two hours the floor plan and
   the booking flow disagreed and `assign_device_slot` would hand the same
   station to a second booking.

   A checked-in walk-in now holds its station until checkout, capped at
   `MAX_LIVE_SESSION_HOURS` (12) so a forgotten checkout frees it by the next day
   rather than never — see `20260826130000_live_walkin_occupies_its_station.sql`
   and `liveSessionEndMinutes`, which `assign_device_slot` and
   `lib/payments/availability.ts` now both apply.

   **Only walk-in sessions.** The rule keys on `billed_on_actual_time`, the column
   that means "no end until somebody stops the clock". A fixed slot keeps the end
   on its row: stretching that to checkout would make a customer overrunning
   14:00–15:00 block the 15:00–16:00 booking sold months ago. `npm run test:walkin`
   pins both halves.
2. **Happy hour is all-or-nothing on a session**, because that is what the existing
   rule does. A customer who plays 10:00–13:30 through a 10:00–12:00 happy hour
   gets no discount at all rather than two discounted hours. If the floor expects
   the discounted hours to be honoured pro-rata, that is a change to
   `isSlotWithinTimeRange` and would affect online bookings too.
3. **Promo codes are not offered on walk-in sessions.** There is no field to enter
   one, matching the previous walk-in form; an existing `promo_discount` on the
   row is still respected at checkout.
