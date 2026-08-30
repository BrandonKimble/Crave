/**
 * THE ATTRIBUTE-ID REFERENCE REGISTRY (redteam-l2 K2, 2026-08-26).
 *
 * Adjudication (applyPlan) must repoint every place a merged attribute id
 * lives and strip every place a rejected one does. That set used to be a
 * prose claim in a doc comment ("those are the only array columns") — and
 * the claim went FALSE the same commit set that added
 * `core_entities.knowledge_cuisines` and the evidence table. Now the set is
 * DECLARED here, adjudication iterates the declaration, and
 * `attribute-reference-registry.spec.ts` scans schema.prisma for every
 * `uuid[]` column and fails the build when one exists that is neither
 * registered as attribute-bearing nor explicitly classified as
 * non-attribute. A new uuid[] column cannot be silently invisible to the
 * judge.
 */
import type { AttributeEntityType } from './attribute-ontology.service';

export interface AttributeIdArrayColumn {
  /** Physical table name (the @@map name — adjudication runs raw SQL). */
  table: string;
  /** Physical column name. */
  column: string;
}

/**
 * Every uuid[] column that holds attribute-entity ids, by attribute type.
 * Merge repoints (array_replace + DISTINCT collapse) and rejection strips
 * (array_remove) run over exactly this list.
 */
export const ATTRIBUTE_ID_ARRAY_COLUMNS: Record<
  AttributeEntityType,
  readonly AttributeIdArrayColumn[]
> = {
  item_attribute: [
    { table: 'core_restaurant_items', column: 'food_attributes' },
  ],
  place_attribute: [
    { table: 'core_entities', column: 'restaurant_attributes' },
    // Dish-side cuisine knowledge — attribute ids at ENTITY grain. Missing
    // from adjudication until 2026-08-26; the grain bridge then resurrected
    // archived ids into food_attributes on the next rule-version bump.
    { table: 'core_entities', column: 'knowledge_cuisines' },
  ],
};

/**
 * Scalar attribute-id reference sites (not uuid[] — a column per row).
 * `core_restaurant_attribute_evidence.attribute_id` is part of the composite
 * PK, so a merge repoint must COLLAPSE onto an existing canonical row
 * (observations summed) rather than blind-update; rejection deletes the
 * ledger rows outright so correctness never rests on a downstream
 * active-only filter.
 */
export const ATTRIBUTE_ID_SCALAR_SITES: Record<
  AttributeEntityType,
  readonly { table: string; column: string }[]
> = {
  item_attribute: [],
  place_attribute: [
    { table: 'core_restaurant_attribute_evidence', column: 'attribute_id' },
  ],
};

/**
 * The uuid[] columns in schema.prisma that hold NON-attribute entity ids —
 * the scanner's explicit "seen and ruled out" list. A column here holds ids
 * of a type adjudication never merges under the attribute plans.
 */
export const NON_ATTRIBUTE_UUID_ARRAY_COLUMNS: ReadonlySet<string> = new Set([
  'core_entities.canonical_ingredients', // ingredient entity ids
  'core_entities.knowledge_categories', // item entity ids (D4 category facet)
  'core_restaurant_items.categories', // dish_category entity ids
  'core_restaurant_items.ingredients', // ingredient entity ids
  'engines.member_place_ids', // place entity ids
  'poll_topics.category_entity_ids', // dish_category entity ids
  'poll_topics.seed_entity_ids', // place/item seed entity ids
  'places.parent_place_ids', // provider place hierarchy ids (not entities)
]);

/** The slice of Prisma.TransactionClient the repoint/strip helpers need. */
interface RawExecutor {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/**
 * Re-point a merged attribute id to its canonical at EVERY registered
 * reference site for the type: each uuid[] column via array_replace +
 * DISTINCT collapse, and — for place attributes — the evidence ledger's
 * scalar rows, collapsed onto any existing canonical row (observations
 * summed; composite PK). ONE implementation for every attribute merge:
 * the ontology adjudicator (applyPlan) and the active-vocabulary dedupe
 * lane (AttributeDedupeMergeService) both execute THIS, so neither can
 * forget a site the other remembered.
 */
export async function repointAttributeIdRefs(
  tx: RawExecutor,
  type: AttributeEntityType,
  mergedId: string,
  canonicalId: string,
): Promise<number> {
  let count = 0;
  for (const site of ATTRIBUTE_ID_ARRAY_COLUMNS[type]) {
    count += await tx.$executeRawUnsafe(
      `UPDATE ${site.table}
       SET ${site.column} = (
         SELECT array_agg(DISTINCT e)
         FROM unnest(array_replace(${site.column}, $1::uuid, $2::uuid)) e
       )
       WHERE $1::uuid = ANY(${site.column})`,
      mergedId,
      canonicalId,
    );
  }
  if (ATTRIBUTE_ID_SCALAR_SITES[type].length > 0) {
    // core_restaurant_attribute_evidence: (restaurant, attribute,
    // source_class) is the PK, so first FOLD observations onto rows that
    // already exist under the canonical id, then repoint the rest, then
    // drop the folded leftovers. The ledger ends TRUE — no archived id
    // survives to be resurrected by a projection.
    count += await tx.$executeRawUnsafe(
      `UPDATE core_restaurant_attribute_evidence c
       SET observations = c.observations + m.observations
       FROM core_restaurant_attribute_evidence m
       WHERE m.attribute_id = $1::uuid
         AND c.attribute_id = $2::uuid
         AND c.restaurant_id = m.restaurant_id
         AND c.source_class = m.source_class`,
      mergedId,
      canonicalId,
    );
    count += await tx.$executeRawUnsafe(
      `UPDATE core_restaurant_attribute_evidence m
       SET attribute_id = $2::uuid
       WHERE m.attribute_id = $1::uuid
         AND NOT EXISTS (
           SELECT 1 FROM core_restaurant_attribute_evidence c
           WHERE c.restaurant_id = m.restaurant_id
             AND c.source_class = m.source_class
             AND c.attribute_id = $2::uuid
         )`,
      mergedId,
      canonicalId,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM core_restaurant_attribute_evidence
       WHERE attribute_id = $1::uuid`,
      mergedId,
    );
  }
  return count;
}

/**
 * Strip a rejected attribute id from EVERY registered reference site for
 * the type — uuid[] columns via array_remove, and (place attributes) the
 * evidence ledger rows deleted outright.
 */
export async function stripAttributeIdRefs(
  tx: RawExecutor,
  type: AttributeEntityType,
  id: string,
): Promise<number> {
  let count = 0;
  for (const site of ATTRIBUTE_ID_ARRAY_COLUMNS[type]) {
    count += await tx.$executeRawUnsafe(
      `UPDATE ${site.table}
       SET ${site.column} = array_remove(${site.column}, $1::uuid)
       WHERE $1::uuid = ANY(${site.column})`,
      id,
    );
  }
  if (ATTRIBUTE_ID_SCALAR_SITES[type].length > 0) {
    count += await tx.$executeRawUnsafe(
      `DELETE FROM core_restaurant_attribute_evidence
       WHERE attribute_id = $1::uuid`,
      id,
    );
  }
  return count;
}
