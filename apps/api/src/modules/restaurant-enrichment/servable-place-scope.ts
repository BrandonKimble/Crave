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

/** THE A-1 VISIBILITY GATE (birth-and-linking red team, owner-blessed
 *  amendment A-1, 2026-08-30): an UNGROUNDED place with fewer than 2
 *  mention events is not servable — it is a zero-evidence shell (the
 *  census counted 173 of them live in search) or a one-mention mint that
 *  has not yet earned public existence. Grounded places (any location
 *  with a google_place_id) are ALWAYS visible; the median-10-mention
 *  ungrounded cohort (Rudys/Easy Tiger-class real places) stays visible.
 *
 *  Honesty note on "OR a grounding attempt in flight": A-1's spec offered
 *  that disjunct, but the only in-flight signal is the BullMQ job in
 *  Redis — not visible from SQL, and the durable breadcrumb
 *  (`restaurant_metadata->'lastEnrichmentAttempt'`) records COMPLETED
 *  attempts, i.e. exactly the failures. Granting visibility on a failed
 *  attempt would invert the gate (the least-groundable shells become the
 *  most visible), so the gate is mentions-only by deliberate choice. The
 *  cost is a one-mention real place staying dark for its grounding window
 *  (median 5h) — the window A-1 already accepted for <2-mention mints.
 *
 *  The `LIMIT 2` subquery is the cheap existence-of-two test on
 *  idx_restaurant_events_restaurant_time; the grounded arm rides the
 *  locations FK index. */
function placeVisibilityFloorSql(alias: string): string {
  return `(EXISTS (
      SELECT 1 FROM core_restaurant_locations svgl
      WHERE svgl.restaurant_id = ${alias}.entity_id
        AND svgl.google_place_id IS NOT NULL
    ) OR (
      SELECT COUNT(*) FROM (
        SELECT 1 FROM core_restaurant_events svge
        WHERE svge.restaurant_id = ${alias}.entity_id
        LIMIT 2
      ) svgc
    ) >= 2)`;
}

/** The full public serving floor: a place entity, never archived, in
 *  market, and past the A-1 visibility gate (grounded, or ≥2 mentions —
 *  ungrounded zero/one-mention shells are not served). Readers needing a
 *  stricter status (e.g. `= 'active'`) compose `marketIncludedSql` with
 *  their own predicates instead. */
export function servablePlaceConditionsSql(alias: string): string {
  return `${alias}.type = 'place' AND ${alias}.status <> 'archived' AND ${marketIncludedSql(alias)} AND ${placeVisibilityFloorSql(alias)}`;
}
