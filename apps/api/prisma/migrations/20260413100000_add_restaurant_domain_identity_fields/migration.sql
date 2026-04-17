ALTER TABLE "core_entities"
ADD COLUMN "canonical_domain" VARCHAR(255);

ALTER TABLE "core_restaurant_locations"
ADD COLUMN "website_domain" VARCHAR(255);

CREATE INDEX "idx_entities_canonical_domain"
ON "core_entities"("canonical_domain");

CREATE INDEX "idx_entities_type_canonical_domain"
ON "core_entities"("type", "canonical_domain");

CREATE INDEX "idx_restaurant_locations_website_domain"
ON "core_restaurant_locations"("website_domain");

CREATE INDEX "idx_restaurant_locations_restaurant_domain"
ON "core_restaurant_locations"("restaurant_id", "website_domain");
