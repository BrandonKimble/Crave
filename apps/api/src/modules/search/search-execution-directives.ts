/** A column home a soft concept can be satisfied from. */
export type SoftConceptColumn = 'food_attributes' | 'restaurant_attributes';

/** One soft word of the pooled gate: a concept (attribute entity id) plus
 *  the column homes any one of which satisfies it — OR within a concept,
 *  AND across concepts. */
export interface PooledSoftConcept {
  id: string;
  columns: SoftConceptColumn[];
}

export interface SearchExecutionDirectives {
  /**
   * When the primary target is a food attribute (no explicit food/restaurant),
   * allow a fallback that includes connections whose food/category text matches
   * the attribute term(s), even if the attribute ID graph is incomplete.
   */
  primaryItemAttributeQuery?: boolean;
  primaryItemAttributeTextItemIds?: string[];
  /**
   * Twin-ingredient union (owner ruling 2026-07-25): same-named ingredient
   * entities of the query foods — the food clause ORs their containment
   * (evidence + canon tiers), so "burrata" the food also returns the pizza
   * that CONTAINS burrata.
   */
  twinIngredientIds?: string[];
  /**
   * STEP-3 POOLED RICHNESS GATE (spec §1.4; owner rulings 2026-08-01):
   * soft (non-dietary) attribute constraints leave the WHERE membership and
   * become per-row PROVENANCE — a row matching EVERY soft id is tier 0
   * ("all words"), anything else tier 1. The gate admits tier-1 rows ONLY
   * when tier-0 rows cannot fill one page (threshold), in the SAME
   * execution: page 1 filled with all-word matches when they exist,
   * otherwise partial matches join, score-ordered within tier. tier →
   * match_tier → exactMatch, so the chip and pooled ordering ride the
   * existing plumbing.
   *
   */
  /** DIETARY WALLS (owner semantics 2026-08-04), per-projection:
   *  DISH projection — every wall with a foodAttributeId requires
   *  `c.food_attributes @> [fa]` (dish-side only; a wall with no
   *  dish-side id does not constrain dishes).
   *  RESTAURANT projection — every wall requires
   *  `(fr.restaurant_attributes @> [ra] OR EXISTS(dish with fa))`,
   *  arms dropped when the side has no entity. Sourced from BOTH the
   *  toggle strip (request.dietary names) and query-text grounding
   *  (a grounded dietary id activates its whole pair). */
  dietaryWalls?: Array<{
    name: string;
    itemAttributeId?: string;
    placeAttributeId?: string;
  }>;
  /**
   * CUISINE DUAL-PROJECTION, hard membership (v17 S4; F5): a grounded
   * facet='cuisine' attribute is ONE concept with two storage homes — the
   * dish-side `food_attributes` array (knowledge projection) and the
   * restaurant-side `restaurant_attributes` array (testimony + Places +
   * cuisine_llm). When the query has no primary subject the concept is a
   * WALL, satisfied by EITHER home (never an AND that gets stricter):
   * dish axis `(c.food_attributes @> [id] OR fr.restaurant_attributes @>
   * [id])`, restaurant axis `(r.restaurant_attributes @> [id] OR EXISTS
   * dish carrying it)`. With a primary subject the same concept rides the
   * pooled gate as one soft concept spanning both columns.
   */
  cuisineConceptIds?: string[];
  pooledGate?: {
    /**
     * ONE soft entry per CONCEPT (F5): a concept lists the column homes
     * that can satisfy it, and tier-0 requires every concept satisfied by
     * ANY of its columns. The old parallel id lists made a dual-homed
     * cuisine id two AND'd requirements (stricter, the exact starvation
     * this exists to prevent) and duplicated its starvation JSON key.
     */
    softConcepts: PooledSoftConcept[];
    threshold: number;
    /** TIER-2 SIMILAR RING (round-5 ideal, spec §7.2 dissolved): the dense
     *  sibling ids ride the SAME dish scan as provenance tier 2 — admitted
     *  to the scan (an OR arm), EXCLUDED from the served page, counted by
     *  the window (similarAvailable becomes a measured fact). The
     *  Include-similar chip flips membership (ring becomes tier-1 members)
     *  instead of re-running the pipeline. Dish axis only. */
    similarItemIds?: string[];
  };
}
