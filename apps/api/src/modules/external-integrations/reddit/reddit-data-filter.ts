/**
 * Reddit Data Filter
 * Strips unnecessary properties from Reddit API responses early to reduce memory and processing overhead
 */

export interface MinimalRedditPost {
  id: string;
  name: string; // Full ID with t3_ prefix
  title: string;
  selftext?: string;
  author: string;
  score: number;
  ups?: number;
  created_utc: number;
  subreddit: string;
  permalink: string;
  num_comments?: number;
}

export interface MinimalRedditComment {
  id: string;
  name: string; // Full ID with t1_ prefix
  parent_id: string; // Full parent ID with prefix
  body: string;
  author: string;
  score: number;
  ups?: number;
  created_utc: number;
  permalink?: string;
  depth?: number;
  replies?: any; // Preserve replies structure for recursion
}

/**
 * Filter post data to only essential fields needed for LLM processing
 * Removes ~70% of data volume from Reddit API response
 */
export function filterPostData(rawPost: any): MinimalRedditPost {
  return {
    id: rawPost.id,
    name: rawPost.name,
    title: rawPost.title,
    selftext: rawPost.selftext,
    author: rawPost.author,
    score: rawPost.score,
    ups: rawPost.ups,
    created_utc: rawPost.created_utc,
    subreddit: rawPost.subreddit,
    permalink: rawPost.permalink,
    num_comments: rawPost.num_comments,
  };
}

/**
 * Filter comment data to only essential fields needed for LLM processing
 * Preserves hierarchical structure through replies
 */
export function filterCommentData(rawComment: any): MinimalRedditComment | null {
  // Skip deleted/removed comments early
  if (!rawComment?.data || rawComment.kind !== 't1') {
    return null;
  }
  
  const data = rawComment.data;
  
  // Skip deleted/removed comments
  if (data.body === '[deleted]' || data.body === '[removed]' || !data.author) {
    return null;
  }
  
  const filtered: MinimalRedditComment = {
    id: data.id,
    name: data.name,
    parent_id: data.parent_id,
    body: data.body,
    author: data.author,
    score: data.score,
    ups: data.ups,
    created_utc: data.created_utc,
    permalink: data.permalink,
    depth: data.depth,
  };
  
  // Recursively filter replies if they exist
  if (data.replies?.data?.children) {
    filtered.replies = {
      data: {
        children: data.replies.data.children
          .map(filterCommentData)
          .filter((c: any) => c !== null)
      }
    };
  }
  
  return filtered;
}

/**
 * Filter the entire Reddit API response to minimal required data
 * This should be called immediately after receiving data from Reddit API
 */
export function filterRedditResponse(response: any[]): {
  post: MinimalRedditPost | null;
  comments: MinimalRedditComment[];
} {
  if (!response || !Array.isArray(response) || response.length < 2) {
    return { post: null, comments: [] };
  }
  
  // Extract and filter post
  const postListing = response[0];
  const postData = postListing?.data?.children?.[0]?.data;
  const post = postData ? filterPostData(postData) : null;
  
  // Extract and filter comments
  const commentListing = response[1];
  const rawComments = commentListing?.data?.children || [];
  const comments = rawComments
    .map(filterCommentData)
    .filter((c): c is MinimalRedditComment => c !== null);
  
  return { post, comments };
}