import type { MapState as MapboxMapState } from '@rnmapbox/maps';

import type { Coordinate, MapBounds } from '../../../types';
import { MAP_MOVE_DISTANCE_RATIO, MAP_MOVE_MIN_DISTANCE_MILES } from '../constants/search';

export const isLngLatTuple = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === 'number' &&
  Number.isFinite(value[0]) &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[1]);

export const boundsFromPairs = (first: [number, number], second: [number, number]): MapBounds => {
  const lngs = [first[0], second[0]];
  const lats = [first[1], second[1]];
  return {
    northEast: {
      lat: Math.max(lats[0], lats[1]),
      lng: Math.max(lngs[0], lngs[1]),
    },
    southWest: {
      lat: Math.min(lats[0], lats[1]),
      lng: Math.min(lngs[0], lngs[1]),
    },
  };
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const haversineDistanceMiles = (a: Coordinate, b: Coordinate): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const earthRadiusMiles = 3958.8;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const haversine = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(1 - haversine, 0)));
  return earthRadiusMiles * c;
};

export const getBoundsCenter = (bounds: MapBounds): Coordinate => ({
  lat: (bounds.northEast.lat + bounds.southWest.lat) / 2,
  lng: (bounds.northEast.lng + bounds.southWest.lng) / 2,
});

export const getBoundsDiagonalMiles = (bounds: MapBounds): number =>
  haversineDistanceMiles(bounds.northEast, bounds.southWest);

export const mapStateBoundsToMapBounds = (state?: MapboxMapState | null): MapBounds | null => {
  const bounds = state?.properties?.bounds;
  if (!bounds || !isLngLatTuple(bounds.ne as unknown) || !isLngLatTuple(bounds.sw as unknown)) {
    return null;
  }
  return boundsFromPairs(bounds.ne as [number, number], bounds.sw as [number, number]);
};

/**
 * Calculates full screen bounds from MapboxMapState, ignoring camera padding.
 * Includes generous padding to keep markers rendered beyond visible viewport.
 *
 * @param paddingMultiplier - How much to extend bounds (2.0 = show markers up to 2 screens away)
 */
export const mapStateToFullScreenBounds = (
  state: MapboxMapState | null | undefined,
  screenWidth: number,
  screenHeight: number,
  paddingMultiplier = 2.0
): MapBounds | null => {
  const center = state?.properties?.center as unknown;
  const zoom = state?.properties?.zoom as unknown;

  if (!isLngLatTuple(center) || typeof zoom !== 'number' || !Number.isFinite(zoom)) {
    return null;
  }

  return calculateFullScreenBounds(center, zoom, screenWidth, screenHeight, paddingMultiplier);
};

export const hasBoundsMovedSignificantly = (previous: MapBounds, next: MapBounds): boolean => {
  const centerShift = haversineDistanceMiles(getBoundsCenter(previous), getBoundsCenter(next));
  const previousDiagonal = Math.max(getBoundsDiagonalMiles(previous), 0.01);
  const nextDiagonal = Math.max(getBoundsDiagonalMiles(next), 0.01);
  const normalizedShift = centerShift / previousDiagonal;
  const sizeDeltaRatio = Math.abs(nextDiagonal - previousDiagonal) / previousDiagonal;
  return (
    centerShift >= MAP_MOVE_MIN_DISTANCE_MILES &&
    (normalizedShift >= MAP_MOVE_DISTANCE_RATIO || sizeDeltaRatio >= MAP_MOVE_DISTANCE_RATIO)
  );
};

/**
 * Calculates the full screen map bounds based on center, zoom, and screen dimensions.
 * This ignores any camera padding and returns the actual geographic bounds of the entire screen.
 * Accounts for marker pin dimensions to prevent culling when anchor point crosses screen edge.
 *
 * @param center - The map center [lng, lat]
 * @param zoom - The map zoom level
 * @param screenWidth - Screen width in pixels
 * @param screenHeight - Screen height in pixels
 * @param paddingMultiplier - Multiplier for extending bounds (1.0 = screen size, 2.0 = 2x screen size on each side)
 * @returns MapBounds representing the full screen viewport with optional padding
 */
export const calculateFullScreenBounds = (
  center: [number, number],
  zoom: number,
  screenWidth: number,
  screenHeight: number,
  paddingMultiplier = 1.0
): MapBounds => {
  const [lng, lat] = center;

  // At zoom level z, the world is 256 * 2^z pixels wide
  // One degree of longitude = (256 * 2^z) / 360 pixels
  const worldWidthPixels = 256 * Math.pow(2, zoom);
  const degreesPerPixelLng = 360 / worldWidthPixels;

  // For latitude, we need to account for Mercator projection
  // The formula is more complex, but we can use a reasonable approximation:
  // At a given latitude, the scale factor is 1/cos(lat)
  const latRadians = toRadians(lat);
  const latitudeScaleFactor = 1 / Math.cos(latRadians);
  const degreesPerPixelLat = degreesPerPixelLng * latitudeScaleFactor;

  // Pin marker dimensions (from constants/search.ts)
  // Pin is 28x28px with anchor at { x: 0.5, y: 1.0 } (bottom-center)
  // This means pin extends 14px left/right and 28px up from anchor
  const PIN_HALF_WIDTH_PX = 14;
  const PIN_HEIGHT_PX = 28;

  // Convert pin dimensions to degrees at current zoom
  const pinHalfWidthDegrees = PIN_HALF_WIDTH_PX * degreesPerPixelLng;
  const pinHeightDegrees = PIN_HEIGHT_PX * degreesPerPixelLat;

  // Calculate the span in degrees with padding multiplier
  // Add pin dimensions to prevent culling when anchor crosses screen edge
  const lngPadding = paddingMultiplier * 1.5; // 50% extra for horizontal
  const lngSpan = ((screenWidth / 2) * degreesPerPixelLng) * lngPadding + pinHalfWidthDegrees;
  const latSpan = ((screenHeight / 2) * degreesPerPixelLat) * paddingMultiplier + pinHeightDegrees;

  // Build bounds
  const west = lng - lngSpan;
  const east = lng + lngSpan;
  const south = Math.max(-90, lat - latSpan); // Clamp to valid lat range
  const north = Math.min(90, lat + latSpan);

  return {
    northEast: { lat: north, lng: east },
    southWest: { lat: south, lng: west },
  };
};
