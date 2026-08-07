/**
 * Reddit Data Filter
 * Strips unnecessary properties from Reddit API responses early to reduce memory and processing overhead
 */

import { LLMComment, LLMPost } from '../llm/llm.types';

type RedditListingChild = {
  kind?: unknown;
  data?: Record<string, unknown>;
};

type RedditListing = {
  data?: {
    children?: RedditListingChild[];
  };
};

type RedditCommentListing = {
  kind?: string;
  data?: {
    name?: unknown;
    body?: unknown;
    author?: unknown;
    score?: unknown;
    created_utc?: unknown;
    parent_id?: unknown;
    permalink?: unknown;
    replies?: unknown;
  };
};

type RedditPostData = {
  name?: unknown;
  id?: unknown;
  title?: unknown;
  selftext?: unknown;
  subreddit?: unknown;
  author?: unknown;
  score?: unknown;
  created_utc?: unknown;
};

export interface FilteredRedditData {
  post: LLMPost | null;
  comments: LLMComment[];
}

/**
 * Combined single-pass filter and transform to LLM format
 * Eliminates double processing by doing filtering and transformation in one pass
 */
export function filterAndTransformToLLM(
  response: unknown,
  postUrl: string,
): FilteredRedditData {
  if (!Array.isArray(response) || response.length < 2) {
    return { post: null, comments: [] };
  }

  const postListing = extractListing(response[0]);
  const postChild = Array.isArray(postListing?.data?.children)
    ? postListing.data.children.find(isListingChild)
    : undefined;
  const postData =
    postChild && isRedditPostData(postChild.data) ? postChild.data : undefined;
  const post =
    postData && isRedditPostData(postData)
      ? transformPostDirectly(postData, postUrl)
      : null;
  // transformPostDirectly returns null for an idless post — the same honest
  // "unknown, so drop it" the comment path takes (F4906).

  const commentListing = extractListing(response[1]);
  const rawComments = Array.isArray(commentListing?.data?.children)
    ? commentListing.data.children.filter(isListingChild)
    : [];
  const comments = transformCommentsDirectly(rawComments);

  return { post, comments };
}

function extractListing(value: unknown): RedditListing | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as RedditListing;
  if (!candidate.data || typeof candidate.data !== 'object') {
    return null;
  }

  return candidate;
}

function isRedditPostData(value: unknown): value is RedditPostData {
  return typeof value === 'object' && value !== null;
}

/**
 * Direct post transformation (single-pass)
 */
function transformPostDirectly(
  postData: RedditPostData,
  postUrl: string,
): LLMPost | null {
  // F4906: no synthetic 't3_unknown'. An idless post is unidentifiable — two
  // would collide on one id — so drop it, exactly as transformComment drops an
  // idless comment. Absence is representable (filterAndTransformToLLM already
  // models `post: null`); a fabricated id is not.
  const id =
    typeof postData.name === 'string' && postData.name.length > 0
      ? postData.name
      : typeof postData.id === 'string' && postData.id.length > 0
        ? `t3_${postData.id}`
        : null;
  if (!id) {
    return null;
  }

  const title =
    typeof postData.title === 'string' && postData.title.length > 0
      ? postData.title
      : '';
  const content =
    typeof postData.selftext === 'string' && postData.selftext.length > 0
      ? postData.selftext
      : title;
  const subreddit =
    typeof postData.subreddit === 'string' && postData.subreddit.length > 0
      ? postData.subreddit
      : '';
  // F4906: one representation of an absent author — null, never a sentinel we
  // did not observe ('unknown'/'[deleted]' both asserted facts we don't know).
  const author =
    typeof postData.author === 'string' && postData.author.length > 0
      ? postData.author
      : null;
  // F4906: no Math.max(0, …) clamp — Reddit scores are genuinely signed and the
  // sign is the strongest quality signal; clamping destroys it at ingest.
  const score =
    typeof postData.score === 'number' && Number.isFinite(postData.score)
      ? postData.score
      : 0;

  return {
    id,
    title,
    content,
    subreddit,
    author,
    url: postUrl,
    score,
    created_at: formatTimestamp(postData.created_utc),
    comments: [],
  };
}

