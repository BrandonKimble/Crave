DROP VIEW IF EXISTS public.connection_entity_names;

ALTER TABLE "core_connections" RENAME TO "core_restaurant_items";

ALTER TABLE "collection_sources" RENAME TO "collection_processed_sources";
ALTER TABLE "collection_processed_sources" RENAME COLUMN "subreddit" TO "community";

ALTER INDEX "idx_source_pipeline" RENAME TO "idx_processed_source_pipeline";
ALTER INDEX "idx_source_subreddit" RENAME TO "idx_processed_source_community";
ALTER INDEX "idx_source_processed_at" RENAME TO "idx_processed_source_processed_at";

CREATE TABLE "collection_extraction_runs" (
  "extraction_run_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pipeline" VARCHAR(32) NOT NULL,
  "model" VARCHAR(128) NOT NULL,
  "system_prompt_hash" VARCHAR(64) NOT NULL,
  "system_prompt" TEXT NOT NULL,
  "generation_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "chunking_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "extraction_schema_version" VARCHAR(32) NOT NULL DEFAULT 'v1',
  "status" VARCHAR(32) NOT NULL DEFAULT 'running',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "metadata" JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT "collection_extraction_runs_pkey" PRIMARY KEY ("extraction_run_id")
);

CREATE INDEX "idx_extraction_runs_pipeline_started_at"
  ON "collection_extraction_runs"("pipeline", "started_at" DESC);
CREATE INDEX "idx_extraction_runs_status"
  ON "collection_extraction_runs"("status");

