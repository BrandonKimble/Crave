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
}
