import api from './api';
import type { Coordinate, MapBounds } from '../types';

export type MarketResolveResponse = {
  status?: 'resolved' | 'no_market' | 'error' | null;
  market?: {
    marketKey?: string | null;
    marketShortName?: string | null;
    marketName?: string | null;
    marketType?: string | null;
    isCollectable?: boolean | null;
  } | null;
  resolution?: {
    anchorType?: 'user_location' | 'viewport_center' | null;
    viewportContainsUser?: boolean | null;
    candidatePlaceName?: string | null;
    candidatePlaceGeoId?: string | null;
  } | null;
  cta?: {
    kind?: 'create_poll' | 'none' | null;
    label?: string | null;
    prompt?: string | null;
  } | null;
};

const normalizeMarketResolveResponse = (payload: unknown): MarketResolveResponse => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return normalizeMarketResolveResponse((payload as { data?: unknown }).data);
  }
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  return payload as MarketResolveResponse;
};

export const resolveMarket = async (
  bounds: MapBounds,
  userLocation?: Coordinate | null
): Promise<MarketResolveResponse> => {
  const response = await api.post('/markets/resolve', {
    bounds,
    ...(userLocation ? { userLocation } : {}),
    mode: 'polls',
  });
  return normalizeMarketResolveResponse(response.data);
};
