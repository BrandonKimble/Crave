-- CREATE-ONLY, UNAPPLIED (multilingual ruling R5, 2026-08-12; authored per
-- AUTHORING.md — apply with `prisma migrate deploy`, NEVER `migrate dev`).
--
-- Per-row fold provenance beside identity_key: which revision of the fold
-- algorithm (entity-identity.ts FOLD_ALGORITHM_VERSION) computed this row's
-- key. Backfilled to 1 = the algorithm as of 2026-08-12, verified corpus-wide
-- by scripts/check-fold-drift.ts (0 drifted rows at authoring time), so the
-- backfill states a fact, not a guess.
--
-- WIRING THAT MUST LAND IN THE SAME DEPLOY WINDOW (deliberately NOT wired
-- while this sits unapplied — a schema.prisma column the DB lacks would fail
-- every entity insert at runtime):
--   1. schema.prisma: `foldVersion Int @default(1) @map("fold_version")` on
--      CoreEntity, then `prisma generate`;
--   2. entity-identity.ts `identityInsertData` spreads
--      `foldVersion: FOLD_ALGORITHM_VERSION`;
--   3. projection-rebuild's refreshSortedIdentityKeys stamps fold_version on
--      every row it re-keys ({full:true} backfill included).
--
-- No table rewrite: ADD COLUMN with a constant default is metadata-only on
-- this Postgres version. No parallel-worker guard needed (AUTHORING.md's
-- heavy-rewrite rule does not trigger).
ALTER TABLE core_entities
  ADD COLUMN fold_version smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN core_entities.fold_version IS
  'FOLD_ALGORITHM_VERSION (entity-identity.ts) that computed identity_key/identity_key_sorted for this row. Drift detector: scripts/check-fold-drift.ts.';
