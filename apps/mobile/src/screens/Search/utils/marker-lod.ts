import type { Coordinate, MapBounds, RestaurantResult } from '../../../types';

import { getQualityColorFromPercentile } from './quality';

export const getMarkerColorForRestaurant = (restaurant: RestaurantResult): string =>
  getQualityColorFromPercentile(restaurant.displayPercentile);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const padMapBounds = (bounds: MapBounds, padRatio: number): MapBounds => {
  const clampedPadRatio = clamp(padRatio, 0, 1);
  const latSpan = Math.max(bounds.northEast.lat - bounds.southWest.lat, 0);
  const lngSpan = Math.max(bounds.northEast.lng - bounds.southWest.lng, 0);
  const latPad = latSpan * clampedPadRatio;
  const lngPad = lngSpan * clampedPadRatio;

  const paddedSouthLat = clamp(bounds.southWest.lat - latPad, -90, 90);
  const paddedNorthLat = clamp(bounds.northEast.lat + latPad, -90, 90);
  const paddedWestLng = clamp(bounds.southWest.lng - lngPad, -180, 180);
  const paddedEastLng = clamp(bounds.northEast.lng + lngPad, -180, 180);

  return {
    northEast: {
      lat: Math.max(paddedNorthLat, paddedSouthLat),
      lng: Math.max(paddedEastLng, paddedWestLng),
    },
    southWest: {
      lat: Math.min(paddedNorthLat, paddedSouthLat),
      lng: Math.min(paddedEastLng, paddedWestLng),
    },
  };
};

export const isCoordinateWithinBounds = (coordinate: Coordinate, bounds: MapBounds): boolean =>
  coordinate.lat >= bounds.southWest.lat &&
  coordinate.lat <= bounds.northEast.lat &&
  coordinate.lng >= bounds.southWest.lng &&
  coordinate.lng <= bounds.northEast.lng;
