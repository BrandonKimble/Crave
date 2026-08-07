/**
 * THE CENTER-ANCHORED HEADER LAW (owner-ratified 2026-08-07 — supersedes the
 * §2.5 dominator/straddle law of 2026-07-22, which itself superseded §2's
 * symmetric-commensurability arms). PURE functions — no IO, no service
 * state; the catalog service (server) or the sliding slice (client) supplies
 * the candidates, this file judges them. Naming OBSERVES at write time
 * (sketch everything); the header is judged here, at read, and is
 * re-definable forever.
 *
 * THE LAW:
 *   The header = the FINEST place (smallest measured ground area) whose
 *   ground CONTAINS THE VIEW'S CENTRE and which holds
 *   ≥ HEADER_ATTENTION_FRACTION of the view. Nothing centred → 'this area'
 *   (nothing-under-center); centred places all under the fraction →
 *   'this area' (under-threshold).
 *
 * Full derivation with the measured failures of the dominator/straddle law
 * it replaces — Texas naming a 55-mile Austin view, the Austin/Travis
 * nested "straddle", the NYC level-code inversion — on resolveHeaderPlace.
 *
 * §2.5(c) SURVIVES UNCHANGED: polygon = truth, bbox = INDEX only. Coverage
 * and centre-containment are judged on the ONE ground representation (§2.6:
 * a sketch-grade place's ground is its envelope rectangle). The Mexico-bbox
 * lie stays dead: a country whose index box contains the view but whose
 * real ground misses the centre is never even a candidate.
 *
 * KEPT: probeAnchors / probedRegionAnswersAnchor / isTooBigForView — they
 * are about PROBE coverage (§2 sketch mechanics) and the §4
 * feed-at-that-zoom boundary, not headers; the reconciler still runs on
 * them. ATTENTION_FRACTION likewise remains theirs; the header has its own
 * knob (HEADER_ATTENTION_FRACTION) because "worth probing/feeding" and
 * "deserves to name the screen" are different judgments.
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
  bboxLngSpan,
  MIN_COS_LAT,
  METERS_PER_DEGREE_LAT,
  normalizeLng,
  pointDistance,
  pointDistanceMeters,
  pointToBboxDistance,
} from './place-geo';
import { PlaceGround, groundArea, groundContainsPoint, groundCoverageOfView } from './ground';

/** §2: "a view attends to ≤ ~3 places". */
export const ATTENTION_FRACTION = 1 / 3;

/** §2 probe budget: ≤ ⌊1/ATTENTION_FRACTION⌋ = 3 anchors per view. */
export const MAX_PROBE_ANCHORS = Math.floor(1 / ATTENTION_FRACTION);

/**
 * §16 K6 DEFINITIONAL — float tolerance so exact-boundary fixtures
 * (coverage == 2/3) judge stably; nothing changes it.
 */
const EPSILON = 1e-9;

/**
 * The coverage a place must hold of the view before it may NAME the header.
 *
 * §16 OWNER CHOICE, ratified 2026-08-07 ("build the header law with your
 * recommended thresholds"). What bounds it, measured on the live catalog
 * (header-verdict-probe.ts): Austin holds 0.216 of a ~55-mile view and 0.096
 * of an ~82-mile one, so any T in ~[0.10, 0.216] gives the same city-band
 * behaviour; and T also decides when a NEIGHBOURHOOD takes the header —
 * Downtown Austin reaches 0.264 only at a ~3-mile view, so T ≤ 0.26 admits
 * neighbourhoods at block zoom and a higher T shuts them out entirely. 0.2
 * sits inside both bands. Change it from measurement, never from taste.
 */
export const HEADER_ATTENTION_FRACTION = 0.2;

/** What the header judgment needs to know about a candidate place. */
export interface SubjectCandidate {
  placeId: string;
  name: string;
  // NO bbox (dropped 2026-07-26): the judgment ranks ONLY on ground-derived
  // numbers. Carrying a bbox here was dead payload that invited a second,
  // weaker source of truth.
  //
  // NO parentPlaceIds either (dropped 2026-08-07 with the straddle
  // reservation): the DAG is measurably unfit for header judgments — 19,451
  // municipalities carry their STATE as parent and only 14 their county, so
  // Austin and its own county Travis read as siblings, and the "straddle"
  // the DAG detected between them was two NESTED places. Geometry answers
  // the same question correctly via containsViewCenter.
  /**
   * §2.5/§2.6 coverage: area(ground ∩ view)/area(view) — ONE representation
   * (a sketch-grade place's ground IS its envelope rectangle; no bbox arm).
   * Build it with resolvePlaceCoverage so both runtimes feed identical
   * numbers.
   */
  coverageOfView: number;
  /**
   * The "finest" ranking key: ground area (a sketch envelope's area equals
   * its bbox area) — cos-weighted degrees².
   */
  placeArea: number;
  /**
   * Does this place's ground contain the CENTER of the view? The header
   * anchor: "what am I over" is a fact about the middle of the screen, not
   * about coverage fractions. Computed by resolvePlaceCoverage from the same
   * ground the coverage came from.
   */
  containsViewCenter: boolean;
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

/** resolvePlaceCoverage result: the three header-judgment inputs per candidate. */
export interface PlaceCoverage {
  coverageOfView: number;
  placeArea: number;
  containsViewCenter: boolean;
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
    containsViewCenter: groundContainsPoint(place.ground, bboxCenter(view)),
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
      coverageOfView: coverage.coverageOfView,
      placeArea: coverage.placeArea,
      containsViewCenter: coverage.containsViewCenter,
    });
  }
  return candidates;
}

