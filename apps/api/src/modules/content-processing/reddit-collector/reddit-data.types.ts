/**
 * TypeScript interfaces for Reddit data structures from Pushshift archives
 *
 * Based on the actual Reddit API data format as stored in Pushshift archives
 * These interfaces ensure type safety while processing Reddit comments and submissions
 *
 * NOTE: For production use, consider using CraveRedditComment from reddit-data-extractor.service.ts
 * which provides 59% memory reduction by filtering unnecessary fields
 */

/**
 * Reddit Comment interface
 * Represents a comment object from Pushshift archives
 */
export interface RedditComment {
  /** Unique comment identifier */
  id: string;
  /** Comment text content */
  body: string;
  /** Comment author username */
  author: string;
  /** Creation timestamp (Unix timestamp) - can be number or numeric string */
  created_utc: number | string;
  /** Comment score (upvotes - downvotes) */
  score: number;
  /** Subreddit name */
  subreddit: string;
  /** Link ID of the parent submission (with t3_ prefix) */
  link_id: string;
  /** Parent comment ID (with t1_ prefix), null for top-level comments */
  parent_id?: string;
  /** Comment permalink URL */
  permalink?: string;
  /** Whether comment was edited */
  edited?: boolean | number;
  /** Comment author flair text */
  author_flair_text?: string;
  /** Whether author is submitter */
  is_submitter?: boolean;
  /** Comment depth level */
  depth?: number;
  /** Number of replies to this comment */
  replies?: number;
  /** Whether comment is stickied */
  stickied?: boolean;
  /** Comment distinguished status (mod, admin, etc.) */
  distinguished?: string;
  /** Controversiality score */
  controversiality?: number;
}

/**
 * Reddit Submission interface
 * Represents a submission (post) object from Pushshift archives
 */
export interface RedditSubmission {
  /** Unique submission identifier */
  id: string;
  /** Submission title */
  title: string;
  /** Self-text content (for text posts) */
  selftext?: string;
  /** Submission author username */
  author: string;
  /** Creation timestamp (Unix timestamp) - can be number or numeric string */
  created_utc: number | string;
  /** Submission score (upvotes - downvotes) */
  score: number;
  /** Subreddit name */
  subreddit: string;
  /** Number of comments */
  num_comments: number;
  /** Submission URL (for link posts) or Reddit URL (for text posts) */
  url: string;
  /** Submission domain */
  domain?: string;
  /** Whether submission is self-post */
  is_self?: boolean;
  /** Whether submission was edited */
  edited?: boolean | number;
  /** Submission author flair text */
  author_flair_text?: string;
  /** Whether submission is over 18 */
  over_18?: boolean;
  /** Whether submission is stickied */
  stickied?: boolean;
  /** Submission distinguished status */
  distinguished?: string;
  /** Upvote ratio */
  upvote_ratio?: number;
  /** Submission permalink */
  permalink?: string;
  /** Post flair text */
  link_flair_text?: string;
  /** Number of crossposts */
  num_crossposts?: number;
  /** Whether submission is spoiler */
  spoiler?: boolean;
  /** Whether submission is locked */
  locked?: boolean;
  /** Whether submission is pinned */
  pinned?: boolean;
}

/**
 * Union type for Reddit data objects
 */
export type RedditDataObject = RedditComment | RedditSubmission;

/**
 * Type guard to check if an object is a Reddit comment
 */
export function isRedditComment(data: unknown): data is RedditComment {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'body' in data &&
    'author' in data &&
    'created_utc' in data &&
    'subreddit' in data &&
    'link_id' in data &&
    typeof (data as RedditComment).id === 'string' &&
    (data as RedditComment).id.trim() !== '' &&
    typeof (data as RedditComment).body === 'string' &&
    (data as RedditComment).body.trim() !== '' &&
    typeof (data as RedditComment).author === 'string' &&
    (data as RedditComment).author.trim() !== '' &&
    (typeof (data as RedditComment).created_utc === 'number' ||
      (typeof (data as RedditComment).created_utc === 'string' &&
        !isNaN(Number((data as RedditComment).created_utc)))) &&
    typeof (data as RedditComment).subreddit === 'string' &&
    (data as RedditComment).subreddit.trim() !== '' &&
    typeof (data as RedditComment).link_id === 'string' &&
    (data as RedditComment).link_id.trim() !== ''
  );
}

/**
 * Type guard to check if an object is a Reddit submission
 */
export function isRedditSubmission(data: unknown): data is RedditSubmission {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'title' in data &&
    'author' in data &&
    'created_utc' in data &&
    'subreddit' in data &&
    'url' in data &&
    typeof (data as RedditSubmission).id === 'string' &&
    typeof (data as RedditSubmission).title === 'string' &&
    typeof (data as RedditSubmission).author === 'string' &&
    // F451: accept the same number-or-numeric-string created_utc shapes the
    // RedditSubmission type declares (created_utc: number | string) and that
    // isRedditComment already accepts. Rejecting numeric-string timestamps
    // silently dropped legal archive submissions.
    (typeof (data as RedditSubmission).created_utc === 'number' ||
      (typeof (data as RedditSubmission).created_utc === 'string' &&
        !isNaN(Number((data as RedditSubmission).created_utc)))) &&
    typeof (data as RedditSubmission).subreddit === 'string' &&
    typeof (data as RedditSubmission).url === 'string'
  );
}

/**
 * Historical content pipeline types
 */
export interface HistoricalItem {
  id: string;
  body?: string;
  title?: string;
  selftext?: string;
  author: string;
  subreddit: string;
  created_utc: number | string;
  score: number;
  link_id?: string;
  num_comments?: number;
  // Raw data may contain additional fields
  [key: string]: unknown;
}

/**
 * Bulk entity operation interfaces
 */
export interface BulkEntityData {
  entityId: string;
  name: string;
  type: string;
  [key: string]: unknown;
}
