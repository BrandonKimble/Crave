import api from './api';
import { logPerfScenarioSearchRequestLifecycle } from '../perf/perf-scenario-attribution';
import type { Coordinate, MapBounds } from '../types';

export type MarketResolveResponse = {
  status?: 'resolved' | 'multi_market' | 'no_market' | 'error' | null;
  market?: {
    marketKey?: string | null;
    marketShortName?: string | null;
    marketName?: string | null;
    marketType?: string | null;
    isCollectable?: boolean | null;
  } | null;
  markets?: Array<{
    marketKey?: string | null;
    marketShortName?: string | null;
    marketName?: string | null;
    marketType?: string | null;
    isCollectable?: boolean | null;
    overlapAreaMeters?: number | null;
  }> | null;
  resolution?: {
    anchorType?: 'user_location' | 'viewport_center' | 'viewport_coverage' | null;
    viewportContainsUser?: boolean | null;
    candidateLocalityName?: string | null;
    candidateBoundaryProvider?: string | null;
    candidateBoundaryId?: string | null;
    candidateBoundaryType?: string | null;
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

export const resolveMarket = async (
  bounds: MapBounds,
  userLocation?: Coordinate | null
): Promise<MarketResolveResponse> => {
  const response = await api.post('/markets/resolve', {
    bounds,
    ...(userLocation ? { userLocation } : {}),
    mode: 'polls_read',
  });
  const normalized = normalizeMarketResolveResponse(response.data);
  logPerfScenarioSearchRequestLifecycle({
    source: 'markets.resolveMarket',
    phase: 'market_resolve_response',
    marketResolveMode: 'polls_read',
    marketResolveStatus: normalized.status ?? null,
    marketKey: normalized.market?.marketKey ?? null,
    marketName: normalized.market?.marketShortName ?? normalized.market?.marketName ?? null,
    marketType: normalized.market?.marketType ?? null,
    marketIsCollectable: normalized.market?.isCollectable ?? null,
    marketCount: normalized.markets?.length ?? 0,
    candidateLocalityName: normalized.resolution?.candidateLocalityName ?? null,
    candidateBoundaryProvider: normalized.resolution?.candidateBoundaryProvider ?? null,
    candidateBoundaryId: normalized.resolution?.candidateBoundaryId ?? null,
    candidateBoundaryType: normalized.resolution?.candidateBoundaryType ?? null,
  });
  return normalized;
};
