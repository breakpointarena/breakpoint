-- Retire hour-pack catalog rows without carrying their balances into the wallet.
-- Keep old subscription rows for audit/history, but detach them from the plan
-- catalog so the obsolete plans can be removed without deleting purchase history.
UPDATE public.customers c
SET active_subscription_id = NULL
FROM public.subscriptions s
JOIN public.subscription_plans sp ON sp.id = s.subscription_plan_id
WHERE c.active_subscription_id = s.id
  AND sp.plan_type = 'hour_pack';

UPDATE public.subscriptions s
SET subscription_plan_id = NULL,
    hours_remaining_minutes = 0,
    status = CASE WHEN s.status = 'active' THEN 'cancelled' ELSE s.status END
FROM public.subscription_plans sp
WHERE sp.id = s.subscription_plan_id
  AND sp.plan_type = 'hour_pack';

DELETE FROM public.subscription_plans
WHERE plan_type = 'hour_pack';
