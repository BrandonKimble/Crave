-- THE CLAIM KEY RECORDS THE FOLD THAT MINTED IT (D-census, 2026-08-13).
--
-- A word claim's key is `locale|surfaceClaimKey(form)|entity`, and
-- `surfaceClaimKey` IS the fold (entity-identity.ts `diacriticFold`, whose
-- output is versioned by FOLD_ALGORITHM_VERSION). So the key is a FUNCTION of
-- the fold algorithm, and a behavioural fold change — the tone-mark work is
-- already planned — silently re-spells every key ever written. The verdicts
-- do not become wrong; they become UNFINDABLE: `decidedKeys` probes the new
-- spelling, misses all 4,452 rows, and the whole judged corpus reads as
-- unheard and is re-bought. Nothing anywhere would have said so.
--
-- Recording the fold version makes that event LOUD instead of silent: a
-- verdict is answered by the rule in force AND spelled by the fold in force,
-- so both belong in the identity of the row. A fold bump then re-opens the
-- corpus the same way a rule bump does — through the budgeted drain, with a
-- quote — rather than by quietly orphaning it.
--
-- IN THE KEY, not merely beside it: a same-key row minted under a different
-- fold is a different claim identity, and letting the two share a primary key
-- would make the newer one overwrite a verdict it is not the successor of.
--
-- Small table (4,452 rows at authoring time); no rewrite triggers here — the
-- ADD COLUMN carries a constant default (metadata-only since PG 11, see
-- AUTHORING.md §1) and the primary key is rebuilt on a table this size in
-- milliseconds. No parallel-worker guard needed.
ALTER TABLE "claim_verdicts"
  ADD COLUMN "fold_version" SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN "claim_verdicts"."fold_version" IS
  'FOLD_ALGORITHM_VERSION (entity-identity.ts) whose fold spelled claim_key. Part of the claim identity: a fold bump re-opens the claim rather than silently orphaning its verdict.';

ALTER TABLE "claim_verdicts" DROP CONSTRAINT "claim_verdicts_pkey";
ALTER TABLE "claim_verdicts"
  ADD CONSTRAINT "claim_verdicts_pkey"
  PRIMARY KEY ("lane", "claim_key", "rule_version", "fold_version");
