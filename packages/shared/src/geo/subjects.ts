/**
 * §2.5 POLYGON-NATIVE HEADER LAW (plans/geo-demand-foundation-rebuild.md
 * §2.5, RATIFIED 2026-07-22 — supersedes §2's symmetric-commensurability
 * header arms). PURE functions — no IO, no service state; the catalog
 * service (server) or the sliding slice (client) supplies the candidates,
 * this file judges them. Naming OBSERVES at write time (sketch everything);
 * the header is judged here, at read, and is re-definable forever.
 *
 * THE LAW (owner ruling, verbatim):
 *   - The header = the FINEST place whose REAL GROUND covers
 *     ≥ COVERING_FRACTION (2/3) of the view. "Finest" = smallest place area
 *     among the covering candidates (the dominators) — descent needs no DAG
 *     walk: a covering city always out-fines its covering state.
 *   - STRADDLE RESERVATION: if ≥ 2 of that dominator's CHILDREN (DAG edges —
 *     candidates whose parentPlaceIds include it) each hold
 *     ≥ ATTENTION_FRACTION (1/3) of the view, the view genuinely straddles
 *     them → 'this area'.
 *   - Nothing covers 2/3 → 'this area' (straddle when ≥2 places each hold
 *     attention, unnamed ground otherwise).
 *
 * §2.5(c) polygon = truth, bbox = INDEX only: a candidate's coverage is the
 * POLYGON-clip share when its real ground is known (ground.ts), and the
 * bbox-intersection share ONLY as the honest fallback where no polygon has
 * landed yet (§2.5(f) — degradation, never a judge where a polygon exists).
 * This kills the Mexico-bbox lie: a country whose rectangular index box
 * contains the view but whose real ground touches 5% of it can never name
 * the header once its polygon is known — and even bbox-only, the FINEST
 * dominator rule already prefers the state over the country.
 *
 * DEAD (per the ratification): the too-big arm (descent-to-finest-dominator
 * does its job), the lone-commensurate branch, and the containing-fallback
 * branch (a containing place covers the view entirely, so it IS a dominator
 * — the fallback is subsumed, not lost).
 *
 * KEPT: probeAnchors / bboxAnswersAnchor / isTooBigForView — they are about
 * PROBE coverage (§2 sketch mechanics) and the §4 feed-at-that-zoom
 * boundary, not headers; the reconciler still runs on them.
 *
 * Hysteresis (commit on settle+dwell, enter/exit asymmetry) is the CALLER's
 * concern — this function is the memoryless judgment hysteresis wraps.
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
  bboxContainsPoint,
  bboxIntersectionParts,
  bboxLngSpan,
  normalizeLng,
  pointDistance,
  pointToBboxDistance,
} from './place-geo';
import { PlaceGround, groundArea, groundCoverageOfView } from './ground';

/** §2: "a view attends to ≤ ~3 places". */
export const ATTENTION_FRACTION = 1 / 3;

/**
 * §2.5 dominator threshold: a place claims the view when its real ground
 * covers all but a sub-attention remainder — coverage ≥ 1 − 1/3 = 2/3.
 * One-knob derivation RATIFIED 2026-07-19 (owner docket item 1) and
 * re-ratified inside the §2.5 header law 2026-07-22.
 */
export const COVERING_FRACTION = 1 - ATTENTION_FRACTION;

/** §2 probe budget: ≤ ⌊1/ATTENTION_FRACTION⌋ = 3 anchors per view. */
export const MAX_PROBE_ANCHORS = Math.floor(1 / ATTENTION_FRACTION);

/**
 * §16 K6 DEFINITIONAL — float tolerance so exact-boundary fixtures
 * (coverage == 2/3) judge stably; nothing changes it.
 */
const EPSILON = 1e-9;

/** What the §2.5 judgment needs to know about a candidate place. */
export interface SubjectCandidate {
  placeId: string;
  name: string;
  bbox: GeoBbox;
  /**
   * §2.5 coverage: area(real ground ∩ view)/area(view) when the polygon is
   * known; area(bbox ∩ view)/area(view) as the honest fallback otherwise.
   * Build it with resolvePlaceCoverage so both runtimes feed identical
   * numbers.
   */
  coverageOfView: number;
  /**
   * The "finest" ranking key: real-ground area when known, bbox area
   * otherwise — same cos-weighted degrees² metric either way.
   */
  placeArea: number;
  /**
   * DAG parent edges (§1) — the straddle reservation reads children through
   * these. Optional so bbox-era callers/fixtures stay valid (absent = no
   * known children ⇒ no reservation can fire through this candidate).
   */
  parentPlaceIds?: string[];
}

