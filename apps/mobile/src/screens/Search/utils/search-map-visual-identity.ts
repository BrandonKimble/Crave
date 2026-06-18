import type { Feature, Point } from 'geojson';

import type { RestaurantFeatureProperties } from '../components/search-map';

type RestaurantVisualIdentityProperties = {
  restaurantId: string;
};

export type SearchMapVisualIdentityKey = string;

export const buildSearchMapVisualIdentityKey = <TProps extends RestaurantVisualIdentityProperties>(
  feature: Feature<Point, TProps>
): SearchMapVisualIdentityKey => {
  const [lng, lat] = feature.geometry.coordinates;
  return [
    feature.properties.restaurantId,
    Number.isFinite(lng) ? lng.toFixed(6) : String(lng),
    Number.isFinite(lat) ? lat.toFixed(6) : String(lat),
  ].join(':');
};

export const normalizeSearchMapVisualFeatureIdentity = (
  feature: Feature<Point, RestaurantFeatureProperties>,
  visualIdentityKey: SearchMapVisualIdentityKey = buildSearchMapVisualIdentityKey(feature)
): Feature<Point, RestaurantFeatureProperties> => {
  if (feature.id === visualIdentityKey && feature.properties.markerKey === visualIdentityKey) {
    return feature;
  }

  return {
    ...feature,
    id: visualIdentityKey,
    properties: {
      ...feature.properties,
      markerKey: visualIdentityKey,
    },
  };
};