CREATE TABLE "collection_source_documents" (
  "document_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "platform" VARCHAR(32) NOT NULL DEFAULT 'reddit',
  "community" VARCHAR(100),
  "source_type" "mention_source" NOT NULL,
  "source_id" VARCHAR(64) NOT NULL,
  "parent_source_id" VARCHAR(64),
  "title" TEXT,
  "body" TEXT,
  "url" VARCHAR(2048),
  "source_created_at" TIMESTAMP(3) NOT NULL,
  "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "score_snapshot" INTEGER,
  "raw_payload" JSONB,
  "active_extraction_run_id" UUID,

  CONSTRAINT "collection_source_documents_pkey" PRIMARY KEY ("document_id"),
  CONSTRAINT "collection_source_documents_active_extraction_run_id_fkey"
    FOREIGN KEY ("active_extraction_run_id")
    REFERENCES "collection_extraction_runs"("extraction_run_id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "source_documents_platform_type_source_id_key"
  ON "collection_source_documents"("platform", "source_type", "source_id");
CREATE INDEX "idx_source_documents_community"
  ON "collection_source_documents"("community");
CREATE INDEX "idx_source_documents_created_at"
  ON "collection_source_documents"("source_created_at" DESC);
CREATE INDEX "idx_source_documents_active_run"
  ON "collection_source_documents"("active_extraction_run_id");

CREATE TABLE "collection_extraction_inputs" (
  "input_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "extraction_run_id" UUID NOT NULL,
  "input_index" INTEGER NOT NULL,
  "input_payload" JSONB NOT NULL,
  "raw_output" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "collection_extraction_inputs_pkey" PRIMARY KEY ("input_id"),
  CONSTRAINT "collection_extraction_inputs_extraction_run_id_fkey"
    FOREIGN KEY ("extraction_run_id")
    REFERENCES "collection_extraction_runs"("extraction_run_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "extraction_inputs_run_index_key"
  ON "collection_extraction_inputs"("extraction_run_id", "input_index");
CREATE INDEX "idx_extraction_inputs_run"
  ON "collection_extraction_inputs"("extraction_run_id");

CREATE TABLE "collection_extraction_input_documents" (
  "input_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,

  CONSTRAINT "collection_extraction_input_documents_pkey" PRIMARY KEY ("input_id", "document_id"),
  CONSTRAINT "collection_extraction_input_documents_input_id_fkey"
    FOREIGN KEY ("input_id")
    REFERENCES "collection_extraction_inputs"("input_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "collection_extraction_input_documents_document_id_fkey"
    FOREIGN KEY ("document_id")
    REFERENCES "collection_source_documents"("document_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_extraction_input_documents_document"
  ON "collection_extraction_input_documents"("document_id");
CREATE INDEX "idx_extraction_input_documents_input_ordinal"
  ON "collection_extraction_input_documents"("input_id", "ordinal");

CREATE TABLE "core_restaurant_events" (
  "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "extraction_run_id" UUID NOT NULL,
  "input_id" UUID NOT NULL,
  "source_document_id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "mention_key" VARCHAR(255) NOT NULL,
  "evidence_type" VARCHAR(64) NOT NULL,
  "mentioned_at" TIMESTAMP(3) NOT NULL,
  "source_upvotes" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "core_restaurant_events_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "core_restaurant_events_extraction_run_id_fkey"
    FOREIGN KEY ("extraction_run_id")
    REFERENCES "collection_extraction_runs"("extraction_run_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "core_restaurant_events_input_id_fkey"
    FOREIGN KEY ("input_id")
    REFERENCES "collection_extraction_inputs"("input_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "core_restaurant_events_source_document_id_fkey"
    FOREIGN KEY ("source_document_id")
    REFERENCES "collection_source_documents"("document_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "core_restaurant_events_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id")
    REFERENCES "core_entities"("entity_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "restaurant_events_run_mention_restaurant_type_key"
  ON "core_restaurant_events"("extraction_run_id", "mention_key", "restaurant_id", "evidence_type");
CREATE INDEX "idx_restaurant_events_restaurant_time"
  ON "core_restaurant_events"("restaurant_id", "mentioned_at" DESC);
CREATE INDEX "idx_restaurant_events_source_document"
  ON "core_restaurant_events"("source_document_id");
CREATE INDEX "idx_restaurant_events_run"
  ON "core_restaurant_events"("extraction_run_id");

CREATE TABLE "core_restaurant_entity_events" (
  "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "extraction_run_id" UUID NOT NULL,
  "input_id" UUID NOT NULL,
  "source_document_id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "mention_key" VARCHAR(255) NOT NULL,
  "entity_id" UUID NOT NULL,
  "entity_type" "entity_type" NOT NULL,
  "evidence_type" VARCHAR(64) NOT NULL,
  "is_menu_item" BOOLEAN,
  "mentioned_at" TIMESTAMP(3) NOT NULL,
  "source_upvotes" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "core_restaurant_entity_events_pkey" PRIMARY KEY ("event_id"),
  CONSTRAINT "core_restaurant_entity_events_extraction_run_id_fkey"
    FOREIGN KEY ("extraction_run_id")
    REFERENCES "collection_extraction_runs"("extraction_run_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "core_restaurant_entity_events_input_id_fkey"
    FOREIGN KEY ("input_id")
    REFERENCES "collection_extraction_inputs"("input_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "core_restaurant_entity_events_source_document_id_fkey"
    FOREIGN KEY ("source_document_id")
    REFERENCES "collection_source_documents"("document_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "core_restaurant_entity_events_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id")
    REFERENCES "core_entities"("entity_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "core_restaurant_entity_events_entity_id_fkey"
    FOREIGN KEY ("entity_id")
    REFERENCES "core_entities"("entity_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "restaurant_entity_events_run_mention_restaurant_entity_type_key"
  ON "core_restaurant_entity_events"("extraction_run_id", "mention_key", "restaurant_id", "entity_id", "evidence_type");
CREATE INDEX "idx_restaurant_entity_events_restaurant_time"
  ON "core_restaurant_entity_events"("restaurant_id", "mentioned_at" DESC);
CREATE INDEX "idx_restaurant_entity_events_entity_time"
  ON "core_restaurant_entity_events"("entity_id", "mentioned_at" DESC);
CREATE INDEX "idx_restaurant_entity_events_source_document"
  ON "core_restaurant_entity_events"("source_document_id");
CREATE INDEX "idx_restaurant_entity_events_run"
  ON "core_restaurant_entity_events"("extraction_run_id");

CREATE TABLE "core_restaurant_entity_signals" (
  "restaurant_id" UUID NOT NULL,
  "entity_id" UUID NOT NULL,
  "entity_type" "entity_type" NOT NULL,
  "mention_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "core_restaurant_entity_signals_pkey" PRIMARY KEY ("restaurant_id", "entity_id"),
  CONSTRAINT "core_restaurant_entity_signals_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id")
    REFERENCES "core_entities"("entity_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "core_restaurant_entity_signals_entity_id_fkey"
    FOREIGN KEY ("entity_id")
    REFERENCES "core_entities"("entity_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_restaurant_entity_signals_entity_mentions"
  ON "core_restaurant_entity_signals"("entity_id", "mention_count" DESC);
CREATE INDEX "idx_restaurant_entity_signals_restaurant_mentions"
  ON "core_restaurant_entity_signals"("restaurant_id", "mention_count" DESC);
CREATE INDEX "idx_restaurant_entity_signals_restaurant_type_mentions"
  ON "core_restaurant_entity_signals"("restaurant_id", "entity_type", "mention_count" DESC);

CREATE VIEW public.connection_entity_names AS
SELECT c.connection_id,
       c.restaurant_id,
       r.name AS restaurant_name,
       c.food_id,
       f.name AS food_name,
       c.categories,
       ARRAY(
         SELECT e.name
         FROM public.core_entities e
         WHERE e.entity_id = ANY (c.categories)
         ORDER BY e.name
       ) AS category_names,
       c.food_attributes,
       ARRAY(
         SELECT e.name
         FROM public.core_entities e
         WHERE e.entity_id = ANY (c.food_attributes)
         ORDER BY e.name
       ) AS food_attribute_names,
       COALESCE(array_agg(DISTINCT emp.market_key) FILTER (WHERE emp.market_key IS NOT NULL), ARRAY[]::varchar[]) AS restaurant_market_keys
FROM public.core_restaurant_items c
JOIN public.core_entities r ON r.entity_id = c.restaurant_id
JOIN public.core_entities f ON f.entity_id = c.food_id
LEFT JOIN public.core_entity_market_presence emp ON emp.entity_id = c.restaurant_id
GROUP BY c.connection_id, c.restaurant_id, r.name, c.food_id, f.name, c.categories, c.food_attributes;
