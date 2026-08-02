export interface SearchExecutionDirectives {
  /**
   * When the primary target is a food attribute (no explicit food/restaurant),
   * allow a fallback that includes connections whose food/category text matches
   * the attribute term(s), even if the attribute ID graph is incomplete.
   */
  primaryFoodAttributeQuery?: boolean;
  primaryFoodAttributeTextFoodIds?: string[];
  /**
   * SECTIONED RELEVANCY (owner-approved shape): the EXACT query food ids —
   * distinguishable from sibling/category/lexical widening by construction.
   * When `sectionedRanking` is on, rows matching these ids rank as tier 0
   * (pure Crave Score within), everything widened ranks after as tier 1, and
   * every row carries the tier so the client can draw the section divider.
   */
  exactFoodIds?: string[];
  sectionedRanking?: boolean;
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
   * gateFull: the PARAMETERIZED gate decision (spec §1.4.4a/b). null =
   * decide in-SQL from the pre-openness candidate count. true/false =
   * the caller already decided on the openness-aware set (open-now
   * restaurant axis) — SQL applies the verdict without recounting.
   */
  pooledGate?: {
    softFoodAttributeIds: string[];
    softRestaurantAttributeIds: string[];
    threshold: number;
    gateFull: boolean | null;
  };
}
