ALTER TABLE "entity_priority_metrics" RENAME TO "entity_priority";

ALTER TABLE "entity_priority" RENAME CONSTRAINT "entity_priority_metrics_pkey" TO "entity_priority_pkey";
ALTER TABLE "entity_priority" RENAME CONSTRAINT "entity_priority_metrics_entity_id_fkey" TO "entity_priority_entity_id_fkey";

ALTER INDEX "idx_entity_priority_metrics_type" RENAME TO "idx_entity_priority_type";
ALTER INDEX "idx_entity_priority_metrics_calculated" RENAME TO "idx_entity_priority_calculated";
