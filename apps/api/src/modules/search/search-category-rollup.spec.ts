import 'reflect-metadata';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import { SearchQueryBuilder } from './search-query.builder';
import { renderInlinedSql } from './sql-preview';
import type { SearchConstraints } from './search-constraints';

const ITEM_ID = '33333333-3333-3333-3333-333333333333';

function constraints(): SearchConstraints {
  return {
    format: 'dual_list',
    inputPresence: {
      places: 0,
      items: 1,
      itemAttributes: 0,
      placeAttributes: 0,
    },
    hadItemGroup: true,
    hadPlaceGroup: false,
    hadItemAttributeGroup: false,
    hadPlaceAttributeGroup: false,
    primaryItemAttributeQuery: false,
    grounding: {
      item: { anchors: [], family: [], similar: {}, twinIngredientIds: [] },
    },
    ids: {
      placeIds: [],
      itemIds: [ITEM_ID],
      itemAttributeIds: [],
      placeAttributeIds: [],
      ingredientIds: [],
    },
    filters: { priceLevels: [], minimumVotes: null, rising: false },
    unresolved: { groups: [] },
  };
}

/**
 * ONE COMMENT IS ONE RESTAURANT VOTE (owner ruling 2026-09-04). These pin the
 * SHAPE of the restaurant rollup in both rollup CTEs; the arithmetic is
 * proven against a real database in
 * restaurant-vote-totals-per-document.integration.spec.ts.
 *
 * History: the 2026-07-28 claim-identity rule deduped only category-vs-member
 * pairs from the same document ("taco" shadowed by "carnitas taco"), so a
 * comment naming five distinct dishes still counted five times. Collapsing
 * per source document subsumes that rule — same-document rows collapse
 * regardless of lineage — so the derived-edge shadow lookup is gone from the
 * restaurant lane. The dish lane never read it (it reads the connection
 * counters), so nothing else lost it.
 */
describe('restaurant rollup counts one source document once', () => {
  const preview = (): string =>
    renderInlinedSql(
      new SearchQueryBuilder().buildPlaceQuery({
        plan: compileQueryPlanFromConstraints(constraints()),
        pagination: { skip: 0, take: 10 },
        searchCenter: null,
      }).dataSql,
    );

  const rollup = (): string => {
    const sql = preview();
    const start = sql.indexOf('restaurant_vote_totals AS (');
    expect(start).toBeGreaterThanOrEqual(0);
    // The CTE closes at the first line that is exactly ")".
    const end = sql.indexOf('\n)', start);
    expect(end).toBeGreaterThan(start);
    return sql.slice(start, end);
  };

  it('reads the mention LEDGER (direct kind only — support rows are banked evidence, not votes)', () => {
    const sql = rollup();
    expect(sql).toContain('core_restaurant_item_mentions m');
    expect(sql).toContain("m.kind = 'direct'");
  });

  it('collapses per (restaurant, source document) BEFORE summing — a five-dish comment is one vote', () => {
    const sql = rollup();
    expect(sql).toContain('GROUP BY restaurant_id, claim_key');
    // Each document's upvotes are taken once (MAX over its rows), never
    // re-summed per dish.
    expect(sql).toContain('MAX(source_upvotes) AS source_upvotes');
    // The outer aggregate counts DOCUMENTS, not ledger rows.
    expect(sql).toContain('COUNT(*) AS total_mentions');
    expect(sql).toContain('SUM(source_upvotes) AS total_upvotes');
    expect(sql).not.toContain('SUM(m.source_upvotes)');
  });

  it('a mention with no source document still counts once (its own row is its claim key)', () => {
    expect(rollup()).toContain('COALESCE(m.source_document_id, m.id)');
  });

  it('the general_praise carrier is a vote too — read from the ACTIVE-run event ledger, same scope as the praise lane', () => {
    const sql = rollup();
    expect(sql).toContain("ev_scope.evidence_type = 'general_praise'");
    expect(sql).toContain('core_restaurant_events ev_scope');
    expect(sql).toContain(
      'd_scope.active_extraction_run_id = ev_scope.extraction_run_id',
    );
    expect(sql).toContain('UNION ALL');
  });

  it('no longer shadows by food lineage — per-document collapse subsumes the category-vs-member rule', () => {
    const sql = rollup();
    expect(sql).not.toContain('derived_food_category_edges');
    expect(sql).not.toContain('NOT c.is_category_item');
  });

  it('is scoped to the filtered restaurant set in BOTH lanes (never a corpus-wide scan)', () => {
    const sql = rollup();
    expect(sql).toContain(
      'JOIN filtered_restaurants fr ON fr.entity_id = c.restaurant_id',
    );
    expect(sql).toContain(
      'JOIN filtered_restaurants fr ON fr.entity_id = ev_scope.restaurant_id',
    );
  });
});
