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
  bboxLngArcs,
  bboxLngSpan,
  bboxToGround,
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

/** Read a Place row's decimal bbox as a GeoBbox, or null when un-sketched. */
export function placeBbox(place: Place): GeoBbox | null {
  if (
    place.bboxMinLat === null ||
    place.bboxMinLng === null ||
    place.bboxMaxLat === null ||
    place.bboxMaxLng === null
  ) {
    return null;
  }
  return {
    minLat: Number(place.bboxMinLat),
    minLng: Number(place.bboxMinLng),
    maxLat: Number(place.bboxMaxLat),
    maxLng: Number(place.bboxMaxLng),
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
   * no fallback arm). The bbox predicate is INDEX ONLY (§2.5(c)) — it finds
   * candidates and never judges them; a candidate whose ground clips to
   * zero inside the view is dropped (the bbox lied). Rows without a
   * sketched bbox drop out (NULL fails every comparison), which is right:
   * an unindexed sketch can't be found and has no ground.
   *
   * Antimeridian handling (wrap-aware, R1): a crossing VIEW splits into its
   * two non-crossing lng ranges (OR of two plain range predicates — btree
   * columns can't wrap); crossing PLACE rows (bbox_min_lng > bbox_max_lng)
   * can't be range-tested at all, so they are prefetched wholesale (they are
   * a handful of seam-straddling entities) and the exact wrap-aware
   * coverage below decides. The DB predicate only needs to never DROP a
   * true candidate; precision lives in resolvePlaceCoverage.
   */
  async placesInView(view: GeoBbox): Promise<PlaceInView[]> {
    const rows = await this.prisma.place.findMany({
      where: {
        bboxMinLat: { lte: view.maxLat },
        bboxMaxLat: { gte: view.minLat },
        OR: [
          ...bboxLngArcs(view).map((arc) => ({
            bboxMinLng: { lte: arc.end },
            bboxMaxLng: { gte: arc.start },
          })),
          // Crossing rows: min > max, judged in memory.
          { bboxMinLng: { gt: this.prisma.place.fields.bboxMaxLng } },
        ],
      },
    });
    const grounds = await this.loadSimplifiedGrounds(
      rows.map((place) => place.placeId),
      view,
    );
    const viewArea = bboxArea(view);
    const results: PlaceInView[] = [];
    for (const place of rows) {
      const bbox = placeBbox(place);
      if (!bbox) continue;
      // §2.6: ground is ALWAYS judged. Hydration failure (or a raced
      // just-born row) degrades to the envelope ring derived from the bbox
      // — the SAME representation a sketch row stores, never a second arm.
      const ground = grounds.get(place.placeId) ?? bboxToGround(bbox);
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
   * §2.5 tier-2 hydration: simplified real ground for the candidate rows
   * that have a place_geometries polygon. Simplification runs IN the
   * database (ST_SimplifyPreserveTopology) at tolerance = viewSpan /
   * GROUND_SIMPLIFY_VIEW_FRACTION (§16 derived, see the constant) — full
   * detail never leaves place_geometries; every read is view-appropriate.
   * The GeoJSON is flattened to OUTER rings (holes dropped — see
   * @crave-search/shared ground.ts for why that is honest).
   *
   * Failure posture (§2.6): ground hydration failing degrades THIS read to
   * the envelope ring derived from the bbox at the caller (warn logged) —
   * the SAME ground representation at sketch precision, never a second
   * judgment arm and never an error surface.
   */
  private async loadSimplifiedGrounds(
    placeIds: string[],
    view: GeoBbox,
  ): Promise<Map<string, PlaceGround>> {
    const grounds = new Map<string, PlaceGround>();
    if (placeIds.length === 0) {
      return grounds;
    }
    const viewSpan = Math.max(bboxLatSpan(view), bboxLngSpan(view));
    const tolerance = viewSpan / GROUND_SIMPLIFY_VIEW_FRACTION;
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ placeId: string; geojson: string | null }>
      >(Prisma.sql`
        SELECT place_id AS "placeId",
               ST_AsGeoJSON(
                 ST_SimplifyPreserveTopology(geometry, ${tolerance})
               ) AS "geojson"
        FROM place_geometries
        WHERE place_id = ANY(${placeIds}::uuid[])
      `);
      for (const row of rows) {
        if (!row.geojson) continue;
        const ground = parseGroundGeoJson(row.geojson);
        if (ground && ground.length > 0) {
          grounds.set(row.placeId, ground);
        }
      }
    } catch (error) {
      this.logger.warn(
        'Ground hydration failed — §2.6 envelope-ring degradation for this read',
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
    const envelope =
      box.minLng <= box.maxLng
        ? Prisma.sql`ST_MakeEnvelope(${box.minLng}::float8, ${box.minLat}::float8, ${box.maxLng}::float8, ${box.maxLat}::float8, 4326)`
        : Prisma.sql`ST_Union(
            ST_MakeEnvelope(${box.minLng}::float8, ${box.minLat}::float8, 180::float8, ${box.maxLat}::float8, 4326),
            ST_MakeEnvelope((-180)::float8, ${box.minLat}::float8, ${box.maxLng}::float8, ${box.maxLat}::float8, 4326))`;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ placeId: string }>>(
        Prisma.sql`
        /*places:smallest_containing*/
        SELECT pg.place_id AS "placeId"
        FROM place_geometries pg
        JOIN places p ON p.place_id = pg.place_id
        WHERE ST_Covers(pg.geometry, ${envelope})
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
  private findIdentityCandidates(
    node: PlaceSketchNode,
    name: string,
  ): Promise<Place[]> {
    return this.prisma.place.findMany({
      where: {
        countryCode: node.countryCode,
        subdivisionCode: node.subdivisionCode ?? null,
        providerLevelCode: node.providerLevelCode,
        name: { equals: name, mode: 'insensitive' },
      },
      orderBy: [{ createdAt: 'asc' }, { placeId: 'asc' }],
    });
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
      const rowBbox = placeBbox(row);
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
        const rowBbox = placeBbox(row);
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
      const byVendorId = await this.prisma.place.findFirst({
        where: { providerPlaceId: node.providerPlaceId },
      });
      if (byVendorId) {
        return this.mergeSketch(byVendorId, node, parentPlaceId);
      }
    }
    // Bounded re-resolution loop: every race (create-vs-create P2002,
    // adopt-vs-adopt on the same NULL-county row) settles by re-reading the
    // candidates — rows and counties only ever ACCRUE, so a re-run of the
    // decision table lands on the settled truth.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidates = await this.findIdentityCandidates(node, name);
      const resolved = this.resolveIdentity(candidates, node);
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
            bboxMinLat: node.bbox?.minLat,
            bboxMinLng: node.bbox?.minLng,
            bboxMaxLat: node.bbox?.maxLat,
            bboxMaxLng: node.bbox?.maxLng,
            timeZone: node.timeZone ?? null,
            localScriptAlias: node.localScriptAlias ?? null,
            ...(node.provider ? { provider: node.provider } : {}),
            providerPlaceId: node.providerPlaceId ?? null,
          },
        });
        // §2.6 BIRTH = GROUND IMMEDIATELY: the sketch envelope lands in
        // place_geometries synchronously with the place row (never waiting
        // for the drain) — a bbox-carrying place without a geometry row is
        // impossible. The drain upgrades grade (sketch→outline) later.
        await this.writeSketchGround(created.placeId);
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
    const existingBbox = placeBbox(existing);
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
    // Skip-if-contained is race-safe: bboxes only ever grow, so an
    // observation that adds nothing against our read adds nothing against
    // any concurrent state either.
    const widen =
      node.bbox && merged && !this.sameBbox(existingBbox, merged)
        ? node.bbox
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
      await this.widenBbox(existing.placeId, existingBbox, widen);
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
   * Atomic §1 bbox widening: LEAST/GREATEST against the LIVE row, so two
   * concurrent merges each land their widening (no lost update — a lost
   * widening is an effective shrink, which §1 forbids). COALESCE lets a
   * first bbox land on a currently-NULL row.
   *
   * Antimeridian caveat: min/max monotonicity only holds when the union
   * stays seam-free. When the observed bbox, the known bbox, or their hull
   * crosses the antimeridian, the wrap-aware hull (bboxUnion — smaller
   * enclosing arc) is written directly for the lng pair: lat stays atomic,
   * and the lng last-writer window is confined to concurrent merges of the
   * same seam-straddling place — rare, and self-healing since later sketches
   * keep unioning.
   */
  private async widenBbox(
    placeId: string,
    knownBbox: GeoBbox | null,
    observed: GeoBbox,
  ): Promise<void> {
    const seamFree =
      !bboxCrossesAntimeridian(observed) &&
      (!knownBbox ||
        (!bboxCrossesAntimeridian(knownBbox) &&
          !bboxCrossesAntimeridian(bboxUnion(knownBbox, observed) as GeoBbox)));
    if (seamFree) {
      await this.prisma.$executeRaw`
        UPDATE places SET
          bbox_min_lat = LEAST(COALESCE(bbox_min_lat, ${observed.minLat}), ${observed.minLat}),
          bbox_min_lng = LEAST(COALESCE(bbox_min_lng, ${observed.minLng}), ${observed.minLng}),
          bbox_max_lat = GREATEST(COALESCE(bbox_max_lat, ${observed.maxLat}), ${observed.maxLat}),
          bbox_max_lng = GREATEST(COALESCE(bbox_max_lng, ${observed.maxLng}), ${observed.maxLng})
        WHERE place_id = ${placeId}::uuid`;
    } else {
      const hull = bboxUnion(knownBbox, observed) as GeoBbox;
      await this.prisma.$executeRaw`
        UPDATE places SET
          bbox_min_lat = LEAST(COALESCE(bbox_min_lat, ${hull.minLat}), ${hull.minLat}),
          bbox_min_lng = ${hull.minLng},
          bbox_max_lat = GREATEST(COALESCE(bbox_max_lat, ${hull.maxLat}), ${hull.maxLat}),
          bbox_max_lng = ${hull.maxLng}
        WHERE place_id = ${placeId}::uuid`;
    }
    // §2.6 derivation invariant: while sketch-grade, geometry DERIVES from
    // the bbox — every widen refreshes the envelope row from the POST-widen
    // places row in the same call flow (outline rows are untouched: the
    // upsert is guarded on provider_boundary_id IS NULL).
    await this.writeSketchGround(placeId);
  }

  /**
   * §2.6 GROUND UNIFICATION — the sketch-grade ground write chokepoint:
   * upsert the place's bbox envelope into place_geometries as a rectangular
   * polygon (provider_boundary_id NULL = sketch-grade marker). Wrap-aware
   * (a crossing bbox stores the union of its two arms) and degenerate-safe
   * (a zero-span bbox cannot form a polygon — skipped; such a place stays
   * invisible to judgment exactly like a bbox-less birth). The guard
   * `WHERE provider_boundary_id IS NULL` means a sketch refresh can NEVER
   * clobber a landed outline — detail never decreases; the drain's outline
   * upsert (which stamps provider_boundary_id) is the only sketch→outline
   * transition.
   */
  private async writeSketchGround(placeId: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO place_geometries (place_id, provider_boundary_id, fetched_at, geometry)
      SELECT p.place_id, NULL, now(),
             CASE
               WHEN p.bbox_min_lng < p.bbox_max_lng THEN
                 ST_Multi(ST_MakeEnvelope(
                   p.bbox_min_lng::float8, p.bbox_min_lat::float8,
                   p.bbox_max_lng::float8, p.bbox_max_lat::float8, 4326))
               ELSE
                 ST_Multi(ST_Union(
                   ST_MakeEnvelope(p.bbox_min_lng::float8, p.bbox_min_lat::float8,
                                   180::float8, p.bbox_max_lat::float8, 4326),
                   ST_MakeEnvelope((-180)::float8, p.bbox_min_lat::float8,
                                   p.bbox_max_lng::float8, p.bbox_max_lat::float8, 4326)))
             END
      FROM places p
      WHERE p.place_id = ${placeId}::uuid
        AND p.bbox_min_lat IS NOT NULL
        AND p.bbox_min_lat < p.bbox_max_lat
        AND p.bbox_min_lng <> p.bbox_max_lng
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
