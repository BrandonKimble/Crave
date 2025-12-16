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
