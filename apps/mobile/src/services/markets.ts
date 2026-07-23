import api from './api';
import type { Coordinate } from '../types';

// Startup fallback (no device location): coarse IP→coords from the place
// catalog's launch endpoint (markets extermination leg 3 — the old
// /markets/resolve-ip market shape is dead). Returns a city-level coordinate
// plus the smallest containing catalog place's bbox as the camera envelope,
// or resolved:false so the caller uses a neutral national default — never a
// hardcoded city.
export type LaunchPositionBounds = {
  northEast: Coordinate;
  southWest: Coordinate;
};

export type IpLocationResponse = {
  resolved: boolean;
  coordinate?: Coordinate | null;
  city?: string | null;
  region?: string | null;
  bounds?: LaunchPositionBounds | null;
};

export const resolveIpLocation = async (): Promise<IpLocationResponse | null> => {
  try {
    const response = await api.get('/places/launch-position');
    const raw =
      response.data && typeof response.data === 'object' && 'data' in response.data
        ? (response.data as { data?: unknown }).data
        : response.data;
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const result = raw as IpLocationResponse;
    return result.resolved ? result : { resolved: false };
  } catch {
    return null;
  }
};
