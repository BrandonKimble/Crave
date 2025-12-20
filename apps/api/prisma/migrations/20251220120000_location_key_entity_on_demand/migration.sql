ALTER TABLE "core_entities"
  ADD COLUMN "location_key" VARCHAR(255) NOT NULL DEFAULT 'global';

ALTER TABLE "collection_on_demand_requests"
  ADD COLUMN "location_key" VARCHAR(255) NOT NULL DEFAULT 'global';

DROP INDEX IF EXISTS "core_entities_name_type_key";
CREATE UNIQUE INDEX "core_entities_name_type_location_key_key"
  ON "core_entities"("name", "type", "location_key");

CREATE INDEX "idx_entities_location_key"
  ON "core_entities"("location_key");

DROP INDEX IF EXISTS "collection_on_demand_requests_term_entity_type_reason_key";
CREATE UNIQUE INDEX "collection_on_demand_requests_term_entity_type_reason_location_key_key"
  ON "collection_on_demand_requests"("term", "entity_type", "reason", "location_key");
