import type { NaturalSearchRequest, SearchResponse } from '../types';
import api from './api';

export const searchService = {
  naturalSearch: async (payload: NaturalSearchRequest): Promise<SearchResponse> => {
    const { data } = await api.post<SearchResponse>('/search/natural', payload);
    return data;
  },
};

export type { NaturalSearchRequest, SearchResponse };
