import api from './api';
import type { Coordinate } from '../types';

// Startup fallback (no device location): coarse IP→metro, Google's bottom rung.
// Returns a city-level coordinate + containing market, or resolved:false so the
// caller uses a neutral national default — never a hardcoded city.
export type IpLocationResponse = {
  resolved: boolean;
  coordinate?: Coordinate | null;
  city?: string | null;
  region?: string | null;
  marketKey?: string | null;
};

// Leg 11: the ListDetail Market chip's option vocabulary (§8.16 "sliced by
// city") — the active markets themselves (search rows carry no per-row market
// provenance; the markets table is the source of truth).
export type ActiveMarket = {
  marketKey: string;
  marketName?: string | null;
  marketShortName?: string | null;
};

export const listActiveMarkets = async (): Promise<ActiveMarket[]> => {
  const response = await api.get('/markets/active');
  const raw =
    response.data && typeof response.data === 'object' && 'data' in response.data
      ? (response.data as { data?: unknown }).data
      : response.data;
  return Array.isArray(raw) ? (raw as ActiveMarket[]) : [];
};

export const resolveIpLocation = async (): Promise<IpLocationResponse | null> => {
  try {
    const response = await api.get('/markets/resolve-ip');
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
