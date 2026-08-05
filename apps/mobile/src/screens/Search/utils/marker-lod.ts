import type { Coordinate, FoodResult, MapBounds, RestaurantResult } from '../../../types';

import { getScoreBucketColor } from './quality';

// Marker + rank-pill color comes from the SAME discrete score-bucket function the
// map pins are baked from (4 decade buckets), so a result's rank pill matches its
// pin's color exactly. (Was the continuous getCraveScoreColorFromScore, which only
// rendered the green→yellow third of the palette and never matched a bucketed pin.)
export const getMarkerColorForRestaurant = (restaurant: RestaurantResult): string => {
  return getScoreBucketColor(restaurant.craveScore);
};

export const getMarkerColorForDish = (dish: FoodResult): string => {
  return getScoreBucketColor(dish.craveScore);
};

export const isCoordinateWithinBounds = (coordinate: Coordinate, bounds: MapBounds): boolean =>
  coordinate.lat >= bounds.southWest.lat &&
  coordinate.lat <= bounds.northEast.lat &&
  coordinate.lng >= bounds.southWest.lng &&
  coordinate.lng <= bounds.northEast.lng;
