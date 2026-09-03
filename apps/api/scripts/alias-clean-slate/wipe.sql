-- THE ALIAS CLEAN SLATE — derived-state wipe (plans/alias-clean-slate.md).
-- Owner-approved program, manifest-approved per execution. STAGING FIRST.
--
-- DRY RUN BY DEFAULT: run plain and it rolls back after printing counts.
--   PGPASSWORD=... psql -h <host> -p <port> -U postgres -d crave_search \
--     -f apps/api/scripts/alias-clean-slate/wipe.sql
-- EXECUTE: add -v execute=1
--
-- WHAT THIS TOUCHES (derived, re-derivable — the projection principle):
--   1. entity_surface        — ALL rows. Regenerated: observed via
--                              backfill-observed.ts, judged via hearings,
--                              recall via the vocabulary sweeps.
--   2. judgment-based merge losers — reopened (status 'active') and their
--      redirects deleted, freeing the stolen identity; future mentions
--      Tier-1 resolve to the shell and the re-extraction refills it.
--   3. fold-twin losers — STAY archived WITH their redirects: identity by
--      construction, and the redirect is the only bridge from loser-keyed
--      user signals to the surviving entity.
--
-- WHAT THIS NEVER TOUCHES (ground truth + history):
--   documents, extraction runs/inputs/outputs, events, place-grounded
--   restaurants (never deleted — the ~$118 law), user anchors, the
--   claim_verdicts ledger (history; old-rule rows naturally reopen).

\set ON_ERROR_STOP on
\if :{?execute}
\else
\set execute 0
\endif

BEGIN;

SELECT count(*) AS surfaces_to_delete FROM entity_surface;

-- Merge losers: archived entities whose identity was folded into a
-- survivor. Un-archive so the convergence sweeps can re-judge every pair
-- under TODAY'S rules (owned-domain test, accent veto, ledgered verdicts).
-- Rejected-rehearsal rows (born_extraction_run_id set) stay archived: they
-- are shadow rejects, not merge losers.
SELECT count(*) AS merge_losers_to_unarchive
  FROM core_entities e
 WHERE e.status = 'archived'
   AND e.born_extraction_run_id IS NULL
   AND EXISTS (SELECT 1 FROM entity_redirects r
                WHERE r.from_entity_id = e.entity_id)
   -- A loser whose identity_key is HELD by a live entity was a fold-twin
   -- merge — identity by construction, nothing to re-hear, and re-activating
   -- it would violate the attribute/ingredient identity uniques. Only
   -- judgment-based merges (different keys) reopen.
   AND NOT EXISTS (SELECT 1 FROM core_entities t
                    WHERE t.type = e.type AND t.identity_key = e.identity_key
                      AND t.status <> 'archived');

-- REDIRECTS ARE IDENTITY HISTORY, NOT DERIVED STATE (red team 2026-09-03):
-- signals resolve loser-keyed user history through the redirect join, and a
-- fold-twin loser that stays archived keeps its redirect as the ONLY bridge
-- from that history to the surviving entity. Only the redirects of losers
-- that REOPEN are deleted — deleting one frees the name (the tombstone
-- pre-sink skips redirect-free archived rows, and reopening restores
-- Tier-1 resolution to the shell), and the loser's own signals then
-- correctly re-point at the reopened entity itself.
SELECT count(*) AS redirects_to_delete
  FROM entity_redirects r
  JOIN core_entities e ON e.entity_id = r.from_entity_id
 WHERE e.status = 'archived'
   AND e.born_extraction_run_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM core_entities t
                    WHERE t.type = e.type AND t.identity_key = e.identity_key
                      AND t.status <> 'archived');

UPDATE core_entities e
   SET status = 'active', last_updated = now()
 WHERE e.status = 'archived'
   AND e.born_extraction_run_id IS NULL
   AND EXISTS (SELECT 1 FROM entity_redirects r
                WHERE r.from_entity_id = e.entity_id)
   -- A loser whose identity_key is HELD by a live entity was a fold-twin
   -- merge — identity by construction, nothing to re-hear, and re-activating
   -- it would violate the attribute/ingredient identity uniques. Only
   -- judgment-based merges (different keys) reopen.
   AND NOT EXISTS (SELECT 1 FROM core_entities t
                    WHERE t.type = e.type AND t.identity_key = e.identity_key
                      AND t.status <> 'archived');

-- Ordering note: the UPDATE above already reopened the judgment-based
-- losers (status now 'active'), so their redirects are found here by the
-- reopened status rather than re-testing archived+twin-free.
DELETE FROM entity_redirects r
 USING core_entities e
 WHERE e.entity_id = r.from_entity_id
   AND e.status = 'active';

DELETE FROM entity_surface;

\if :execute
COMMIT;
\echo 'EXECUTED. DO NOT run gc-unsupported-entities.sql until the next'
\echo 're-extraction has re-supported the reopened shells — GC would delete'
\echo 'them and silently undo this wipe (red team 2026-09-03 F5).'
\echo 'Next: backfill-observed.ts --execute, then the nightly'
\echo 'convergence sweeps (or activate-shadow''s twin sweep), then the'
\echo 'vocabulary sweeps per locale. Verify with README.md queries.'
\else
ROLLBACK;
\echo 'DRY RUN — rolled back. Re-run with -v execute=1 to apply.'
\endif
