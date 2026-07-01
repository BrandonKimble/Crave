-- CONTRACT phase — Crave Score rising/heat redesign.
-- Drops the legacy snapshot-delta columns, the score-history table, and the
-- movement-state enum, now that `rising` (the dual-pass display-point surge) has
-- replaced them and nothing reads them. Destructive + irreversible (no down
-- migration). In a real prod rollout this runs ONLY after the expand release is
-- live, the new scorer is the sole writer, and `rising` is verified.

ALTER TABLE "core_public_entity_scores" DROP COLUMN "movement_state";
ALTER TABLE "core_public_entity_scores" DROP COLUMN "score_delta_7d";
ALTER TABLE "core_public_entity_scores" DROP COLUMN "score_delta_28d";

DROP TABLE "core_public_entity_score_history";   -- auto-drops its CraveScoreRun FK

DROP TYPE "crave_score_movement_state";          -- LAST: fails if any column still uses it
