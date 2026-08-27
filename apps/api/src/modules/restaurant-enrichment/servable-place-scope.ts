/**
 * THE SERVABLE-PLACE SCOPE — one definition, never hand-rolled (red-team
 * L3 F1, 2026-08-26). Same pattern as the extraction-scope service's
 * `activePlaceEventExistsSql`: pure SQL fragments readers embed via
 * `Prisma.raw`, so the meaning of "a place the public product may serve"
 * cannot fork across readers.
 *
 * Before this file, `market_excluded_at IS NULL` was hand-enumerated at
 * exactly four sites and MISSING from four more (autocomplete corpus
 * counts, signal demand/recall reads, the teaser, the curated-list
 * feeder) — each omission served out-of-market places through a lane the
 * ranked search would never show.
 *
 * Two grains, both exported deliberately:
 * - `marketIncludedSql(alias)` — ONLY the market-membership verdict, for
 *   readers that already carry their own type/status predicates (e.g. the
 *   score lanes require `status = 'active'`, stricter than servable's
 *   `<> 'archived'`; joins that imply type='place' structurally).
 * - `servablePlaceConditionsSql(alias)` — the full public serving floor:
 *   a place row, not archived, in market. Search + coverage use this.
 *
 * OPT-OUT is by name, in a comment at the site: user-owned surfaces
 * (favorites lists, polls a user voted in) may deliberately keep showing
 * an out-of-market place the user saved — see the ruling comment in
 * user-list-results.assembler.ts.
 */

/** Market-membership verdict only: the place is not excluded from every
 *  crediting community's market. NULL = in market (fail-open; see
 *  market-membership.service.ts for the verdict's definition). */
export function marketIncludedSql(alias: string): string {
  return `${alias}.market_excluded_at IS NULL`;
}

/** The full public serving floor: a place entity, never archived, in
 *  market. Readers needing a stricter status (e.g. `= 'active'`) compose
 *  `marketIncludedSql` with their own predicates instead. */
export function servablePlaceConditionsSql(alias: string): string {
  return `${alias}.type = 'place' AND ${alias}.status <> 'archived' AND ${marketIncludedSql(alias)}`;
}
