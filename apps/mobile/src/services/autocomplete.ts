import api from './api';
import type { Coordinate, MapBounds } from '../types';

export type AutocompleteMatch = {
  entityId: string;
  entityType: string;
  name: string;
  aliases: string[];
  confidence: number;
  matchType?: 'entity' | 'query';
  badges?: {
    favorite?: boolean;
    viewed?: boolean;
    recentQuery?: boolean;
  };
  querySuggestionSource?: 'personal' | 'global';
  locationCount?: number;
};

export type AutocompleteResponse = {
  matches: AutocompleteMatch[];
  query: string;
  normalizedQuery: string;
  onDemandQueued?: boolean;
  querySuggestions?: string[];
};

type RequestOptions = {
  signal?: AbortSignal;
  bounds?: MapBounds | null;
  userLocation?: Coordinate | null;
};

export const autocompleteService = {
  async fetchEntities(query: string, options: RequestOptions = {}): Promise<AutocompleteResponse> {
    const payload: Record<string, unknown> = {
      query,
      limit: 6,
      enableOnDemand: false,
    };
    if (options.bounds) {
      payload.bounds = options.bounds;
    }
    if (options.userLocation) {
      payload.userLocation = options.userLocation;
    }
    const { data } = await api.post<AutocompleteResponse>('/autocomplete/entities', payload, {
      signal: options.signal,
    });
    return data;
  },
};
