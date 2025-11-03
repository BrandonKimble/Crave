import type { Region } from 'react-native-maps';
import type { MapBounds, Coordinate } from '../types';

const constrainDelta = (value: number, fallback: number) => {
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
};

export const regionToBounds = (region: Region): MapBounds => {
  const latitudeDelta = constrainDelta(region.latitudeDelta, 0.02);
  const longitudeDelta = constrainDelta(region.longitudeDelta, 0.02);
  const halfLat = latitudeDelta / 2;
  const halfLng = longitudeDelta / 2;

  return {
    northEast: {
      lat: region.latitude + halfLat,
      lng: region.longitude + halfLng,
    },
    southWest: {
      lat: region.latitude - halfLat,
      lng: region.longitude - halfLng,
    },
  };
};

export const boundsCenter = (bounds: MapBounds): Coordinate => ({
  lat: (bounds.northEast.lat + bounds.southWest.lat) / 2,
  lng: (bounds.northEast.lng + bounds.southWest.lng) / 2,
});

export const boundsToRegion = (bounds: MapBounds): Region => {
  const center = boundsCenter(bounds);
  const latitudeDelta = constrainDelta(bounds.northEast.lat - bounds.southWest.lat, 0.05);
  const longitudeDelta = constrainDelta(bounds.northEast.lng - bounds.southWest.lng, 0.05);

  return {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta,
    longitudeDelta,
  };
};
