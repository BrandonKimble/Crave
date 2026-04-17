ALTER TABLE "core_entities"
ALTER COLUMN "market_key" DROP NOT NULL;

CREATE TABLE "core_entity_market_presence" (
  "entity_id" UUID NOT NULL,
  "market_key" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "core_entity_market_presence_pkey" PRIMARY KEY ("entity_id", "market_key"),
  CONSTRAINT "core_entity_market_presence_entity_id_fkey"
    FOREIGN KEY ("entity_id") REFERENCES "core_entities"("entity_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_entity_market_presence_market_key"
  ON "core_entity_market_presence"("market_key");

CREATE INDEX "idx_entity_market_presence_entity_id"
  ON "core_entity_market_presence"("entity_id");

INSERT INTO "core_entity_market_presence" ("entity_id", "market_key")
SELECT
  e."entity_id",
  LOWER(BTRIM(e."market_key")) AS "market_key"
FROM "core_entities" e
WHERE e."type" = 'restaurant'::"entity_type"
  AND e."market_key" IS NOT NULL
  AND BTRIM(e."market_key") <> ''
ON CONFLICT ("entity_id", "market_key") DO NOTHING;

INSERT INTO "core_entity_market_presence" ("entity_id", "market_key")
SELECT DISTINCT
  rl."restaurant_id" AS "entity_id",
  LOWER(BTRIM(m."market_key")) AS "market_key"
FROM "core_restaurant_locations" rl
JOIN "core_markets" m
  ON m."is_active" = TRUE
 AND m."geometry" IS NOT NULL
WHERE rl."latitude" IS NOT NULL
  AND rl."longitude" IS NOT NULL
  AND ST_Contains(
    m."geometry",
    ST_SetSRID(
      ST_MakePoint(
        rl."longitude"::double precision,
        rl."latitude"::double precision
      ),
      4326
    )
  )
ON CONFLICT ("entity_id", "market_key") DO NOTHING;

UPDATE "core_entities"
SET "market_key" = NULL
WHERE "type" = 'restaurant'::"entity_type";
