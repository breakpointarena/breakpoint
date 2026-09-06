-- ================================================
-- OTP SEND: issue a code atomically, and leave a trace when it fails
-- ================================================
--
-- Three defects in createOTPSession() motivated this migration.
--
--  1. The SMS went out BEFORE the row existed. The old order was: send the SMS,
--     retire every earlier session, then insert. A failed insert left the
--     customer holding a real code that nothing could redeem - and their
--     previous session was already retired, so the code in their hand and the
--     code in the database were both dead.
--
--  2. The hourly ceiling and the 60-second cooldown were read-then-act from the
--     application. Two requests arriving together both read "nothing recent",
--     both spent a paid SMS credit, and both inserted; the second one's
--     deactivation sweep then invalidated the first code, so whichever SMS
--     landed first was already useless by the time it was typed in.
--
--  3. A failed send left no row at all. The only trace was a console line, so a
--     customer reporting "it says failed to send" could not be looked up.
--
-- begin_otp_session() takes the whole decision - resend ceiling, hourly limit,
-- cooldown, retire the old session, insert the new one - inside one transaction
-- behind a per-phone advisory lock, and returns a row that exists BEFORE the SMS
-- is attempted. The application then sends, and marks the row 'sent' (with the
-- MSG91 request id) or 'failed' (with the reason).
--
-- A lost mark is deliberately harmless: verification accepts any row that is not
-- 'failed', so a dropped confirmation cannot strand a customer holding a code
-- that did arrive. Only the accounting degrades, never the login.
-- ================================================

-- ================================================
-- Schema
-- ================================================

-- Existing rows were, by definition, only ever inserted after a successful send,
-- so 'sent' is the correct default for them.
ALTER TABLE public.otp_sessions
  ADD COLUMN IF NOT EXISTS send_status TEXT NOT NULL DEFAULT 'sent';

ALTER TABLE public.otp_sessions
  DROP CONSTRAINT IF EXISTS otp_sessions_send_status_check;
ALTER TABLE public.otp_sessions
  ADD CONSTRAINT otp_sessions_send_status_check
  CHECK (send_status IN ('pending', 'sent', 'failed'));

-- What MSG91 called the request, so a delivery query can be answered without
-- guessing which send a customer is asking about.
ALTER TABLE public.otp_sessions
  ADD COLUMN IF NOT EXISTS msg91_request_id TEXT;

-- Why a send failed, in the machine-readable form the service returns
-- (invalid_recipient, provider_rejected, provider_unreachable, ...).
ALTER TABLE public.otp_sessions
  ADD COLUMN IF NOT EXISTS send_error TEXT;

-- The rate limit and the cooldown both scan a phone's recent non-failed rows.
CREATE INDEX IF NOT EXISTS idx_otp_sessions_send_window
  ON public.otp_sessions(phone, created_at)
  WHERE send_status <> 'failed';

