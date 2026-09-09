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

`20260907000000_walkin_planned_end_time.sql` replaces `checkin_walkin_session`
again, adding `p_planned_end` and a `held_until` column on the returned row — see
section 8. It drops the ten-argument version for the same reason, and until it is
applied the Planned End field fails with `PGRST202` as well.

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

## 8. Holding a session to the time the customer says they are leaving

A walk-in has no chosen duration — that is the point of billing it on actual
time — so check-in claims the station for `PROVISIONAL_SESSION_HOURS` (5) and
writes that on the slot row. It is a placeholder. It says the same thing about a
customer leaving in twenty minutes as about one settling in for the evening.

The desk often knows better, because the customer just said. Once **Set start
time** is chosen, an optional **Planned End** field appears on the same step, and
what is entered there becomes the window the station is held for.

**It settles no money.** The bill is still worked out at checkout from the two
real timestamps: stay past the planned end and it costs more, leave before it and
it costs less. A customer who wants to pay for a fixed window wants **Advance
Counter Booking**, on the toggle at the top of the same screen.

### What it actually changes

| | With no planned end | With one |
| --- | --- | --- |
| `slot_end_time`, `duration_hours` | Start + 5 hours, a placeholder | The window the customer named |
| Seating them at all | The 5-hour block has to be free, so a station with a fixed booking in 2 hours refuses | Only the named window has to be free, so that station can take them |
| The bill | Actual time at checkout | Actual time at checkout — unchanged |
| Selling the hours after it | Nothing until checkout, capped at 12 hours | Sellable from the planned end onwards |
| The floor plan / device cards | Occupied until checkout | Occupied until checkout — unchanged |

The floor warning on the confirm step asks about that same window —
`getWalkInDeviceAvailability` runs `sessionClaimWindow`, which is the TypeScript
copy of the arithmetic in `checkin_walkin_session`. It used to ask a fixed
question, "is a station free for the next five hours", however the times had been
filled in, so a customer starting at seven and leaving at nine was told **every
station is in use** by a booking at ten their session would never have touched.
A backdated start was checked from now rather than from when they sat down, too,
which is the overlap that actually matters. `npm run test:walkin-start` pins the
window, including the past-midnight cases where the claim belongs to yesterday's
`slot_date`.

### Who still holds the station, and for how long

`20260826130000` made a checked-in walk-in hold its station until checkout,
capped at `MAX_LIVE_SESSION_HOURS` (12), because a customer was being sold a
station somebody was still sitting at. It had to assume the worst: a session with
no stated end might be over in ten minutes or run all evening.

Once the desk can say, that assumption is only right while nobody has said
anything. `20260908000000` narrows it to three lines, applied identically by
`assign_device_slot` and by `liveSessionEndMinutes` in
`lib/payments/availability.ts`:

| The session | The hold |
| --- | --- |
| No planned end | Until checkout, capped at 12 hours from check-in |
| Planned end, not yet reached | To the planned end — the hours after it are for sale |
| Planned end passed, no checkout | Until checkout again, capped at 12 hours |

That third line is what keeps it honest: the customer is not thrown out of the
system at nine o'clock. At 9:01 with no checkout they are overrunning, the hold
comes back exactly as an unplanned session's would, and nothing new is sold over
the top of them.

**The risk this accepts:** a booking sold for 9:30 while they were expected to
leave at nine, which they then overrun. That is the exposure every fixed slot
already carries — a 2–3pm customer who will not get up does not make the 3pm
booking disappear — and it is an overbooking question for the floor, not an
availability one.

**Occupancy still keys on booking status**, not on any window:
`lib/devices/occupancy.ts` calls a station busy from check-in until checkout
however the session was planned, because that is the right answer to a different
question - "is somebody sitting there now", where the tables above answer "can I
sell this station for later".

What changed is that the answer to the first question stopped **gating** the
second. "FULLY BOOKED" was a verdict on the whole day drawn from a fact about
this minute, and on a one-station type it was a dead button: one customer sat
down at ten past five and not only tonight's later slots but *every future date*
became unreachable, because the card would not open at all.

| Surface | Was | Now |
| --- | --- | --- |
| Customer booking card | FULLY BOOKED, Select disabled | `N AVAILABLE NOW` / `IN USE RIGHT NOW`, Select always opens the picker |
| Home station card | Fully Booked, button disabled | `Available N/M` pill, Book slot always opens the picker |
| Walk-in device card, walk-in now | Not clickable with none free | Unchanged - seating somebody *now* does need a free station |
| Walk-in device card, advance booking | Not clickable with none free | Opens regardless: a window later on does not care who is sitting there |
| Admin device grid | FULLY BOOKED | Unchanged - it is a floor view, and it means now |

A walk-in is a thing that is happening today. It can say which of *today's*
hours are taken, and it has nothing whatever to say about tomorrow - so no card
is closed on account of one.

### Setting it at check-in, and changing it afterwards

The New Walk-In form is not the only place a customer says when they are
leaving. **Check In** on the bookings list opens a dialog with the same optional
field, so a walk-in taken earlier in the evening can be given a finish at the
moment the customer actually sits down - which is when they say it.

Once the session is running, the booking detail panel has an **Expected finish**
card: set, change, or remove. It goes through `set_walkin_planned_end`, not an
UPDATE, because by then the hours the plan freed may already have been sold:

| Change | What happens |
| --- | --- |
| Extend into free time | Allowed; the slot row and the booking both move |
| Extend over another booking on that station | **Refused** — *"that station is booked before the new finish time"*, and nothing moves |
| Shorten | Always allowed |
| Remove the plan | Back to the `PROVISIONAL_SESSION_HOURS` placeholder, **clamped to the next booking on that station** |

