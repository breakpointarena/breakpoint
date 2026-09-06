-- ================================================
-- CLOSE THE MEMBERSHIP BYPASS: subscriptions are written by the server only
-- ================================================
--
-- `20260803100000_lock_down_booking_tables.sql` took anonymous and authenticated
-- writes away from every booking table, on the grounds that "verifying the
-- Razorpay signature perfectly is worth nothing if the payment path can be
-- skipped entirely". It never covered `subscriptions`, which at the time was not
-- a table money went through - a membership was granted by the browser calling
-- `activateSubscriptionPlan` with a payment id it made up.
--
-- `20260821000000` put memberships behind Razorpay. That closed the front door
-- and left this one open:
--
--     Allow authenticated insert to subscriptions   FOR INSERT   WITH CHECK (true)
--     Allow authenticated update to subscriptions   FOR UPDATE   USING (true)
--     Allow authenticated read access to subscriptions FOR SELECT USING (true)
--
-- With those in place any `authenticated` caller can POST to /rest/v1/subscriptions
-- and mint a membership with `amount_paid = 0`, or - worse, because it needs no
-- other privilege - PATCH the `end_date` of the membership they already hold and
-- turn one month into ten years. `status` is writable by the same route, so an
-- expired membership can be switched back on.
--
-- Inserting a *new* row is inert on its own: the discount follows
-- `customers.active_subscription_id`, and `customers` grants no UPDATE to
-- `authenticated`. Extending an existing row is not, because the pointer is
-- already aimed at it.
--
-- `authenticated` is also not a synonym for "staff". It is whoever holds a
-- Supabase Auth session, and sign-ups are open (`enable_signup = true`,
-- `enable_confirmations = false` in supabase/config.toml) using an anon key that
-- ships in the browser bundle. Even where sign-up is closed, these policies grant
-- a privilege nothing needs.
--
-- SAFE FOR THE APP: every read and write of this table is in a `"use server"`
-- action going through SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS -
-- lib/payments/fulfil.ts, lib/payments/orders.ts, lib/subscriptions/discount.ts,
-- app/(customer)/my-subscription/action.ts and
-- app/(customer)/subscription/[planId]/payment-actions.ts. No client component
-- touches `subscriptions`; the only browser-side Supabase use in this area is a
-- realtime channel on `subscription_plans`, which is untouched below.

DROP POLICY IF EXISTS "Allow authenticated insert to subscriptions"      ON public.subscriptions;
DROP POLICY IF EXISTS "Allow authenticated update to subscriptions"      ON public.subscriptions;

-- The SELECT goes too, which is the one difference from the booking lockdown.
-- That kept `Staff read bookings` because the admin notification poller reads
-- `bookings` from the browser as `authenticated`. Nothing reads `subscriptions`
-- that way, and the rows carry a customer id, what they paid and when - so the
-- policy grants a view of every member's purchase history to anyone holding a
-- session, and buys the application nothing. Any future admin screen should read
-- it the way the rest of the admin does: a `requireStaff()` server action.
DROP POLICY IF EXISTS "Allow authenticated read access to subscriptions" ON public.subscriptions;

-- Stated rather than implied. `service_role` carries BYPASSRLS so this grants no
-- access it did not already have, but it leaves the table's intent readable in
-- `pg_policies` instead of as an empty list that looks like an oversight - and it
-- matches "Service role manages bookings" next door.
DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.subscriptions;

CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.subscriptions IS 'Memberships. Written only by the server on a verified Razorpay payment (lib/payments/fulfil.ts); RLS grants no direct access to anon or authenticated.';
