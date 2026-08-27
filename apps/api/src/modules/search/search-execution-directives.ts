/** A storage column an attribute concept can be satisfied from. */
export type ConceptColumn = 'food_attributes' | 'restaurant_attributes';

/** One (column, attribute-id) arm of a concept. A concept may bind a
 *  DIFFERENT id per column: a dietary pair walls with its dish-side entity
 *  on food_attributes and its venue-side entity on restaurant_attributes,
 *  while a cuisine concept carries the same id in both homes. */
export interface ConceptArm {
  column: ConceptColumn;
  id: string;
}

/**
 * THE ONE ATTRIBUTE-CONSTRAINT PRIMITIVE (red-team L3 F3, 2026-08-26).
 *
 * Every attribute constraint — dietary wall, cuisine concept, plain
 * item/place attribute — is ONE shape: an identity, a hardness, and its
 * per-axis column arms. Arms are ORed WITHIN a concept (any home
 * satisfies it) and concepts are ANDed ACROSS; hardness decides where the
 * AND lands:
 *
 *  - 'wall'  — ANDed into the WHERE membership (dietary: softening the
 *    constraint is a wrong answer, not degradation; cuisine with no
 *    primary subject: the cuisine IS the ask).
 *  - 'soft'  — the concept rides the pooled richness gate as per-row
 *    provenance (spec §1.4): tier 0 = a row satisfies EVERY soft concept,
 *    each by ANY of its arms; tier-1 rows admitted only when tier-0 rows
 *    cannot fill one page.
 *
 * The arms are FACET-DERIVED (the attribute knows its homes, callers
 * never re-hardcode columns — see concept-membership.compiler.ts):
 *  - dietary pair → per-axis ASYMMETRIC: dish axis food_attributes only
 *    (a wall with no dish-side entity does not constrain dishes);
 *    restaurant axis venue containment OR dish EXISTS.
 *  - cuisine → both homes on both axes (the Mexican taco at the Korean
 *    spot surfaces through the dish arm; the Mexican restaurant's menu
 *    through the venue arm — never two AND'd twins, the naive dual
 *    projection that gets STRICTER, F5).
 *  - plain place attribute → restaurant_attributes; plain item
 *    attribute → food_attributes.
 *
 * This one field replaces the three sibling representations the F3 red
 * team found: `dietaryWalls` (bespoke pair shape with its own two SQL
 * renderers), `cuisineConceptIds` (a bare id list whose columns were
 * re-hardcoded at every builder site), and the residual single-column
 * soft-concept wrapping in the service.
 */
export interface ConceptConstraint {
  /** Identity/report key — the starvation JSON key for soft concepts. */
  id: string;
  hardness: 'wall' | 'soft';
  /** Dish-axis arms, ORed. Empty ⇒ the concept does not constrain the
   *  dish projection (dietary walls with no dish-side entity). */
  dishArms: ConceptArm[];
  /** Restaurant-axis arms, ORed. A food_attributes arm renders as a dish
   *  EXISTS ("any of its dishes carries it"); a restaurant_attributes arm
   *  as venue containment. */
  restaurantArms: ConceptArm[];
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
   * THE typed attribute-constraint list (F3): walls AND softs together,
   * partitioned by hardness at the builder. Soft concepts are rendered
   * only when `pooledGate` is present (they are gate provenance, not
   * membership); walls always AND into the WHERE of both projections.
   */
  concepts?: ConceptConstraint[];
  /**
   * STEP-3 POOLED RICHNESS GATE (spec §1.4; owner rulings 2026-08-01):
   * soft attribute constraints leave the WHERE membership and become
   * per-row PROVENANCE — a row matching EVERY soft concept is tier 0
   * ("all words"), anything else tier 1. The gate admits tier-1 rows ONLY
   * when tier-0 rows cannot fill one page (threshold), in the SAME
   * execution. tier → match_tier → exactMatch, so the chip and pooled
   * ordering ride the existing plumbing. The soft concepts themselves
   * live in `concepts` (hardness 'soft').
   */
  pooledGate?: {
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