That last row is the one worth reading twice. Removing a plan is the desk saying
nobody knows when this customer is leaving, which is true whether or not somebody
holds a booking at nine - so it must not be refusable, or a mistaken finish could
never be taken off. Clamping keeps it honest instead: the hold runs to the
placeholder or to the next booking, whichever comes first, and never behind the
time already played. If the customer then overruns, that is the same exposure a
fixed slot has always carried.

The whole thing runs under the advisory lock `assign_device_slot` takes for that
device type and date, so an extension and a booking of the hours being extended
into cannot both decide they are fine.

### Where the planned end shows up

| Screen | While it runs | After checkout |
| --- | --- | --- |
| Bookings list / grid | `In: 07:00 PM` and `Till: 09:00 PM` | `In:` and `Out:`, the real times |
| Booking detail timeline | An **Expected to finish** step, noted "station held until then; billing still runs to checkout" | The checkout step, as before |

"Till" rather than "Out", and a paler blue, on purpose: `Out:` is a timestamp
the database wrote at checkout and half the screens price against it, so a time
somebody promised at the counter must never be read as one. `sessionTimes` drops
the planned end the moment a real checkout exists - two times side by side saying
different things, only one of which was billed, is worse than one.

### The slot picker

`lib/bookings/deviceTypeOccupancy.ts` is what the customer's picker reads, and it
is a **different** builder from `lib/payments/availability.ts` - it never had the
live-session rule that `20260826130000` added, so between the fifth and twelfth
hour of an open-ended session it offered a station that `assign_device_slot`
would then refuse. It now applies `liveSessionEndMinutes` too, which gives the
customer the behaviour the desk asked for:

- a session with a planned end blocks **its own hours** and no more;
- a session without one takes the twelve hours with it, and now says so before
  the customer picks a slot rather than after.

`npm run test:walkin` pins both, through the same `availableStartMinutes` the
picker runs in the browser.

### The worked example

1. A customer arrives at 7:00 PM and says they will be gone by nine.
2. Create the walk-in. On **Confirm**, leave **Set start time** on the seeded
   07:00 PM, and set **Planned End** to 09:00 PM.
3. The line under the field reads *"Held until 09:00 PM · 2h from 07:00 PM"*, and
   the panel adds *"It is held until 09:00 PM — 2h — which is the window the slot
   and the floor plan will show."*
4. Confirm. The booking is **Playing 0m · since 7:00 PM**, with a station.

```sql
select b.booking_number, b.status, b.checked_in_at, b.completed_at,
       s.slot_date, s.slot_start_time, s.slot_end_time, s.duration_hours
from bookings b
join booking_device_slots s on s.booking_id = b.id
where b.booking_number = '<the number>';
```

`slot_start_time` / `slot_end_time` must read 19:00 and 21:00 with
`duration_hours` 2 — not the 5-hour placeholder — and `completed_at` must be
null, because nothing was closed. Check them out at 7:20 and the bill is 20
minutes, not two hours; checkout rewrites the slot to the window played, exactly
as it does for any other session.

### Which day, and how far ahead

The planned end is read **forwards** where the start is read backwards: a reading
at or before the start belongs to tomorrow, so a session running 11:50 PM to
12:30 AM needs no date on either field. It is resolved against the day the
session *starts*, not the day it is typed on, so an entry made at 12:05 AM about
a session that began at 11:50 PM still lands on that evening.

| Now | Start | Planned end | Result |
| --- | --- | --- | --- |
| 7:15 PM | 07:00 PM | 09:00 PM | Held 2h |
| 11:50 PM | 11:50 PM | 12:30 AM | Held 40m, across midnight |
| 7:15 PM | 07:00 PM | 09:00 **AM** | Refused — about 14h, over the ceiling |
| 9:00 PM | 08:00 PM | 07:00 PM | Refused — already gone, so read as tomorrow |

`MAX_PLANNED_SESSION_HOURS` is `MAX_LIVE_SESSION_HOURS` (12), measured **from the
start**, so a backdated start counts against the hold. Beyond the live window the
dashboard, `lib/devices/occupancy.ts` and the attention list have all stopped
believing in the session, so a hold that outlasts it would be a claim nothing
else honours. Twelve hours is also exactly the size of an AM/PM slip, which is
what the third row above is.

An end that has already passed can only be read as tomorrow, which comes out
about a day long and hits the same ceiling — so "not in the past" needs no
separate rule, and the message points at Check Out, which is what a customer
whose end has passed actually needs.

### Invalid actions

| Attempt | Expected |
| --- | --- |
| A planned end over the ceiling, or already past | Confirm is disabled and the field says so; the action refuses it before any row is written |
| A planned end with no start time | Refused by the action — and the field is not shown until a start time is set, because a planned end on a booking still waiting for check-in would be a promise about a session that has not begun |
| No station free for the window | The booking is created **waiting**, as in section 7, and neither time is used |
| A station somebody else holds during the window | Refused as a full floor — which is the point: the named window is what `assign_device_slot` tests |
| Calling the RPC with `p_planned_end` in the past or over `p_max_session_hours` | `check_violation`, and the check-in it would have made is rolled back with it — the booking stays `confirmed` rather than half started |
| Calling `checkin_walkin_session` with no `p_planned_end` | The 5-hour placeholder, exactly as before. The Check In button on the bookings list passes nothing and is untouched |

`20260907000000_walkin_planned_end_time.sql` **drops** the ten-argument
`checkin_walkin_session` before recreating it, for the reason section 1 gives —
and because `held_until` is a new column on the returned row.

`npm run test:walkin-start` pins the reading of both fields, including under
three host time zones.

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
