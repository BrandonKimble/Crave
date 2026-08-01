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
 * §1 identity law (COUNTY-AXIS amendment, §18 item 8 ratified 2026-07-19):
 * placeKey = (countryCode, subdivisionCode?, county?, providerLevelCode,
 * normalized name). The optional COUNTY axis discriminates genuinely
 * distinct same-name municipalities within one subdivision (the two TX
 * "Lakeside"s). Sketch conflicts NEVER fork a place — they bbox-MERGE
 * (widen to union) and adopt the provider's stable geometry id as an alias
 * when present; whether a county-carrying observation MATCHES a stored row,
 * GAP-FILLS a county-unknown row, or mints a genuinely distinct sibling is
 * the resolveIdentity decision table.
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
  /**
   * COUNTY AXIS (§1 amendment): the provider's county-axis NAME for nodes
   * FINER than the county rung (a county axis on a county/state/country node
   * is meaningless — a state is not inside a county — so providers leave it
   * null there). Optional and best-effort: reverse responses don't always
   * carry it; the gap-fill law adopts it when it arrives.
   */
  county?: string | null;
  bbox?: GeoBbox | null;
  centroid?: GeoPoint | null;
  /** Offline centroid→tz at creation (§1); optional at sketch time. */
  timeZone?: string | null;
  localScriptAlias?: string | null;
  provider?: string;
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
  return Prisma.sql`
    ST_YMin(${g}.geometry)::float8 AS bbox_min_lat,
    ST_YMax(${g}.geometry)::float8 AS bbox_max_lat,
    CASE WHEN ST_XMax(${g}.geometry) - ST_XMin(${g}.geometry) < 180
         THEN ST_XMin(${g}.geometry)::float8
         ELSE COALESCE((
           SELECT MIN(ST_XMin(part.geom))
           FROM ST_Dump(${g}.geometry) AS part
           WHERE ST_X(ST_Centroid(part.geom)) >= 0
         ), ST_XMin(${g}.geometry))::float8
    END AS bbox_min_lng,
    CASE WHEN ST_XMax(${g}.geometry) - ST_XMin(${g}.geometry) < 180
         THEN ST_XMax(${g}.geometry)::float8
         ELSE COALESCE((
           SELECT MAX(ST_XMax(part.geom))
           FROM ST_Dump(${g}.geometry) AS part
           WHERE ST_X(ST_Centroid(part.geom)) < 0
         ), ST_XMax(${g}.geometry))::float8
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
    const results: Place[] = new Array<Place>(chain.length);
    // Broadest-first walk so parent ids exist for child edges.
    let parentPlaceId: string | undefined;
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const place = await this.upsertSketch(chain[i], parentPlaceId);
      results[i] = place;
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
   * All rows sharing the county-BLIND identity tuple (country, subdivision,
   * level, lower(name)) — the candidate set the county-axis decision table
   * (resolveIdentity) chooses among. Deterministically ordered (oldest
   * first) so ties resolve the same way on every node.
   */
  private async findIdentityCandidates(
    node: PlaceSketchNode,
    name: string,
  ): Promise<{ rows: Place[]; bboxOf: Map<string, GeoBbox> }> {
    const rows = await this.prisma.place.findMany({
      where: {
        countryCode: node.countryCode,
        subdivisionCode: node.subdivisionCode ?? null,
        providerLevelCode: node.providerLevelCode,
        name: { equals: name, mode: 'insensitive' },
      },
      orderBy: [{ createdAt: 'asc' }, { placeId: 'asc' }],
    });
    // P4: the decision table's geometry checks (b'/a/u2) read each
    // candidate's extent DERIVED from its ground — candidates are 0-2 rows,
    // one batched query. A groundless row simply has no extent, the same
    // "unknown counts as not-disjoint" posture as before.
    const bboxOf = new Map<string, GeoBbox>();
    if (rows.length > 0) {
      const derived = await this.prisma.$queryRaw<
        Array<{ place_id: string } & DerivedBboxRow>
      >(Prisma.sql`
        SELECT g.place_id, ${derivedBboxSelectSql('g')}
        FROM place_geometries g
        WHERE g.place_id = ANY(${rows.map((r) => r.placeId)}::uuid[])`);
      for (const row of derived) {
        bboxOf.set(row.place_id, bboxFromDerivedRow(row));
      }
    }
    return { rows, bboxOf };
  }

  /**
   * The §1 COUNTY-AXIS decision table (ratified 2026-07-19). Given the
   * county-blind candidate rows and one observation, decide MATCH / GAP-FILL
   * / DISTINCT. County comparison is case-insensitive on the normalized name
   * (same law as place names). Rows, observed county K:
   *
   *  (c) K known, candidate county == K            → MATCH, merge.
   *  (b′) K known, candidate county != K (non-null) BUT its bbox INTERSECTS
   *       the observation → MATCH into that candidate, stored county WINS,
   *       disagreement logged. This is the multi-county-municipality law
   *       (Houston spans Harris/Fort Bend/Montgomery: probes from different
   *       parts of ONE city report different counties — rule (b) without
   *       this geometry override would fork every multi-county city). It
   *       also implements the ratified "UNLESS a sibling row already carries
   *       a DIFFERENT county with a bbox near the observation" clause: the
   *       near sibling absorbs the observation instead of the NULL row
   *       adopting a contested county.
   *  (a) K known, a county-UNKNOWN candidate exists whose bbox is NOT
   *      disjoint from the observation (unknown-bbox counts as not-disjoint)
   *      → GAP-FILL: merge into it and ADOPT K (no fork). Disjoint bboxes
   *      veto adoption — that NULL row is the OTHER same-name town observed
   *      before counties existed.
   *  (b) K known, no candidate passed (c)/(b′)/(a) → genuinely DISTINCT
   *      place: create a sibling row carrying K (the new index shape admits
   *      it — counties differ, or NULL vs K).
   *
   *  K UNKNOWN (county-less observation — county-rung-and-above nodes,
   *  fallback mints, providers without county data):
   *  (u1) a county-unknown candidate exists → MATCH it (the legacy tuple;
   *       mergeSketch's disjoint-bbox guard still refuses phantom widening).
   *  (u2) else a candidate whose bbox intersects the observation → MATCH it
   *       (geometry picks among county-carrying same-name siblings; county
   *       untouched).
   *  (u3) else exactly one candidate → MATCH it (pre-amendment behavior;
   *       the widen guard protects the disjoint case).
   *  (u4) else (several county-carrying siblings, no geometry to arbitrate)
   *       → MATCH the deterministic oldest, loudly. NEVER create here: a
   *       fresh NULL-county row beside county-carrying siblings is pure
   *       adoption bait for the wrong county later.
   */
  private resolveIdentity(
    candidateRows: Place[],
    node: PlaceSketchNode,
    candidateBboxOf: Map<string, GeoBbox>,
  ): { row: Place; adoptCounty?: string } | { row: null } {
    let candidates = candidateRows;
    if (candidates.length === 0) {
      return { row: null };
    }
    // DIFFERENT VENDOR ID = DIFFERENT ENTITY (one-ground charter P3): the
    // id-first lookup upstream already matched an exact id, so any remaining
    // name-candidate that carries a DIFFERENT id is provably not this place
    // — the vendor says so. Disqualify it rather than let the name/county
    // rules merge two entities (the defect that widened San Juan Municipio
    // across 45° of longitude). A candidate with no stored id is still
    // eligible: it simply has no vendor opinion yet.
    if (node.providerPlaceId) {
      candidates = candidates.filter(
        (row) =>
          row.providerPlaceId === null ||
          row.providerPlaceId === node.providerPlaceId,
      );
      if (candidates.length === 0) {
        return { row: null }; // all homonyms are other entities → mint ours
      }
    }
    const observedCounty = node.county ? normalizePlaceName(node.county) : null;
    const sameCounty = (row: Place) =>
      row.county !== null &&
      observedCounty !== null &&
      row.county.toLowerCase() === observedCounty.toLowerCase();
    const bboxNear = (row: Place) => {
      const rowBbox = candidateBboxOf.get(row.placeId) ?? null;
      return (
        rowBbox !== null &&
        node.bbox != null &&
        bboxIntersectionParts(rowBbox, node.bbox).length > 0
      );
    };

    if (observedCounty !== null) {
      const exact = candidates.find(sameCounty); // (c)
      if (exact) {
        return { row: exact };
      }
      const contested = candidates.find(
        (row) => row.county !== null && bboxNear(row),
      ); // (b′)
      if (contested) {
        this.logger.warn(
          'county disagreement on identity match (multi-county ground) — stored county wins',
          {
            placeId: contested.placeId,
            stored: contested.county,
            observed: observedCounty,
          },
        );
        return { row: contested };
      }
      const adoptable = candidates.find((row) => {
        if (row.county !== null) return false;
        const rowBbox = candidateBboxOf.get(row.placeId) ?? null;
        const disjoint =
          rowBbox !== null &&
          node.bbox != null &&
          bboxIntersectionParts(rowBbox, node.bbox).length === 0;
        return !disjoint; // (a)
      });
      if (adoptable) {
        return { row: adoptable, adoptCounty: observedCounty };
      }
      return { row: null }; // (b): distinct sibling
    }

    const countyless = candidates.find((row) => row.county === null); // (u1)
    if (countyless) {
      return { row: countyless };
    }
    const near = candidates.find(bboxNear); // (u2)
    if (near) {
      return { row: near };
    }
    if (candidates.length > 1) {
      // (u4) — candidates are oldest-first; log the unarbitrable ambiguity.
      this.logger.warn(
        'ambiguous county-less observation across county-carrying siblings — merging into oldest',
        {
          placeId: candidates[0].placeId,
          siblingCount: candidates.length,
        },
      );
    }
    return { row: candidates[0] }; // (u3)/(u4)
  }

  private async upsertSketch(
    node: PlaceSketchNode,
    parentPlaceId: string | undefined,
  ): Promise<Place> {
    const name = normalizePlaceName(node.name);
    // VENDOR ID IS THE IDENTITY (one-ground charter P3, 2026-07-26). The
    // provider's geometry id is STABLE and per-entity (live-validated: the
    // same id comes back from reverse and forward geocodes for the same
    // entity), so when the observation carries one it answers identity
    // EXACTLY — no name normalization, no county axis, no geometric
    // comparison, no ambiguity. Names were never identity: "Scotland" is a
    // town in Georgia AND a country; matching by name is what let two
    // different entities merge and destroy each other's extent.
    if (node.providerPlaceId) {
      // findUNIQUE, not findFirst: the id is the identity key and carries a
      // unique index (migration 20260727220000), so "which row wins" is not a
      // question — an unordered findFirst could have answered differently
      // between calls if the invariant ever slipped (red-team finding).
      const byVendorId = await this.prisma.place.findUnique({
        where: { providerPlaceId: node.providerPlaceId },
      });
      if (byVendorId) {
        // LEVEL GUARD: the vendor can return the same geometry id at two
        // rungs for a coincident boundary (a city-state, a consolidated
        // city-county). Merging a Municipality observation into a
        // CountrySubdivision row would silently mislabel the level, which
        // mergeSketch never corrects. Same id at a DIFFERENT level is not
        // this place — fall through to the name path, which can mint the
        // distinct row.
        if (byVendorId.providerLevelCode === node.providerLevelCode) {
          return this.mergeSketch(byVendorId, node, parentPlaceId);
        }
        this.logger.warn(
          'vendor id matched a row at a DIFFERENT level — not this place',
          {
            placeId: byVendorId.placeId,
            storedLevel: byVendorId.providerLevelCode,
            observedLevel: node.providerLevelCode,
            providerPlaceId: node.providerPlaceId,
          },
        );
        // ENTITY EXCLUSIVITY (red-team finding, 2026-07-29, both reviewers
        // independently): the id is CLAIMED — by the other rung — and the
        // unique index enforces exactly that. Falling through while the node
        // still carried the id was a guaranteed crash: the name path either
        // CREATEs with it (P2002 → retry → identical state → "did not settle
        // after 3 attempts") or merges into a null-id candidate whose
        // id-adopt UPDATE throws P2002 uncaught. Deterministic input —
        // any chain where the vendor stamps one geometry id on two rungs, the
        // exact case this guard's comment names — so one such probe killed
        // the whole sketchChain, and in seed-region.ts aborted the entire
        // run. The node proceeds id-LESS: the row mints/merges on the name
        // axis and simply never claims an id that is not its to claim.
        node = { ...node, providerPlaceId: undefined };
      }
    }
    // Bounded re-resolution loop: every race (create-vs-create P2002,
    // adopt-vs-adopt on the same NULL-county row) settles by re-reading the
    // candidates — rows and counties only ever ACCRUE, so a re-run of the
    // decision table lands on the settled truth.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { rows: candidates, bboxOf } = await this.findIdentityCandidates(
        node,
        name,
      );
      const resolved = this.resolveIdentity(candidates, node, bboxOf);
      if (resolved.row) {
        if ('adoptCounty' in resolved && resolved.adoptCounty) {
          // Gap-fill (rule a) must be RACE-SAFE: adopt only if the row is
          // STILL county-unknown (a concurrent observer may have adopted a
          // different county first — then the decision table must re-run
          // against the new truth, possibly minting a distinct sibling).
          const adopted = await this.prisma.place.updateMany({
            where: { placeId: resolved.row.placeId, county: null },
            data: { county: resolved.adoptCounty },
          });
          if (adopted.count === 0) {
            continue; // lost the adoption race — re-resolve
          }
          resolved.row.county = resolved.adoptCounty;
        }
        return this.mergeSketch(resolved.row, node, parentPlaceId);
      }
      try {
        const created = await this.prisma.place.create({
          data: {
            name,
            providerLevelCode: node.providerLevelCode,
            countryCode: node.countryCode,
            subdivisionCode: node.subdivisionCode ?? null,
            county: node.county ? normalizePlaceName(node.county) : null,
            parentPlaceIds: parentPlaceId ? [parentPlaceId] : [],
            centroidLat: node.centroid?.lat,
            centroidLng: node.centroid?.lng,
            timeZone: node.timeZone ?? null,
            localScriptAlias: node.localScriptAlias ?? null,
            ...(node.provider ? { provider: node.provider } : {}),
            providerPlaceId: node.providerPlaceId ?? null,
          },
        });
        // §2.6 BIRTH = GROUND IMMEDIATELY: the sketch envelope lands in
        // place_geometries synchronously with the place row (never waiting
        // for the drain). P4: the envelope is built from the OBSERVATION
        // directly — there are no bbox columns to route it through.
        if (node.bbox) {
          await this.writeSketchGround(created.placeId, node.bbox);
        }
        // §2.5(d) POLYGON AT BIRTH: every new place enters the governed
        // promotion queue immediately (fire-and-forget; the enqueue itself
        // filters fallback mints and already-outlined ground). The hourly
        // drain turns it into an outline within the hour — fine by law.
        if (this.birthListener) {
          void this.birthListener.enqueue(created.placeId, 'birth');
        }
        return created;
      } catch (error) {
        // Two concurrent first-sketches of the same tuple: the DB identity
        // index (uq_places_identity, county axis included) makes the fork
        // impossible; the loser re-resolves and MERGES instead.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue; // re-resolve against the winner's row
        }
        throw error;
      }
    }
    throw new Error(
      `place identity resolution did not settle after 3 attempts: ` +
        `${node.countryCode}/${node.subdivisionCode ?? '∅'}/${node.county ?? '∅'}/` +
        `${node.providerLevelCode}/${name}`,
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
   */
  private async mergeSketch(
    existing: Place,
    node: PlaceSketchNode,
    parentPlaceId: string | undefined,
  ): Promise<Place> {
    // P4: the known extent is DERIVED from the one ground at the moment of
    // use — no stored rectangle to read or to drift.
    const existingBbox = await this.derivedBboxOf(existing.placeId);
    // Distinct-place guard (red-team 7aaa66d9 finding 3, the Lakeside-TX
    // phantom): when both bboxes exist and are DISJOINT (no intersection —
    // definitional, no threshold), the identity match has collided two
    // genuinely different places. Unioning them mints a phantom region
    // that poisons containing-fallback headers for everything in between,
    // and §1's grow-only law makes the poison permanent. Refuse the widen,
    // log the suspect. The COUNTY-AXIS amendment (resolveIdentity) resolves
    // most of this class upstream, but the guard STAYS as defense in depth:
    // same-county homonyms, county-less providers, and county-less
    // observations (rules u1–u4) can still land a disjoint observation on
    // the wrong row.
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
    const widen =
      node.bbox && merged && !this.sameBbox(existingBbox, merged)
        ? merged
        : null;

    const data: Prisma.PlaceUpdateInput = {};

    if (node.providerPlaceId) {
      if (!existing.providerPlaceId) {
        data.providerPlaceId = node.providerPlaceId;
      }
      // An id DISAGREEMENT can no longer reach here: resolveIdentity
      // disqualifies differently-id'd candidates and the id-first lookup
      // matches exactly (one-ground charter P3). Nothing to reconcile.
    }

    if (parentPlaceId && !existing.parentPlaceIds.includes(parentPlaceId)) {
      // Atomic append — duplicates are possible under concurrency and fine
      // (dedupe lives in placeParentIds); dropped edges are not.
      data.parentPlaceIds = { push: parentPlaceId };
    }

    // COUNTY GAP-FILL lives HERE (moved 2026-07-27, red-team finding).
    // It used to sit only in resolveIdentity's decision table, because the
    // county was part of how identity was CHOSEN. Since P3 made the vendor
    // geometry id the identity, the id-first path skips that table entirely
    // — so for every observation carrying a vendor id (i.e. nearly all of
    // them) the county axis silently stopped accruing. County is not an
    // identity input any more; it is just another unknown scalar the merge
    // fills, exactly like centroid/timeZone/localScriptAlias below. Same
    // never-overwrite rule: a stored non-null county is never replaced.
    if (!existing.county && node.county) {
      data.county = normalizePlaceName(node.county);
    }
    if (existing.centroidLat === null && node.centroid) {
      data.centroidLat = node.centroid.lat;
      data.centroidLng = node.centroid.lng;
    }
    if (!existing.timeZone && node.timeZone) {
      data.timeZone = node.timeZone;
    }
    if (!existing.localScriptAlias && node.localScriptAlias) {
      data.localScriptAlias = node.localScriptAlias;
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
  private async derivedBboxOf(placeId: string): Promise<GeoBbox | null> {
    const [row] = await this.prisma.$queryRaw<DerivedBboxRow[]>(Prisma.sql`
      SELECT ${derivedBboxSelectSql('g')}
      FROM place_geometries g WHERE g.place_id = ${placeId}::uuid`);
    return row ? bboxFromDerivedRow(row) : null;
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
          AND provider_boundary_id IS NULL`;
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