-- ================================================
-- Issue a code
-- ================================================
CREATE OR REPLACE FUNCTION public.begin_otp_session(
  p_phone VARCHAR(15),
  p_otp_hash VARCHAR(255),
  p_otp_expires_at TIMESTAMPTZ,
  p_max_per_hour INT,
  p_cooldown_seconds INT,
  p_max_resends INT,
  p_is_resend BOOLEAN DEFAULT false,
  p_ip_address VARCHAR(45) DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  outcome TEXT,
  session_id UUID,
  expires_at TIMESTAMPTZ,
  next_allowed_at TIMESTAMPTZ,
  seconds_remaining INT,
  resends_used INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev RECORD;
  v_resends INT := 0;
  v_count INT;
  v_oldest TIMESTAMPTZ;
  v_last_sent TIMESTAMPTZ;
  v_elapsed INT;
  v_new_id UUID;
  -- Never compare against a NULL ceiling.
  --
  -- `x >= NULL` is NULL, and `IF NULL THEN` does not run, so a null parameter
  -- does not fall back to a default - it removes the limit. The application
  -- validates these before sending them, and this is the second lock on the
  -- same door: a mistyped OTP_MAX_REQUESTS_PER_PHONE arrives here as null
  -- (NaN does not survive JSON), and an unlimited OTP ceiling is an open tab
  -- at the SMS provider.
  v_max_per_hour INT := COALESCE(p_max_per_hour, 3);
  v_cooldown INT := COALESCE(p_cooldown_seconds, 60);
  v_max_resends INT := COALESCE(p_max_resends, 3);
BEGIN
  -- Serialise every concurrent send for this number. Two requests that arrive
  -- together now queue here instead of both deciding they are the first.
  PERFORM pg_advisory_xact_lock(hashtext('otp_send:' || p_phone));

  -- The newest usable session for this number, whichever state it is in.
  --
  -- This is what carries the resend counter forward. resendOTP() used to
  -- increment the counter on the row createOTPSession had just retired and start
  -- the new row at zero, so the resend ceiling never actually bit.
  SELECT s.id, s.resend_count
  INTO v_prev
  FROM public.otp_sessions s
  WHERE s.phone = p_phone
    AND s.send_status <> 'failed'
    AND s.created_at > NOW() - INTERVAL '1 hour'
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_resends := v_prev.resend_count;
  END IF;

  IF p_is_resend AND v_resends >= v_max_resends THEN
    RETURN QUERY SELECT 'resend_limit'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ,
                        NULL::TIMESTAMPTZ, 0, v_resends;
    RETURN;
  END IF;

  -- Hourly ceiling. Failed sends are excluded on purpose: a code that never
  -- reached the handset must not spend the customer's quota, or one provider
  -- outage locks them out for an hour.
  SELECT COUNT(*), MIN(s.created_at)
  INTO v_count, v_oldest
  FROM public.otp_sessions s
  WHERE s.phone = p_phone
    AND s.created_at > NOW() - INTERVAL '1 hour'
    AND s.send_status <> 'failed';

  IF v_count >= v_max_per_hour THEN
    RETURN QUERY SELECT 'rate_limited'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ,
                        v_oldest + INTERVAL '1 hour', 0, v_resends;
    RETURN;
  END IF;

  -- Cooldown between consecutive codes.
  SELECT MAX(s.otp_sent_at)
  INTO v_last_sent
  FROM public.otp_sessions s
  WHERE s.phone = p_phone
    AND s.send_status <> 'failed';

  IF v_last_sent IS NOT NULL THEN
    v_elapsed := FLOOR(EXTRACT(EPOCH FROM (NOW() - v_last_sent)))::INT;
    IF v_elapsed < v_cooldown THEN
      RETURN QUERY SELECT 'cooldown'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ,
                          v_last_sent + make_interval(secs => v_cooldown),
                          v_cooldown - v_elapsed, v_resends;
      RETURN;
    END IF;
  END IF;

  -- Retire the earlier codes and insert the replacement in the same
  -- transaction, so there is no instant where the customer's only live code has
  -- been cancelled and its successor does not exist yet.
  UPDATE public.otp_sessions
  SET is_active = false, updated_at = NOW()
  WHERE phone = p_phone
    AND is_active = true;

  IF p_is_resend THEN
    v_resends := v_resends + 1;
  END IF;

  INSERT INTO public.otp_sessions (
    phone, otp_hash, otp_sent_at, otp_expires_at, otp_attempts,
    is_active, is_verified, resend_count, last_resend_at,
    send_status, ip_address, user_agent
  ) VALUES (
    p_phone, p_otp_hash, NOW(), p_otp_expires_at, 0,
    true, false, v_resends,
    CASE WHEN p_is_resend THEN NOW() ELSE NULL END,
    'pending', p_ip_address, p_user_agent
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_new_id, p_otp_expires_at,
                      NULL::TIMESTAMPTZ, 0, v_resends;
END;
$$;

-- ================================================
-- Verification must ignore sends we know failed
-- ================================================
-- Same body as the original, plus the send_status guard: a row marked 'failed'
-- is never redeemable, even in the window before its is_active flag settles.
-- 'pending' stays redeemable - see the note at the top about why a lost
-- confirmation must not strand a customer.
CREATE OR REPLACE FUNCTION public.consume_otp_attempt(
  p_phone VARCHAR(15),
  p_otp_hash VARCHAR(255),
  p_max_attempts INT
)
RETURNS TABLE (
  outcome TEXT,
  session_id UUID,
  attempts_remaining INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_session RECORD;
  v_attempts INT;
  -- Same reason as begin_otp_session: `v_attempts >= NULL` is NULL, so a null
  -- ceiling here would not cap anything - it would hand out unlimited guesses
  -- against a six-digit code.
  v_max_attempts INT := COALESCE(p_max_attempts, 3);
BEGIN
  -- Lock the row so concurrent guesses serialise on it.
  SELECT s.id, s.otp_hash, s.otp_attempts
  INTO v_session
  FROM public.otp_sessions s
  WHERE s.phone = p_phone
    AND s.is_active = true
    AND s.is_verified = false
    AND s.send_status <> 'failed'
    AND s.otp_expires_at > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_session'::TEXT, NULL::UUID, 0;
    RETURN;
  END IF;

  IF v_session.otp_attempts >= v_max_attempts THEN
    UPDATE public.otp_sessions SET is_active = false, updated_at = NOW()
    WHERE id = v_session.id;
    RETURN QUERY SELECT 'too_many_attempts'::TEXT, v_session.id, 0;
    RETURN;
  END IF;

  v_attempts := v_session.otp_attempts + 1;

  UPDATE public.otp_sessions
  SET otp_attempts = v_attempts, updated_at = NOW()
  WHERE id = v_session.id;

  -- Constant-time-ish comparison of two equal-length hex digests.
  IF v_session.otp_hash = p_otp_hash THEN
    RETURN QUERY SELECT 'verified'::TEXT, v_session.id, v_max_attempts - v_attempts;
  ELSE
    IF v_attempts >= v_max_attempts THEN
      UPDATE public.otp_sessions SET is_active = false, updated_at = NOW()
      WHERE id = v_session.id;
    END IF;
    RETURN QUERY SELECT 'invalid'::TEXT, v_session.id, v_max_attempts - v_attempts;
  END IF;
END;
$$;

-- ================================================
-- Standalone rate-limit read
-- ================================================
-- No longer on the send path (begin_otp_session decides that under its lock),
-- but kept for scripts and support queries. Aligned with the new accounting so
-- the two cannot disagree.
CREATE OR REPLACE FUNCTION public.check_otp_rate_limit(p_phone VARCHAR(15))
RETURNS TABLE (
  is_allowed BOOLEAN,
  requests_count INT,
  next_allowed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
  v_oldest_request TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*), MIN(created_at)
  INTO v_count, v_oldest_request
  FROM public.otp_sessions
  WHERE phone = p_phone
    AND created_at > NOW() - INTERVAL '1 hour'
    AND send_status <> 'failed';

  RETURN QUERY
  SELECT
    (v_count < 3) AS is_allowed,
    v_count AS requests_count,
    CASE WHEN v_count >= 3 THEN v_oldest_request + INTERVAL '1 hour' ELSE NOW() END
      AS next_allowed_at;
END;
$$;

-- ================================================
-- Function grants: service role only
-- ================================================
REVOKE ALL ON FUNCTION public.begin_otp_session(
  VARCHAR, VARCHAR, TIMESTAMPTZ, INT, INT, INT, BOOLEAN, VARCHAR, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_otp_session(
  VARCHAR, VARCHAR, TIMESTAMPTZ, INT, INT, INT, BOOLEAN, VARCHAR, TEXT
) TO service_role;

-- ================================================
-- Comments
-- ================================================
COMMENT ON FUNCTION public.begin_otp_session(
  VARCHAR, VARCHAR, TIMESTAMPTZ, INT, INT, INT, BOOLEAN, VARCHAR, TEXT
) IS 'Reserves the next OTP for a phone under a per-phone advisory lock: resend ceiling, hourly limit, cooldown, retire-old and insert-new in one transaction. The row is created BEFORE the SMS is attempted.';
COMMENT ON COLUMN public.otp_sessions.send_status IS 'pending = row reserved, SMS not yet confirmed; sent = provider accepted it; failed = never delivered, excluded from rate limiting and not redeemable.';
COMMENT ON COLUMN public.otp_sessions.msg91_request_id IS 'MSG91 request id for the send, so a delivery query can be traced without guessing.';
COMMENT ON COLUMN public.otp_sessions.send_error IS 'Machine-readable reason a send failed (invalid_recipient, provider_rejected, provider_unreachable, ...).';