/**
 * The lean catalog-row shape the subjects law accepts from EITHER runtime —
 * the server's Prisma Place row projects onto it, and the slice endpoint
 * (GET /places/in-view) ships exactly this (minus `area`, which derives from
 * bbox/ground and is never wire data). Deliberately storage-agnostic: no
 * Prisma types may appear in this module.
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
  /**
   * §2.6 GROUND UNIFICATION: real ground is REQUIRED — every place has ONE
   * ground representation (simplified boundary rings; a sketch-grade place
   * ships its bbox envelope as a 5-point rectangle). View-appropriate
   * simplification is the SERVER's concern; full detail never ships. A
   * degraded caller synthesizes the envelope ring (bboxToGround) — same
   * representation, never a second judgment arm.
   */
  ground: PlaceGround;
}

/** resolvePlaceCoverage result: the two §2.5 judgment inputs per candidate. */
export interface PlaceCoverage {
  coverageOfView: number;
  placeArea: number;
}

/**
 * Bbox-intersection coverage — area(bbox ∩ view) / area(view). §2.6: NOT a
 * judgment arm (the judgment law is single-representation, ground-only) —
 * kept as pure index-side math (candidate diagnostics, fixtures). Returns
 * null when the bbox misses the view entirely. A zero-area (point) view
 * degenerates to coverage 1: any place whose bbox admits the point fully
 * covers the attention there.
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
 * THE per-candidate coverage law (§2.5(c) under §2.6 GROUND UNIFICATION)
 * shared by the server catalog read (PlacesCatalogService.placesInView) and
 * the client's slice evaluation: polygon-clip coverage + real-ground area,
 * ALWAYS — every place has ONE ground representation (a sketch-grade place's
 * ground is its bbox envelope rectangle; same math, coarser precision).
 * Returns null when the place is NOT a candidate for this view at all —
 * ground absent/empty (a bbox-less birth: no ground knowledge) or clipping
 * to zero (the index found it, the ground disqualifies it). NO bbox arm:
 * no code path may branch on which representation exists.
 */
export function resolvePlaceCoverage(
  view: GeoBbox,
  viewArea: number,
  place: { ground: PlaceGround }
): PlaceCoverage | null {
  if (place.ground.length === 0) {
    return null; // no ground knowledge — invisible to judgment
  }
  const coverage = groundCoverageOfView(view, viewArea, place.ground);
  if (coverage <= 0) {
    return null; // real ground never touches the view — the index was noise
  }
  return {
    coverageOfView: coverage,
    placeArea: groundArea(place.ground),
  };
}

/**
 * Catalog rows → subject candidates for one view: keep every place whose
 * ground genuinely touches the view (§2.6: ground is the ONE
 * representation — sketch rectangles and full outlines alike), with its §2.5
 * coverage share and finest-ranking area. This is the pure core of the
 * server's placesInView (which merely adds the DB prefilter and geometry
 * hydration) and the WHOLE of the client's read over its slice — feed the
 * result straight to resolveHeaderPlace.
 */
export function subjectCandidatesInView(view: GeoBbox, places: PlaceLike[]): SubjectCandidate[] {
  const viewArea = bboxArea(view);
  const candidates: SubjectCandidate[] = [];
  for (const place of places) {
    const coverage = resolvePlaceCoverage(view, viewArea, place);
    if (coverage === null) continue;
    candidates.push({
      placeId: place.placeId,
      name: place.name,
      bbox: place.bbox,
      coverageOfView: coverage.coverageOfView,
      placeArea: coverage.placeArea,
      parentPlaceIds: place.parentPlaceIds,
    });
  }
  return candidates;
}

