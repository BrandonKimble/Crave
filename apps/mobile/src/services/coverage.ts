import api from './api';
import type { MapBounds } from '../types';

export type CoverageResolveResponse = {
  coverageKey?: string | null;
};

export const resolveCoverage = async (bounds: MapBounds): Promise<CoverageResolveResponse> => {
  const response = await api.post('/coverage/resolve', { bounds });
  const payload = response.data as { coverageKey?: string | null } | { data?: unknown };
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const data = (payload as { data?: CoverageResolveResponse }).data;
    return data ?? { coverageKey: null };
  }
  return payload ?? { coverageKey: null };
};
