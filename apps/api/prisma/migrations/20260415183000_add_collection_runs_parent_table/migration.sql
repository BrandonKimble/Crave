CREATE TABLE "collection_runs" (
  "collection_run_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope_key" VARCHAR(255) NOT NULL,
  "pipeline" VARCHAR(32) NOT NULL,
  "platform" VARCHAR(32),
  "community" VARCHAR(255),
  "status" VARCHAR(32) NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "metadata" JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT "collection_runs_pkey" PRIMARY KEY ("collection_run_id")
);

CREATE UNIQUE INDEX "collection_runs_scope_key_key"
ON "collection_runs" ("scope_key");

CREATE INDEX "idx_collection_runs_pipeline_started_at"
ON "collection_runs" ("pipeline", "started_at" DESC);

CREATE INDEX "idx_collection_runs_status"
ON "collection_runs" ("status");

ALTER TABLE "collection_extraction_runs"
ADD COLUMN "collection_run_id" UUID;

INSERT INTO "collection_runs" (
  "scope_key",
  "pipeline",
  "platform",
  "community",
  "status",
  "started_at",
  "completed_at",
  "metadata"
)
SELECT
  er."collection_scope_key",
  MIN(er."pipeline") AS "pipeline",
  COALESCE(MAX(sd."platform"), 'reddit') AS "platform",
  MAX(sd."community") AS "community",
  CASE
    WHEN BOOL_OR(er."status" = 'running') THEN 'running'
    WHEN BOOL_OR(er."status" = 'failed') THEN 'failed'
    ELSE 'completed'
  END AS "status",
  MIN(er."started_at") AS "started_at",
  CASE
    WHEN COUNT(*) FILTER (WHERE er."completed_at" IS NULL) = 0 THEN MAX(er."completed_at")
    ELSE NULL
  END AS "completed_at",
  jsonb_build_object('backfilledFromCollectionScopeKey', true)
FROM "collection_extraction_runs" er
LEFT JOIN "collection_source_documents" sd
  ON sd."active_extraction_run_id" = er."extraction_run_id"
WHERE er."collection_scope_key" IS NOT NULL
GROUP BY er."collection_scope_key";

UPDATE "collection_extraction_runs" er
SET "collection_run_id" = cr."collection_run_id"
FROM "collection_runs" cr
WHERE er."collection_scope_key" = cr."scope_key";

CREATE INDEX "idx_extraction_runs_collection_run_id"
ON "collection_extraction_runs" ("collection_run_id");

ALTER TABLE "collection_extraction_runs"
ADD CONSTRAINT "collection_extraction_runs_collection_run_id_fkey"
FOREIGN KEY ("collection_run_id")
REFERENCES "collection_runs"("collection_run_id")
ON DELETE SET NULL
ON UPDATE CASCADE;

DROP INDEX IF EXISTS "idx_extraction_runs_collection_scope_key";

ALTER TABLE "collection_extraction_runs"
DROP COLUMN "collection_scope_key";
