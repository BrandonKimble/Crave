export interface SearchQuery {
  term: string;
  type?: 'dish_specific' | 'venue_specific' | 'broad';
  location?: string;
  availability?: string;
}

export interface SearchResult {
  id: string;
  type: 'restaurant' | 'dish';
  name: string;
  description?: string;
  score: number;
  mentions: number;
  evidence: Array<{
    source: string;
    text: string;
    author?: string;
    score?: number;
  }>;
}
