/**
 * Place Catalog geo primitives (plans/geo-demand-foundation-rebuild.md §1).
 *
 * Pure bbox math shared by the catalog service, the §2 read-time subject law
 * (subjects.ts), and the naming reconciler. Everything here is deliberately
 * bbox-level: §1 keeps the hot naming row lean (bbox on the place row) and
 * defers tier-2 polygon precision to place_geometries — "cheap btree on
 * decimals is fine at this scale; geometry-precise later".
 *
 * Two global correctness laws live HERE so every consumer inherits them:
 *
 *  - WRAP-AWARE LONGITUDE (R1: anywhere on earth): a bbox whose minLng >
 *    maxLng CROSSES the antimeridian (Fiji, Chukotka); its lng coverage is
 *    the two arcs [minLng, 180] ∪ [-180, maxLng]. Span, area, intersection,
 *    containment, center, union, and distances all handle the crossing case;
 *    union picks the SMALLER enclosing arc so seam-straddling sketches never
 *    balloon into near-world bboxes.
 *
 *  - COS-WEIGHTED AREA: areas are latSpan × lngSpan × cos(midLat) — first-
 *    order equal-area, so cross-latitude RATIOS (coverage-of-view,
 *    view-vs-place commensurability) judge sanely even for high-latitude
 *    places (a Norway-spanning bbox no longer distorts the 1/3 law by the
 *    ~cos(60°) longitude compression that flat squared-degrees ignored).
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Axis-aligned bbox. A point is representable as a zero-area bbox (§3 law).
 * minLng > maxLng means the bbox crosses the antimeridian (see file header).
 */
export interface GeoBbox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** WGS-84 meters per degree of latitude (§16 definitional constant). */
export const METERS_PER_DEGREE_LAT = 111_320;

export function isGeoPoint(target: GeoPoint | GeoBbox): target is GeoPoint {
  return (
    typeof (target as GeoPoint).lat === 'number' &&
    typeof (target as GeoPoint).lng === 'number' &&
    (target as GeoBbox).minLat === undefined
  );
}

/** Point → zero-area bbox (the §3 "point = zero-area" convention). */
export function pointToBbox(point: GeoPoint): GeoBbox {
  return {
    minLat: point.lat,
    minLng: point.lng,
    maxLat: point.lat,
    maxLng: point.lng,
  };
}

/** True when the bbox's lng interval crosses the antimeridian. */
export function bboxCrossesAntimeridian(bbox: GeoBbox): boolean {
  return bbox.minLng > bbox.maxLng;
}

/** Normalize a longitude into [-180, 180]; in-range values (incl. ±180) pass through. */
export function normalizeLng(lng: number): number {
  if (lng >= -180 && lng <= 180) {
    return lng;
  }
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Wrap-aware longitude span in degrees, ∈ [0, 360]. */
export function bboxLngSpan(bbox: GeoBbox): number {
  const raw = bbox.maxLng - bbox.minLng;
  return raw >= 0 ? raw : raw + 360;
}

export function bboxLatSpan(bbox: GeoBbox): number {
  return Math.max(0, bbox.maxLat - bbox.minLat);
}

/**
 * The bbox's lng coverage as 1–2 NON-crossing closed intervals: a crossing
 * bbox splits at the seam into [minLng, 180] and [-180, maxLng]. Exported so
 * the catalog's DB WHERE clauses can split a crossing view into two plain
 * range predicates (btree columns can't wrap).
 */
export interface LngArc {
  start: number;
  end: number;
}

export function bboxLngArcs(bbox: GeoBbox): LngArc[] {
  if (!bboxCrossesAntimeridian(bbox)) {
    return [{ start: bbox.minLng, end: bbox.maxLng }];
  }
  return [
    { start: bbox.minLng, end: 180 },
    { start: -180, end: bbox.maxLng },
  ];
}

export function bboxCenter(bbox: GeoBbox): GeoPoint {
  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    // Wrap-aware: center of {179, -179} is ±180, not 0.
    lng: normalizeLng(bbox.minLng + bboxLngSpan(bbox) / 2),
  };
}

/**
 * Cos-weighted degree² area: latSpan × wrap-aware lngSpan × cos(midLat).
 * First-order equal-area (see file header); consumers use areas only as
 * RATIOS between shapes, which now stay sane across latitudes.
 */
export function bboxArea(bbox: GeoBbox): number {
  const midLat = (bbox.minLat + bbox.maxLat) / 2;
  const cosMidLat = Math.max(0, Math.cos((midLat * Math.PI) / 180));
  return bboxLatSpan(bbox) * bboxLngSpan(bbox) * cosMidLat;
}

/**
 * Wrap-aware intersection as 0–2 NON-crossing parts (a seam-straddling
 * overlap genuinely splits in two: e.g. a crossing place ∩ a non-crossing
 * view touching both sides of the seam). The true intersection area is
 * Σ bboxArea(part) — parts never overlap each other.
 */
