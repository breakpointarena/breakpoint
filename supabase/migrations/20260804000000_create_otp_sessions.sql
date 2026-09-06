-- ================================================
-- OTP SESSIONS: phone verification for customer flows
-- ================================================
--
-- Backs MSG91 OTP verification and the short-lived session a customer holds
-- after verifying their number.
--
-- SECURITY MODEL: service role only.
--
-- This table holds live session credentials, OTP hashes, phone numbers and IP
-- addresses. The `anon` key ships in every browser bundle, so any policy granting
-- anon access here would let anyone read live session tokens or simply flip
-- `is_verified` on their own row - a complete authentication bypass. Every read
-- and write goes through "use server" actions on SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS, so no anon/authenticated policy is needed or wanted.
--
-- This mirrors the lockdown applied to the booking tables in
-- 20260803100000_lock_down_booking_tables.sql.
-- ================================================

CREATE TABLE IF NOT EXISTS public.otp_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Customer identification
  phone VARCHAR(15) NOT NULL,

  -- OTP management.
  -- Only a keyed hash is stored. The plaintext OTP is never persisted: it exists
  -- for the length of one SMS send and nowhere else, so a database read cannot
  -- recover a code that is in flight.
  otp_hash VARCHAR(255) NOT NULL,
  otp_sent_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  otp_expires_at TIMESTAMPTZ NOT NULL,
  otp_attempts INT DEFAULT 0 NOT NULL,
  otp_verified_at TIMESTAMPTZ,

  -- Session management.
  -- The session token is stored as a hash for the same reason a password is:
  -- a leaked backup or a stray SELECT must not hand over usable credentials.
  session_token_hash VARCHAR(255) UNIQUE,
  session_created_at TIMESTAMPTZ,
  session_expires_at TIMESTAMPTZ,
  session_last_activity TIMESTAMPTZ,

  -- Rate limiting
  resend_count INT DEFAULT 0 NOT NULL,
  last_resend_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_verified BOOLEAN DEFAULT false NOT NULL,

  -- Metadata
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_sessions_phone_active
  ON public.otp_sessions(phone, is_active);
CREATE INDEX IF NOT EXISTS idx_otp_sessions_token
  ON public.otp_sessions(session_token_hash)
  WHERE session_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_sessions_rate_limit
  ON public.otp_sessions(phone, created_at);

-- ================================================
-- RLS: service role only
-- ================================================
ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on otp_sessions" ON public.otp_sessions;
-- Legacy permissive policies, dropped explicitly so a re-run of an older version
-- of this migration cannot leave them behind.
DROP POLICY IF EXISTS "Public can create OTP sessions"        ON public.otp_sessions;
DROP POLICY IF EXISTS "Public can update their OTP sessions"  ON public.otp_sessions;
DROP POLICY IF EXISTS "Public can read their active sessions" ON public.otp_sessions;

CREATE POLICY "Service role full access on otp_sessions"
  ON public.otp_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.otp_sessions FROM anon, authenticated;
GRANT ALL ON public.otp_sessions TO service_role;

-- ================================================
-- Helper functions
-- ================================================
-- Deliberately NOT security definer: the only caller is the service role, which
-- already has full access. A definer function here would run as the owner and
-- would need a pinned search_path to be safe; not needing one at all is better.

