/**
 * ONE DEFINITION OF A FOOD-CATEGORY EDGE (2026-08-13; source re-derived
 * 2026-08-30, the D4 category move).
 *
 * `derived_food_category_edges` answers "is this food a member of that
 * category" for SEARCH's category expansion, the teaser's category lists, and
 * the satisfies judge's rung-2 arm. All three READ it and FAIL OPEN — a
 * missing edge is not an error anywhere, it is a category that quietly returns
 * fewer dishes than it should.
 *
 * THE SOURCE (D4, plans/category-and-knowledge-split-study.md): the dish
 * entity's `knowledge_categories` facet — category membership derived ONCE
 * per dish concept by the dish-knowledge pass, versioned by its release
 * ledger. The previous source, a union-and-threshold reconciliation of the
 * per-connection `categories` arrays, is retired: it existed only to launder
 * per-mention disagreement (60.3% of multi-connection foods) back into one
 * answer, and still passed real errors through. Edges exist only for foods
 * with a LIVE connection (an edge for a food nobody serves is dead weight in
 * four fail-open readers), only to ACTIVE item entities (the K2-analog
 * guard: a merge-archived category can never be resurrected here), and the
 * mint-time containment-inversion filter stays (a child is never its own
 * parent's parent). `conn_support`/`food_conns` both record the food's live
 * connection count — knowledge is one opinion, so there is no support
 * arithmetic left, and no reader consumes the counts.
 *
 * WHY THE SQL LIVES HERE AND NOT AT ITS CALLERS. There are two writers, and
 * there always will be:
 *
 *   - the INCREMENTAL one, inside the projection rebuild's transaction, which
 *     recomputes the edges of every food the just-rebuilt restaurants touch;
 *   - the FULL-REPLACE one, the nightly DerivedIndexJob, which is the only
 *     thing that can heal an edge whose inputs changed outside a restaurant
 *     rebuild (an entity archived, a merge, a knowledge re-synthesis) and the
 *     only thing that can repopulate the table after a wipe.
 *
 * Those two must agree EXACTLY, because they write the same rows; the two
 * paths differ ONLY in scope, so scope is the only thing this module takes
 * as an argument.
 */

/**
 * Restrict the rebuild to the foods a set of restaurants touches, or to
 * nothing at all — `null` means EVERY food, which is what the nightly
 * full-replace wants.
 *
 * The predicate is a literal SQL fragment, never interpolated user input: the
 * restaurant ids travel as `$1`, a bind parameter, exactly as they did when
 * this SQL lived at its one caller.
 */
export type ItemEdgeScope = { readonly placeIdsParam: string } | null;

function knowledgeScopeClause(scope: ItemEdgeScope): string {
  if (scope === null) return '';
  return `
         AND e.entity_id IN (
           SELECT DISTINCT food_id FROM core_restaurant_items
           WHERE restaurant_id = ANY(${scope.placeIdsParam}::uuid[])
         )`;
}

/**
 * GLOBAL edge lock (round-6 red team): edge rows are keyed by FOOD and shared
 * across restaurants — two rebuild txs holding disjoint restaurant locks
 * contend on the same hot-food edges in unsynchronized order (deadlock
 * shape). One lock serializes only this phase. The nightly full replace takes
 * the same lock, so it cannot interleave with an incremental refresh either.
 */
export const ITEM_CATEGORY_EDGE_LOCK =
  "SELECT pg_advisory_xact_lock(hashtext('rebuild:food-category-edges'))";

/** Clear the edges this rebuild is about to re-derive, and nothing else. */
export function itemCategoryEdgeDeleteSql(scope: ItemEdgeScope): string {
  if (scope === null) return 'DELETE FROM derived_food_category_edges';
  return `DELETE FROM derived_food_category_edges
       WHERE food_id IN (
         SELECT DISTINCT food_id FROM core_restaurant_items
         WHERE restaurant_id = ANY(${scope.placeIdsParam}::uuid[])
       )`;
}

/** Re-derive them from the dish entities' knowledge_categories facet. */
export function itemCategoryEdgeInsertSql(scope: ItemEdgeScope): string {
  return `INSERT INTO derived_food_category_edges (food_id, category_id, conn_support, food_conns)
       SELECT DISTINCT e.entity_id, cat_id, live.n, live.n
       FROM core_entities e
       CROSS JOIN LATERAL unnest(e.knowledge_categories) AS cat_id
       JOIN LATERAL (
         -- STARVED (zeroed) connections never count; a food whose every
         -- connection is starved gets no edges at all.
         SELECT count(*)::int AS n FROM core_restaurant_items c
          WHERE c.food_id = e.entity_id AND c.mention_count > 0
       ) live ON live.n > 0
       WHERE e.type = 'item'::entity_type
         AND e.status = 'active'::entity_status
         AND cat_id <> e.entity_id${knowledgeScopeClause(scope)}
         -- ACTIVE item targets only (K2-analog): a merged/archived category
         -- id lingering in knowledge_categories mints nothing until the
         -- dish's next knowledge hearing repoints it.
         AND EXISTS (
           SELECT 1 FROM core_entities cat
           WHERE cat.entity_id = cat_id
             AND cat.type = 'item'::entity_type
             AND cat.status = 'active'::entity_status
         )
         -- mint-time twin of the edge_hygiene cleanup (round-6 red team:
         -- cleanup was transient because rebuilds re-minted what it
         -- deleted): no containment inversions — a category whose NAME
         -- contains the food's whole name is the food's child, not parent.
         AND NOT EXISTS (
           SELECT 1 FROM core_entities cat
           WHERE cat.entity_id = cat_id
             AND position(lower(e.name) IN lower(cat.name)) > 0
             AND lower(e.name) <> lower(cat.name)
         )`;
}
