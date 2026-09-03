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
--   2. entity_redirects      — ALL rows, after un-archiving merge losers.
--   3. merge-archived losers — status back to 'active'; the nightly
--                              convergence re-hears every pair under
--                              current rules, fully ledgered.
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
                WHERE r.from_entity_id = e.entity_id);

SELECT count(*) AS redirects_to_delete FROM entity_redirects;

UPDATE core_entities e
   SET status = 'active', last_updated = now()
 WHERE e.status = 'archived'
   AND e.born_extraction_run_id IS NULL
   AND EXISTS (SELECT 1 FROM entity_redirects r
                WHERE r.from_entity_id = e.entity_id);

DELETE FROM entity_redirects;

DELETE FROM entity_surface;

\if :execute
COMMIT;
\echo 'EXECUTED. Next: backfill-observed.ts --execute, then the nightly'
\echo 'convergence sweeps (or activate-shadow''s twin sweep), then the'
\echo 'vocabulary sweeps per locale. Verify with README.md queries.'
\else
ROLLBACK;
\echo 'DRY RUN — rolled back. Re-run with -v execute=1 to apply.'
\endif
