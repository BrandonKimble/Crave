/**
 * Place Catalog reads/writes (plans/geo-demand-foundation-rebuild.md §1).
 *
 * The catalog is a containment DAG of places: open providerLevelCode
 * vocabulary (stored, never switched on), parent edges captured from the
 * reverse-geocode chain at creation (geometry never derives hierarchy), and
 * ONE ground representation (§2.6 GROUND UNIFICATION): every bbox-carrying
 * place has a place_geometries polygon — a sketch-grade bbox envelope
 * (provider_boundary_id NULL, written synchronously at birth and refreshed
 * on widen) upgraded IN PLACE to the vendor outline by the promotion drain.
 * The places bbox stays as the derived candidate INDEX only (btree paths).
 * The PostGIS geometry column lives OUTSIDE the prisma model; any
 * polygon-precise op must go through $queryRaw.
 *
 * §1 identity law (THE FINAL DISSOLUTION, 2026-07-30): placeKey =
 * (providerPlaceId, providerLevelCode) — the vendor's own key, since the
 * vendor stamps one geometry id on two rungs for a coincident boundary and
 * distinguishes those entities by entityType. The county-axis name table
 * that used to reconcile id-less observations is DELETED (the id-less case
 * measured as never-occurred). The fallback lane is DELETED too (owner
 * ruling 2026-08-01, "TomTom or nothing": zero mints ever on prod; a
 * droughted poll creation now refuses honestly instead of minting a
 * synthetic place sized by the creator's zoom). Every ground in the system
 * is the vendor's — bbox at birth, outline when granted.
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Place, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  GeoBbox,
  GeoPoint,
  PlaceGround,
  bboxArea,
  bboxCrossesAntimeridian,
  bboxIntersectionParts,
  bboxLatSpan,
  bboxLngSpan,
  bboxUnion,
  isGeoPoint,
  normalizePlaceName,
  pointToBbox,
  resolvePlaceCoverage,
} from '@crave-search/shared';

/**
 * §2.5(d) POLYGON AT BIRTH: every newly sketched place immediately earns its
 * outline through the governed promotion lane — the queue is the ordinary
 * intake now, and the hourly drain's cadence is the only latency
 * (birth→outline within the hour is fine; the pool bounds spend). The
 * listener is the PlacesPromotionService behind a token because the module
 * import graph is cyclic (promotion → probe port → catalog types); optional
 * so bare-constructed test/script instances stay valid.
 */
export interface PlaceBirthListener {
  enqueue(placeId: string, trigger: string): Promise<void>;
}
export const PLACE_BIRTH_LISTENER = Symbol('PLACE_BIRTH_LISTENER');

/**
 * §16 DERIVED — simplification resolution: served/judged ground is
 * simplified with tolerance = viewSpan / GROUND_SIMPLIFY_VIEW_FRACTION.
 * 512 is a definitional screen-resolution factor: a phone viewport renders
 * ~400–800 px across, so span/512 keeps every simplification artifact at or
 * below one device pixel at the scale the view (or margin box) is looked at
 * — sub-pixel error can never move a coverage judgment visibly. What
 * changes it: display-resolution physics, never tuning.
 */
export const GROUND_SIMPLIFY_VIEW_FRACTION = 512;

/**
 * One node of a reverse-geocode chain, as handed to sketchChain. Everything
 * beyond the identity tuple is optional: §2's sketch mechanics may learn a
 * node's bbox only on a LATER probe (forward geocode is once-ever per node),
 * and the identity-law merge fills gaps as observations accrue.
 */
export interface PlaceSketchNode {
  name: string;
  /** OPEN vocabulary (§1) — stored verbatim, never switched on. */
  providerLevelCode: string;
  countryCode: string;
  subdivisionCode?: string | null;
  bbox?: GeoBbox | null;
  centroid?: GeoPoint | null;
  /** Offline centroid→tz at creation (§1); optional at sketch time. */
  timeZone?: string | null;
  /** The provider's stable geometry id — adopted as an alias (§1). */
  providerPlaceId?: string | null;
}

/** placesInView row: the place plus its §2.5 coverage share of the view. */
export interface PlaceInView {
  place: Place;
  bbox: GeoBbox;
  /** §2.5/§2.6 coverage: the ONE ground's polygon-clip share of the view. */
  coverageOfView: number;
  /**
   * The finest-ranking key: real-ground area — same cos-weighted degrees²
   * metric as the view's (a sketch envelope's area equals its bbox area).
   */
  placeArea: number;
  /** Deduped DAG parent edges (placeParentIds) — the straddle reservation. */
  parentPlaceIds: string[];
  /**
   * Simplified real ground (§2.6: ALWAYS present — sketch-grade rows carry
   * their envelope rectangle; hydration failure degrades to the envelope
   * ring derived from the bbox, same representation).
   */
  ground: PlaceGround;
}

