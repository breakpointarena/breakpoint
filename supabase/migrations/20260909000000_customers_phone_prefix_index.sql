-- ================================================
-- THE COUNTER'S PHONE-NUMBER SEARCH NEEDS AN INDEX IT CAN ACTUALLY USE
-- ================================================
-- `searchWalkInCustomers` offers matching profiles while the desk types a
-- number, so a misheard digit does not end as a second customer row. It matches
-- with `phone LIKE '98765%'`, and none of the three existing indexes on the
-- column can serve that: a btree built under a non-C collation orders text in a
-- way that makes prefix ranges meaningless, so Postgres falls back to a
-- sequential scan.
--
-- Measured on this schema before the change:
--
--   Seq Scan on customers  (cost=0.00..11.75)
--     Filter: ((phone)::text ~~ '9191%'::text)
--
-- Ten rows locally, which hides it. At the size this table actually reaches it
-- is a full scan of the customer book on every keystroke pause, on the busiest
-- screen in the building.
--
-- `text_pattern_ops` compares byte by byte rather than by collation, which is
-- exactly what a prefix match wants. It does not replace the existing indexes:
-- `customers_phone_key` still enforces uniqueness and still serves the equality
-- lookup `lookupWalkInCustomer` does.
CREATE INDEX IF NOT EXISTS idx_customers_phone_prefix
  ON public.customers (phone text_pattern_ops);

COMMENT ON INDEX public.idx_customers_phone_prefix IS 'Serves the walk-in desk''s prefix search (phone LIKE ''digits%''), which the collation-ordered btrees on this column cannot. Equality lookups keep using customers_phone_key.';
