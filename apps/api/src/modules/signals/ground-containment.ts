import { Prisma } from '@prisma/client';

/**
 * §2.5(c)/§2.6 ground containment predicates for signal-geo attribution
 * (plans/geo-demand-foundation-rebuild.md): GROUND UNIFICATION — a place has
 * ONE ground representation (place_geometries.geometry; sketch-grade rows
 * hold the bbox envelope as a rectangular polygon), so containment is a
 * plain ST_Covers/ST_CoveredBy against that column, no fallback arm. Stated
 * ONCE here and consumed by every fresh-arm ledger read (demand-mass reader,
 * signal-demand territory reads) so both arms of the aggregate∪fresh union
 * speak the aggregate's attribution law (signal-demand-aggregate.service
 * `containing`/`contained` CTEs restate the same predicates inline over the
 * rebuild's candidate sets).
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
 * primary key) — cheap at fresh-arm cardinalities. Call sites keep their
 * bbox-intersection join conditions as the btree PREFILTER (§2.5(c): bbox =
 * index only; containment implies intersection, so the prefilter never
 * drops a true candidate).
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
 * THE fresh-arm attribution predicate (C3 cut, single-representation under
 * §2.6): a today's-ledger signal belongs to a place read iff one CONTAINS
 * the other — always judged on the place's ONE ground. The call sites keep
 * their cheap bbox-intersection join conditions as the PREFILTER
 * (containment in either direction implies intersection, so the prefilter
 * never drops a true candidate). Residual seam, documented: a coarse geo
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
