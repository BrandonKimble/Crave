-- JOINED-IDENTITY SQUEEZE INDEXES (2026-08-11, the v7 shadow twin class).
--
-- Authored by hand under --create-only discipline (agents never run
-- `prisma migrate dev`; this file is committed unapplied and lands via
-- `prisma migrate deploy` at container boot after review).
--
-- The resolver's Tier 2.5 (performJoinedIdentityMatches) probes
--   replace(identity_key, ' ', '')   on core_entities, and
--   replace(form_folded, ' ', '')    on entity_surface
-- to claim space/join spelling twins ("Pulltab Coffee" = "Pull-tab Coffee")
-- deterministically before the LLM judge. These expression indexes make those
-- probes index scans instead of per-batch seq scans.
--
-- FOLD-LAW NOTE: this is NOT a SQL fold expression of the kind the fold law
-- forbids. Both indexed columns are APP-WRITTEN by canonicalFold, whose
-- separator is by construction a single ASCII space (U+0020); replace() of a
-- literal ASCII byte evaluates no Unicode character class and is
-- platform-independent, so there is no glibc/ICU drift surface here.
--
-- Not a table rewrite; plain CREATE INDEX on moderate tables. Parallel-worker
-- guard included anyway per AUTHORING.md ("index builds" are listed among the
-- shapes that have died on prod's small /dev/shm).

SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

CREATE INDEX IF NOT EXISTS idx_entities_type_identity_key_squeezed
  ON core_entities (type, (replace(identity_key, ' ', '')))
  WHERE identity_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_surface_form_folded_squeezed
  ON entity_surface ((replace(form_folded, ' ', '')))
  WHERE status = 'active';