-- Marks expired OTP sessions inactive. Returns how many were closed.
CREATE OR REPLACE FUNCTION public.cleanup_expired_otp_sessions()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  closed_count INT;
BEGIN
  WITH updated AS (
    UPDATE public.otp_sessions
    SET is_active = false,
        updated_at = NOW()
    WHERE is_active = true
      AND (
        (otp_expires_at < NOW() AND is_verified = false)
        OR (session_expires_at IS NOT NULL AND session_expires_at < NOW())
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO closed_count FROM updated;

  RETURN closed_count;
END;
$$;

-- A session is proven by presenting its token, never by naming a phone number.
--
-- The removed `get_active_session_by_phone()` did the latter: it returned a live
-- session for any phone passed to it, so entering someone else's number within
-- their active session window skipped verification entirely. Anything that needs to
-- know who the caller is must go through this function instead.
CREATE OR REPLACE FUNCTION public.validate_session_token(p_session_token_hash VARCHAR(255))
RETURNS TABLE (
  is_valid BOOLEAN,
  phone VARCHAR(15),
  session_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_session RECORD;
BEGIN
  IF p_session_token_hash IS NULL OR p_session_token_hash = '' THEN
    RETURN QUERY SELECT false, NULL::VARCHAR(15), NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT s.id, s.phone, s.session_expires_at
  INTO v_session
  FROM public.otp_sessions s
  WHERE s.session_token_hash = p_session_token_hash
    AND s.is_active = true
    AND s.is_verified = true
    AND s.session_expires_at > NOW()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::VARCHAR(15), NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  UPDATE public.otp_sessions
  SET session_last_activity = NOW(),
      updated_at = NOW()
  WHERE id = v_session.id;

  RETURN QUERY SELECT true, v_session.phone, v_session.session_expires_at;
END;
$$;

-- Atomically consumes one verification attempt and reports the OTP verdict.
--
-- Read-then-write from the application would let two concurrent guesses share an
-- attempt, handing an attacker extra tries against a 6-digit code.
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
BEGIN
  -- Lock the row so concurrent guesses serialise on it.
  SELECT s.id, s.otp_hash, s.otp_attempts
  INTO v_session
  FROM public.otp_sessions s
  WHERE s.phone = p_phone
    AND s.is_active = true
    AND s.is_verified = false
    AND s.otp_expires_at > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_session'::TEXT, NULL::UUID, 0;
    RETURN;
  END IF;

  IF v_session.otp_attempts >= p_max_attempts THEN
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
    RETURN QUERY SELECT 'verified'::TEXT, v_session.id, p_max_attempts - v_attempts;
  ELSE
    IF v_attempts >= p_max_attempts THEN
      UPDATE public.otp_sessions SET is_active = false, updated_at = NOW()
      WHERE id = v_session.id;
    END IF;
    RETURN QUERY SELECT 'invalid'::TEXT, v_session.id, p_max_attempts - v_attempts;
  END IF;
END;
$$;

-- Max 3 OTP requests per phone per hour.
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
    AND created_at > NOW() - INTERVAL '1 hour';

  RETURN QUERY
  SELECT
    (v_count < 3) AS is_allowed,
    v_count AS requests_count,
    CASE WHEN v_count >= 3 THEN v_oldest_request + INTERVAL '1 hour' ELSE NOW() END
      AS next_allowed_at;
END;
$$;

-- ================================================
-- Triggers
-- ================================================
CREATE OR REPLACE FUNCTION public.update_otp_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_otp_sessions_updated_at ON public.otp_sessions;
CREATE TRIGGER trigger_update_otp_sessions_updated_at
  BEFORE UPDATE ON public.otp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_otp_sessions_updated_at();

-- ================================================
-- Function grants: service role only
-- ================================================
DROP FUNCTION IF EXISTS public.get_active_session_by_phone(VARCHAR);

REVOKE ALL ON FUNCTION public.cleanup_expired_otp_sessions()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_session_token(VARCHAR)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_otp_attempt(VARCHAR, VARCHAR, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_otp_rate_limit(VARCHAR)             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_otp_sessions()            TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_session_token(VARCHAR)           TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_otp_attempt(VARCHAR, VARCHAR, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_otp_rate_limit(VARCHAR)             TO service_role;

-- ================================================
-- Comments
-- ================================================
COMMENT ON TABLE  public.otp_sessions IS 'OTP verification and short-lived customer sessions. Service role only - contains live session credentials and PII.';
COMMENT ON COLUMN public.otp_sessions.otp_hash IS 'HMAC-SHA256 of the OTP keyed with OTP_HASH_SECRET. The plaintext code is never stored.';
COMMENT ON COLUMN public.otp_sessions.session_token_hash IS 'SHA-256 of the session token. The token itself only ever exists in the customer''s httpOnly cookie.';
COMMENT ON COLUMN public.otp_sessions.session_expires_at IS 'When the customer session lapses. Set by the app (CUSTOMER_SESSION_MINUTES, default 12 hours) at verification time.';
COMMENT ON FUNCTION public.validate_session_token(VARCHAR) IS 'Resolves a session token hash to its verified phone number. The only way to prove who a customer is.';
COMMENT ON FUNCTION public.consume_otp_attempt(VARCHAR, VARCHAR, INT) IS 'Atomically consumes one attempt and reports the OTP verdict under a row lock.';
