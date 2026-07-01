-- Crave Score 0-10 native scale.
-- Migrates the public Crave Score DISPLAY off the squished 60-99.9 band onto a
-- flat 0-10 native scale, stored to 2 decimals.
-- Narrows the display columns from numeric(5,1) to numeric(4,2) (fits 0.00..10.00).
--
-- `core_public_entity_scores.rising` already lives at numeric(5,3), which fits the
-- 0-10 point surge, so it is intentionally left unchanged here. The next scorer run
-- (displayCurveVersion crave-score-display-v6) repopulates display_score on the new
-- scale (the percentile→display curve itself lives in the scorer, not this DDL); any
-- pre-existing 60-99.9 rows that survive the narrowing are stale and overwritten by
-- that rebuild.

ALTER TABLE "core_public_entity_scores"
  ALTER COLUMN "display_score" TYPE numeric(4, 2);

ALTER TABLE "core_crave_score_runs"
  ALTER COLUMN "display_min" TYPE numeric(4, 2);

ALTER TABLE "core_crave_score_runs"
  ALTER COLUMN "display_max" TYPE numeric(4, 2);
