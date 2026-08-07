-- entity_labels gets a FOLDED RECALL MIRROR, the exact shape entity_alias
-- already carries (form_folded VARCHAR(255) + the two fold indexes).
--
-- WHY: labels double as MATCH surfaces (scanForKnownEntityGroups, the
-- locale-chained labels arm). N1's fold-symmetry law folds BOTH sides of
-- every match. The labels arm alone compared a FOLDED query candidate
-- against LOWER(form), so every accented/apostrophe/hyphen label — measured
-- 2,262 of 11,068 active rows (20.4%), overwhelmingly the Spanish rows the
-- arm exists to serve — was structurally unmatchable: lower('ensalada
-- César') = 'ensalada césar' can never equal the folded candidate
-- 'ensalada cesar'. The column makes the asymmetry UNREPRESENTABLE: a label
-- cannot be written without its folded mirror, and the arm matches on it.
--
-- THE FOLD LAW IS ABSOLUTE: form_folded is APP-WRITTEN by canonicalFold
-- (entity-identity.ts). There is no SQL fold, no generated column, no
-- expression index over a fold — Postgres Unicode character classes are
-- platform-dependent (glibc PG17 vs mac PG18), so a SQL mirror can never be
-- trusted. The DB stores and indexes; it never folds.
--
-- EXISTING ROWS are seeded to '' by the constant DEFAULT (a metadata-only
-- add in PG11+, no table rewrite), then the DEFAULT is dropped so the column
-- matches entity_alias.form_folded (NOT NULL, no default) and the app writer
-- is the only source going forward. '' never equals a real folded candidate,
-- so pre-backfill rows are inert (not wrong) on the match arm until
-- scripts/backfill-label-folds.ts re-folds every row through canonicalFold.
--
-- SERIAL EXECUTION (prod /dev/shm law, 2026-08-02): index builds and any
-- large touch grab a dynamic shared-memory segment the prod container cannot
-- allocate. Disable parallel workers before any of it.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

ALTER TABLE entity_labels
  ADD COLUMN IF NOT EXISTS form_folded VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE entity_labels
  ALTER COLUMN form_folded DROP DEFAULT;

-- The labels lookup arm: fold BOTH sides, then match.
CREATE INDEX IF NOT EXISTS idx_entity_labels_form_folded
  ON entity_labels (form_folded);
-- The locale-filtered form of the same lookup (the arm runs the locale chain).
CREATE INDEX IF NOT EXISTS idx_entity_labels_locale_form_folded
  ON entity_labels (locale, form_folded);
