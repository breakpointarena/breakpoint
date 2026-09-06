-- ================================================
-- END-TO-END DATABASE CHECKS
-- ================================================
-- Everything the booking flows rely on the database to guarantee: slot holds,
-- the walk-in session lifecycle, advance bookings, and that the customer online
-- path is untouched by any of it.
--
-- Runs inside a transaction and rolls back, so it is safe against a database with
-- real data in it. Nothing survives the run.
--
--   docker exec -i supabase_db_arena-breakpoint psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < scripts/e2e-checks.sql
--
-- Any FAIL raises and aborts. A clean run ends with ALL DATABASE CHECKS PASSED.

BEGIN;

DO $$
DECLARE
  v_type UUID; v_rate NUMERIC; v_capacity INT;
  v_b UUID; v_other UUID; v_slot UUID;
  r RECORD; n INT; i INT;
  v_wins INT := 0; v_losses INT := 0;
BEGIN
  SELECT id, regular_hourly_rate INTO v_type, v_rate FROM device_types WHERE name = 'ps5';
  SELECT count(*) INTO v_capacity FROM devices
   WHERE device_type_id = v_type AND status = 'available';

  RAISE NOTICE '--- Slot holds (customer online flow) ---';

  -- One hold per station, and not one more.
  FOR i IN 1..(v_capacity + 1) LOOP
    INSERT INTO bookings (booking_number, status, lock_expires_at, hold_token, total_amount)
    VALUES ('E2E-HOLD-' || i, 'locked', NOW() + INTERVAL '10 minutes', 'tok-' || i, 0)
    RETURNING id INTO v_b;

    SELECT count(*) INTO n FROM assign_device_slot(
      v_b, v_type, CURRENT_DATE + 3, '10:00:00', '11:30:00',
      1.5, v_rate, 300, 'PS5 Console', 1, 1, 0, 0);

    IF n = 1 THEN v_wins := v_wins + 1; ELSE v_losses := v_losses + 1; END IF;
  END LOOP;

  IF v_wins <> v_capacity OR v_losses <> 1 THEN
    RAISE EXCEPTION 'FAIL: % stations, % holds granted, % refused', v_capacity, v_wins, v_losses;
  END IF;
  RAISE NOTICE 'PASS: % stations -> % holds granted, 1 refused', v_capacity, v_wins;

  PERFORM 1 FROM booking_device_slots
   WHERE slot_date = CURRENT_DATE + 3 AND slot_start_time = '10:00:00'
   GROUP BY device_id HAVING count(*) > 1;
  IF FOUND THEN RAISE EXCEPTION 'FAIL: a station was held twice'; END IF;
  RAISE NOTICE 'PASS: no station held twice';

  -- A hold that has run out frees its station at the same start time.
  UPDATE bookings SET lock_expires_at = NOW() - INTERVAL '1 minute'
   WHERE booking_number = 'E2E-HOLD-1';

  INSERT INTO bookings (booking_number, status, lock_expires_at, hold_token, total_amount)
  VALUES ('E2E-HOLD-LATE', 'locked', NOW() + INTERVAL '10 minutes', 'tok-late', 0)
  RETURNING id INTO v_b;

  SELECT count(*) INTO n FROM assign_device_slot(
    v_b, v_type, CURRENT_DATE + 3, '10:00:00', '11:30:00',
    1.5, v_rate, 300, 'PS5 Console', 1, 1, 0, 0);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: a lapsed hold still blocked its station'; END IF;
  RAISE NOTICE 'PASS: lapsed hold releases its station';

  -- Release needs the right token, and is a no-op the second time.
  SELECT id INTO v_b FROM bookings WHERE booking_number = 'E2E-HOLD-2';
  IF release_slot_hold(v_b, 'wrong') THEN
    RAISE EXCEPTION 'FAIL: released with the wrong token';
  END IF;
  IF NOT release_slot_hold(v_b, 'tok-2') THEN
    RAISE EXCEPTION 'FAIL: owner could not release its own hold';
  END IF;
  IF release_slot_hold(v_b, 'tok-2') THEN
    RAISE EXCEPTION 'FAIL: released twice';
  END IF;
  PERFORM 1 FROM booking_device_slots WHERE booking_id = v_b;
  IF FOUND THEN RAISE EXCEPTION 'FAIL: release left the slot row behind'; END IF;
  RAISE NOTICE 'PASS: release is owner-only, idempotent, and clears the slot';

  RAISE NOTICE '--- Walk-in session lifecycle ---';

  INSERT INTO bookings (booking_number, customer_name, customer_phone, status, total_amount,
    booking_source, billed_on_actual_time, walk_in_device_type_id,
    walk_in_device_type_name, walk_in_player_count)
  VALUES ('E2E-WI', 'Walk In', '9876500000', 'confirmed', 0,
    'walk-in', true, v_type, 'PS5 Console', 1)
  RETURNING id INTO v_b;

  SELECT count(*) INTO n FROM booking_device_slots WHERE booking_id = v_b;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: creation allocated a station'; END IF;
  SELECT status, checked_in_at, total_amount INTO r FROM bookings WHERE id = v_b;
  IF r.status <> 'confirmed' OR r.checked_in_at IS NOT NULL OR r.total_amount <> 0 THEN
    RAISE EXCEPTION 'FAIL: a new walk-in is not waiting (status=%, total=%)', r.status, r.total_amount;
  END IF;
  RAISE NOTICE 'PASS: created waiting - no station, no clock, no money';

  SELECT count(*) INTO n FROM checkout_walkin_session(v_b);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: checked out before check-in'; END IF;
  RAISE NOTICE 'PASS: cannot check out before check-in';

  SELECT * INTO r FROM checkin_walkin_session(v_b, v_type, 'PS5 Console', v_rate, 1, 1, 0, 5);
  IF r.station_number IS NULL THEN RAISE EXCEPTION 'FAIL: check-in claimed no station'; END IF;
  SELECT status, checked_in_at INTO r FROM bookings WHERE id = v_b;
  IF r.status <> 'checked_in' OR r.checked_in_at IS NULL THEN
    RAISE EXCEPTION 'FAIL: check-in did not start the session';
  END IF;
  IF abs(EXTRACT(EPOCH FROM (r.checked_in_at - NOW()))) > 5 THEN
    RAISE EXCEPTION 'FAIL: checked_in_at is not the database clock';
  END IF;
  RAISE NOTICE 'PASS: checked in, station claimed, clock from the server';

  SELECT count(*) INTO n FROM checkin_walkin_session(v_b, v_type, 'PS5 Console', v_rate, 1, 1, 0, 5);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: checked in twice'; END IF;
  RAISE NOTICE 'PASS: cannot check in twice';

  -- Food added mid-session belongs on the bill.
  INSERT INTO booking_food_items (booking_id, item_name, item_category, quantity,
    unit_price, line_total, status)
  VALUES (v_b, 'Coffee', 'beverages', 2, 50, 100, 'preparing');

  -- Backdate so there is a measurable session, then stop the clock.
  UPDATE bookings SET checked_in_at = NOW() - INTERVAL '2 hours 45 minutes' WHERE id = v_b;
  SELECT * INTO r FROM checkout_walkin_session(v_b);
  IF r.played_minutes NOT BETWEEN 165 AND 166 THEN
    RAISE EXCEPTION 'FAIL: expected 165 minutes, got %', r.played_minutes;
  END IF;
  RAISE NOTICE 'PASS: 9:00-11:45 style session measured as % minutes', r.played_minutes;

  SELECT count(*) INTO n FROM checkout_walkin_session(v_b);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: checked out twice'; END IF;
  SELECT count(*) INTO n FROM checkin_walkin_session(v_b, v_type, 'PS5 Console', v_rate, 1, 1, 0, 5);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a completed session was reopened'; END IF;
  RAISE NOTICE 'PASS: a completed session is terminal';

  SELECT count(*) INTO n FROM booking_device_slots WHERE booking_id = v_b;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: % slot rows on one session', n; END IF;
  RAISE NOTICE 'PASS: exactly one station, start to finish';

  -- Every station of a type busy -> check-in is refused and rolls back cleanly.
  FOR i IN 1..v_capacity LOOP
    INSERT INTO bookings (booking_number, customer_name, customer_phone, status, total_amount,
      booking_source, billed_on_actual_time, walk_in_device_type_id,
      walk_in_device_type_name, walk_in_player_count)
    VALUES ('E2E-FILL-' || i, 'Filler', '9876500001', 'confirmed', 0,
      'walk-in', true, v_type, 'PS5 Console', 1)
    RETURNING id INTO v_other;
    PERFORM checkin_walkin_session(v_other, v_type, 'PS5 Console', v_rate, 1, 1, 0, 5);
  END LOOP;

  INSERT INTO bookings (booking_number, customer_name, customer_phone, status, total_amount,
    booking_source, billed_on_actual_time, walk_in_device_type_id,
    walk_in_device_type_name, walk_in_player_count)
  VALUES ('E2E-OVERFLOW', 'Unlucky', '9876500002', 'confirmed', 0,
    'walk-in', true, v_type, 'PS5 Console', 1)
  RETURNING id INTO v_other;

  SELECT count(*) INTO n FROM checkin_walkin_session(v_other, v_type, 'PS5 Console', v_rate, 1, 1, 0, 5);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: checked in with every station busy'; END IF;
  SELECT status, checked_in_at INTO r FROM bookings WHERE id = v_other;
  IF r.status <> 'confirmed' OR r.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a refused check-in left the booking in %', r.status;
  END IF;
  RAISE NOTICE 'PASS: floor full -> check-in refused, booking still waiting';

  RAISE NOTICE '--- Food on a walk-in ---';

  INSERT INTO bookings (booking_number, customer_name, customer_phone, status, total_amount,
    device_subtotal, food_subtotal, booking_source, billed_on_actual_time,
    walk_in_device_type_id, walk_in_device_type_name, walk_in_player_count)
  VALUES ('E2E-FOOD', 'Hungry', '9876500009', 'confirmed', 0, 0, 0,
    'walk-in', true, v_type, 'PS5 Console', 4)
  RETURNING id INTO v_b;

  -- Two coffees at 50. The trigger owns food_subtotal and total_amount; the
  -- application must read them, never add the same items on top again.
  INSERT INTO booking_food_items (booking_id, item_name, item_category, quantity,
    unit_price, line_total, status)
  VALUES (v_b, 'Coffee', 'beverages', 2, 50, 100, 'pending');

  SELECT food_subtotal, total_amount INTO r FROM bookings WHERE id = v_b;
  IF r.food_subtotal <> 100 THEN
    RAISE EXCEPTION 'FAIL: 2 x 50 of food came to % - counted more than once', r.food_subtotal;
  END IF;
  IF r.total_amount <> 100 THEN
    RAISE EXCEPTION 'FAIL: total is % for 100 of food on a session with no play yet', r.total_amount;
  END IF;
  RAISE NOTICE 'PASS: 2 x Rs.50 of food = Rs.100 on the bill, counted once';

  -- A second order adds to it; it does not replace or re-double it.
  INSERT INTO booking_food_items (booking_id, item_name, item_category, quantity,
    unit_price, line_total, status)
  VALUES (v_b, 'Samosa', 'snacks', 3, 25, 75, 'pending');

  SELECT food_subtotal, total_amount INTO r FROM bookings WHERE id = v_b;
  IF r.food_subtotal <> 175 OR r.total_amount <> 175 THEN
    RAISE EXCEPTION 'FAIL: after a second order food=% total=%, expected 175',
      r.food_subtotal, r.total_amount;
  END IF;
  RAISE NOTICE 'PASS: a second order adds to the food total (Rs.175)';

  -- Four players at the table must not multiply the food.
  IF (SELECT walk_in_player_count FROM bookings WHERE id = v_b) <> 4 THEN
    RAISE EXCEPTION 'FAIL: test setup - expected 4 players';
  END IF;
  IF r.food_subtotal <> 175 THEN
    RAISE EXCEPTION 'FAIL: food scaled with player count (% for 4 players)', r.food_subtotal;
  END IF;
  RAISE NOTICE 'PASS: 4 players at the table, food still Rs.175 - never per player';

  -- Play is charged on top of the food, each counted once.
  UPDATE bookings SET device_subtotal = 550, total_amount = 550 + 175 WHERE id = v_b;
  SELECT device_subtotal, food_subtotal, total_amount INTO r FROM bookings WHERE id = v_b;
  IF r.total_amount <> r.device_subtotal + r.food_subtotal THEN
    RAISE EXCEPTION 'FAIL: total % <> play % + food %',
      r.total_amount, r.device_subtotal, r.food_subtotal;
  END IF;
  RAISE NOTICE 'PASS: final bill = play Rs.% + food Rs.% = Rs.%',
    r.device_subtotal, r.food_subtotal, r.total_amount;

  -- Removing an item takes exactly that item off.
  DELETE FROM booking_food_items WHERE booking_id = v_b AND item_name = 'Samosa';
  SELECT food_subtotal INTO r FROM bookings WHERE id = v_b;
  IF r.food_subtotal <> 100 THEN
    RAISE EXCEPTION 'FAIL: after removing Rs.75 of food, food_subtotal is %', r.food_subtotal;
  END IF;
  RAISE NOTICE 'PASS: removing an item takes only that item off (Rs.100 left)';

  RAISE NOTICE '--- Advance counter booking ---';

  INSERT INTO bookings (booking_number, customer_name, customer_phone, status,
    total_amount, device_subtotal, booking_source, billed_on_actual_time, checked_in_at)
  VALUES ('E2E-ADV', 'Later Today', '9876511111', 'confirmed', 200, 200, 'walk-in', false, NULL)
  RETURNING id INTO v_b;

  SELECT count(*) INTO n FROM assign_device_slot(
    v_b, v_type, CURRENT_DATE + 4, '20:00:00', '21:00:00',
    1.0, v_rate, 200, 'PS5 Console', 1, 1, 0, 0);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: advance booking got no station'; END IF;

  SELECT status, checked_in_at INTO r FROM bookings WHERE id = v_b;
  IF r.status <> 'confirmed' OR r.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: advance booking was auto checked in';
  END IF;
  RAISE NOTICE 'PASS: an advance booking waits for the customer';

  SELECT count(*) INTO n FROM checkin_walkin_session(v_b, v_type, 'PS5 Console', v_rate, 1, 1, 0, 5);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: session check-in claimed an advance booking'; END IF;
  RAISE NOTICE 'PASS: an advance booking is not a walk-in session';

  RAISE NOTICE '--- Customer online flow is untouched ---';

  INSERT INTO bookings (booking_number, status, lock_expires_at, hold_token, total_amount)
  VALUES ('E2E-ONL', 'locked', NOW() + INTERVAL '10 minutes', 'tok-onl', 0)
  RETURNING id INTO v_b;

  SELECT count(*) INTO n FROM assign_device_slot(
    v_b, v_type, CURRENT_DATE + 5, '15:00:00', '16:00:00',
    1.0, v_rate, 200, 'PS5 Console', 1, 1, 0, 0);
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: online hold could not claim a station'; END IF;

  SELECT billed_on_actual_time, walk_in_device_type_id INTO r FROM bookings WHERE id = v_b;
  IF r.billed_on_actual_time IS DISTINCT FROM false OR r.walk_in_device_type_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: a customer hold looks like a walk-in session';
  END IF;

  -- Conversion to a paid booking, exactly as fulfilment does it.
  UPDATE bookings
     SET status = 'confirmed', payment_status = 'paid', customer_phone = '9000000000',
         customer_name = 'Online Customer', amount_paid = 200, online_amount = 200,
         total_amount = 200, device_subtotal = 200, hold_token = NULL,
         lock_expires_at = NULL, locked_by = 'customer', created_at = NOW()
   WHERE id = v_b AND status = 'locked' AND hold_token = 'tok-onl' AND lock_expires_at > NOW();
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL: hold conversion matched nothing'; END IF;

  SELECT count(*) INTO n FROM booking_device_slots WHERE booking_id = v_b;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: % slot rows after conversion', n; END IF;
  RAISE NOTICE 'PASS: hold converts in place - one booking, one station';

  BEGIN
    INSERT INTO bookings (booking_number, status, total_amount)
    VALUES ('E2E-NOPHONE', 'confirmed', 100);
    RAISE EXCEPTION 'FAIL: a confirmed booking was allowed with no phone';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: a real booking still requires a phone';
  END;

  RAISE NOTICE '';
  RAISE NOTICE 'ALL DATABASE CHECKS PASSED';
END $$;

ROLLBACK;
