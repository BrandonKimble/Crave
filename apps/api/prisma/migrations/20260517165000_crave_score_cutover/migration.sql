-- Create Crave Score ownership enums.
CREATE TYPE "crave_score_subject_type" AS ENUM ('restaurant', 'connection');
CREATE TYPE "crave_score_run_status" AS ENUM ('running', 'completed', 'failed');
CREATE TYPE "crave_score_movement_state" AS ENUM ('rising', 'cooling', 'stable', 'insufficient_history');

-- Run ledger for reproducible public score rebuilds.
CREATE TABLE "core_crave_score_runs" (
  "score_run_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "score_version" VARCHAR(64) NOT NULL,
  "display_curve_version" VARCHAR(64) NOT NULL,
  "display_min" DECIMAL(5, 1) NOT NULL,
  "display_max" DECIMAL(5, 1) NOT NULL,
  "status" "crave_score_run_status" NOT NULL DEFAULT 'running',
  "recency_reference_date" DATE NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ(6),
  "input_counts" JSONB DEFAULT '{}',
  "config_snapshot" JSONB DEFAULT '{}',
  "error_message" TEXT,
  CONSTRAINT "core_crave_score_runs_pkey" PRIMARY KEY ("score_run_id")
);

CREATE INDEX "idx_crave_score_runs_version_started"
  ON "core_crave_score_runs" ("score_version", "started_at" DESC);
CREATE INDEX "idx_crave_score_runs_status_started"
  ON "core_crave_score_runs" ("status", "started_at" DESC);

