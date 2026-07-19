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
 * §1 identity law: placeKey = (countryCode, subdivisionCode?,
 * providerLevelCode, normalized name). Sketch conflicts NEVER fork a place —
 * they bbox-MERGE (widen to union) and adopt the provider's stable geometry
 * id as an alias when present.
 */
import { Injectable } from '@nestjs/common';
import { Place, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  GeoBbox,
  GeoPoint,
  bboxArea,
  bboxIntersection,
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
   * Identity law per node: match on (countryCode, subdivisionCode?,
   * providerLevelCode, normalized name), case-INSENSITIVELY on the name (case
   * is display; identity is not). On conflict: bbox-merge (widen to union),
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
   */
  async placesInView(view: GeoBbox): Promise<PlaceInView[]> {
    const rows = await this.prisma.place.findMany({
      where: {
        bboxMinLat: { lte: view.maxLat },
        bboxMaxLat: { gte: view.minLat },
        bboxMinLng: { lte: view.maxLng },
        bboxMaxLng: { gte: view.minLng },
      },
    });
    const viewArea = bboxArea(view);
    const results: PlaceInView[] = [];
    for (const place of rows) {
      const bbox = placeBbox(place);
      if (!bbox) continue;
      const intersection = bboxIntersection(bbox, view);
      if (!intersection) continue;
      results.push({
        place,
        bbox,
        // Zero-area view (a point) degenerates to coverage 1: any place whose
        // bbox admits the point fully covers the attention there.
        coverageOfView: viewArea > 0 ? bboxArea(intersection) / viewArea : 1,
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
    const rows = await this.prisma.place.findMany({
      where: {
        bboxMinLat: { lte: box.minLat },
        bboxMinLng: { lte: box.minLng },
        bboxMaxLat: { gte: box.maxLat },
        bboxMaxLng: { gte: box.maxLng },
      },
    });
    let smallest: Place | null = null;
    let smallestArea = Number.POSITIVE_INFINITY;
    for (const place of rows) {
      const bbox = placeBbox(place);
      if (!bbox) continue;
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

  /** Identity-law lookup: exact tuple, case-insensitive on normalized name. */
  private findByIdentity(
    node: PlaceSketchNode,
    name: string,
  ): Promise<Place | null> {
    return this.prisma.place.findFirst({
      where: {
        countryCode: node.countryCode,
        subdivisionCode: node.subdivisionCode ?? null,
        providerLevelCode: node.providerLevelCode,
        name: { equals: name, mode: 'insensitive' },
      },
    });
  }

  private async upsertSketch(
    node: PlaceSketchNode,
    parentPlaceId: string | undefined,
  ): Promise<Place> {
    const name = normalizePlaceName(node.name);
    const existing = await this.findByIdentity(node, name);
    if (existing) {
      return this.mergeSketch(existing, node, parentPlaceId);
    }
    try {
      return await this.prisma.place.create({
        data: {
          name,
          providerLevelCode: node.providerLevelCode,
          countryCode: node.countryCode,
          subdivisionCode: node.subdivisionCode ?? null,
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
      // Two concurrent first-sketches of the same node: the DB's identity
      // constraint (uq_places_identity) makes the fork impossible; the loser
      // re-reads and MERGES instead. (The reconciler's single-flight makes
      // this rare; the constraint makes it safe.)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findByIdentity(node, name);
        if (raced) {
          return this.mergeSketch(raced, node, parentPlaceId);
        }
      }
      throw error;
    }
  }

  /**
   * The §1 conflict rule: no silent forks — the existing row absorbs the new
   * observation. Bbox WIDENS to the union; providerPlaceId is adopted as an
   * alias when we had none (when both exist and differ, ours wins and the
   * disagreement is logged — alias multiplicity is a §2 promotion-queue
   * concern, not a fork); parent edges union; unknown scalars fill in.
   */
  private async mergeSketch(
    existing: Place,
    node: PlaceSketchNode,
    parentPlaceId: string | undefined,
  ): Promise<Place> {
    const data: Prisma.PlaceUpdateInput = {};

    const merged = bboxUnion(placeBbox(existing), node.bbox);
    if (merged && !this.sameBbox(placeBbox(existing), merged)) {
      data.bboxMinLat = merged.minLat;
      data.bboxMinLng = merged.minLng;
      data.bboxMaxLat = merged.maxLat;
      data.bboxMaxLng = merged.maxLng;
    }

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
      data.parentPlaceIds = [...existing.parentPlaceIds, parentPlaceId];
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

    if (Object.keys(data).length === 0) {
      // Idempotent re-sketch (§2: "idempotent upserts") — nothing to write.
      return existing;
    }
    return this.prisma.place.update({
      where: { placeId: existing.placeId },
      data,
    });
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
