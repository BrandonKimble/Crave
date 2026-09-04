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
 * Three grains, all exported deliberately (waves 3-4 red team W2 — the A-1
 * floor forked at birth because it only rode the composite):
 * - `marketIncludedSql(alias)` — ONLY the market-membership verdict, for
 *   readers that already carry their own type/status predicates (e.g. the
 *   score lanes require `status = 'active'`, stricter than servable's
 *   `<> 'archived'`; joins that imply type='place' structurally).
 * - `placeVisibilityFloorSql(alias)` — ONLY the A-1 visibility gate, for
 *   readers on the market-only grain that are nonetheless SERVING surfaces
 *   (autocomplete, teaser, curated feeder): they must not seed a journey
 *   toward a shell the ranked search will refuse to show. Evidence-side
 *   readers (signal demand, score computation) deliberately omit it — see
 *   the named opt-out comments at those sites.
 * - `servablePlaceConditionsSql(alias)` — the full public serving floor:
 *   a place row, not archived, in market, past the A-1 gate. Search +
 *   coverage use this.
 *
 * OPT-OUT is by name, in a comment at the site: user-owned surfaces
 * (favorites lists, polls a user voted in) may deliberately keep showing
 * an out-of-market place the user saved — see the ruling comment in
 * user-list-results.assembler.ts.
 */

import { locationNoMatchAttemptThreshold } from '../../config/configuration';

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
 *  locations FK index.
 *
 *  TERMINALLY UNGROUNDABLE IS NOT SERVABLE EITHER (2026-09-04, parked-names
 *  law). The 2026-08-12 ruling ("ungrounded-after-attempt must not be
 *  searchable") used to be enforced by the janitor ARCHIVING the place once
 *  the money guard's threshold said Google had definitively said no — and
 *  that archive then masqueraded as a judge reject in the resolver's sink
 *  (an archived "Arlo's" ate every vouch meant for the live "Arlo's
 *  Junior"). The place now stays ACTIVE as a parked, ungrounded name, and
 *  THIS predicate is what keeps it off every serving surface: the mentions
 *  arm admits an ungrounded place only while grounding attempts remain.
 *  One threshold, one meaning, read from the same declaration the money
 *  guard reads (configuration.ts). Grounded places are unaffected — a
 *  google_place_id is the first arm regardless of failure history. */
export function placeVisibilityFloorSql(alias: string): string {
  return `(EXISTS (
      SELECT 1 FROM core_restaurant_locations svgl
      WHERE svgl.restaurant_id = ${alias}.entity_id
        AND svgl.google_place_id IS NOT NULL
    ) OR (
      ${alias}.enrichment_failure_count < ${locationNoMatchAttemptThreshold()}
      AND (
        SELECT COUNT(*) FROM (
          SELECT 1 FROM core_restaurant_events svge
          WHERE svge.restaurant_id = ${alias}.entity_id
          LIMIT 2
        ) svgc
      ) >= 2
    ))`;
}

/** The full public serving floor: a place entity, never archived, in
 *  market, and past the A-1 visibility gate (grounded, or ≥2 mentions —
 *  ungrounded zero/one-mention shells are not served). Readers needing a
 *  stricter status (e.g. `= 'active'`) compose `marketIncludedSql` with
 *  their own predicates instead. */
export function servablePlaceConditionsSql(alias: string): string {
  return `${alias}.type = 'place' AND ${alias}.status <> 'archived' AND ${marketIncludedSql(alias)} AND ${placeVisibilityFloorSql(alias)}`;
}
