-- EXPAND phase — Crave Score endorsement-unification + rising/heat redesign.
-- Adds the new `rising` column (recent-vs-baseline display-point surge) and makes
-- the legacy `movement_state` nullable on both tables, so the new scorer (which
-- omits movement_state / score_delta and stops writing history) and the old binary
-- can BOTH write during rollover.
--
-- The legacy snapshot-delta columns, the `core_public_entity_score_history` table,
-- and the `crave_score_movement_state` enum are dropped in the CONTRACT migration
-- (a SEPARATE, later release — see crave_score_rising_contract), only after `rising`
-- is populated by a global rebuild and the live rising path is verified.

ALTER TABLE "core_public_entity_scores"
  ADD COLUMN "rising" numeric(5, 3);

ALTER TABLE "core_public_entity_scores"
  ALTER COLUMN "movement_state" DROP NOT NULL;

ALTER TABLE "core_public_entity_score_history"
  ALTER COLUMN "movement_state" DROP NOT NULL;

CREATE INDEX "idx_public_entity_scores_subject_rising"
  ON "core_public_entity_scores" ("subject_type", "rising" DESC);