/**
 * P4 (one-ground charter, 2026-07-30): THE BBOX IS DERIVED FROM THE GROUND AT
 * THE MOMENT OF USE — the stored columns are gone. This is the SELECT-list
 * fragment; `alias` is a place_geometries alias. Seam-honest: a crossing
 * geometry (planar span ≥ 180° — its parts straddle ±180) reconstructs the
 * wrap convention (min_lng > max_lng) from its per-arm extents via ST_Dump;
 * a normal geometry is just its envelope. Consumers read four columns named
 * bbox_min_lat / bbox_min_lng / bbox_max_lat / bbox_max_lng.
 */
export function derivedBboxSelectSql(alias: string): Prisma.Sql {
  const g = Prisma.raw(alias);
  // THE LARGEST-GAP LAW (empirical red-team 2026-08-01, supersedes two prior
  // gates — each proven RED in places-containment.integration.spec before
  // its fix):
  // - Gate 1 (planar span >= 180 + centroid-sign arms) wrapped the UK class
  //   (wide both-hemisphere parts, seam untouched) around the Pacific.
  // - Gate 2 ("crossing = reaching ±179.999 on both sides") assumed the
  //   two-arm storage convention touches ±180 exactly. Measured on PROD:
  //   TomTom's real US geometry stops at 179.778 / -179.147, so the gate
  //   never fired and the US bbox derived as the planar band
  //   [-179.147, 179.778] — a 359° world band ("THE ALEUTIAN CLASS").
  // The honest definition needs no crossing gate at all: the bbox is the
  // COMPLEMENT OF THE LARGEST EMPTY LONGITUDINAL ARC between the geometry's
  // merged part extents (the standard antimeridian treatment). US: the
  // empty arc runs -66.9 east to 172.5 (~239°), so the bbox wraps
  // 172.5 → -66.9. UK class: its largest arc contains the seam, so the
  // complement IS the planar envelope. A normal row's largest arc is the
  // whole rest of the circle — planar, unchanged.
  //
  // Cost: the gap analysis scans ST_Dump parts, so it runs ONLY behind the
  // cheap suspicion gate `planar span >= 180` (provably sufficient: parts
  // confined to any arc < 180° can never make the wrap complement smaller
  // than the planar envelope). A handful of country-scale rows pay it.
  const wide = Prisma.sql`(ST_XMax(${g}.geometry) - ST_XMin(${g}.geometry) >= 180)`;
  // Largest gap over merged part intervals: sort by part min-lng; a gap
  // opens where a part's min exceeds the running max of all prior part
  // maxes; the wrap-around arc (global max b → first a + 360) competes as
  // the "planar" candidate. Ties prefer planar (is_wrap DESC).
  const gapPick = (column: Prisma.Sql) => Prisma.sql`(
      SELECT ${column}
      FROM (
        SELECT all_gaps.gap_start, all_gaps.gap_end, all_gaps.is_wrap
        FROM (
          SELECT gap_start, gap_end, is_wrap
          FROM (
            SELECT iv.a AS gap_end,
                   MAX(iv.b) OVER (ORDER BY iv.a ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS gap_start,
                   FALSE AS is_wrap
            FROM (SELECT ST_XMin(part.geom) AS a, ST_XMax(part.geom) AS b
                  FROM ST_Dump(${g}.geometry) AS part) iv
          ) internal_gaps
          WHERE gap_start IS NOT NULL AND gap_end > gap_start
          UNION ALL
          SELECT ST_XMax(${g}.geometry), ST_XMin(${g}.geometry) + 360, TRUE
        ) all_gaps
        ORDER BY (all_gaps.gap_end - all_gaps.gap_start) DESC, all_gaps.is_wrap DESC
        LIMIT 1
      ) best_gap
    )`;
  return Prisma.sql`
    ST_YMin(${g}.geometry)::float8 AS bbox_min_lat,
    ST_YMax(${g}.geometry)::float8 AS bbox_max_lat,
    CASE WHEN NOT ${wide}
         THEN ST_XMin(${g}.geometry)::float8
         ELSE ${gapPick(Prisma.sql`CASE WHEN is_wrap THEN ST_XMin(${g}.geometry) ELSE gap_end END`)}::float8
    END AS bbox_min_lng,
    CASE WHEN NOT ${wide}
         THEN ST_XMax(${g}.geometry)::float8
         ELSE ${gapPick(Prisma.sql`CASE WHEN is_wrap THEN ST_XMax(${g}.geometry) ELSE gap_start END`)}::float8
    END AS bbox_max_lng`;
}

/** Row shape produced by derivedBboxSelectSql. */
export interface DerivedBboxRow {
  bbox_min_lat: number;
  bbox_min_lng: number;
  bbox_max_lat: number;
  bbox_max_lng: number;
}

export function bboxFromDerivedRow(row: DerivedBboxRow): GeoBbox {
  return {
    minLat: row.bbox_min_lat,
    minLng: row.bbox_min_lng,
    maxLat: row.bbox_max_lat,
    maxLng: row.bbox_max_lng,
  };
}

