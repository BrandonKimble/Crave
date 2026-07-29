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
 * P5b — THE PLACE-ANCHORED DIRECTION (one-ground charter, 2026-07-28).
 *
 * When a signal's WHERE genuinely IS a place (a poll act), the act belongs to
 * that place and to every place CONTAINING it — its ancestors — and to nothing
 * else. Judged ground-to-ground: `ST_Covers(candidate.ground, anchor.ground)`.
 * A polygon covers itself, so the anchor place matches; a county covering the
 * town matches; a neighbourhood INSIDE the town does NOT (the act is not in it).
 *
 * There is deliberately NO tiling arm here. That arm exists so a coarse
 * VIEWPORT reaches the places inside it; a poll is not a viewport, and letting
 * it tile downward is precisely the measured defect this replaces — a poll in
 * Austin collected demand in 31 other places because arm (ii) matched every
 * ground that fitted inside Austin's stored RECTANGLE.
 *
 * Ancestors are resolved geometrically rather than through the DAG because
 * `places.parent_place_ids` holds DIRECT edges only, so a DAG walk would need
 * recursion per row; `ST_Covers` answers the same question in one GiST-indexed
 * predicate.
 */
export function placeAnchoredAttributionSql(
  placeAlias: string,
  geoAlias = 's',
): Prisma.Sql {
  const p = Prisma.raw(placeAlias);
  const s = Prisma.raw(geoAlias);
  return Prisma.sql`EXISTS (
        SELECT 1
        FROM place_geometries anchor_pg
        JOIN place_geometries cand_pg ON cand_pg.place_id = ${p}.place_id
        WHERE anchor_pg.place_id = ${s}.place_id
          AND ST_Covers(cand_pg.geometry, anchor_pg.geometry)
      )`;
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
