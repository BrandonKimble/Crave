/**
 * Place Catalog geo primitives (plans/geo-demand-foundation-rebuild.md §1).
 *
 * Pure bbox math shared by the catalog service, the §2 read-time subject law
 * (subjects.ts), and the naming reconciler. Everything here is deliberately
 * bbox-level: §1 keeps the hot naming row lean (bbox on the place row) and
 * defers tier-2 polygon precision to place_geometries — "cheap btree on
 * decimals is fine at this scale; geometry-precise later". Areas are computed
 * in squared degrees; every consumer uses them only as RATIOS between shapes
 * at comparable latitudes (coverage-of-view, view-vs-place commensurability),
 * where the cos(lat) longitude distortion cancels to first order.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Axis-aligned bbox. A point is representable as a zero-area bbox (§3 law). */
export interface GeoBbox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

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

export function bboxCenter(bbox: GeoBbox): GeoPoint {
  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lng: (bbox.minLng + bbox.maxLng) / 2,
  };
}

/** Squared-degree area. Ratio-only usage — see file header. */
export function bboxArea(bbox: GeoBbox): number {
  const latSpan = Math.max(0, bbox.maxLat - bbox.minLat);
  const lngSpan = Math.max(0, bbox.maxLng - bbox.minLng);
  return latSpan * lngSpan;
}

/** Intersection bbox, or null when the two do not overlap. */
export function bboxIntersection(a: GeoBbox, b: GeoBbox): GeoBbox | null {
  const minLat = Math.max(a.minLat, b.minLat);
  const minLng = Math.max(a.minLng, b.minLng);
  const maxLat = Math.min(a.maxLat, b.maxLat);
  const maxLng = Math.min(a.maxLng, b.maxLng);
  if (minLat > maxLat || minLng > maxLng) {
    return null;
  }
  return { minLat, minLng, maxLat, maxLng };
}

/**
 * §1 identity law's conflict rule: "sketch conflicts bbox-merge" — the merged
 * bbox WIDENS to the union hull of both observations, never shrinks. Either
 * side may be absent (a chain node sketched before its forward geocode
 * supplied a bbox).
 */
export function bboxUnion(
  a: GeoBbox | null | undefined,
  b: GeoBbox | null | undefined,
): GeoBbox | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return {
    minLat: Math.min(a.minLat, b.minLat),
    minLng: Math.min(a.minLng, b.minLng),
    maxLat: Math.max(a.maxLat, b.maxLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
  };
}

/** True when `outer` fully contains `inner` (closed-interval containment). */
export function bboxContains(outer: GeoBbox, inner: GeoBbox): boolean {
  return (
    outer.minLat <= inner.minLat &&
    outer.minLng <= inner.minLng &&
    outer.maxLat >= inner.maxLat &&
    outer.maxLng >= inner.maxLng
  );
}

export function bboxContainsPoint(bbox: GeoBbox, point: GeoPoint): boolean {
  return (
    bbox.minLat <= point.lat &&
    bbox.maxLat >= point.lat &&
    bbox.minLng <= point.lng &&
    bbox.maxLng >= point.lng
  );
}

/**
 * Distance (in degrees, chebyshev-ish euclidean on the two axis gaps) from a
 * point to the nearest edge of a bbox; 0 when inside. Used only to RANK probe
 * anchor candidates (§2 "largest-uncovered-region" approximation), so the
 * degree metric is fine.
 */
export function pointToBboxDistance(point: GeoPoint, bbox: GeoBbox): number {
  const dLat = Math.max(bbox.minLat - point.lat, 0, point.lat - bbox.maxLat);
  const dLng = Math.max(bbox.minLng - point.lng, 0, point.lng - bbox.maxLng);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function pointDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
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
