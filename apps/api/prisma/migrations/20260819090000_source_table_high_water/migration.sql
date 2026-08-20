-- SOURCE-TABLE ROW-COLLAPSE ALARM (08-16 silent-wipe incident).
-- Persisted high-water row counts for the unrebuildable source tables
-- (core_entities, entity_surface, core_restaurant_locations,
-- collection_source_documents, core_restaurant_events). The alarm service
-- compares live counts to these at boot and nightly and raises a critical
-- deduped ops alert on a collapse. Tiny catalog table: no parallel-worker
-- guard needed (no rewrite, no unbounded UPDATE).
CREATE TABLE "source_table_high_water" (
    "table_name" TEXT NOT NULL,
    "high_water_count" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_table_high_water_pkey" PRIMARY KEY ("table_name")
);
