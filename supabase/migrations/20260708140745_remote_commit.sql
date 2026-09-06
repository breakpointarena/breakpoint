drop extension if exists "pg_net";

set check_function_bodies = off;

-- Drop existing functions to allow return type change
DROP FUNCTION IF EXISTS public.decrement_menu_item_quantity(uuid, integer);
DROP FUNCTION IF EXISTS public.increment_menu_item_quantity(uuid, integer);

CREATE OR REPLACE FUNCTION public.decrement_menu_item_quantity(item_id uuid, decrement_by integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE menu_items
  SET
    quantity = GREATEST(0, quantity - decrement_by),
    updated_at = NOW()
  WHERE id = item_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_menu_item_quantity(item_id uuid, increment_by integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE menu_items
  SET
    quantity = quantity + increment_by,
    updated_at = NOW()
  WHERE id = item_id;
END;
$function$
;

grant delete on table "public"."admin_users" to "anon";

grant insert on table "public"."admin_users" to "anon";

grant select on table "public"."admin_users" to "anon";

grant update on table "public"."admin_users" to "anon";

grant delete on table "public"."admin_users" to "authenticated";

grant insert on table "public"."admin_users" to "authenticated";

grant select on table "public"."admin_users" to "authenticated";

grant update on table "public"."admin_users" to "authenticated";

grant delete on table "public"."booking_device_slots" to "anon";

grant insert on table "public"."booking_device_slots" to "anon";

grant select on table "public"."booking_device_slots" to "anon";

grant update on table "public"."booking_device_slots" to "anon";

grant delete on table "public"."booking_device_slots" to "authenticated";

grant insert on table "public"."booking_device_slots" to "authenticated";

grant select on table "public"."booking_device_slots" to "authenticated";

grant update on table "public"."booking_device_slots" to "authenticated";

grant delete on table "public"."booking_food_items" to "anon";

grant insert on table "public"."booking_food_items" to "anon";

grant select on table "public"."booking_food_items" to "anon";

grant update on table "public"."booking_food_items" to "anon";

grant delete on table "public"."booking_food_items" to "authenticated";

grant insert on table "public"."booking_food_items" to "authenticated";

grant select on table "public"."booking_food_items" to "authenticated";

grant update on table "public"."booking_food_items" to "authenticated";

grant delete on table "public"."booking_line_items" to "anon";

grant insert on table "public"."booking_line_items" to "anon";

grant update on table "public"."booking_line_items" to "anon";

grant delete on table "public"."booking_line_items" to "authenticated";

grant insert on table "public"."booking_line_items" to "authenticated";

grant update on table "public"."booking_line_items" to "authenticated";

grant delete on table "public"."bookings" to "anon";

grant insert on table "public"."bookings" to "anon";

grant select on table "public"."bookings" to "anon";

grant update on table "public"."bookings" to "anon";

grant delete on table "public"."bookings" to "authenticated";

grant insert on table "public"."bookings" to "authenticated";

grant select on table "public"."bookings" to "authenticated";

grant update on table "public"."bookings" to "authenticated";

grant delete on table "public"."customer_subscriptions" to "anon";

grant insert on table "public"."customer_subscriptions" to "anon";

grant update on table "public"."customer_subscriptions" to "anon";

grant delete on table "public"."customer_subscriptions" to "authenticated";

grant insert on table "public"."customer_subscriptions" to "authenticated";

grant update on table "public"."customer_subscriptions" to "authenticated";

grant delete on table "public"."customers" to "anon";

grant insert on table "public"."customers" to "anon";

grant select on table "public"."customers" to "anon";

grant update on table "public"."customers" to "anon";

grant delete on table "public"."customers" to "authenticated";

grant insert on table "public"."customers" to "authenticated";

grant select on table "public"."customers" to "authenticated";

grant update on table "public"."customers" to "authenticated";

grant delete on table "public"."device_types" to "anon";

grant insert on table "public"."device_types" to "anon";

grant select on table "public"."device_types" to "anon";

grant update on table "public"."device_types" to "anon";

grant delete on table "public"."device_types" to "authenticated";

grant insert on table "public"."device_types" to "authenticated";

grant select on table "public"."device_types" to "authenticated";

grant update on table "public"."device_types" to "authenticated";

grant delete on table "public"."devices" to "anon";

grant insert on table "public"."devices" to "anon";

grant select on table "public"."devices" to "anon";

grant update on table "public"."devices" to "anon";

grant delete on table "public"."devices" to "authenticated";

grant insert on table "public"."devices" to "authenticated";

grant select on table "public"."devices" to "authenticated";

grant update on table "public"."devices" to "authenticated";

grant delete on table "public"."expenses" to "anon";

grant insert on table "public"."expenses" to "anon";

grant select on table "public"."expenses" to "anon";

grant update on table "public"."expenses" to "anon";

grant delete on table "public"."happy_hour_rules" to "anon";

grant insert on table "public"."happy_hour_rules" to "anon";

grant select on table "public"."happy_hour_rules" to "anon";

grant update on table "public"."happy_hour_rules" to "anon";

grant delete on table "public"."happy_hour_rules" to "authenticated";

grant insert on table "public"."happy_hour_rules" to "authenticated";

grant select on table "public"."happy_hour_rules" to "authenticated";

grant update on table "public"."happy_hour_rules" to "authenticated";

grant delete on table "public"."menu_items" to "anon";

grant insert on table "public"."menu_items" to "anon";

grant select on table "public"."menu_items" to "anon";

grant update on table "public"."menu_items" to "anon";

grant delete on table "public"."menu_items" to "authenticated";

grant insert on table "public"."menu_items" to "authenticated";

grant select on table "public"."menu_items" to "authenticated";

grant update on table "public"."menu_items" to "authenticated";

grant delete on table "public"."payment_groups" to "anon";

grant insert on table "public"."payment_groups" to "anon";

grant select on table "public"."payment_groups" to "anon";

grant update on table "public"."payment_groups" to "anon";

grant delete on table "public"."payment_groups" to "authenticated";

grant insert on table "public"."payment_groups" to "authenticated";

grant select on table "public"."payment_groups" to "authenticated";

grant update on table "public"."payment_groups" to "authenticated";

grant delete on table "public"."promo_codes" to "anon";

grant insert on table "public"."promo_codes" to "anon";

grant select on table "public"."promo_codes" to "anon";

grant update on table "public"."promo_codes" to "anon";

grant delete on table "public"."promo_codes" to "authenticated";

grant insert on table "public"."promo_codes" to "authenticated";

grant select on table "public"."promo_codes" to "authenticated";

grant update on table "public"."promo_codes" to "authenticated";

grant delete on table "public"."subscription_plans" to "anon";

grant insert on table "public"."subscription_plans" to "anon";

grant select on table "public"."subscription_plans" to "anon";

grant update on table "public"."subscription_plans" to "anon";

grant delete on table "public"."subscription_plans" to "authenticated";

grant insert on table "public"."subscription_plans" to "authenticated";

grant select on table "public"."subscription_plans" to "authenticated";

grant update on table "public"."subscription_plans" to "authenticated";

grant delete on table "public"."subscription_plans_legacy" to "anon";

grant insert on table "public"."subscription_plans_legacy" to "anon";

grant select on table "public"."subscription_plans_legacy" to "anon";

grant update on table "public"."subscription_plans_legacy" to "anon";

grant delete on table "public"."subscription_plans_legacy" to "authenticated";

grant insert on table "public"."subscription_plans_legacy" to "authenticated";

grant select on table "public"."subscription_plans_legacy" to "authenticated";

grant update on table "public"."subscription_plans_legacy" to "authenticated";

grant delete on table "public"."subscription_purchases_legacy" to "anon";

grant insert on table "public"."subscription_purchases_legacy" to "anon";

grant select on table "public"."subscription_purchases_legacy" to "anon";

grant update on table "public"."subscription_purchases_legacy" to "anon";

grant delete on table "public"."subscription_purchases_legacy" to "authenticated";

grant insert on table "public"."subscription_purchases_legacy" to "authenticated";

grant select on table "public"."subscription_purchases_legacy" to "authenticated";

grant update on table "public"."subscription_purchases_legacy" to "authenticated";

grant delete on table "public"."subscriptions" to "anon";

grant insert on table "public"."subscriptions" to "anon";

grant select on table "public"."subscriptions" to "anon";

grant update on table "public"."subscriptions" to "anon";

grant delete on table "public"."subscriptions" to "authenticated";

grant insert on table "public"."subscriptions" to "authenticated";

grant select on table "public"."subscriptions" to "authenticated";

grant update on table "public"."subscriptions" to "authenticated";


