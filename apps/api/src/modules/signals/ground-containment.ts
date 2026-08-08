import { Prisma } from '@prisma/client';
import { LEVEL_SPECIFICITY } from '@crave-search/shared';

/**
 * §2.5(c)/§2.6 ground containment predicates for signal-geo attribution
 * (plans/geo-demand-foundation-rebuild.md): GROUND UNIFICATION — a place has
 * ONE ground representation (place_geometries.geometry; sketch-grade rows
 * hold the bbox envelope as a rectangular polygon), so containment is a
 * plain ST_Covers/ST_CoveredBy against that column, no fallback arm. Stated
 * ONCE here; post-docket-#6 the sole ledger consumer is territoryUnmetAsks
 * (ask CONTENT, never demand mass). The aggregate rebuild
 * (signal-demand-aggregate.service `containing`/`contained` CTEs) restates
 * the same predicates inline over its candidate sets.
 *
 * Two directions, one law:
 * - place COVERS geo  — the §3 (i) "containing" direction (own-place row);
 * - geo COVERS place  — the §3 (ii) "tiling" direction (a coarse geo whose
 *   ground the place sits inside — the ancestor-row reach for today's
 *   signals; the aggregate stores it at the coarsest contained tile and the
 *   lineage read brings it back, so the fresh arm must speak the same
 *   containment, never intersection).
 *
 * The ground JUDGES (an act inside a neighbor's overhanging bbox but outside
 * its ground never attributes there); a place with no geometry row (a
 * bbox-less birth — no ground knowledge at all) is simply not a container.
 * The correlated place_geometries probe is a PK lookup (place_id is the
 * primary key) — cheap at fresh-arm cardinalities, and it IS the whole
 * check: P2 (2026-07-30) removed every separate prefilter, because
 * ST_Covers/ST_CoveredBy short-circuit on the cached geometry bbox inside
 * PostGIS — any hand-written pre-check was a redundant second probe.
 *
 * Wrap-awareness: a crossing signal geo (min_lng > max_lng) covers
 * [min, 180] ∪ [-180, max]; its envelope is the ST_Union of the two arms
 * (never one seam-spanning rectangle).
 */

/**
 * Wrap-aware PostGIS envelope over a signal-shaped geo bbox (columns
 * geo_min_lat/geo_min_lng/geo_max_lat/geo_max_lng on `alias`). A crossing
 * geo becomes the union of its two arms; a point geo degenerates cleanly
 * (zero-area envelope — ST_Covers handles it).
 */
export function geoEnvelopeSql(alias: string): Prisma.Sql {
  const a = Prisma.raw(alias);
  return Prisma.sql`CASE
        WHEN ${a}.geo_min_lng <= ${a}.geo_max_lng
          THEN ST_MakeEnvelope(${a}.geo_min_lng::float8, ${a}.geo_min_lat::float8,
                               ${a}.geo_max_lng::float8, ${a}.geo_max_lat::float8, 4326)
        ELSE ST_Union(
          ST_MakeEnvelope(${a}.geo_min_lng::float8, ${a}.geo_min_lat::float8,
                          180::float8, ${a}.geo_max_lat::float8, 4326),
          ST_MakeEnvelope((-180)::float8, ${a}.geo_min_lat::float8,
                          ${a}.geo_max_lng::float8, ${a}.geo_max_lat::float8, 4326))
      END`;
}

/**
 * TRUE when the place's ground CONTAINS the signal geo — §3 (i) under §2.6:
 * ST_Covers(geometry, geo envelope), one representation, no fallback arm.
 */
export function placeCoversGeoSql(
  placeAlias: string,
  geoAlias = 's',
): Prisma.Sql {
  const p = Prisma.raw(placeAlias);
  return Prisma.sql`EXISTS (
        SELECT 1 FROM place_geometries pg
        WHERE pg.place_id = ${p}.place_id
          AND ST_Covers(pg.geometry, ${geoEnvelopeSql(geoAlias)})
      )`;
}

