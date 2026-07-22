/**
 * §2 read-time subjecthood law (plans/geo-demand-foundation-rebuild.md §2,
 * consolidating the old §35.2 header rule). PURE functions — no IO, no
 * service state; the catalog service supplies the candidates, this file
 * judges them. Naming OBSERVES at write time (sketch everything); SUBJECTHOOD
 * is judged here, at read, and is re-definable forever.
 *
 * The law — SYMMETRIC commensurability at ATTENTION_FRACTION = 1/3 ("a view
 * attends to ≤ ~3 places"):
 *   - too small: place covers < 1/3 of the view → not a subject;
 *   - too big:   view is < 1/3 of the place    → not the subject either —
 *     descend the DAG to the commensurate node (street zoom in Chongqing
 *     names the ward, not Chongqing).
 * A place is COMMENSURATE with the view iff neither disqualifier fires.
 *
 * Header (§2):
 *   - the commensurate COVERING place's name when one exists;
 *   - when NO commensurate node exists, the smallest CONTAINING node — even
 *     over-scale (containing-fallback names the city, NOT "this area");
 *   - "this area" is RESERVED for multi-place straddles (several commensurate
 *     subjects, none covering) and unnamed ground (nothing commensurate,
 *     nothing containing — the continental view over sparse catalog).
 * Hysteresis (commit on settle+dwell, enter/exit asymmetry) is the CALLER's
 * concern — this function is the memoryless judgment it hysteresis-wraps.
 *
 * SHARED HOME (header subject-store design, ratified 2026-07-21): this law
 * lives in @crave-search/shared because the header is a pure function of
 * (viewport, catalog) and BOTH sides run it — the server (search header,
 * polls membership, reconciler, promotion) and the client (against its
 * sliding catalog slice, GET /places/in-view). One law, two runtimes; no
 * Nest, no Prisma, no IO may ever enter this module.
 */
import {
  GeoBbox,
  GeoPoint,
  bboxArea,
  bboxCenter,
  bboxContains,
  bboxContainsPoint,
  bboxIntersectionParts,
  bboxLngSpan,
  normalizeLng,
  pointDistance,
  pointToBboxDistance,
} from './place-geo';

/** §2: "a view attends to ≤ ~3 places". */
export const ATTENTION_FRACTION = 1 / 3;

/**
 * A commensurate place is COVERING when what it leaves uncovered is itself
 * sub-attention (< ATTENTION_FRACTION of the view): coverage ≥ 1 − 1/3.
 * Derived from the same constant so the law stays one-knobbed. Two towns at
 * ~half the view each are both subjects but neither covers → straddle; a
 * city at 90% with border slivers covers → the city is the header.
 * RATIFIED 2026-07-19 (owner docket item 1): the one-knob derivation is law.
 */
export const COVERING_FRACTION = 1 - ATTENTION_FRACTION;

/** §2 probe budget: ≤ ⌊1/ATTENTION_FRACTION⌋ = 3 anchors per view. */
export const MAX_PROBE_ANCHORS = Math.floor(1 / ATTENTION_FRACTION);

/**
 * §16 K6 DEFINITIONAL — float tolerance so exact-boundary fixtures
 * (coverage == 1/3) judge stably; nothing changes it.
 */
const EPSILON = 1e-9;

/** What the judgment needs to know about a place in view (bbox-level, §1). */
export interface SubjectCandidate {
  placeId: string;
  name: string;
  bbox: GeoBbox;
  /** area(place bbox ∩ view) / area(view) — see coverageOfView below. */
  coverageOfView: number;
}

/**
 * The lean catalog-row shape the subjects law accepts from EITHER runtime —
 * the server's Prisma Place row projects onto it, and the slice endpoint
 * (GET /places/in-view) ships exactly this (minus `area`, which derives from
 * bbox via bboxArea and is never wire data). Deliberately storage-agnostic:
 * no Prisma types may appear in this module.
 */
export interface PlaceLike {
  placeId: string;
  name: string;
  bbox: GeoBbox;
  /** OPEN vocabulary (§1) — stored verbatim, never switched on. */
  providerLevelCode: string;
  /** DAG parent edges (dedupe is the reader's concern, §1). */
  parentPlaceIds: string[];
  /** Optional cached bboxArea(bbox); recomputed when absent. */
  area?: number;
}

/**
 * THE per-row coverage law — area(bbox ∩ view) / area(view) — shared by the
 * server catalog read (PlacesCatalogService.placesInView) and the client's
 * local slice evaluation, so both sides feed resolveHeaderPlace identical
 * numbers. Returns null when the bbox does not intersect the view at all
 * (not a candidate). A zero-area (point) view degenerates to coverage 1:
 * any place whose bbox admits the point fully covers the attention there.
 * `viewArea` is passed in (callers already hold bboxArea(view)) so a slice
 * of N places computes it once.
 */
