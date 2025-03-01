export interface RedditPost {
  id: string;
  title: string;
  content: string;
  created_utc: number;
  author: string;
  subreddit: string;
  score: number;
  url: string;
}

export interface RedditComment {
  id: string;
  parent_id: string;
  content: string;
  author: string;
  created_utc: number;
  score: number;
}