/**
 * Direct comment transformation (single-pass recursive)
 */
function transformCommentsDirectly(
  rawComments: RedditListingChild[],
): LLMComment[] {
  const result: LLMComment[] = [];

  const traverse = (
    commentList: RedditListingChild[] | null | undefined,
  ): void => {
    if (!Array.isArray(commentList)) {
      return;
    }

    commentList.forEach((rawComment) => {
      if (!isRedditCommentListing(rawComment)) {
        return;
      }

      const transformed = transformComment(rawComment);
      if (transformed) {
        result.push(transformed);
      }

      const replies = extractReplies(rawComment);
      if (replies) {
        traverse(replies);
      }
    });
  };

  traverse(rawComments);
  return result;
}

function isRedditCommentListing(value: unknown): value is RedditCommentListing {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as RedditCommentListing;
  return typeof candidate.data === 'object' && candidate.data !== null;
}

function transformComment(comment: RedditCommentListing): LLMComment | null {
  if (comment.kind !== 't1' || !comment.data) {
    return null;
  }

  const { data } = comment;

  if (typeof data.body !== 'string' || !data.body.trim()) {
    return null;
  }

  if (data.body === '[deleted]' || data.body === '[removed]') {
    return null;
  }

  const id =
    typeof data.name === 'string' && data.name.length > 0 ? data.name : null;
  if (!id) {
    return null;
  }

  // F4906: absent author is null, not the '[deleted]' sentinel — '[deleted]' is
  // Reddit's specific claim the account was removed, which we do not know here.
  const author =
    typeof data.author === 'string' && data.author.length > 0
      ? data.author
      : null;

  // F4906: no clamp — a −50 comment must stay distinguishable from a 0 comment.
  const score =
    typeof data.score === 'number' && Number.isFinite(data.score)
      ? data.score
      : 0;

  const url =
    typeof data.permalink === 'string' && data.permalink.length > 0
      ? `https://reddit.com${data.permalink}`
      : '';

  return {
    id,
    content: data.body,
    author,
    score,
    created_at: formatTimestamp(data.created_utc),
    parent_id: extractParentId(data.parent_id),
    url,
  };
}

function extractReplies(
  comment: RedditCommentListing,
): RedditListingChild[] | null {
  const replies = comment.data?.replies;
  const replyListing = extractListing(replies);
  if (!replyListing?.data?.children) {
    return null;
  }

  const children = replyListing.data.children.filter(isListingChild);
  if (!children.length) {
    return null;
  }

  return children;
}

function isListingChild(value: unknown): value is RedditListingChild {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as RedditListingChild;
  return typeof candidate.data === 'object' && candidate.data !== null;
}

/**
 * Helper functions for single-pass processing
 */
// F4905: an unparseable timestamp is UNKNOWN, never NOW. Returning `new Date()`
// stamped every undated item with the collection time — a fabricated, maximally
// recent fact feeding a recency-weighted pipeline. Return null instead; the
// nullable `created_at` makes the absence expressible and forces each consumer
// to decide what an undated item means.
function formatTimestamp(timestamp: unknown): string | null {
  if (timestamp instanceof Date) {
    return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
  }

  const numericValue =
    typeof timestamp === 'number'
      ? timestamp
      : typeof timestamp === 'string'
        ? parseFloat(timestamp)
        : null;

  if (numericValue === null || Number.isNaN(numericValue)) {
    return null;
  }

  const milliseconds =
    numericValue > 10_000_000_000 ? numericValue : numericValue * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractParentId(parentId: unknown): string | null {
  if (typeof parentId !== 'string' || parentId.length === 0) {
    return null;
  }

  const trimmed = parentId.trim();
  if (trimmed.startsWith('t1_') || trimmed.startsWith('t3_')) {
    return trimmed;
  }

  return null;
}
