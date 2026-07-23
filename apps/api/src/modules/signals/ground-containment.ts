import { Prisma } from '@prisma/client';
import {
  lngContainsSql,
  LngIntervalColumns,
  placeLngColumns,
} from './lng-intersect';

/**
 * §2.5(c) polygon-first containment predicates for signal-geo attribution
 * (plans/geo-demand-foundation-rebuild.md): polygon = truth, bbox = index/
 * prefilter + geometry-null fallback ONLY. Stated ONCE here and consumed by
 * every fresh-arm ledger read (demand-mass reader, signal-demand territory
 * reads) so both arms of the aggregate∪fresh union speak the aggregate's
 * attribution law (signal-demand-aggregate.service `containing`/`contained`
 * CTEs restate the same predicates inline over the rebuild's candidate sets).
 *
 * Two directions, one law:
 * - place COVERS geo  — the §3 (i) "containing" direction (own-place row);
 * - geo COVERS place  — the §3 (ii) "tiling" direction (a coarse geo whose
 *   ground the place sits inside — the ancestor-row reach for today's
 *   signals; the aggregate stores it at the coarsest contained tile and the
 *   lineage read brings it back, so the fresh arm must speak the same
 *   containment, never intersection).
 *
 * Where a place has real ground (place_geometries.geometry), the polygon
 * JUDGES (an act inside a neighbor's overhanging bbox but outside its ground
 * never attributes there); the wrap-aware bbox containment survives only for
 * geometry-null places. The correlated place_geometries probe is a PK lookup
 * (place_id is the primary key) — cheap at fresh-arm cardinalities.
 *
 * Wrap-awareness: a crossing signal geo (min_lng > max_lng) covers
 * [min, 180] ∪ [-180, max]; its polygon-side envelope is the ST_Union of the
 * two arms (never one seam-spanning rectangle), and the bbox fallback goes
 * through the canonical lngContainsSql cases.
 */

/** Column references for a signal-shaped geo bbox (geo_min_* / geo_max_*). */
function geoLatColumns(alias: string): { min: Prisma.Sql; max: Prisma.Sql } {
  const ref = Prisma.raw(alias);
  return {
    min: Prisma.sql`${ref}.geo_min_lat`,
    max: Prisma.sql`${ref}.geo_max_lat`,
  };
}

function geoLngColumns(alias: string): LngIntervalColumns {
  const ref = Prisma.raw(alias);
  return {
    min: Prisma.sql`${ref}.geo_min_lng`,
    max: Prisma.sql`${ref}.geo_max_lng`,
  };
}

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
 * TRUE when the place's ground CONTAINS the signal geo — §3 (i) restated
 * polygon-first: ST_Covers(geometry, geo envelope) when real ground exists,
 * wrap-aware bbox containment for geometry-null places.
 */
export function placeCoversGeoSql(
  placeAlias: string,
  geoAlias = 's',
): Prisma.Sql {
  const p = Prisma.raw(placeAlias);
  const geoLat = geoLatColumns(geoAlias);
  return Prisma.sql`COALESCE(
        (SELECT ST_Covers(pg.geometry, ${geoEnvelopeSql(geoAlias)})
           FROM place_geometries pg
          WHERE pg.place_id = ${p}.place_id AND pg.geometry IS NOT NULL),
        ${p}.bbox_min_lat <= ${geoLat.min} AND ${p}.bbox_max_lat >= ${geoLat.max}
          AND (${lngContainsSql(placeLngColumns(placeAlias), geoLngColumns(geoAlias))})
      )`;
}

/**
 * TRUE when the signal geo CONTAINS the place's ground — §3 (ii) restated
 * polygon-first: ST_CoveredBy(geometry, geo envelope) when real ground
 * exists, wrap-aware bbox containment for geometry-null places.
 */
export function geoCoversPlaceSql(
  placeAlias: string,
  geoAlias = 's',
): Prisma.Sql {
  const p = Prisma.raw(placeAlias);
  const geoLat = geoLatColumns(geoAlias);
  return Prisma.sql`COALESCE(
        (SELECT ST_CoveredBy(pg.geometry, ${geoEnvelopeSql(geoAlias)})
           FROM place_geometries pg
          WHERE pg.place_id = ${p}.place_id AND pg.geometry IS NOT NULL),
        ${geoLat.min} <= ${p}.bbox_min_lat AND ${geoLat.max} >= ${p}.bbox_max_lat
          AND (${lngContainsSql(geoLngColumns(geoAlias), placeLngColumns(placeAlias))})
      )`;
}

/**
 * THE fresh-arm attribution predicate (C3 cut): a today's-ledger signal
 * belongs to a place read iff one CONTAINS the other — polygon-judged where
 * ground exists, bbox only as the geometry-null fallback. The call sites
 * keep their cheap bbox-intersection join conditions as the PREFILTER
 * (containment in either direction implies intersection, so the prefilter
 * never drops a true candidate). Residual seam, documented: a coarse geo
 * that STRADDLES the place (neither contains the other) reaches the place
 * through a shared-ancestor aggregate tile once its day closes — the fresh
 * arm honestly excludes it for at most one day rather than counting by
 * intersection, which §3 forbids.
 */
export function freshSignalAttributionSql(
  placeAlias: string,
  geoAlias = 's',
): Prisma.Sql {
  return Prisma.sql`(${placeCoversGeoSql(placeAlias, geoAlias)})
          OR (${geoCoversPlaceSql(placeAlias, geoAlias)})`;
}