export type HeaderResolution =
  | {
      kind: 'place';
      place: SubjectCandidate;
      /** The finest centered place holding ≥ HEADER_ATTENTION_FRACTION. */
      reason: 'finest-centered';
      /**
       * The named subject — descendant expansion (§6 feed) keys off this.
       * Always exactly [place] for the place verdict.
       */
      subjects: SubjectCandidate[];
    }
  | {
      kind: 'this-area';
      /**
       * 'nothing-under-center' → no candidate's ground contains the view's
       *                          centre (open water, unmapped ground);
       * 'under-threshold'      → centred places exist but the finest-to-
       *                          coarsest of them all hold < the header
       *                          fraction (continental zoom: the country is
       *                          under the centre at a sliver of the view).
       */
      reason: 'nothing-under-center' | 'under-threshold';
      /**
       * Always empty. The straddle arm used to surface "attention holders"
       * here, and the feed expanded their descendants; the straddle is gone
       * (it fired between NESTED places — see resolveHeaderPlace) and a
       * this-area view's feed is exactly its in-view members.
       */
      subjects: SubjectCandidate[];
    };

/**
 * The §2 "too big" scale disqualifier — NO LONGER a header arm (§2.5 killed
 * it) but still the law behind (a) the reconciler's answered test
 * (probedRegionAnswersAnchor: an over-scale sketched country must not suppress
 * street-zoom probing) and (b) the §4 feed-at-that-zoom boundary
 * (poll-feed-membership). A region is over-scale for the view when the view
 * is < ATTENTION_FRACTION of it.
 */
export function isTooBigForView(viewArea: number, regionArea: number): boolean {
  return regionArea > 0 && viewArea + EPSILON < ATTENTION_FRACTION * regionArea;
}

/**
 * A region we have ALREADY ASKED ABOUT (one-ground charter P5, 2026-07-27).
 *
 * Two provenances, two honest shapes — the point of this type is that they
 * are NOT the same shape and were previously forced to be:
 *  - 'disc': a reverse geocode speaks for a RADIUS around its anchor (the
 *    vendor's ~100 m). Squaring that disc overclaimed its corners — a square
 *    of side 2r covers 4r² where the disc covers πr², so ~21% of what we
 *    called "asked" was never asked. A real place sitting in that corner
 *    could be permanently suppressed from discovery.
 *  - 'box': a VIEWPORT we probed and sketched exhaustively. A viewport
 *    genuinely is a rectangle; nothing is gained by pretending otherwise.
 */
export type ProbedRegion =
  | { kind: 'disc'; center: GeoPoint; radiusMeters: number }
  | { kind: 'box'; bbox: GeoBbox };

/** Cos-weighted degrees², the SAME metric bboxArea uses, so the scale gate
 *  compares like with like. */
export function probedRegionArea(region: ProbedRegion): number {
  if (region.kind === 'box') {
    return bboxArea(region.bbox);
  }
  const radiusDeg = region.radiusMeters / METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((region.center.lat * Math.PI) / 180), MIN_COS_LAT);
  // π r² with the lng axis stretched by 1/cos(lat) — the same weighting
  // bboxArea applies, so a disc and a box are directly comparable.
  return Math.PI * radiusDeg * (radiusDeg / cosLat) * cosLat;
}

export function probedRegionContainsPoint(region: ProbedRegion, point: GeoPoint): boolean {
  if (region.kind === 'box') {
    return bboxContainsPoint(region.bbox, point);
  }
  return pointDistanceMeters(region.center, point) <= region.radiusMeters;
}

/** Degrees to the region's nearest edge; 0 inside. Ranking only (§2's
 *  largest-uncovered-region proxy), same use as pointToBboxDistance. */
export function pointToProbedRegionDistance(point: GeoPoint, region: ProbedRegion): number {
  if (region.kind === 'box') {
    return pointToBboxDistance(point, region.bbox);
  }
  const gapMeters = pointDistanceMeters(region.center, point) - region.radiusMeters;
  return gapMeters <= 0 ? 0 : gapMeters / METERS_PER_DEGREE_LAT;
}

