-- Decay-ready per-contribution mention ledger for dish endorsement.
-- One row per counted contribution (direct + fanned support), so the v3 scorer
-- can decay-sum by Reddit post date while preserving the categorical fan-out.

CREATE TABLE "core_restaurant_item_mentions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "mentioned_at" TIMESTAMP(3) NOT NULL,
    "source_upvotes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "core_restaurant_item_mentions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "core_restaurant_item_mentions_connection_id_idx" ON "core_restaurant_item_mentions"("connection_id");

ALTER TABLE "core_restaurant_item_mentions"
    ADD CONSTRAINT "core_restaurant_item_mentions_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "core_restaurant_items"("connection_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
