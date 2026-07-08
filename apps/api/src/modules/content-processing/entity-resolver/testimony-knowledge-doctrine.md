# The Testimony / Knowledge Doctrine

Some facts about a dish have TWO legitimate sources, and the system keeps them
in two tiers **on purpose** — merging them at write time is the anti-pattern
(loses provenance, and chains the cheap re-synthesizable tier to the evidence
tier's lifecycle).

- **Testimony (evidence tier)** — what real sources SAID about a specific
  venue's version. Sparse by design (source-named only), venue-specific, the
  only place venue variation can live. Lives on the CONNECTION
  (`connection.ingredients`) or as banked surface variants
  (`entity.aliases` from real usage).
- **Knowledge (synthesis tier)** — what the dish IS, world-knowledge,
  re-derivable offline for pennies at any time. Lives on the ENTITY
  (`entity.canonicalIngredients`, synthesis-added aliases) via the nightly
  dish-knowledge pass.

## The read contract (stated once, referenced everywhere)

1. **One named seam per field.** No consumer touches the raw columns to answer
   "what's in this dish" — for ingredients that seam is
   `SearchQueryBuilder.buildEffectiveIngredientsClause` (SQL layer).
2. **Precedence: testimony wins for claims about THIS venue; knowledge fills
   recall.** Display/badging prefers connection-level evidence ("mentioned:
   burrata"); search/filter inclusion unions both tiers.
3. **Exclusion is conservative.** For allergy/"no cilantro" filtering, exclude
   when EITHER tier names the ingredient — canon says ramen has egg; a venue's
   version might not, and an exclusion never gambles on the venue being the
   exception.

## Fields following this pattern

- `ingredients` (connection) / `canonicalIngredients` (entity)
- `aliases`: extraction banks established surfaces (testimony);
  dish-knowledge synthesis adds canonical co-names (knowledge). Same
  reasoning moved alias generation out of the extraction prompt.

New fields that grow two tiers should reference this document rather than
restate the rules.
