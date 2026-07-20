/**
 * Place Catalog reads/writes (plans/geo-demand-foundation-rebuild.md §1).
 *
 * The catalog is a containment DAG of places: open providerLevelCode
 * vocabulary (stored, never switched on), parent edges captured from the
 * reverse-geocode chain at creation (geometry never derives hierarchy), and
 * two-tier geometry — a lean bbox on the hot places row, tier-2 polygons in
 * place_geometries (whose PostGIS geometry column lives OUTSIDE the prisma
 * model; any polygon-precise op must go through $queryRaw).
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
import { Injectable } from '@nestjs/common';
import { Place, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  GeoBbox,
  GeoPoint,
  bboxArea,
  bboxContains,
  bboxCrossesAntimeridian,
  bboxIntersectionParts,
  bboxLngArcs,
  bboxUnion,
  isGeoPoint,
  normalizePlaceName,
  pointToBbox,
} from './place-geo';

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

/** placesInView row: the place plus its §2 coverage share of the view. */
export interface PlaceInView {
  place: Place;
  bbox: GeoBbox;
  /** area(place bbox ∩ view) / area(view) — the §2 "coverage of view". */
  coverageOfView: number;
  /** area(place bbox), same squared-degree metric as the view's. */
  placeArea: number;
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
   * All places whose bbox intersects the view, with §2 coverage shares.
   * Bbox-level btree predicate on the decimal columns — cheap and correct at
   * catalog scale; polygon-precise intersection is a tier-2/$queryRaw concern
   * for later (§1). Rows without a sketched bbox drop out (NULL fails every
   * comparison), which is right: a bbox-less sketch can't answer coverage.
   *
   * Antimeridian handling (wrap-aware, R1): a crossing VIEW splits into its
   * two non-crossing lng ranges (OR of two plain range predicates — btree
   * columns can't wrap); crossing PLACE rows (bbox_min_lng > bbox_max_lng)
   * can't be range-tested at all, so they are prefetched wholesale (they are
   * a handful of seam-straddling entities) and the exact wrap-aware
   * intersection below decides. The DB predicate only needs to never DROP a
   * true candidate; precision lives in bboxIntersectionParts.
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
    const viewArea = bboxArea(view);
    const results: PlaceInView[] = [];
    for (const place of rows) {
      const bbox = placeBbox(place);
      if (!bbox) continue;
      const parts = bboxIntersectionParts(bbox, view);
      if (parts.length === 0) continue;
      const intersectionArea = parts.reduce(
        (sum, part) => sum + bboxArea(part),
        0,
      );
      results.push({
        place,
        bbox,
        // Zero-area view (a point) degenerates to coverage 1: any place whose
        // bbox admits the point fully covers the attention there.
        coverageOfView: viewArea > 0 ? intersectionArea / viewArea : 1,
        placeArea: bboxArea(bbox),
      });
    }
    return results;
  }

  /**
   * Smallest-area place whose bbox CONTAINS the target (§3 attribution's
   * "smallest place containing its geo"; also the §2 header fallback's
   * containment read). Points are the zero-area bbox degenerate case.
   */
  async smallestContaining(target: GeoPoint | GeoBbox): Promise<Place | null> {
    const box = isGeoPoint(target) ? pointToBbox(target) : target;
    // Wrap-aware prefilter (see placesInView): the plain range branch is the
    // exact containment test for non-crossing rows against a non-crossing
    // target (and merely over-inclusive otherwise); crossing rows are
    // prefetched and judged in memory. bboxContains below is authoritative.
    const rows = await this.prisma.place.findMany({
      where: {
        bboxMinLat: { lte: box.minLat },
        bboxMaxLat: { gte: box.maxLat },
        OR: [
          {
            bboxMinLng: { lte: box.minLng },
            bboxMaxLng: { gte: box.maxLng },
          },
          { bboxMinLng: { gt: this.prisma.place.fields.bboxMaxLng } },
        ],
      },
    });
    let smallest: Place | null = null;
    let smallestArea = Number.POSITIVE_INFINITY;
    for (const place of rows) {
      const bbox = placeBbox(place);
      if (!bbox) continue;
      if (!bboxContains(bbox, box)) continue;
      const area = bboxArea(bbox);
      if (
        area < smallestArea ||
        // Deterministic tiebreak on equal area (name-stability flavor, §2).
        (area === smallestArea &&
          smallest !== null &&
          place.name.localeCompare(smallest.name) < 0)
      ) {
        smallest = place;
        smallestArea = area;
      }
    }
    return smallest;
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
    candidates: Place[],
    node: PlaceSketchNode,
  ): { row: Place; adoptCounty?: string } | { row: null } {
    if (candidates.length === 0) {
      return { row: null };
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
        return await this.prisma.place.create({
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
      } else if (existing.providerPlaceId !== node.providerPlaceId) {
        this.logger.warn('providerPlaceId disagreement on identity match', {
          placeId: existing.placeId,
          stored: existing.providerPlaceId,
          observed: node.providerPlaceId,
        });
      }
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
      return;
    }
    const hull = bboxUnion(knownBbox, observed) as GeoBbox;
    await this.prisma.$executeRaw`
      UPDATE places SET
        bbox_min_lat = LEAST(COALESCE(bbox_min_lat, ${hull.minLat}), ${hull.minLat}),
        bbox_min_lng = ${hull.minLng},
        bbox_max_lat = GREATEST(COALESCE(bbox_max_lat, ${hull.maxLat}), ${hull.maxLat}),
        bbox_max_lng = ${hull.maxLng}
      WHERE place_id = ${placeId}::uuid`;
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