export type HeaderResolution =
  | {
      kind: 'place';
      place: SubjectCandidate;
      /** §2.5: the finest dominator named the header (the only place arm). */
      reason: 'finest-dominator';
      /**
       * The named subject — descendant expansion (§6 feed) keys off this.
       * Always exactly [place] for the place verdict.
       */
      subjects: SubjectCandidate[];
    }
  | {
      kind: 'this-area';
      /**
       * 'straddle'       → ≥2 places each hold ≥ ATTENTION_FRACTION of the
       *                    view (the dominator's children reservation, or —
       *                    with no dominator — the attention holders
       *                    themselves);
       * 'unnamed-ground' → nothing claims the view and at most one place
       *                    even holds attention (sparse catalog, open
       *                    water).
       */
      reason: 'straddle' | 'unnamed-ground';
      /** The places genuinely holding attention (coverage-desc). */
      subjects: SubjectCandidate[];
    };

/**
 * The §2 "too big" scale disqualifier — NO LONGER a header arm (§2.5 killed
 * it) but still the law behind (a) the reconciler's answered test
 * (bboxAnswersAnchor: an over-scale sketched country must not suppress
 * street-zoom probing) and (b) the §4 feed-at-that-zoom boundary
 * (poll-feed-membership). A region is over-scale for the view when the view
 * is < ATTENTION_FRACTION of it.
 */
export function isTooBigForView(viewArea: number, regionArea: number): boolean {
  return regionArea > 0 && viewArea + EPSILON < ATTENTION_FRACTION * regionArea;
}

/**
 * Does a KNOWN region (stored place bbox or negative observation) answer a
 * probe anchor for THIS view? Point-in-bbox alone is not enough: an
 * over-scale region (a sketched country under a street-zoom view) knows
 * nothing about the finer places the view actually needs, so it must not
 * suppress the probe. Applied SYMMETRICALLY to places and negative
 * observations.
 */
export function bboxAnswersAnchor(viewArea: number, bbox: GeoBbox, anchor: GeoPoint): boolean {
  return !isTooBigForView(viewArea, bboxArea(bbox)) && bboxContainsPoint(bbox, anchor);
}

/**
 * The §2.5 header judgment. `placesInView` is EVERY candidate whose ground
 * (or fallback bbox) touches the view — including ancestors, so "finest"
 * needs no DAG traversal: a covering city simply out-fines its covering
 * state. The straddle reservation is the ONE DAG read: the dominator's
 * children are the candidates whose parentPlaceIds include it.
 */
export function resolveHeaderPlace(
  view: GeoBbox,
  placesInView: SubjectCandidate[]
): HeaderResolution {
  // Attention holders: places genuinely holding ≥ 1/3 of the view —
  // straddle material and the feed's subject set. Coverage-desc, then
  // name-stability (deterministic lexicographic close).
  const attentionHolders = placesInView
    .filter((candidate) => candidate.coverageOfView + EPSILON >= ATTENTION_FRACTION)
    .sort((a, b) => b.coverageOfView - a.coverageOfView || a.name.localeCompare(b.name));

  // §2.5 dominators: real ground covers ≥ 2/3 of the view. FINEST first —
  // smallest placeArea; area ties close on name for determinism.
  const dominators = placesInView
    .filter((candidate) => candidate.coverageOfView + EPSILON >= COVERING_FRACTION)
    .sort((a, b) => a.placeArea - b.placeArea || a.name.localeCompare(b.name));

  if (dominators.length === 0) {
    // Nothing claims the view. ≥2 attention holders = a genuine straddle
    // (two towns at ~half the view each); otherwise unnamed ground.
    return {
      kind: 'this-area',
      reason: attentionHolders.length >= 2 ? 'straddle' : 'unnamed-ground',
      subjects: attentionHolders,
    };
  }

  const dominator = dominators[0];

  // Straddle reservation (§2.5(b)): ≥2 of the dominator's CHILDREN each
  // hold ≥ 1/3 of the view → the view is genuinely split between them.
  const straddlingChildren = attentionHolders.filter(
    (candidate) =>
      candidate.placeId !== dominator.placeId &&
      (candidate.parentPlaceIds ?? []).includes(dominator.placeId)
  );
  if (straddlingChildren.length >= 2) {
    return { kind: 'this-area', reason: 'straddle', subjects: straddlingChildren };
  }

  return {
    kind: 'place',
    place: dominator,
    reason: 'finest-dominator',
    subjects: [dominator],
  };
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