/**
 * TRUE when the signal geo CONTAINS the place's ground — §3 (ii) under §2.6:
 * ST_CoveredBy(geometry, geo envelope), one representation, no fallback arm.
 */
export function geoCoversPlaceSql(
  placeAlias: string,
  geoAlias = 's',
): Prisma.Sql {
  const p = Prisma.raw(placeAlias);
  return Prisma.sql`EXISTS (
        SELECT 1 FROM place_geometries pg
        WHERE pg.place_id = ${p}.place_id
          AND ST_CoveredBy(pg.geometry, ${geoEnvelopeSql(geoAlias)})
      )`;
}

/**
 * P5b — THE PLACE-ANCHORED DIRECTION (one-ground charter, 2026-07-28;
 * ancestry law corrected 2026-07-29).
 *
 * When a signal's WHERE genuinely IS a place (a poll act), the act belongs to
 * that place and to its ANCESTORS — the vendor's own stated chain, walked up
 * `parent_place_ids` — and to nothing else.
 *
 * ANCESTRY COMES FROM THE DAG, NEVER FROM GEOMETRY. The first version judged
 * ancestors with `ST_Covers(candidate.ground, anchor.ground)` and claimed the
 * two were "the same question in one GiST-indexed predicate". They are not.
 * ST_Covers is all-or-nothing, and polygons do not nest perfectly: municipal
 * outlines include bays, barrier islands and metro spill the parent's outline
 * generalises away. Measured on prod (2026-07-29): 2,111 of 19,452 US
 * municipality→state links the DAG asserts (10.85%) are NOT geometric
 * containments — TomTom's Washington Municipality is 159.5 sq mi with only
 * 42.8% inside the District, so a DC poll attributed to Washington and the
 * COUNTRY, silently skipping its state. The vendor's stated hierarchy is a
 * fact; polygon nesting is an approximation — the same principle that made
 * identity the vendor ID rather than a geometric comparison (P3).
 *
 * BOTH DIRECTIONS OF THE CHAIN, deliberately (red-team 2026-07-29, the two
 * reviewers found the same asymmetry from opposite ends). The aggregate READ
 * already serves an anchored act to the anchor's DAG DESCENDANTS: the act is
 * stored at the anchor tile, and the ratified lineage law (docket item 7 —
 * ancestors at weight 1) walks a root's `up` chain straight onto that tile, so
 * a Bouldin Creek read counts an Austin-anchored poll — but only once the day
 * CLOSES. A fresh arm that refused the downward direction produced a midnight
 * step-discontinuity: same act, different verdict either side of the day
 * boundary. So the fresh arm speaks the aggregate's lineage law: the act
 * belongs to the anchor, its ancestors, and its DAG descendants.
 *
 * This is NOT the Austin-rectangle bleed returning. That defect reached
 * NEIGHBOURS — Round Rock fitted inside Austin's stored rectangle without
 * being inside Austin at all. DAG descendants are places the vendor itself
 * says are IN the anchor. A place merely inside the anchor's polygon but off
 * its chain (the fixture's "Innocent") stays excluded in both directions.
 * The two arms also now mirror the geometric law's own two directions
 * (place-covers-geo OR geo-covers-place), each expressed on the axis that is
 * a FACT for its signal shape: geometry for viewports, the chain for anchors.
 *
 * Cost, honestly: two correlated recursive walks per (signal, candidate)
 * pair — but the ladder is ≤6 rungs of PK lookups and the fresh arm's
 * cardinality is one day of poll acts.
 */
export function placeAnchoredAttributionSql(
  placeAlias: string,
  geoAlias = 's',
): Prisma.Sql {
  const p = Prisma.raw(placeAlias);
  const s = Prisma.raw(geoAlias);
  return Prisma.sql`(EXISTS (
        WITH RECURSIVE anchor_chain(place_id) AS (
          SELECT ${s}.place_id
          UNION
          SELECT parent.place_id
          FROM anchor_chain ac
          JOIN places ap ON ap.place_id = ac.place_id
          CROSS JOIN LATERAL unnest(ap.parent_place_ids) AS parent(place_id)
        )
        SELECT 1 FROM anchor_chain WHERE place_id = ${p}.place_id
      ) OR EXISTS (
        WITH RECURSIVE candidate_chain(place_id) AS (
          SELECT ${p}.place_id
          UNION
          SELECT parent.place_id
          FROM candidate_chain cc
          JOIN places cp ON cp.place_id = cc.place_id
          CROSS JOIN LATERAL unnest(cp.parent_place_ids) AS parent(place_id)
        )
        SELECT 1 FROM candidate_chain WHERE place_id = ${s}.place_id
      ))`;
}