export function bboxIntersectionParts(a: GeoBbox, b: GeoBbox): GeoBbox[] {
  const minLat = Math.max(a.minLat, b.minLat);
  const maxLat = Math.min(a.maxLat, b.maxLat);
  if (minLat > maxLat) {
    return [];
  }
  const parts: GeoBbox[] = [];
  for (const arcA of bboxLngArcs(a)) {
    for (const arcB of bboxLngArcs(b)) {
      const start = Math.max(arcA.start, arcB.start);
      const end = Math.min(arcA.end, arcB.end);
      if (start <= end) {
        parts.push({ minLat, minLng: start, maxLat, maxLng: end });
      }
    }
  }
  return parts;
}

/**
 * §1 identity law's conflict rule: "sketch conflicts bbox-merge" — the merged
 * bbox WIDENS to the union hull of both observations, never shrinks. Either
 * side may be absent (a chain node sketched before its forward geocode
 * supplied a bbox). Wrap-aware: the lng hull is the SMALLER enclosing arc,
 * so two boxes straddling the antimeridian union into a tight crossing bbox
 * rather than a near-world one.
 */
export function bboxUnion(
  a: GeoBbox | null | undefined,
  b: GeoBbox | null | undefined
): GeoBbox | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const lng = lngHullUnion(a, b);
  return {
    minLat: Math.min(a.minLat, b.minLat),
    minLng: lng.minLng,
    maxLat: Math.max(a.maxLat, b.maxLat),
    maxLng: lng.maxLng,
  };
}

/** Smaller-enclosing-arc hull of the two boxes' lng coverage. */
function lngHullUnion(a: GeoBbox, b: GeoBbox): { minLng: number; maxLng: number } {
  const spanA = bboxLngSpan(a);
  const spanB = bboxLngSpan(b);
  // Candidate hulls start at either box's west edge and extend east to cover
  // the other; the smaller candidate is the tight hull.
  const eastwardAToB = (((b.minLng - a.minLng) % 360) + 360) % 360;
  const eastwardBToA = (((a.minLng - b.minLng) % 360) + 360) % 360;
  const spanFromA = Math.max(spanA, eastwardAToB + spanB);
  const spanFromB = Math.max(spanB, eastwardBToA + spanA);
  if (Math.min(spanFromA, spanFromB) >= 360) {
    return { minLng: -180, maxLng: 180 }; // hull wraps the whole circle
  }
  const [start, span] = spanFromA <= spanFromB ? [a.minLng, spanFromA] : [b.minLng, spanFromB];
  const end = start + span;
  return end <= 180 ? { minLng: start, maxLng: end } : { minLng: start, maxLng: normalizeLng(end) }; // crossing representation
}

/** True when `outer` fully contains `inner` (closed-interval, wrap-aware). */
export function bboxContains(outer: GeoBbox, inner: GeoBbox): boolean {
  if (outer.minLat > inner.minLat || outer.maxLat < inner.maxLat) {
    return false;
  }
  const outerArcs = bboxLngArcs(outer);
  // Each inner arc must sit wholly inside ONE outer arc (arcs are the
  // maximal non-crossing pieces; an interval can't span the gap between
  // them).
  return bboxLngArcs(inner).every((arc) =>
    outerArcs.some((o) => o.start <= arc.start && o.end >= arc.end)
  );
}

export function bboxContainsPoint(bbox: GeoBbox, point: GeoPoint): boolean {
  if (point.lat < bbox.minLat || point.lat > bbox.maxLat) {
    return false;
  }
  return bboxLngArcs(bbox).some((arc) => arc.start <= point.lng && arc.end >= point.lng);
}

/** Signed shortest angular difference a − b, wrapped into [-180, 180). */
export function circularLngDelta(a: number, b: number): number {
  const raw = a - b;
  return ((((raw + 180) % 360) + 360) % 360) - 180;
}

/**
 * Distance (in degrees, euclidean on the two axis gaps) from a point to the
 * nearest edge of a bbox; 0 when inside. The lng gap is circular (a point at
 * -179 is 3° from a bbox ending at 178, not 357°). Used only to RANK probe
 * anchor candidates (§2 "largest-uncovered-region" approximation), so the
 * degree metric is fine.
 */
export function pointToBboxDistance(point: GeoPoint, bbox: GeoBbox): number {
  const dLat = Math.max(bbox.minLat - point.lat, 0, point.lat - bbox.maxLat);
  const inside = bboxLngArcs(bbox).some((arc) => arc.start <= point.lng && arc.end >= point.lng);
  const dLng = inside
    ? 0
    : Math.min(
        Math.abs(circularLngDelta(point.lng, bbox.minLng)),
        Math.abs(circularLngDelta(point.lng, bbox.maxLng))
      );
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function pointDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = a.lat - b.lat;
  const dLng = circularLngDelta(a.lng, b.lng);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * §1 identity law's name normalization: trim + collapse internal whitespace.
 * Case is PRESERVED for display ("localized display" name); identity
 * comparison happens case-insensitively at the query layer (see
 * PlacesCatalogService.findByIdentity).
 */
export function normalizePlaceName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
