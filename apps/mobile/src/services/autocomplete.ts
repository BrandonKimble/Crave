import api from './api';

export type AutocompleteMatch = {
  entityId: string;
  entityType: string;
  name: string;
  aliases: string[];
  confidence: number;
};

export type AutocompleteResponse = {
  matches: AutocompleteMatch[];
  query: string;
  normalizedQuery: string;
  onDemandQueued?: boolean;
};

export const autocompleteService = {
  async fetchEntities(query: string): Promise<AutocompleteResponse> {
    const { data } = await api.post<AutocompleteResponse>('/autocomplete/entities', {
      query,
      limit: 6,
      enableOnDemand: true,
    });
    return data;
  },
};
