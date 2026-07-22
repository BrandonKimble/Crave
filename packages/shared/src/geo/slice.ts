/**
 * Sliding catalog slice (header subject-store design, ratified 2026-07-21).
 *
 * The header is a pure function of (viewport, catalog). The client holds a
 * SLIDING SLICE of the catalog — every place whose bbox intersects a MARGIN
 * box around the last-fetched view — and runs the SAME subjects law
 * (subjects.ts) locally on every camera frame. The server's slice read is
 * GET /places/in-view; this file is the shared vocabulary of that seam: the
 * margin law and the wire contract, one definition for both runtimes.
 *
 * PLACES_SLICE_MARGIN_FACTOR — §16 DERIVED (not a chosen number): the margin
 * IS the re-fetch hysteresis of the sliding-cache pattern. The served region
 * must contain the requested view with enough surround that a pan needs no
 * network until the view leaves the margin box; ×3 per axis is the smallest
 * odd integer factor that centers the view with a full view-span of surround
 * on every side (pan a whole viewport in any direction and the header still
 * judges locally). What changes it: the sliding-cache pattern itself, never
 * tuning.
 */
import { GeoBbox, bboxCenter, bboxLatSpan, bboxLngSpan, normalizeLng } from './place-geo';
import { PlaceLike } from './subjects';

export const PLACES_SLICE_MARGIN_FACTOR = 3;

/**
 * Expand a view to its margin box: same center, each span × `factor`.
 * Wrap-aware — the expansion can legitimately produce a crossing bbox
 * (minLng > maxLng) near the antimeridian, and collapses to the full lng
 * circle when the expanded span reaches 360°. Latitude clamps at the poles
 * (a bbox cannot wrap over them). A zero-area (point) view expands to a
 * point — the degenerate slice is exactly the containing-chain read.
 */
export function expandBboxByFactor(view: GeoBbox, factor: number): GeoBbox {
  const center = bboxCenter(view);
  const latHalf = (bboxLatSpan(view) * factor) / 2;
  const lngSpan = bboxLngSpan(view) * factor;
  const lat = {
    minLat: Math.max(-90, center.lat - latHalf),
    maxLat: Math.min(90, center.lat + latHalf),
  };
  if (lngSpan >= 360) {
    return { ...lat, minLng: -180, maxLng: 180 };
  }
  return {
    ...lat,
    minLng: normalizeLng(center.lng - lngSpan / 2),
    maxLng: normalizeLng(center.lng + lngSpan / 2),
  };
}

/**
 * Wire contract of GET /places/in-view. `marginBox` is the region the rows
 * cover — the client's cache-validity region: while the live view stays
 * inside it (bboxContains), no re-fetch is needed and the local subjects law
 * is authoritative. Rows are lean PlaceLike (bbox + identity + DAG edges);
 * areas/coverages are DERIVED client-side with the same shared functions —
 * derivable data never ships.
 */
export interface PlacesInViewSliceResponse {
  marginBox: GeoBbox;
  places: PlaceLike[];
}
