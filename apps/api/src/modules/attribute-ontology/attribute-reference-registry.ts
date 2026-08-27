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
  'core_restaurant_items.categories', // dish_category entity ids
  'core_restaurant_items.ingredients', // ingredient entity ids
  'engines.member_place_ids', // place entity ids
  'poll_topics.category_entity_ids', // dish_category entity ids
  'poll_topics.seed_entity_ids', // place/item seed entity ids
  'places.parent_place_ids', // provider place hierarchy ids (not entities)
]);
