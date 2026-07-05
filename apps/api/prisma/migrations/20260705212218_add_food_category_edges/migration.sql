-- Canonical per-food category edges (see FoodCategoryEdge in schema.prisma).
CREATE TABLE "derived_food_category_edges" (
    "food_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "conn_support" INTEGER NOT NULL,
    "food_conns" INTEGER NOT NULL,
    "built_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "derived_food_category_edges_pkey" PRIMARY KEY ("food_id","category_id")
);
CREATE INDEX "idx_food_category_edges_category" ON "derived_food_category_edges"("category_id");

-- Backfill: union across each food's connections, self-edges excluded.
INSERT INTO derived_food_category_edges (food_id, category_id, conn_support, food_conns)
SELECT c.food_id, cat_id, count(*),
       (SELECT count(*) FROM core_restaurant_items c2 WHERE c2.food_id = c.food_id)
FROM core_restaurant_items c, unnest(c.categories) AS cat_id
WHERE cat_id <> c.food_id
GROUP BY c.food_id, cat_id;
