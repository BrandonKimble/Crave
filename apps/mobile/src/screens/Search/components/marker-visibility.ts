import { PIN_MARKER_RENDER_SIZE } from '../constants/search';

/**
 * Marker visibility + "edge fade" behavior is intentionally built around TWO coordinate spaces:
 *
 * 1) **Inner (what the user sees):** the clipped `mapViewport` (has `overflow: hidden`).
 * 2) **Outer (what Mapbox renders):** an overscanned `MapView` that extends beyond the viewport by
 *    ~1 marker radius in each direction.
 *
 * That "outer" overscan is the key to our no-snapping fade:
 * - We start fading markers **in** as soon as their coordinate re-enters the *outer* bounds (still
 *   potentially offscreen in the inner viewport), so by the time they actually cross the visible
 *   edge they are already mid-fade instead of popping in.
 * - We hard-hide markers (opacity=0) only once they leave the *outer* bounds, so any opacity jump
 *   is never visible to the user.
 *
 * IMPORTANT: Keep the overscan used here in sync with:
 * - `search-map.tsx` MapView `style` overscan, and
 * - the `getCoordinateFromView` sampling rectangle used to compute the visibility polygon.
 * If these drift, markers can "snap" at the viewport edge because our JS visibility state will no
 * longer match what the native Mapbox view annotation system is actually drawing.
 */

export type ViewportSize = { width: number; height: number };

export const MARKER_VIEW_OVERSCAN_LEFT_PX = Math.max(0, Math.ceil(PIN_MARKER_RENDER_SIZE / 2) + 1);
export const MARKER_VIEW_OVERSCAN_RIGHT_PX = MARKER_VIEW_OVERSCAN_LEFT_PX;
export const MARKER_VIEW_OVERSCAN_TOP_PX = 2;
export const MARKER_VIEW_OVERSCAN_BOTTOM_PX = Math.max(0, Math.ceil(PIN_MARKER_RENDER_SIZE) + 2);

export const MARKER_VIEW_OVERSCAN_STYLE = {
  left: -MARKER_VIEW_OVERSCAN_LEFT_PX,
  right: -MARKER_VIEW_OVERSCAN_RIGHT_PX,
  top: -MARKER_VIEW_OVERSCAN_TOP_PX,
  bottom: -MARKER_VIEW_OVERSCAN_BOTTOM_PX,
};

type LngLat = [number, number];
type MercatorPoint = [number, number];
type Polygon = Array<LngLat>;
type MercatorPolygon = Array<MercatorPoint>;

// Mapbox view->coordinate conversion is async; we only depend on this single method.
export type MapCoordinateFromView = {
  getCoordinateFromView?: (point: [number, number]) => Promise<LngLat>;
};

export const projectToMercator = (coordinate: LngLat): MercatorPoint => {
  const lng = coordinate[0];
  const lat = Math.max(-85.05112878, Math.min(85.05112878, coordinate[1]));
  const lngRadians = (lng * Math.PI) / 180;
  const latRadians = (lat * Math.PI) / 180;
  const x = lngRadians;
  const y = Math.log(Math.tan(Math.PI / 4 + latRadians / 2));
  return [x, y];
};

export const isPointInPolygon = (point: MercatorPoint, polygon: MercatorPolygon): boolean => {
  const x = point[0];
  const y = point[1];
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      isInside = !isInside;
    }
  }
  return isInside;
};

const isLngLatPair = (value: unknown): value is LngLat =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number';

export const getViewportMercatorPolygonForMarkerVisibility = async (
  mapInstance: MapCoordinateFromView,
  viewport: ViewportSize
): Promise<MercatorPolygon | null> => {
  if (!mapInstance.getCoordinateFromView) {
    return null;
  }
  if (viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }

  const mapViewWidth =
    viewport.width + MARKER_VIEW_OVERSCAN_LEFT_PX + MARKER_VIEW_OVERSCAN_RIGHT_PX;
  const mapViewHeight =
    viewport.height + MARKER_VIEW_OVERSCAN_TOP_PX + MARKER_VIEW_OVERSCAN_BOTTOM_PX;
  const rightEdge = Math.max(0, mapViewWidth - 1);
  const bottomEdge = Math.max(0, mapViewHeight - 1);

  const [topLeft, topRight, bottomRight, bottomLeft] = await Promise.all([
    mapInstance.getCoordinateFromView([0, 0]),
    mapInstance.getCoordinateFromView([rightEdge, 0]),
    mapInstance.getCoordinateFromView([rightEdge, bottomEdge]),
    mapInstance.getCoordinateFromView([0, bottomEdge]),
  ]);

  const polygon: Polygon = [topLeft, topRight, bottomRight, bottomLeft].filter(isLngLatPair);
  if (polygon.length !== 4) {
    return null;
  }

  return polygon.map(projectToMercator);
};
