import api from './api';

export type AutocompleteMatch = {
  entityId: string;
  entityType: string;
  name: string;
  aliases: string[];
  confidence: number;
  matchType?: 'entity' | 'query';
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
};

export const autocompleteService = {
  async fetchEntities(query: string, options: RequestOptions = {}): Promise<AutocompleteResponse> {
    const { data } = await api.post<AutocompleteResponse>(
      '/autocomplete/entities',
      {
        query,
        limit: 6,
        enableOnDemand: false,
      },
      { signal: options.signal }
    );
    return data;
  },
};
