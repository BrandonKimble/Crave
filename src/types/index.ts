export interface SearchQuery {
  term: string;
  filters?: {
    subreddit?: string;
    timeRange?: string;
  };
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  score: number;
  created: Date;
}