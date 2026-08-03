import type { EntityType } from '@prisma/client';
import type { MapBoundsDto } from './dto/search-query.dto';

export interface ConstraintInputPresence {
  restaurants: number;
  food: number;
  foodAttributes: number;
  restaurantAttributes: number;
}

export interface ConstraintResolvedIds {
  restaurantIds: string[];
  foodIds: string[];
  foodAttributeIds: string[];
  restaurantAttributeIds: string[];
  /** Ingredient lane — filters connections by evidence OR canonical tier.
   *  (The excluded-ingredient lane was deleted 2026-07-30 — spec §1.1:
   *  negation is not interpreted, allergen toggles rejected.) */
  ingredientIds: string[];
}

/**
 * STEP-4 STRUCTURED GROUNDING (spec §1.2, anti-flattening law): the query's
 * food grounding kept STRUCTURED to the builder boundary. The flat
 * `ids.foodIds` array is a DERIVED VIEW of this structure (anchors ∪ family
 * ∪ similar), never the source of truth — exactness, relevance, and
 * widening all read the structure instead of reconstructing it.
 *
 * - anchors: the entities the span names (the exact query foods);
 * - family: is-a instances (category edges + head-final name variants) —
 *   MEANING, not widening: tier 0, relevance 1;
 * - similar: graded relatedness (dense siblings, mentions-it names,
 *   lexical adds) — tier 1, each id with its calibrated relevance;
 * - twinIngredientIds: same-named ingredient entities (containment union).
 */
export interface FoodGrounding {
  anchors: string[];
  family: string[];
  similar: Record<string, number>;
  twinIngredientIds: string[];
}

export interface SearchConstraints {
  format: 'dual_list';
  // CUTOVER 2026-08-02: the relaxation ladder is deleted — there is one pooled
  // execution, so the former per-stage `stage`/`stagePresence` (a duplicate of
  // inputPresence) are gone; the pooled richness gate replaced staged drops.
  inputPresence: ConstraintInputPresence;
  hadFoodGroup: boolean;
  hadRestaurantGroup: boolean;
  hadFoodAttributeGroup: boolean;
  hadRestaurantAttributeGroup: boolean;
  primaryFoodAttributeQuery: boolean;
  /** Structured food grounding — `ids.foodIds` is derived from it. */
  grounding: { food: FoodGrounding };
  ids: ConstraintResolvedIds;
  filters: {
    bounds?: MapBoundsDto;
    // Screen-accurate viewport polygon ([lng, lat] pairs) — when present, the exact-viewport
    // filter (ST_Covers) the search uses instead of the AABB bounds box.
    viewportPolygon?: Array<[number, number]>;
    openNow?: boolean;
    priceLevels: number[];
    minimumVotes: number | null;
    rising: boolean;
  };
  unresolved: {
    groups: Array<{
      type: EntityType;
      terms: string[];
    }>;
  };
}
