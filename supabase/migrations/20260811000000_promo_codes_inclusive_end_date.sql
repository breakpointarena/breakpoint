-- ================================================
-- PROMO CODES: INCLUSIVE VALIDITY WINDOW
-- ================================================
-- The admin panel picks whole days, but the modals sent a bare "yyyy-MM-dd", so
-- Postgres stored both bounds at that day's midnight. Redemption rejects
-- anything past `valid_until` (resolvePromoDiscount() in lib/payments/quote.ts
-- and validatePromoCode() in app/(customer)/booking/promo-actions.ts), so a code
-- set to run "until 11 Aug" was already dead the moment 11 Aug began - it lost
-- its entire final day.
--
-- The modals now store the instants that bracket the chosen days: the start of
-- the first and the end of the last. This normalises the rows written before
-- that change, so existing codes gain the final day they were meant to have.
--
-- Day boundaries are resolved in Asia/Kolkata, the arena's local time, because
-- that is the clock behind both the admin's date picker and the dates shown in
-- the promo list. Resolving them in the database's UTC would push each boundary
-- past local midnight and hand out roughly five and a half extra hours.
--
-- Rerunning is a no-op: rows already sitting on local day boundaries are
-- skipped by the WHERE clause.

UPDATE public.promo_codes
SET
  valid_from = date_trunc('day', valid_from AT TIME ZONE 'Asia/Kolkata')
                 AT TIME ZONE 'Asia/Kolkata',
  valid_until = (
                  date_trunc('day', valid_until AT TIME ZONE 'Asia/Kolkata')
                    + INTERVAL '1 day'
                    - INTERVAL '1 millisecond'
                ) AT TIME ZONE 'Asia/Kolkata'
WHERE
  valid_from IS DISTINCT FROM (
    date_trunc('day', valid_from AT TIME ZONE 'Asia/Kolkata')
      AT TIME ZONE 'Asia/Kolkata'
  )
  OR valid_until IS DISTINCT FROM (
    (
      date_trunc('day', valid_until AT TIME ZONE 'Asia/Kolkata')
        + INTERVAL '1 day'
        - INTERVAL '1 millisecond'
    ) AT TIME ZONE 'Asia/Kolkata'
  );

-- The `valid_dates` CHECK (valid_until > valid_from) still holds: a single-day
-- code now spans 00:00:00.000 to 23:59:59.999 rather than collapsing onto one
-- instant, which is also why creating a one-day promo used to fail outright.