/**
 * Does a region we already asked about answer this anchor for THIS view?
 * Two-part law: contains the point AND is not over-scale (an over-scale
 * region — a sketched country under a street-zoom view — knows nothing
 * about the finer places the view needs, so it must not suppress the
 * probe).
 */
export function probedRegionAnswersAnchor(
  viewArea: number,
  region: ProbedRegion,
  anchor: GeoPoint
): boolean {
  return (
    !isTooBigForView(viewArea, probedRegionArea(region)) &&
    probedRegionContainsPoint(region, anchor)
  );
}

/**
 * THE HEADER LAW (rederived 2026-08-07 from measured behaviour — the probe
 * that did it is apps/api/scripts/header-verdict-probe.ts, findings banked
 * in its header):
 *
 *   The header is the FINEST place — by measured ground area — whose ground
 *   contains the view's CENTRE and which holds at least
 *   HEADER_ATTENTION_FRACTION of the view.
 *
 * Why each clause, from the failures of the law it replaced:
 *
 * CENTRE-ANCHORED. "What am I over" is a fact about the middle of the
 * screen — users orient by it and pan to centre what they care about. The
 * old law ranked by coverage alone, so Texas (coverage 1.0 at every
 * city-scale zoom) out-claimed Austin (0.216 at a 55-mile view) and the
 * header read "Texas" from a 200-mile view down to a 55-mile one.
 *
 * FINEST BY MEASURED AREA, NEVER BY LEVEL CODE. The vendor's level ladder
 * INVERTS between cities: Austin (Municipality, 1,441 km²) sits inside its
 * county (2,654 km²), while Manhattan (CountrySecondarySubdivision, 83 km²)
 * sits inside the Municipality of New York (986 km²). Any rule keyed on
 * level codes is wrong in one of those cities. Area is the one ordering
 * that was correct everywhere measured.
 *
 * NO DAG, NO STRADDLE. The old straddle reservation ("≥2 of the dominator's
 * children each hold ≥⅓") keyed on DAG siblinghood, and the DAG records
 * 19,451 municipalities under their STATE (14 under their county) — so it
 * fired between Austin and Travis, two places that NEST, and degraded the
 * header to "this area" at exactly the zoom where "Austin" became true.
 * Two towns genuinely splitting a view need no reservation here: the centre
 * sits in one of them (that one wins) or in neither ("this area"). Anchoring
 * answers the question the straddle was invented for.
 *
 * The threshold keeps a centred sliver honest: at continental zoom the
 * country under the centre holds ~0.19 of the view and should not name it.
 * Measured ladders under this law: Austin — US → Texas → Austin → Downtown
 * Austin; West Village — US → New York → West Village. The old law produced
 * "United States" over a 55-mile view of NYC and «this area» over Austin.
 *
 * `placesInView` is EVERY candidate whose ground touches the view —
 * including ancestors, so "finest" needs no traversal: a centred city simply
 * out-fines its centred state. Pure and stateless; flicker damping at a
 * boundary pan (enter at T, leave lower) is a CLIENT concern, deliberately
 * not built until flicker is observed on a device.
 */
export function resolveHeaderPlace(
  view: GeoBbox,
  placesInView: SubjectCandidate[]
): HeaderResolution {
  const centered = placesInView.filter((candidate) => candidate.containsViewCenter);
  if (centered.length === 0) {
    return { kind: 'this-area', reason: 'nothing-under-center', subjects: [] };
  }
  // Finest first — smallest ground area; ties close on name for determinism.
  const chosen = centered
    .filter((candidate) => candidate.coverageOfView + EPSILON >= HEADER_ATTENTION_FRACTION)
    .sort((a, b) => a.placeArea - b.placeArea || a.name.localeCompare(b.name))[0];
  if (!chosen) {
    return { kind: 'this-area', reason: 'under-threshold', subjects: [] };
  }
  return {
    kind: 'place',
    place: chosen,
    reason: 'finest-centered',
    subjects: [chosen],
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
 * fresh negative observations). "Answered" is SCALE-AWARE (probedRegionAnswersAnchor):
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
  knownRegions: ProbedRegion[],
  maxAnchors: number = MAX_PROBE_ANCHORS
): GeoPoint[] {
  const viewArea = bboxArea(view);
  // Over-scale regions neither answer anchors nor repel them.
  const answering = knownRegions.filter(
    (region) => !isTooBigForView(viewArea, probedRegionArea(region))
  );

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
    answering.some((region) => probedRegionContainsPoint(region, point));

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
      const toKnown = answering.map((region) => pointToProbedRegionDistance(point, region));
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
