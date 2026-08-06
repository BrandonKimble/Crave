import type { Coordinate, MapBounds } from '../../../types';
import { getBoundsCenter, getBoundsDiagonalMiles } from './geo';

// ---------------------------------------------------------------------------
// OVERLAP-ALLOWED REGION — where shortcut-search pins are allowOverlap:true (all
// shown, RANKED). Beyond it, pins are allowOverlap:false (collision-culled, SCORED)
// so a world-wide shortcut result never piles up. The harness (#21) showed in-view
// all-drawn pins are fine to ~10k and collision-culled pins to ~50k, so a metro-scale
// overlap circle stays comfortably in budget.
//
// Rule: if the submitted viewport already frames a metro-ish area (half-diagonal
// within the radius), use the viewport as the region directly — respect the user's
// framing, no auto-zoom. If they searched from far out, anchor a fixed-radius circle
// on their CURRENT LOCATION (Google-style "zoom to your vicinity") and auto-zoom to
// fit it; fall back to the viewport center when location is unavailable.
// ---------------------------------------------------------------------------

export const OVERLAP_REGION_RADIUS_MILES = 12; // ~19 km, metro-scale.

// A [lng, lat] corner. The submitted visible polygon is the 4 screen corners
// projected to coordinates at submit (getCoordinateFromView), so it captures the TRUE
// on-screen area under pitch/twist — not the axis-aligned box that balloons toward the
// horizon. Falls back to the AABB bounds test when no polygon was captured.
export type LngLat = [number, number];

export type OverlapRegion =
  | { kind: 'viewport'; bounds: MapBounds; polygon: LngLat[] | null }
  | { kind: 'radius'; center: Coordinate; radiusMiles: number };

export const resolveOverlapRegion = ({
  submittedBounds,
  submittedPolygon = null,
  userLocation,
  radiusMiles = OVERLAP_REGION_RADIUS_MILES,
}: {
  submittedBounds: MapBounds | null;
  submittedPolygon?: LngLat[] | null;
  userLocation: Coordinate | null;
  radiusMiles?: number;
}): OverlapRegion | null => {
  if (!submittedBounds) {
    return null;
  }
  const halfDiagonalMiles = getBoundsDiagonalMiles(submittedBounds) / 2;
  if (halfDiagonalMiles <= radiusMiles) {
    return {
      kind: 'viewport',
      bounds: submittedBounds,
      polygon: submittedPolygon && submittedPolygon.length >= 3 ? submittedPolygon : null,
    };
  }
  const center = userLocation ?? getBoundsCenter(submittedBounds);
  return { kind: 'radius', center, radiusMiles };
};

// Web-Mercator zoom level at which a circle of `radiusMiles` (its diameter, plus
// padding) fits across a viewport `viewportWidthPx` wide at `centerLat`. Used to
// auto-zoom the camera onto the overlap radius for far-out shortcut runs.
//
// F2308: returns NULL when the question is unanswerable (no viewport width yet —
// the first frame before layout — or a non-positive radius). It used to return a
// bare `12`, a fabricated camera indistinguishable from a computed one, whose
// digits also collided with OVERLAP_REGION_RADIUS_MILES above (a zoom level in
// one place, miles in the other). The caller decides what to do with "not
// measurable yet"; this function does not invent an answer.
export const zoomToFitRadiusMiles = (
  centerLat: number,
  radiusMiles: number,
  viewportWidthPx: number
): number | null => {
  const METERS_PER_MILE = 1609.344;
  const EQUATOR_METERS_PER_PIXEL_Z0 = 156543.03392; // 256px tile.
  // Owner choice, not a measurement: leave ~30% margin so the overlap circle is
  // not drawn edge-to-edge against the viewport bezel.
  const PADDING_FACTOR = 1.3;
  const diameterMeters = radiusMiles * 2 * METERS_PER_MILE * PADDING_FACTOR;
  const cosLat = Math.max(0.01, Math.cos((centerLat * Math.PI) / 180));
  if (!(viewportWidthPx > 0) || !(diameterMeters > 0)) {
    return null;
  }
  const zoom = Math.log2((EQUATOR_METERS_PER_PIXEL_Z0 * cosLat * viewportWidthPx) / diameterMeters);
  return Math.max(1, Math.min(20, zoom));
};