export function coverageOfView(view: GeoBbox, viewArea: number, bbox: GeoBbox): number | null {
  const parts = bboxIntersectionParts(bbox, view);
  if (parts.length === 0) {
    return null;
  }
  const intersectionArea = parts.reduce((sum, part) => sum + bboxArea(part), 0);
  return viewArea > 0 ? intersectionArea / viewArea : 1;
}

/**
 * Catalog rows → subject candidates for one view: keep every place whose
 * bbox intersects the view, with its coverage share. This is the pure core
 * of the server's placesInView (which merely adds the DB prefilter) and the
 * WHOLE of the client's read over its slice — feed the result straight to
 * resolveHeaderPlace.
 */
export function subjectCandidatesInView(view: GeoBbox, places: PlaceLike[]): SubjectCandidate[] {
  const viewArea = bboxArea(view);
  const candidates: SubjectCandidate[] = [];
  for (const place of places) {
    const coverage = coverageOfView(view, viewArea, place.bbox);
    if (coverage === null) continue;
    candidates.push({
      placeId: place.placeId,
      name: place.name,
      bbox: place.bbox,
      coverageOfView: coverage,
    });
  }
  return candidates;
}

export type HeaderResolution =
  | {
      kind: 'place';
      place: SubjectCandidate;
      /**
       * 'commensurate'         → the §2 primary rule chose it;
       * 'containing-fallback'  → no commensurate node existed; smallest
       *                          CONTAINING node named even over-scale.
       */
      reason: 'commensurate' | 'containing-fallback';
      /** All commensurate places, coverage-desc (the view's subjects). */
      subjects: SubjectCandidate[];
    }
  | {
      kind: 'this-area';
      /**
       * 'straddle'       → several commensurate subjects, none covering;
       * 'unnamed-ground' → nothing commensurate AND nothing containing.
       */
      reason: 'straddle' | 'unnamed-ground';
      subjects: SubjectCandidate[];
    };

/**
 * The §2 "too big" disqualifier, shared VERBATIM by isCommensurate and the
 * reconciler's answered test: a region is over-scale for the view when the
 * view is < ATTENTION_FRACTION of it. Sharing the exact test is load-bearing
 * — a known region may only ANSWER an anchor at scales the view could accept
 * as a subject (see bboxAnswersAnchor), so a sketched country can never
 * permanently starve street-zoom probing (§1 lazy neighborhood entry, §2
 * Chongqing descent).
 */
export function isTooBigForView(viewArea: number, regionArea: number): boolean {
  return regionArea > 0 && viewArea + EPSILON < ATTENTION_FRACTION * regionArea;
}

/**
 * §2 symmetric commensurability test for one candidate against the view.
 * Exported so the reconciler/spec fixtures can assert the disqualifiers
 * independently of the full resolution.
 */
export function isCommensurate(viewArea: number, candidate: SubjectCandidate): boolean {
  // Too small: covers < 1/3 of the view.
  if (candidate.coverageOfView + EPSILON < ATTENTION_FRACTION) {
    return false;
  }
  // Too big: the view is < 1/3 of the place → descend (§2). A zero-area
  // place (degenerate sketch) can only fail the too-small arm above.
  return !isTooBigForView(viewArea, bboxArea(candidate.bbox));
}

/**
 * Does a KNOWN region (stored place bbox or negative observation) answer a
 * probe anchor for THIS view? Point-in-bbox alone is not enough: an
 * over-scale region (a sketched country under a street-zoom view) knows
 * nothing about the commensurate places the view actually needs, so it must
 * not suppress the probe. The scale test is the same too-big disqualifier as
 * isCommensurate, applied SYMMETRICALLY to places and negative observations.
 */
export function bboxAnswersAnchor(viewArea: number, bbox: GeoBbox, anchor: GeoPoint): boolean {
  return !isTooBigForView(viewArea, bboxArea(bbox)) && bboxContainsPoint(bbox, anchor);
}

/**
 * The §2 header judgment. `placesInView` is EVERY catalog place whose bbox
 * intersects the view (the catalog service's placesInView read) — this
 * includes ancestors, so DAG "descent" needs no traversal here: a too-big
 * ancestor simply fails commensurability while its commensurate descendant
 * passes, and the descendant wins by construction.
 */
