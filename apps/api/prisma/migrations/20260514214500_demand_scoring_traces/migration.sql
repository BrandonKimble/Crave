-- Durable score traces for batch demand consumers. Request-time autocomplete
-- remains intentionally untraced in v1.
CREATE TYPE "demand_scoring_consumer_kind" AS ENUM (
  'poll_topic',
  'on_demand',
  'keyword_collection'
);

CREATE TYPE "demand_scoring_decision_state" AS ENUM (
  'selected',
  'near_miss',
  'gate_reject',
  'budget_reject',
  'dedupe_reject'
);

CREATE TABLE "demand_scoring_runs" (
  "run_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "consumer_kind" "demand_scoring_consumer_kind" NOT NULL,
  "market_key" VARCHAR(255),
  "collectable_market_key" VARCHAR(255),
  "cycle_start_at" TIMESTAMPTZ NOT NULL,
  "cycle_end_at" TIMESTAMPTZ NOT NULL,
  "scorer_version" VARCHAR(64) NOT NULL,
  "trace_all_candidates" BOOLEAN NOT NULL DEFAULT false,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finished_at" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}',

  CONSTRAINT "demand_scoring_runs_pkey" PRIMARY KEY ("run_id")
);

CREATE TABLE "demand_scoring_candidates" (
  "candidate_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id" UUID NOT NULL,
  "consumer_kind" "demand_scoring_consumer_kind" NOT NULL,
  "candidate_kind" VARCHAR(64) NOT NULL,
  "subject_kind" "demand_subject_kind" NOT NULL,
  "subject_key" VARCHAR(500) NOT NULL,
  "entity_id" UUID,
  "entity_type" "entity_type",
  "normalized_text" VARCHAR(500),
  "market_key" VARCHAR(255),
  "collectable_market_key" VARCHAR(255),
  "bucket" VARCHAR(64),
  "lane" VARCHAR(64),
  "reason" VARCHAR(64),
  "final_score" DOUBLE PRECISION,
  "rank" INTEGER,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "decision_state" "demand_scoring_decision_state" NOT NULL,
  "decision_reason" VARCHAR(255),
  "factor_breakdown" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "demand_scoring_candidates_pkey" PRIMARY KEY ("candidate_id")
);

ALTER TABLE "demand_scoring_candidates"
  ADD CONSTRAINT "demand_scoring_candidates_run_id_fkey"
  FOREIGN KEY ("run_id")
  REFERENCES "demand_scoring_runs"("run_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "demand_scoring_candidates"
  ADD CONSTRAINT "demand_scoring_candidates_entity_id_fkey"
  FOREIGN KEY ("entity_id")
  REFERENCES "core_entities"("entity_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_demand_scoring_candidate_scope"
  ON "demand_scoring_candidates" (
    "run_id",
    "consumer_kind",
    "candidate_kind",
    "subject_kind",
    "subject_key",
    COALESCE("market_key", ''),
    COALESCE("collectable_market_key", ''),
    COALESCE("bucket", ''),
    COALESCE("lane", ''),
    COALESCE("reason", '')
  );

CREATE INDEX "idx_demand_scoring_runs_consumer_started"
  ON "demand_scoring_runs" ("consumer_kind", "started_at" DESC);

CREATE INDEX "idx_demand_scoring_runs_market_consumer"
  ON "demand_scoring_runs" ("market_key", "consumer_kind", "started_at" DESC);

CREATE INDEX "idx_demand_scoring_runs_collectable_consumer"
  ON "demand_scoring_runs" ("collectable_market_key", "consumer_kind", "started_at" DESC);

CREATE INDEX "idx_demand_scoring_candidates_run_rank"
  ON "demand_scoring_candidates" ("run_id", "rank");

CREATE INDEX "idx_demand_scoring_candidates_consumer_selected"
  ON "demand_scoring_candidates" ("consumer_kind", "selected", "created_at" DESC);

CREATE INDEX "idx_demand_scoring_candidates_subject_consumer"
  ON "demand_scoring_candidates" ("subject_kind", "subject_key", "consumer_kind");

CREATE INDEX "idx_demand_scoring_candidates_entity_consumer"
  ON "demand_scoring_candidates" ("entity_id", "consumer_kind");