-- Latest stable public score per restaurant or restaurant-item connection.
CREATE TABLE "core_public_entity_scores" (
  "subject_type" "crave_score_subject_type" NOT NULL,
  "subject_id" UUID NOT NULL,
  "score_run_id" UUID NOT NULL,
  "scoring_market_key" VARCHAR(255),
  "raw_quality_score" DECIMAL(18, 6) NOT NULL,
  "global_z" DECIMAL(18, 6) NOT NULL,
  "market_z" DECIMAL(18, 6),
  "market_reliability" DECIMAL(6, 5) NOT NULL,
  "entity_confidence" DECIMAL(6, 5) NOT NULL,
  "normalized_signal" DECIMAL(18, 6) NOT NULL,
  "posterior_signal" DECIMAL(18, 6) NOT NULL,
  "display_score" DECIMAL(5, 1) NOT NULL,
  "score_delta_7d" DECIMAL(5, 1),
  "score_delta_28d" DECIMAL(5, 1),
  "movement_state" "crave_score_movement_state" NOT NULL,
  "score_version" VARCHAR(64) NOT NULL,
  "display_curve_version" VARCHAR(64) NOT NULL,
  "factor_trace" JSONB DEFAULT '{}',
  "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "core_public_entity_scores_pkey" PRIMARY KEY ("subject_type", "subject_id"),
  CONSTRAINT "core_public_entity_scores_score_run_id_fkey"
    FOREIGN KEY ("score_run_id") REFERENCES "core_crave_score_runs"("score_run_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_public_entity_scores_subject_display"
  ON "core_public_entity_scores" ("subject_type", "display_score" DESC);
CREATE INDEX "idx_public_entity_scores_market_subject_display"
  ON "core_public_entity_scores" ("scoring_market_key", "subject_type", "display_score" DESC);
CREATE INDEX "idx_public_entity_scores_run"
  ON "core_public_entity_scores" ("score_run_id");

-- Per-run market normalization stats.
CREATE TABLE "core_crave_score_market_stats" (
  "score_run_id" UUID NOT NULL,
  "subject_type" "crave_score_subject_type" NOT NULL,
  "market_key" VARCHAR(255) NOT NULL,
  "eligible_subject_count" INTEGER NOT NULL,
  "raw_median" DECIMAL(18, 6) NOT NULL,
  "raw_mad" DECIMAL(18, 6) NOT NULL,
  "raw_iqr" DECIMAL(18, 6) NOT NULL,
  "raw_spread" DECIMAL(18, 6) NOT NULL,
  "global_median" DECIMAL(18, 6) NOT NULL,
  "global_spread" DECIMAL(18, 6) NOT NULL,
  "market_reliability" DECIMAL(6, 5) NOT NULL,
  "evidence_summary" JSONB DEFAULT '{}',
  "factor_trace" JSONB DEFAULT '{}',
  "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "core_crave_score_market_stats_pkey"
    PRIMARY KEY ("score_run_id", "subject_type", "market_key"),
  CONSTRAINT "core_crave_score_market_stats_score_run_id_fkey"
    FOREIGN KEY ("score_run_id") REFERENCES "core_crave_score_runs"("score_run_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_crave_score_market_stats_market_subject"
  ON "core_crave_score_market_stats" ("market_key", "subject_type");

-- Daily score snapshots for movement.
CREATE TABLE "core_public_entity_score_history" (
  "score_run_id" UUID NOT NULL,
  "snapshot_date" DATE NOT NULL,
  "subject_type" "crave_score_subject_type" NOT NULL,
  "subject_id" UUID NOT NULL,
  "scoring_market_key" VARCHAR(255),
  "score_version" VARCHAR(64) NOT NULL,
  "display_curve_version" VARCHAR(64) NOT NULL,
  "display_score" DECIMAL(5, 1) NOT NULL,
  "normalized_signal" DECIMAL(18, 6) NOT NULL,
  "posterior_signal" DECIMAL(18, 6) NOT NULL,
  "entity_confidence" DECIMAL(6, 5) NOT NULL,
  "market_reliability" DECIMAL(6, 5) NOT NULL,
  "movement_state" "crave_score_movement_state" NOT NULL,
  "factor_trace" JSONB DEFAULT '{}',
  "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "core_public_entity_score_history_pkey"
    PRIMARY KEY ("snapshot_date", "subject_type", "subject_id", "score_version"),
  CONSTRAINT "core_public_entity_score_history_score_run_id_fkey"
    FOREIGN KEY ("score_run_id") REFERENCES "core_crave_score_runs"("score_run_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_public_entity_score_history_subject_date"
  ON "core_public_entity_score_history" ("subject_type", "subject_id", "snapshot_date" DESC);
CREATE INDEX "idx_public_entity_score_history_run"
  ON "core_public_entity_score_history" ("score_run_id");

-- Initial projection from existing raw quality values. The public scorer rewrites
-- these rows with calibrated normalization after deployment.
WITH run AS (
  INSERT INTO "core_crave_score_runs" (
    "score_version",
    "display_curve_version",
    "display_min",
    "display_max",
    "status",
    "recency_reference_date",
    "completed_at",
    "input_counts",
    "config_snapshot"
  )
  VALUES (
    'crave-score-v1',
    'crave-score-display-v1',
    60.0,
    99.9,
    'completed',
    CURRENT_DATE,
    now(),
    jsonb_build_object(
      'restaurants', (SELECT COUNT(*) FROM "core_entities" WHERE "type" = 'restaurant'),
      'connections', (SELECT COUNT(*) FROM "core_restaurant_items")
    ),
    jsonb_build_object(
      'source', 'migration_backfill',
      'displayMin', 60.0,
      'displayMax', 99.9
    )
  )
  RETURNING "score_run_id"
),
restaurant_rows AS (
  SELECT
    'restaurant'::"crave_score_subject_type" AS subject_type,
    e."entity_id" AS subject_id,
    COALESCE(e."restaurant_quality_score", 0)::numeric AS raw_quality_score
  FROM "core_entities" e
  WHERE e."type" = 'restaurant'
),
connection_rows AS (
  SELECT
    'connection'::"crave_score_subject_type" AS subject_type,
    c."connection_id" AS subject_id,
    COALESCE(c."food_quality_score", 0)::numeric AS raw_quality_score
  FROM "core_restaurant_items" c
),
all_rows AS (
  SELECT * FROM restaurant_rows
  UNION ALL
  SELECT * FROM connection_rows
),
scored AS (
  SELECT
    all_rows.*,
    LEAST(99.9, GREATEST(60.0, ROUND((60.0 + 39.9 * LEAST(100.0, GREATEST(0.0, raw_quality_score)) / 100.0)::numeric, 1))) AS display_score
  FROM all_rows
)
INSERT INTO "core_public_entity_scores" (
  "subject_type",
  "subject_id",
  "score_run_id",
  "raw_quality_score",
  "global_z",
  "market_reliability",
  "entity_confidence",
  "normalized_signal",
  "posterior_signal",
  "display_score",
  "movement_state",
  "score_version",
  "display_curve_version",
  "factor_trace",
  "computed_at"
)
SELECT
  scored.subject_type,
  scored.subject_id,
  run."score_run_id",
  scored.raw_quality_score,
  0,
  0,
  0.5,
  0,
  0,
  scored.display_score,
  'insufficient_history',
  'crave-score-v1',
  'crave-score-display-v1',
  jsonb_build_object('source', 'migration_backfill'),
  now()
FROM scored
CROSS JOIN run
ON CONFLICT ("subject_type", "subject_id") DO NOTHING;

INSERT INTO "core_public_entity_score_history" (
  "score_run_id",
  "snapshot_date",
  "subject_type",
  "subject_id",
  "score_version",
  "display_curve_version",
  "display_score",
  "normalized_signal",
  "posterior_signal",
  "entity_confidence",
  "market_reliability",
  "movement_state",
  "factor_trace",
  "computed_at"
)
SELECT
  "score_run_id",
  CURRENT_DATE,
  "subject_type",
  "subject_id",
  "score_version",
  "display_curve_version",
  "display_score",
  "normalized_signal",
  "posterior_signal",
  "entity_confidence",
  "market_reliability",
  "movement_state",
  "factor_trace",
  "computed_at"
FROM "core_public_entity_scores"
ON CONFLICT ("snapshot_date", "subject_type", "subject_id", "score_version") DO NOTHING;

DROP TABLE IF EXISTS "core_display_rank_scores";
DROP TYPE IF EXISTS "display_rank_subject_type";
