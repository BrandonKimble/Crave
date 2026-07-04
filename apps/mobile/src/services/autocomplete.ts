import api from './api';
import type { RestaurantStatusPreview } from './search';
import type { Coordinate, MapBounds } from '../types';

// The recall arm that produced a match, forwarded by the backend autocomplete
// (search master plan §Step 2). Drives the typed-Return promoter gate: only an
// 'exact' tier is eligible to jump straight to a profile on typed submit.
export type AutocompleteEvidenceTier =
  | 'exact'
  | 'prefix'
  | 'name'
  | 'alias'
  | 'fuzzy'
  | 'phonetic'
  | 'embedding';

export type AutocompleteMatch = {
  entityId: string;
  entityType: string;
  name: string;
  aliases: string[];
  confidence: number;
  // Forwarded by the backend; optional because older API builds omit it. Typed
  // as a string-widened union so an unrecognized future tier still parses.
  evidenceTier?: AutocompleteEvidenceTier | string;
  // 'poll' matches surface active community polls in the §8.1 autocomplete lane;
  // their `entityId` is the pollId and `name` is the poll question.
  matchType?: 'entity' | 'query' | 'poll';
  badges?: {
    favorite?: boolean;
    viewed?: boolean;
    recentQuery?: boolean;
  };
  querySuggestionSource?: 'personal' | 'global';
  locationCount?: number;
  statusPreview?: RestaurantStatusPreview | null;
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
  entityType?: string;
  entityTypes?: string[];
  bounds?: MapBounds | null;
  userLocation?: Coordinate | null;
};

export const autocompleteService = {
  async fetchEntities(query: string, options: RequestOptions = {}): Promise<AutocompleteResponse> {
    const payload: Record<string, unknown> = {
      query,
      limit: 7,
      enableOnDemand: false,
    };
    if (options.entityType) {
      payload.entityType = options.entityType;
    }
    if (options.entityTypes && options.entityTypes.length > 0) {
      payload.entityTypes = options.entityTypes;
    }
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