/**
 * THE ledger-signal attribution predicate (single-representation under
 * §2.6). Post-docket-#6 it serves ONE caller — territoryUnmetAsks, which
 * reads ask CONTENT from the ledger (never demand mass; the fresh demand
 * arm is deleted). A ledger signal belongs to a place read iff one CONTAINS
 * the other — always judged on the place's ONE ground (no prefilter — P2:
 * ST_Covers/ST_CoveredBy ride the geometry GiST directly). Residual seam,
 * documented: a coarse geo
 * that STRADDLES the place (neither contains the other) reaches the place
 * through a shared-ancestor aggregate tile once its day closes — the fresh
 * arm honestly excludes it for at most one day rather than counting by
 * intersection, which §3 forbids.
 *
 * P5b: a signal carrying a place ANCHOR is judged by the anchored law above
 * instead — its WHERE is a place, so no rectangle is involved at all. The geo
 * arms below still serve the kinds whose shape is honestly a rectangle (a
 * viewport) or a point (entity_view).
 */
export function freshSignalAttributionSql(
  placeAlias: string,
  geoAlias = 's',
): Prisma.Sql {
  const s = Prisma.raw(geoAlias);
  return Prisma.sql`CASE WHEN ${s}.place_id IS NOT NULL
          THEN ${placeAnchoredAttributionSql(placeAlias, geoAlias)}
          ELSE ((${placeCoversGeoSql(placeAlias, geoAlias)})
                OR (${geoCoversPlaceSql(placeAlias, geoAlias)}))
        END`;
}

/**
 * TIE-BREAK FOR "SMALLEST GROUND WINS": on EQUAL area, the FINER vendor level
 * wins — and only then the id.
 *
 * WHY (red team 2026-08-04, measured live). 27 distinct vendor entities carry
 * byte-identical polygons across 55 places — real-world coextensive pairs
 * like consolidated city-counties (Philadelphia the Municipality and
 * Philadelphia the CountrySecondarySubdivision share one shape, and TomTom
 * models both). "ORDER BY ST_Area ASC, place_id" broke those ties by UUID
 * SORT: downtown-Philadelphia demand landed on whichever of the two rows had
 * the lexically smaller id — the county, which no product surface keys (all
 * 672 curated lists key Municipalities) and which has no DAG edge back, so
 * lineage could not recover it. Same coin-flip in Chesapeake, Richmond,
 * Columbus GA, Lexington-Fayette, and ~20 more metros.
 *
 * The finer level is the right winner because it is the row the PRODUCT
 * speaks: coextensive means the acts belong to both, and when only one can
 * hold the aggregate row it must be the one readers ask about. The id stays
 * as the final arm strictly for determinism (two rows at one level and one
 * shape would be a catalog defect, not a judgment call).
 */
export function levelSpecificitySql(placesAlias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(placesAlias)) {
    throw new Error(`Unsafe SQL alias: ${JSON.stringify(placesAlias)}`);
  }
  const alias = Prisma.raw(placesAlias);
  // DERIVED from the shared LEVEL_SPECIFICITY table (round-3 unification):
  // the header's TS tie-break (finestPlaceFirst) and this SQL are one law
  // with one source — the ladder cannot drift between runtimes.
  const arms = LEVEL_SPECIFICITY.map(
    (level, rank) => `WHEN '${level}' THEN ${rank}`,
  ).join('\n    ');
  return Prisma.sql`CASE ${alias}.provider_level_code
    ${Prisma.raw(arms)}
    ELSE ${LEVEL_SPECIFICITY.length}
  END`;
}