/**
 * PostGIS GeoJSON → shared PlaceGround: MultiPolygon/Polygon flattened to
 * OUTER rings ([lng, lat] positions; holes dropped — see shared ground.ts).
 * Returns null on any unexpected shape (the caller falls back to bbox).
 */
export function parseGroundGeoJson(geojson: string): PlaceGround | null {
  try {
    const parsed = JSON.parse(geojson) as {
      type?: string;
      coordinates?: unknown;
    };
    if (parsed.type === 'MultiPolygon' && Array.isArray(parsed.coordinates)) {
      return (parsed.coordinates as number[][][][])
        .map((polygon) => polygon[0])
        .filter((ring) => Array.isArray(ring) && ring.length >= 3);
    }
    if (parsed.type === 'Polygon' && Array.isArray(parsed.coordinates)) {
      const outer = (parsed.coordinates as number[][][])[0];
      return Array.isArray(outer) && outer.length >= 3 ? [outer] : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The DAG-edge READ chokepoint. Parent edges are appended ATOMICALLY on merge
 * (Prisma `push` — see mergeSketch) so concurrent merges can't drop each
 * other's edges; the price is that storage may hold duplicates. Every
 * consumer of a place's parent edges must read them through here, where the
 * duplicates collapse.
 */
export function placeParentIds(place: Place): string[] {
  return [...new Set(place.parentPlaceIds)];
}

@Injectable()
export class PlacesCatalogService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    @Optional()
    @Inject(PLACE_BIRTH_LISTENER)
    private readonly birthListener?: PlaceBirthListener,
  ) {
    this.logger = loggerService.setContext('PlacesCatalogService');
  }

  /**
   * §1/§2 "sketch everything": upsert EVERY node of a reverse-geocode chain.
   *
   * Chain order contract: MOST SPECIFIC FIRST (neighbourhood → … → country),
   * exactly as reverse geocode returns it. Parent edges come from THIS chain
   * order (§1: "edges from the reverse-geocode response chain at creation;
   * geometry never derives hierarchy") — each node gains an edge to the next
   * broader node. We therefore process broadest-first so every parent's
   * placeId exists before its child is written.
   *
   * Identity law per node: match on (countryCode, subdivisionCode?, county?,
   * providerLevelCode, normalized name), case-INSENSITIVELY on name and
   * county (case is display; identity is not); the county axis follows the
   * resolveIdentity decision table (match / gap-fill / distinct sibling).
   * On conflict: bbox-merge (widen to union),
   * adopt providerPlaceId as alias when ours is absent, union parent edges,
   * and fill still-unknown scalars (centroid/timeZone/localScriptAlias) —
   * never fork, never shrink.
   *
   * Returns the upserted places in the SAME order as the input chain.
   */
  async sketchChain(chain: PlaceSketchNode[]): Promise<Place[]> {
    const results: Place[] = [];
    // Broadest-first walk so parent ids exist for child edges. A REFUSED
    // node (id-less, non-fallback — the final dissolution) is dropped and
    // the parent edge threads PAST it: its children attach to the nearest
    // minted ancestor rather than losing the whole chain.
    let parentPlaceId: string | undefined;
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const place = await this.upsertSketch(chain[i], parentPlaceId);
      if (!place) continue;
      results.unshift(place);
      parentPlaceId = place.placeId;
    }
    return results;
  }

  /**
   * All places whose bbox intersects the view, judged by the §2.5 coverage
   * law on THE ONE GROUND (§2.6: every bbox-carrying place has a
   * place_geometries row — sketch envelope or full outline; one clip law,
   * no fallback arm).
   *
   * ONE GROUND FINDS AND JUDGES (one-ground charter P2/P4, 2026-07-26):
   * candidates come from `geometry && view` on the GiST index — PostGIS's
   * INDEX-ONLY bounding-box overlap, i.e. the exact same cheap-find /
   * exact-judge split as before, but expressed by the spatial index instead
   * of four hand-maintained columns. The same query returns each candidate's
   * view-simplified ground, so finding and hydrating are one round trip.
   *
   * What this deletes: a four-column btree range prefilter whose crossing-row
   * branch ("bbox_min_lng > bbox_max_lng can't be range-tested") dragged
   * EVERY antimeridian place into EVERY view read unconditionally. The seam
   * needs no special case now — a crossing view is unioned into its two arms
   * once, in SQL.
   *
   * MEASURED (local, 22.8k grounds, 2026-07-26): world-zoom find+simplify
   * 27ms via the index vs a 1,442ms placesInView on the old path; NY-viewport
   * candidate sets agree (217 both ways, the exact-judge step then drops the
   * one seam row whose ground does not really reach the view).
   */
  async placesInView(view: GeoBbox): Promise<PlaceInView[]> {
    const candidates = await this.groundsIntersectingView(view);
    if (candidates.size === 0) {
      return [];
    }
    const rows = await this.prisma.place.findMany({
      where: { placeId: { in: [...candidates.keys()] } },
    });
    const viewArea = bboxArea(view);
    const results: PlaceInView[] = [];
    for (const place of rows) {
      const entry = candidates.get(place.placeId);
      if (!entry) continue;
      const { ground, bbox } = entry;
      // P4 (2026-07-30): `bbox` is DERIVED from the ground in the same query
      // that fetched it — a camera/transport envelope, wrap-aware at the
      // seam, computed at the moment of use. The wire shape is unchanged, so
      // the mobile client needs nothing.
      // THE per-row coverage law is shared (resolvePlaceCoverage) so the
      // client's slice evaluation and this server read feed
      // resolveHeaderPlace identical numbers (header subject-store design).
      const coverage = resolvePlaceCoverage(view, viewArea, { ground });
      if (coverage === null) continue;
      results.push({
        place,
        bbox,
        coverageOfView: coverage.coverageOfView,
        placeArea: coverage.placeArea,
        parentPlaceIds: placeParentIds(place),
        ground,
      });
    }
    return results;
  }

  /**
   * The view as 1-or-2 NON-CROSSING PostGIS envelopes ("arms").
   *
   * NEVER union them into one geometry for an index operand: `&&` compares
   * BOUNDING BOXES, and the bbox of two arms at ±180 is the WHOLE WORLD, so
   * `geometry && ST_Union(armA, armB)` matches every place in the latitude
   * band and cannot use the index. Measured on the live DB (22.8k grounds):
   * the union form matched 693 rows / seq-scanned; per-arm matched 1 row in
   * 0.18ms. Arms stay separate and are OR-ed (intersection) or AND-ed
   * (containment) by the caller.
   */
  private viewArms(view: GeoBbox): Prisma.Sql[] {
    if (view.minLng <= view.maxLng) {
      return [
        Prisma.sql`ST_MakeEnvelope(${view.minLng}::float8, ${view.minLat}::float8, ${view.maxLng}::float8, ${view.maxLat}::float8, 4326)`,
      ];
    }
    return [
      Prisma.sql`ST_MakeEnvelope(${view.minLng}::float8, ${view.minLat}::float8, 180::float8, ${view.maxLat}::float8, 4326)`,
      Prisma.sql`ST_MakeEnvelope((-180)::float8, ${view.minLat}::float8, ${view.maxLng}::float8, ${view.maxLat}::float8, 4326)`,
    ];
  }

  /**
   * Candidate grounds for a view: ST_Intersects on the GiST index, returning
   * each candidate ALREADY simplified for this view (see
   * GROUND_SIMPLIFY_VIEW_FRACTION — full detail never leaves the table).
   * A crossing view is unioned into its two arms in SQL.
   *
   * Failure posture (§2.6 unchanged): an error yields NO candidates for this
   * read (warn logged) rather than falling back to a weaker judgment.
   */
  /**
   * The catalog REVISION for a region (header ideal, 2026-08-01): the newest
   * ground write intersecting the box. Every ground write bumps fetched_at
   * (sketch birth, widen, promotion — verified), so this is the one honest
   * change signal for everything a viewport slice serves. Piggybacked on
   * feed responses so the client slice revalidates ON CHANGE, never on a
   * clock — the derived-at-source-write law applied to cache freshness
   * (replaces the 1h TTL whose drain-cadence rationale birth-synchronous
   * outlines falsified). Compared as a change DETECTOR (inequality), never
   * ordered — callers may compute it over slightly different boxes.
   */
  async catalogWatermark(view: GeoBbox): Promise<string | null> {
    const overlapsAnyArm = Prisma.join(
      this.viewArms(view).map((arm) => Prisma.sql`g.geometry && ${arm}`),
      ' OR ',
    );
    try {
      const rows = await this.prisma.$queryRaw<Array<{ mark: Date | null }>>(
        Prisma.sql`
          /*places:catalog_watermark*/
          SELECT max(g.fetched_at) AS mark FROM place_geometries g
          WHERE ${overlapsAnyArm}
        `,
      );
      return rows[0]?.mark ? rows[0].mark.toISOString() : null;
    } catch (error) {
      // Freshness signal only — a failed read means "no signal", never a
      // failed feed.
      this.logger.warn('catalogWatermark read failed', {
        detail: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async groundsIntersectingView(
    view: GeoBbox,
  ): Promise<Map<string, { ground: PlaceGround; bbox: GeoBbox }>> {
    const grounds = new Map<string, { ground: PlaceGround; bbox: GeoBbox }>();
    const viewSpan = Math.max(bboxLatSpan(view), bboxLngSpan(view));
    const tolerance = viewSpan / GROUND_SIMPLIFY_VIEW_FRACTION;
    // Intersection = the ground touches ANY arm.
    const overlapsAnyArm = Prisma.join(
      this.viewArms(view).map((arm) => Prisma.sql`g.geometry && ${arm}`),
      ' OR ',
    );
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ placeId: string; geojson: string | null } & DerivedBboxRow>
      >(Prisma.sql`
        /*places:grounds_in_view*/
        SELECT g.place_id AS "placeId",
               ST_AsGeoJSON(
                 ST_SimplifyPreserveTopology(g.geometry, ${tolerance})
               ) AS "geojson",
               ${derivedBboxSelectSql('g')}
        FROM place_geometries g
        WHERE ${overlapsAnyArm}
      `);
      for (const row of rows) {
        if (!row.geojson) continue;
        const ground = parseGroundGeoJson(row.geojson);
        if (ground && ground.length > 0) {
          grounds.set(row.placeId, { ground, bbox: bboxFromDerivedRow(row) });
        }
      }
    } catch (error) {
      this.logger.warn(
        'Ground-in-view read failed — no candidates for this read (§2.6: never bbox-judged)',
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
    }
    return grounds;
  }

  /**
   * Smallest place whose GROUND contains the target (§3 attribution's
   * "smallest place containing its geo"; also the §2 header fallback's
   * containment read). Points are the zero-area bbox degenerate case.
   *
   * §2.5(c) under §2.6 — polygon = truth, bbox = index/prefilter ONLY. The
   * bbox prefilter finds candidates (a place whose ground contains the
   * target has a bbox containing it too, so the prefilter never drops a
   * true container); then THE ONE GROUND judges every candidate: it must
   * ST_Covers the target or it is refused (a target inside a neighbor's
   * bbox overhang but outside its ground resolves to the true container),
   * and candidates rank by real ground area (sketch envelope area == bbox
   * area, so the metric is continuous across grades). A candidate with no
   * verdict row has no ground (bbox-less birth / transient error) and is
   * excluded — never bbox-judged. Consumers (poll placeAt, home-place
   * registration) persist this verdict — which is exactly why it must be
   * ground-true at write.
   */
  async smallestContaining(target: GeoPoint | GeoBbox): Promise<Place | null> {
    const box = isGeoPoint(target) ? pointToBbox(target) : target;
    // ONE GROUND, ONE QUERY (one-ground charter P2, 2026-07-26): the law IS
    // "the smallest ground that covers the target", so ask exactly that —
    // ST_Covers on the GiST index, ordered by real ground area, name as the
    // deterministic tiebreak. This replaces a bbox range prefilter + an
    // in-memory bboxContains screen + a second verdict query, and removes
    // the crossing-row CATCH-ALL that dragged EVERY antimeridian place into
    // every containment read. A place with no ground still never judges —
    // it simply isn't in place_geometries.
    const placeId = await this.smallestCoveringPlaceId(box);
    if (!placeId) {
      return null;
    }
    return this.prisma.place.findUnique({ where: { placeId } });
  }

  /**
   * The covering read itself. Failure posture (§2.6 unchanged): an error
   * answers "no container" for THIS read (warn logged) rather than falling
   * back to a weaker judgment — consumers already tolerate null.
   */
  private async smallestCoveringPlaceId(box: GeoBbox): Promise<string | null> {
    // Containment = the ground covers EVERY arm of the target (a crossing
    // target is only contained if both of its halves are). Per-arm ST_Covers
    // keeps each operand index-usable; see viewArms on why never to union.
    const coversAllArms = Prisma.join(
      this.viewArms(box).map(
        (arm) => Prisma.sql`ST_Covers(pg.geometry, ${arm})`,
      ),
      ' AND ',
    );
    try {
      const rows = await this.prisma.$queryRaw<Array<{ placeId: string }>>(
        Prisma.sql`
        /*places:smallest_containing*/
        SELECT pg.place_id AS "placeId"
        FROM place_geometries pg
        JOIN places p ON p.place_id = pg.place_id
        WHERE ${coversAllArms}
        ORDER BY ST_Area(pg.geometry) ASC, p.name ASC
        LIMIT 1
      `,
      );
      return rows[0]?.placeId ?? null;
    } catch (error) {
      this.logger.warn(
        'Ground containment read failed — no container answered for this read (§2.6: never bbox-judged)',
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      return null;
    }
  }

  /**
   * THE FINAL DISSOLUTION (one-ground charter, 2026-07-30): identity is the
   * VENDOR'S OWN key — (geometry id, entityType) — and nothing else.
   *
   * The county-axis decision table (rules c/b'/a/u1-u4), findIdentityCandidates,
   * bboxNear and the level-guard id-strip that fed them are DELETED, not
   * bypassed. They existed to reconcile PARTIAL observations — chain nodes
   * arriving without a vendor id — and measured 2026-07-30 that case has
   * never occurred: 0 of 22,769 places lack an id, every mint since P3
   * carried one, and the machinery was where the arc's only crash bug lived
   * (the level-guard P2002 loop). A place is a MIRRORED VENDOR ENTITY;
   * an observation that does not name an entity does not touch the mirror.
   *
   * Two lanes (the fallback lane was deleted 2026-08-01 — owner ruling
   * "TomTom or nothing"; it had minted zero rows ever on prod):
   * 1. id-carrying node → findUnique on the composite (id, level); merge or
   *    mint. The coincident-boundary case (one geometry id on two rungs —
   *    a city-state, a consolidated city-county) is now REPRESENTED instead
   *    of hacked around: the vendor distinguishes those entities by
   *    entityType, and so does the composite unique index.
   * 2. anything id-less → REFUSED, loudly. Nothing minted, nothing
   *    updated. If this warning ever fires in live traffic, the vendor
   *    changed its response contract — investigate, do not resurrect the
   *    name table.
   *
   * Returns null ONLY for lane 2 (sketchChain drops the node and threads the
   * parent edge past it).
   */
  private async upsertSketch(
    node: PlaceSketchNode,
    parentPlaceId: string | undefined,
  ): Promise<Place | null> {
    const name = normalizePlaceName(node.name);

    if (!node.providerPlaceId) {
      this.logger.warn(
        'id-less observation REFUSED — a place is a mirrored vendor entity',
        {
          name,
          providerLevelCode: node.providerLevelCode,
          countryCode: node.countryCode,
        },
      );
      return null;
    }

    // Bounded race loop: two concurrent first-sketches of the same entity
    // settle on the composite unique index — the loser re-reads and merges.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.prisma.place.findUnique({
        where: {
          providerPlaceId_providerLevelCode: {
            providerPlaceId: node.providerPlaceId,
            providerLevelCode: node.providerLevelCode,
          },
        },
      });
      if (existing) {
        return this.mergeSketch(existing, node, parentPlaceId);
      }
      try {
        const created = await this.prisma.place.create({
          data: {
            name,
            providerLevelCode: node.providerLevelCode,
            countryCode: node.countryCode,
            subdivisionCode: node.subdivisionCode ?? null,
            parentPlaceIds: parentPlaceId ? [parentPlaceId] : [],
            centroidLat: node.centroid?.lat,
            centroidLng: node.centroid?.lng,
            timeZone: node.timeZone ?? null,
            // places.provider stays a stored vendor fact with schema default
            // 'tomtom' — the node no longer carries it (post-fallback-lane
            // there is exactly one provider; the column records, never
            // switches).
            providerPlaceId: node.providerPlaceId,
          },
        });
        // §2.6 BIRTH = GROUND IMMEDIATELY: the sketch envelope lands in
        // place_geometries synchronously with the place row. P4: built from
        // the OBSERVATION directly — there are no bbox columns.
        if (node.bbox) {
          await this.writeSketchGround(created.placeId, node.bbox);
        }
        // §2.5(d) POLYGON AT BIRTH: every new place enters the governed
        // promotion queue immediately, and the birth drain is AWAITED
        // (2026-08-01) — sketchChain runs off the hot path (the reconciler's
        // background settle), so the vendor-bbox window closes within the
        // same settle instead of "whenever the tick runs". Best-effort by
        // design: if a drain is already running, the in-process latch
        // returns immediately and the belt-and-suspenders re-entry lands
        // the outline next tick. A drain failure must never kill the birth.
        if (this.birthListener) {
          try {
            await this.birthListener.enqueue(created.placeId, 'birth');
          } catch (error) {
            this.logger.warn('birth promotion enqueue failed — next tick', {
              placeId: created.placeId,
              detail: String(error),
            });
          }
        }
        return created;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue; // lost the mint race — re-read the winner and merge
        }
        throw error;
      }
    }
    throw new Error(
      'place identity resolution did not settle after 3 attempts',
    );
  }

  /**
   * The §1 conflict rule: no silent forks — the existing row absorbs the new
   * observation. Bbox WIDENS to the union; providerPlaceId is adopted as an
   * alias when we had none (when both exist and differ, ours wins and the
   * disagreement is logged — alias multiplicity is a §2 promotion-queue
   * concern, not a fork); parent edges union; unknown scalars fill in.
   *
   * Concurrency (routine — two viewport cells sharing ancestor nodes merge
   * the same row): read-modify-write on the stale read is FORBIDDEN for the
   * accretive fields. Parent edges append via Prisma's atomic `push`
   * (duplicates tolerated in storage, deduped at the read chokepoint
   * placeParentIds); bbox widening runs as raw LEAST/GREATEST SQL against
   * the LIVE row (see widenBbox) so concurrent widenings compose instead of
   * one silently shrinking the other. Scalar gap-fills stay last-writer-wins
   * but only ever write when the observed row's value is null/absent — a
   * non-null value is never overwritten with a different non-null one.
   *
   * KNOWN LIMIT, a deliberate choice (end-state audit 2026-08-01): the
   * mirror is ACCRETIVE, never re-synced — parent edges only append and
   * scalars only gap-fill, so a vendor RESTATEMENT (re-parenting after a
   * boundary change, a renamed entity) leaves the first observation
   * standing beside or instead of the new truth. Accepted because vendor
   * restatements are rare, edge accretion fails soft (an extra ancestor
   * over-attributes mildly; it never drops the true chain), and the honest
   * fix is a vendor-refresh sweep (re-probe, diff, replace) built when a
   * real restatement is first MEASURED — never a silent last-writer-wins
   * that would let one bad probe rewrite a good chain.
   */
  private async mergeSketch(
    existing: Place,
    node: PlaceSketchNode,
    parentPlaceId: string | undefined,
  ): Promise<Place> {
    // P4: the known extent is DERIVED from the one ground at the moment of
    // use — no stored rectangle to read or to drift.
    const derived = await this.derivedBboxOf(existing.placeId);
    const existingBbox = derived?.bbox ?? null;
    // Distinct-place guard (red-team 7aaa66d9 finding 3, the Lakeside-TX
    // phantom): when both bboxes exist and are DISJOINT (no intersection —
    // definitional, no threshold), the identity match has collided two
    // genuinely different places. Unioning them mints a phantom region
    // that poisons containing headers for everything in between, and §1's
    // grow-only law makes the poison permanent. Refuse the widen, log the
    // suspect. (The county-axis machinery this note once cited is DELETED —
    // THE FINAL DISSOLUTION; identity is the vendor composite key now, so a
    // disjoint observation under the SAME identity means the vendor itself
    // moved the entity or a stale row survived — either way, refuse and
    // surface, never merge.)
    const disjoint =
      existingBbox &&
      node.bbox &&
      bboxIntersectionParts(existingBbox, node.bbox).length === 0;
    if (disjoint) {
      this.logger.warn(
        'distinct-place suspect: disjoint bbox on identity match',
        {
          placeId: existing.placeId,
          stored: existingBbox,
          observed: node.bbox,
        },
      );
    }
    const merged = disjoint ? null : bboxUnion(existingBbox, node.bbox);
    // Skip-if-contained is race-safe: a sketch ground only ever GROWS, so an
    // observation that adds nothing against our read adds nothing against
    // any concurrent state either.
    // Red-team F6 (2026-07-30): widening is a SKETCH-grade concept. A vendor
    // OUTLINE is a fact — the widen UPDATE was guarded against it anyway, so
    // attempting one was a guaranteed no-op write plus a re-read, recomputed
    // on EVERY future observation of the node (it could never converge).
    const widen =
      node.bbox &&
      merged &&
      (derived?.isSketch ?? true) &&
      !this.sameBbox(existingBbox, merged)
        ? merged
        : null;

    const data: Prisma.PlaceUpdateInput = {};

    // Identity IS the composite key: `existing` was found via findUnique on
    // (providerPlaceId, providerLevelCode), so the ids here are equal by
    // construction — nothing to adopt, nothing to reconcile (cleanup
    // 2026-08-01: the impossible gap-fill branch this note replaced was a
    // ghost of the deleted name-identity machinery).

    if (parentPlaceId && !existing.parentPlaceIds.includes(parentPlaceId)) {
      // Atomic append — duplicates are possible under concurrency and fine
      // (dedupe lives in placeParentIds); dropped edges are not.
      data.parentPlaceIds = { push: parentPlaceId };
    }

    if (existing.centroidLat === null && node.centroid) {
      data.centroidLat = node.centroid.lat;
      data.centroidLng = node.centroid.lng;
    }
    if (!existing.timeZone && node.timeZone) {
      data.timeZone = node.timeZone;
    }

    if (!widen && Object.keys(data).length === 0) {
      // Idempotent re-sketch (§2: "idempotent upserts") — nothing to write.
      return existing;
    }
    if (widen) {
      await this.widenSketchGround(existing.placeId, widen);
    }
    if (Object.keys(data).length > 0) {
      return this.prisma.place.update({
        where: { placeId: existing.placeId },
        data,
      });
    }
    // Bbox-only merge: re-read for the post-widen truth (the raw update
    // composes against the live row, so the stale read can't be returned).
    return this.prisma.place.findUniqueOrThrow({
      where: { placeId: existing.placeId },
    });
  }

  /**
   * P4 public batch form: derived extents for a set of places (reconciler's
   * answered-region memory, and any caller that used to read the columns).
   */
  async derivedBboxes(placeIds: string[]): Promise<Map<string, GeoBbox>> {
    const out = new Map<string, GeoBbox>();
    if (placeIds.length === 0) return out;
    const rows = await this.prisma.$queryRaw<
      Array<{ place_id: string } & DerivedBboxRow>
    >(Prisma.sql`
      SELECT g.place_id, ${derivedBboxSelectSql('g')}
      FROM place_geometries g
      WHERE g.place_id = ANY(${placeIds}::uuid[])`);
    for (const row of rows) out.set(row.place_id, bboxFromDerivedRow(row));
    return out;
  }

  /**
   * P4: derive a place's extent from its ONE ground at the moment of use.
   * Returns null when the place has no geometry row (a bbox-less birth —
   * exactly the rows that were bbox-NULL before). Wrap-aware via
   * derivedBboxSelectSql.
   */
  private async derivedBboxOf(
    placeId: string,
  ): Promise<{ bbox: GeoBbox; isSketch: boolean } | null> {
    const [row] = await this.prisma.$queryRaw<
      Array<DerivedBboxRow & { is_sketch: boolean }>
    >(Prisma.sql`
      SELECT ${derivedBboxSelectSql('g')},
             (g.provider_boundary_id IS NULL) AS is_sketch
      FROM place_geometries g WHERE g.place_id = ${placeId}::uuid`);
    return row
      ? { bbox: bboxFromDerivedRow(row), isSketch: row.is_sketch }
      : null;
  }

  /**
   * §1 widening, P4 form: the SKETCH GROUND ITSELF grows to the hull — there
   * is no second stored shape. Race-safe grow-only: the seam-free path unions
   * the observed envelope into the LIVE geometry (ST_Envelope∘ST_Collect
   * composes exactly like the old LEAST/GREATEST — two concurrent widenings
   * each land), and the outline guard means a landed vendor outline is NEVER
   * widened — a real outline is a fact, not an accretion.
   *
   * Antimeridian caveat, unchanged in shape from the old column writer: a
   * crossing hull is written directly as its two-arm union (last-writer
   * window confined to concurrent merges of the same seam-straddling place —
   * rare, self-healing since later sketches keep unioning).
   */
  private async widenSketchGround(
    placeId: string,
    hull: GeoBbox,
  ): Promise<void> {
    if (!bboxCrossesAntimeridian(hull)) {
      await this.prisma.$executeRaw`
        UPDATE place_geometries SET
          geometry = ST_Multi(ST_Envelope(ST_Collect(
            geometry,
            ST_MakeEnvelope(${hull.minLng}::float8, ${hull.minLat}::float8,
                            ${hull.maxLng}::float8, ${hull.maxLat}::float8, 4326)))),
          fetched_at = now()
        WHERE place_id = ${placeId}::uuid
          AND provider_boundary_id IS NULL
          -- Red-team F2 (2026-07-30, TOCTOU): the seam-free/crossing dispatch
          -- was decided on a STALE read. If a concurrent merge crossed this
          -- row's sketch in between, planar ST_Envelope over a two-arm
          -- geometry is the WHOLE WORLD band — the San Juan class reborn,
          -- and grow-only means it never heals. The live-row span guard makes
          -- the stale branch a no-op instead (the next sketch re-widens
          -- through the crossing path).
          AND (ST_XMax(geometry) - ST_XMin(geometry)) < 180`;
      return;
    }
    await this.writeSketchGround(placeId, hull);
  }

  /**
   * §2.6 GROUND UNIFICATION — the sketch-grade ground write chokepoint:
   * upsert the OBSERVED envelope into place_geometries as a rectangular
   * polygon (provider_boundary_id NULL = sketch-grade marker). P4: the
   * envelope is a PARAMETER (the observation), not a read of stored columns
   * — the ground is the only stored shape. Wrap-aware (a crossing bbox
   * stores the union of its two arms) and degenerate-safe (a zero-span bbox
   * cannot form a polygon — skipped; such a place stays invisible to
   * judgment exactly like a bbox-less birth). The guard
   * `WHERE provider_boundary_id IS NULL` means a sketch refresh can NEVER
   * clobber a landed outline — detail never decreases; the drain's outline
   * upsert (which stamps provider_boundary_id) is the only sketch→outline
   * transition.
   */
  private async writeSketchGround(
    placeId: string,
    bbox: GeoBbox,
  ): Promise<void> {
    if (bbox.minLat >= bbox.maxLat || bbox.minLng === bbox.maxLng) {
      return; // degenerate — cannot form a polygon
    }
    const envelope =
      bbox.minLng < bbox.maxLng
        ? Prisma.sql`ST_Multi(ST_MakeEnvelope(
            ${bbox.minLng}::float8, ${bbox.minLat}::float8,
            ${bbox.maxLng}::float8, ${bbox.maxLat}::float8, 4326))`
        : Prisma.sql`ST_Multi(ST_Union(
            ST_MakeEnvelope(${bbox.minLng}::float8, ${bbox.minLat}::float8,
                            180::float8, ${bbox.maxLat}::float8, 4326),
            ST_MakeEnvelope((-180)::float8, ${bbox.minLat}::float8,
                            ${bbox.maxLng}::float8, ${bbox.maxLat}::float8, 4326)))`;
    await this.prisma.$executeRaw`
      INSERT INTO place_geometries (place_id, provider_boundary_id, fetched_at, geometry)
      VALUES (${placeId}::uuid, NULL, now(), ${envelope})
      ON CONFLICT (place_id) DO UPDATE SET
        geometry = EXCLUDED.geometry,
        fetched_at = EXCLUDED.fetched_at
      WHERE place_geometries.provider_boundary_id IS NULL`;
  }

  private sameBbox(a: GeoBbox | null, b: GeoBbox | null): boolean {
    if (!a || !b) return a === b;
    return (
      a.minLat === b.minLat &&
      a.minLng === b.minLng &&
      a.maxLat === b.maxLat &&
      a.maxLng === b.maxLng
    );
  }
}