export function resolveHeaderPlace(
  view: GeoBbox,
  placesInView: SubjectCandidate[]
): HeaderResolution {
  const viewArea = bboxArea(view);

  const commensurate = placesInView
    .filter((candidate) => isCommensurate(viewArea, candidate))
    // §2 tiebreak: "equal-commensurability descent tiebreak = coverage-of-
    // view, then name-stability" — deterministic lexicographic close.
    .sort((a, b) => b.coverageOfView - a.coverageOfView || a.name.localeCompare(b.name));

  if (commensurate.length > 0) {
    const top = commensurate[0];
    if (commensurate.length === 1 || top.coverageOfView + EPSILON >= COVERING_FRACTION) {
      // The commensurate covering place (or the lone subject — with a single
      // subject there is no straddle to reserve "this area" for).
      // RATIFIED 2026-07-19 (owner docket item 2): a lone commensurate
      // subject names the header even below COVERING_FRACTION — "this area"
      // stays reserved for genuine straddles/unnamed ground.
      return {
        kind: 'place',
        place: top,
        reason: 'commensurate',
        subjects: commensurate,
      };
    }
    // Multi-place straddle: several subjects, none covering → "this area"
    // (§2/§35.2 reservation), subjects listed for the caller.
    return { kind: 'this-area', reason: 'straddle', subjects: commensurate };
  }

  // No commensurate node → smallest CONTAINING node, even over-scale (§2:
  // the fallback names the containing place, NOT "this area").
  const containing = placesInView
    .filter((candidate) => bboxContains(candidate.bbox, view))
    .sort((a, b) => bboxArea(a.bbox) - bboxArea(b.bbox) || a.name.localeCompare(b.name));
  if (containing.length > 0) {
    return {
      kind: 'place',
      place: containing[0],
      reason: 'containing-fallback',
      subjects: [],
    };
  }

  // Unnamed ground: nothing commensurate, nothing containing (continental
  // view over a sparse catalog, open water, …).
  return { kind: 'this-area', reason: 'unnamed-ground', subjects: [] };
}

/**
 * §16 DERIVED: the probe-candidate lattice is the interior grid at
 * k / (⌊1/ATTENTION_FRACTION⌋ + 1) for k = 1..⌊1/ATTENTION_FRACTION⌋ — one
 * candidate row/column per attention slot, placed strictly interior. At
 * ATTENTION_FRACTION = 1/3 this is the quarter lattice [0.25, 0.5, 0.75].
 * Coarse on purpose; §2 wants cheap candidates, not an optimizer.
 */
const GRID_FRACTIONS: readonly number[] = Array.from(
  { length: MAX_PROBE_ANCHORS },
  (_, index) => (index + 1) / (MAX_PROBE_ANCHORS + 1)
);

/**
 * §2 probe anchors for the naming reconciler: ≤ MAX_PROBE_ANCHORS (=3)
 * candidates per view — "center + largest-uncovered-region candidates",
 * approximated (per the §2 sketch mechanics' cheapness stance) as fixed
 * interior candidate points NOT answered by any known bbox (stored places ∪
 * fresh negative observations). "Answered" is SCALE-AWARE (bboxAnswersAnchor):
 * only regions that are not over-scale for the view count — a sketched
 * country or state covers every point inside it but answers nothing at
 * street zoom, so probing (and lazy neighborhood entry, §1) continues there.
 * When the whole grid is answered the result is [] and the reconciler is
 * done without spending anything.
 *
 * Selection: the center leads when unanswered (it is where attention is);
 * remaining slots fill greedily with the unanswered candidate farthest from
 * every answering bbox AND every already-picked anchor (max-min distance —
 * the "largest uncovered region" proxy).
 */
export function probeAnchors(
  view: GeoBbox,
  knownBboxes: GeoBbox[],
  maxAnchors: number = MAX_PROBE_ANCHORS
): GeoPoint[] {
  const viewArea = bboxArea(view);
  // Over-scale regions neither answer anchors nor repel them.
  const answering = knownBboxes.filter((bbox) => !isTooBigForView(viewArea, bboxArea(bbox)));

  const latSpan = view.maxLat - view.minLat;
  const lngSpan = bboxLngSpan(view); // wrap-aware for antimeridian views
  const at = (fLat: number, fLng: number): GeoPoint => ({
    lat: view.minLat + latSpan * fLat,
    lng: normalizeLng(view.minLng + lngSpan * fLng),
  });

  const center = at(0.5, 0.5);
  const candidates: GeoPoint[] = [];
  for (const fLat of GRID_FRACTIONS) {
    for (const fLng of GRID_FRACTIONS) {
      if (fLat === 0.5 && fLng === 0.5) continue; // center handled first
      candidates.push(at(fLat, fLng));
    }
  }

  const isAnswered = (point: GeoPoint): boolean =>
    answering.some((bbox) => bboxContainsPoint(bbox, point));

  const anchors: GeoPoint[] = [];
  if (!isAnswered(center)) {
    anchors.push(center);
  }

  const remaining = candidates.filter((point) => !isAnswered(point));
  while (anchors.length < maxAnchors && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -1;
    for (let i = 0; i < remaining.length; i += 1) {
      const point = remaining[i];
      const toKnown = answering.map((bbox) => pointToBboxDistance(point, bbox));
      const toChosen = anchors.map((anchor) => pointDistance(point, anchor));
      const score = Math.min(...toKnown, ...toChosen, Number.POSITIVE_INFINITY);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    anchors.push(remaining.splice(bestIndex, 1)[0]);
  }
  return anchors;
}

/** Convenience for reconciler fixtures: the view's center point. */
export function viewCenter(view: GeoBbox): GeoPoint {
  return bboxCenter(view);
}
