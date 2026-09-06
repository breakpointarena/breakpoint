-- ================================================
-- THE REST OF THE MEMBERSHIP AUDIT
-- ================================================
-- Two findings left over from the sweep that produced
-- `20260826100000_lock_down_subscriptions.sql`. Neither is reachable through the
-- application; both are things the database was promising to anyone who asked it
-- directly.

-- ================================================
-- 1. customer_subscriptions IS WRITABLE BY anon
-- ================================================
-- The policy is named "Allow service role all on customer_subscriptions" and its
-- role is `public`:
--
--     POLICY "Allow service role all on customer_subscriptions"  FOR ALL  USING (true)
--     POLICY "Allow public read customer_subscriptions"          FOR SELECT USING (true)
--
-- `public` includes `anon`, and the anon key ships in every browser bundle by
-- design - so this is INSERT, UPDATE, DELETE and SELECT on a table with foreign
-- keys into `customers` and `subscriptions`, granted to the internet. The name
-- says otherwise, which is presumably why it survived
-- `20260803000000`'s sweep of the booking tables.
--
-- The table is dead rather than merely unused: `git log -S customer_subscriptions`
-- finds no commit that ever read or wrote it in application code, and it holds no
-- rows. It is not dropped here because a DROP cannot be taken back and this
-- migration will run against a database nobody has counted the rows of - locking
-- it closes the hole, and the table can be dropped later once production is known
-- to be empty:
--
--     select count(*) from public.customer_subscriptions;   -- expect 0
--     drop table public.customer_subscriptions;

DROP POLICY IF EXISTS "Allow service role all on customer_subscriptions" ON public.customer_subscriptions;
DROP POLICY IF EXISTS "Allow public read customer_subscriptions"         ON public.customer_subscriptions;
DROP POLICY IF EXISTS "Service role manages customer_subscriptions"      ON public.customer_subscriptions;

-- What the old policy's *name* claimed. Nothing reads this table, so if anything
-- ever does it will be a server action on the service role like the rest.
CREATE POLICY "Service role manages customer_subscriptions"
  ON public.customer_subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.customer_subscriptions IS 'Unused since it was created; no application code has ever read or written it. Memberships live in public.subscriptions. Safe to drop once confirmed empty.';

-- ================================================
-- 2. subscriptions.payment_id HAS NO INDEX AND NO UNIQUENESS
-- ================================================
-- `bookings` carries `idx_bookings_razorpay_payment` for the same column under a
-- different name; `subscriptions.payment_id` has nothing at all. It is read on the
-- recovery path in `lib/payments/verify.ts` - `getSubscriptionByPaymentId`, which
-- answers "did this payment already produce a membership" when an order was
-- fulfilled but died before its id was written back - so the lookup that runs
-- when something has already gone wrong was the one doing a sequential scan.
--
-- UNIQUE as well as indexed, because the invariant is real: one payment funds at
-- most one membership. Today that is guaranteed only by the atomic claim in
-- `claimPaidOrder`, which is sound but is application code; a duplicate arriving
-- by any other route - a manual insert, a restored backup, a future caller that
-- forgets the claim - would currently be accepted, and `getSubscriptionByPaymentId`
-- would then return whichever row came back first.
--
-- Checked before it is built. A legacy membership carries the id the browser
-- invented before `20260821000000` put memberships behind Razorpay -
-- `pay_mock_${Math.floor(Math.random() * 10000)}`, ten thousand possible values -
-- so two of them colliding is unlikely but not impossible, and a bare unique
-- violation during deploy would name the id without explaining what it is.
DO $$
DECLARE
  v_duplicates TEXT;
BEGIN
  SELECT string_agg(payment_id || ' (' || n || ' memberships)', ', ')
  INTO v_duplicates
  FROM (
    SELECT payment_id, count(*) AS n
    FROM public.subscriptions
    WHERE payment_id IS NOT NULL
    GROUP BY payment_id
    HAVING count(*) > 1
  ) AS dupes;

  IF v_duplicates IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot make subscriptions.payment_id unique - these payments already fund more than one membership: %. Resolve them (a pay_mock_ id is a pre-Razorpay membership and can be set to NULL) and re-run.',
      v_duplicates;
  END IF;
END
$$;

-- Partial on IS NOT NULL: a membership created by hand may have no payment id,
-- and several of those must not collide with each other. The predicate is one the
-- planner can prove from `payment_id = $1`, so the lookup uses it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_payment_id
  ON public.subscriptions (payment_id)
  WHERE payment_id IS NOT NULL;

COMMENT ON INDEX public.idx_subscriptions_payment_id IS 'One Razorpay payment funds at most one membership. Also serves getSubscriptionByPaymentId on the fulfilment recovery path.';
