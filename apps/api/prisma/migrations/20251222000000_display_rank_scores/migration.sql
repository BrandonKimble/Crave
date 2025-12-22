CREATE TYPE "display_rank_subject_type" AS ENUM ('restaurant', 'connection');

CREATE TABLE "core_display_rank_scores" (
  "location_key" VARCHAR(255) NOT NULL,
  "subject_type" "display_rank_subject_type" NOT NULL,
  "subject_id" UUID NOT NULL,
  "rank_score_raw" DECIMAL(9, 4) NOT NULL,
  "rank_score_display" DECIMAL(5, 1) NOT NULL,
  "rank_percentile" DECIMAL(6, 5) NOT NULL,
  "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("location_key", "subject_type", "subject_id")
);

CREATE INDEX "idx_display_rank_location_type" ON "core_display_rank_scores" ("location_key", "subject_type");
CREATE INDEX "idx_display_rank_subject" ON "core_display_rank_scores" ("subject_type", "subject_id");
