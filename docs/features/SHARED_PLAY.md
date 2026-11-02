# Shared Play

Shared Play tracks who is playing during an active **Walk-in now** session on a
regular device. It is unavailable for Advance bookings and FI Simulator sessions.

From the booking details, choose **Shared play**, enter one or more comma-
separated names, and choose **Add players**. Select participants with the
checkboxes, then choose **Sit in** to start their timers at the same moment or
**Sit out** to stop them. Each change saves immediately, and each participant
row shows their accumulated minutes at the board. Any participant, including the
booking customer, can sit out. When everyone is sitting out, all player timers
pause until someone sits in again. The booking customer is counted from
check-in when Shared Play is first enabled if they are playing then; other
participants are counted from when they sit in.

Expand **Play sessions** to see chronological intervals, who was playing
together, and how long each interval lasted.

The booking list labels the session as **Shared play** or **Standard play**.
For Shared play, its minutes count only the intervals when at least one person
was sitting in, rather than the full time since check-in. Its live amount uses
those same tracked intervals, matching the estimate in Booking Details.

At checkout, Shared Play charges only the intervals when at least one participant
was sitting in; time when everyone sat out is excluded. The base device charge
is split across the players by their tracked time. If the active player count is
above the device's included-player count, the device's extra-player hourly rate
is charged for that interval and split across those active participants. Food
and booking discounts remain on the booking, not assigned to individual players.

Run the arithmetic checks with:

```bash
npm run test:shared-play
```
