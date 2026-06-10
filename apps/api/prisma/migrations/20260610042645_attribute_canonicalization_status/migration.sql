-- CreateEnum
CREATE TYPE "entity_status" AS ENUM ('active', 'pending');

-- AlterTable
ALTER TABLE "core_entities" ADD COLUMN     "status" "entity_status" NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "idx_entities_type_status" ON "core_entities"("type", "status");

-- Gate quarantined (pending) entity names out of display: the id arrays on connections
-- keep referencing pending entities (evidence preserved), but their names do not surface
-- until the ontology worker promotes them to active.
CREATE OR REPLACE VIEW public.connection_entity_names AS
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
           AND e.status = 'active'
         ORDER BY e.name
       ) AS category_names,
       c.food_attributes,
       ARRAY(
         SELECT e.name
         FROM public.core_entities e
         WHERE e.entity_id = ANY (c.food_attributes)
           AND e.status = 'active'
         ORDER BY e.name
       ) AS food_attribute_names,
       COALESCE(array_agg(DISTINCT emp.market_key) FILTER (WHERE emp.market_key IS NOT NULL), ARRAY[]::varchar[]) AS restaurant_market_keys
FROM public.core_restaurant_items c
JOIN public.core_entities r ON r.entity_id = c.restaurant_id
JOIN public.core_entities f ON f.entity_id = c.food_id
LEFT JOIN public.core_entity_market_presence emp ON emp.entity_id = c.restaurant_id
GROUP BY c.connection_id, c.restaurant_id, r.name, c.food_id, f.name, c.categories, c.food_attributes;
