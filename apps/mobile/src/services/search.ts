import type { NaturalSearchRequest, SearchResponse } from '../types';
import api from './api';

export const searchService = {
  naturalSearch: async (payload: NaturalSearchRequest): Promise<SearchResponse> => {
    const { data } = await api.post<SearchResponse>('/search/natural', payload);
    return data;
  },
  recentHistory: async (limit = 8): Promise<string[]> => {
    const { data } = await api.get<string[]>('/search/history', {
      params: { limit },
    });
    return data;
  },
};

export type { NaturalSearchRequest, SearchResponse };
