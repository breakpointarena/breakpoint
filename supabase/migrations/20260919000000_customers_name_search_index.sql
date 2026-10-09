-- ================================================
-- FINDING A CUSTOMER BY NAME AT THE COUNTER
-- ================================================
-- The walk-in and advance booking screens can now look a customer up by name as
-- well as by number, because staff know regulars by name long before they know
-- their ten digits - and the desk that cannot find somebody creates a second
-- profile for them, which is the duplicate the phone suggestions already exist
-- to prevent, arriving through the other door.
--
-- The search matches anywhere in the name rather than only the front. Half the
-- rows in this table are two words ("Santu pramanik", "kumar export") and the
-- half a person remembers is as often the second as the first, so a prefix
-- search would answer "nobody" to a name that is plainly there.
--
-- Anywhere-in-the-string is exactly what a btree cannot serve, whatever operator
-- class it is given: idx_customers_phone_prefix works only because a phone
-- number is typed from the left. So this is a trigram index, which is the tool
-- for ILIKE '%...%'.
--
-- Measured on 50,000 rows before committing to it, because an extension is a
-- bigger thing to add than an index:
--
--   without:  Seq Scan    40.6 ms
--   with:     Bitmap Ind.  4.5 ms
--
-- At the fifteen customers this arena has today the difference is nothing and
-- the seq scan would have been fine for years. The index is here so the feature
-- does not quietly get slower as the phone book fills up - by which time nobody
-- would connect a sluggish counter to a search added long before.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Schema-qualified: pg_trgm lives in `extensions` by Supabase convention, and an
-- unqualified `gin_trgm_ops` depends on that schema being on the search_path of
-- whoever runs this - which is not true of every role that might.
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON public.customers USING gin (name extensions.gin_trgm_ops);

COMMENT ON INDEX public.idx_customers_name_trgm IS
  'Serves the counter''s name search (name ILIKE ''%text%''), which no btree can: the match is anywhere in the name because a customer is as often remembered by their second word as their first. Prefix lookups on phone keep using idx_customers_phone_prefix.';
