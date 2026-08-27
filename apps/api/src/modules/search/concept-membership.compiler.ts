import { Prisma } from '@prisma/client';
import type {
  ConceptArm,
  ConceptColumn,
  ConceptConstraint,
} from './search-execution-directives';
import type { DietaryWall } from './dietary-constraints';

/**
 * THE ONE CONCEPT-MEMBERSHIP COMPILER (red-team L3 F3 + L2 K6, 2026-08-26).
 *
 * Every consumer that filters by an attribute concept — the ranked dual-list
 * builder (walls AND pooled-gate provenance), map-dot coverage, and the
 * saved-list assembler — renders its membership SQL HERE. No consumer
 * re-derives which column a concept lives in; the concept's arms carry that
 * (facet-derived, see the constructors at the bottom).
 *
 * K6's lesson, generalized from the dietary fix that preceded it: "coverage
 * used to read only the strip, so 'vegan tacos' walled the cards beside an
 * unwalled map" — and three weeks later cuisine reproduced the same defect
 * because the lesson was fixed for dietary and not generalized. One renderer
 * per axis means the list and the dots cannot disagree about membership.
 */

/** OR across a concept's arms, each rendered by the caller's arm mapper.
 *  Single-arm concepts stay a bare containment — byte-equivalent to the
 *  pre-concept single-column shape. Null when the axis has no arms. */
export function conceptArmsOrSql(
  arms: readonly ConceptArm[],
  armSql: (arm: ConceptArm) => Prisma.Sql,
): Prisma.Sql | null {
  if (!arms.length) {
    return null;
  }
  const parts = arms.map(armSql);
  return parts.length === 1
    ? parts[0]
    : Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

/**
 * DISH-AXIS membership: a (restaurant, dish) row satisfies the concept when
 * the dish carries a food arm's id in `food_attributes` OR its restaurant
 * carries a restaurant arm's id in `restaurant_attributes`. Null when the
 * concept does not constrain dishes at all (dietary walls with no dish-side
 * entity — deliberately NOT a venue fallback: owner semantics 2026-08-04,
 * a dish serves only when IT carries the dish-side attribute).
 */
export function conceptDishAxisSql(
  concept: ConceptConstraint,
  aliases: { connection: string; restaurant: string },
): Prisma.Sql | null {
  const c = Prisma.raw(aliases.connection);
  const fr = Prisma.raw(aliases.restaurant);
  return conceptArmsOrSql(concept.dishArms, (arm) =>
    arm.column === 'food_attributes'
      ? Prisma.sql`${c}.food_attributes @> ARRAY[${arm.id}]::uuid[]`
      : Prisma.sql`${fr}.restaurant_attributes @> ARRAY[${arm.id}]::uuid[]`,
  );
}

/**
 * RESTAURANT-AXIS membership: the venue carries a restaurant arm's id
 * itself OR any of its dishes carries a food arm's id.
 *
 * THE DELIBERATE TIER-0 vs WALL ASYMMETRY (red-team L3 F8, last bullet):
 * the pooled gate's soft path passes `dishExistsScopeSql` (the query's
 * connection-match conditions) so the food arm's EXISTS means "the
 * MATCHING dish carries the concept" — tier 0 is a claim about the rows
 * the query is actually serving. Walls pass NO scope: a wall asks "is
 * this venue X-viable" (any dish at all), not "does the matching dish
 * happen to be X" — that stricter question is the DISH projection's job.
 * Both are right; this comment is why they differ.
 */
export function conceptRestaurantAxisSql(
  concept: ConceptConstraint,
  restaurantAlias: string,
  opts?: { dishExistsScopeSql?: Prisma.Sql | null },
): Prisma.Sql | null {
  const r = Prisma.raw(restaurantAlias);
  const scope = opts?.dishExistsScopeSql ?? null;
  return conceptArmsOrSql(concept.restaurantArms, (arm) =>
    arm.column === 'restaurant_attributes'
      ? Prisma.sql`${r}.restaurant_attributes @> ARRAY[${arm.id}]::uuid[]`
      : Prisma.sql`EXISTS (
                  SELECT 1 FROM core_restaurant_items c
                  WHERE c.restaurant_id = ${r}.entity_id
                    AND c.food_attributes @> ARRAY[${arm.id}]::uuid[]
                    ${scope ? Prisma.sql`AND ${scope}` : Prisma.sql``}
                )`,
  );
}

// ---------------------------------------------------------------------------
// Facet-derived constructors — columns come from what the attribute IS,
// never from the caller re-hardcoding them (F3).
// ---------------------------------------------------------------------------

/** A facet='cuisine' attribute: ONE concept, two storage homes, both axes.
 *  Arm ORDER preserves the proven SQL byte shapes: the wall's restaurant
 *  axis reads venue-first (`r.restaurant_attributes @> … OR EXISTS dish`),
 *  the soft/pooled restaurant axis reads dish-first (`EXISTS … OR
 *  fr.restaurant_attributes @> …`) — both asserted by
 *  cuisine-dual-projection.spec.ts. */
export function cuisineConceptConstraint(
  id: string,
  hardness: 'wall' | 'soft',
): ConceptConstraint {
  const food: ConceptArm = { column: 'food_attributes', id };
  const rest: ConceptArm = { column: 'restaurant_attributes', id };
  return {
    id,
    hardness,
    dishArms: [food, rest],
    restaurantArms: hardness === 'wall' ? [rest, food] : [food, rest],
  };
}

/** A plain (non-faceted) attribute: one home, derived from its type —
 *  item attribute → food_attributes, place attribute →
 *  restaurant_attributes. Soft only: hard plain attributes remain plan
 *  membership (the attributes-ARE-the-subject overlap semantics). */
export function plainAttributeSoftConcept(
  id: string,
  column: ConceptColumn,
): ConceptConstraint {
  const arm: ConceptArm = { column, id };
  return { id, hardness: 'soft', dishArms: [arm], restaurantArms: [arm] };
}

/** A dietary wall (owner semantics 2026-08-04), as the one primitive:
 *  per-axis ASYMMETRIC — the dish axis carries only the dish-side arm
 *  (a wall with no dish-side entity does not constrain dishes); the
 *  restaurant axis carries venue containment and/or the dish EXISTS,
 *  arms dropped when a side has no entity (vegetarian has no venue row
 *  today). */
export function dietaryWallConcept(wall: DietaryWall): ConceptConstraint {
  const food: ConceptArm[] = wall.itemAttributeId
    ? [{ column: 'food_attributes', id: wall.itemAttributeId }]
    : [];
  const rest: ConceptArm[] = wall.placeAttributeId
    ? [{ column: 'restaurant_attributes', id: wall.placeAttributeId }]
    : [];
  return {
    id: wall.itemAttributeId ?? wall.placeAttributeId ?? wall.name,
    hardness: 'wall',
    dishArms: food,
    restaurantArms: [...rest, ...food],
  };
}
