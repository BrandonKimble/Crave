/**
 * Reddit Data Filter
 * Strips unnecessary properties from Reddit API responses early to reduce memory and processing overhead
 */


/**
 * Combined single-pass filter and transform to LLM format
 * Eliminates double processing by doing filtering and transformation in one pass
 */
export function filterAndTransformToLLM(
  response: any[],
  postUrl: string,
): {
  post: any | null;
  comments: any[];
} {
  if (!response || !Array.isArray(response) || response.length < 2) {
    return { post: null, comments: [] };
  }

  // Single-pass post processing
  const postListing = response[0];
  const postData = postListing?.data?.children?.[0]?.data;
  const post = postData ? transformPostDirectly(postData, postUrl) : null;

  // Single-pass comment processing
  const commentListing = response[1];
  const rawComments = commentListing?.data?.children || [];
  const comments = transformCommentsDirectly(rawComments);

  return { post, comments };
}

/**
 * Direct post transformation (single-pass)
 */
function transformPostDirectly(postData: any, postUrl: string): any {
  return {
    id: postData.name || `t3_${postData.id || ''}`,
    title: postData.title || '',
    content: postData.selftext || postData.title || '',
    subreddit: postData.subreddit || '',
    author: postData.author || 'unknown',
    url: postUrl,
    score: typeof postData.score === 'number' ? Math.max(0, postData.score) : 0,
    created_at: formatTimestamp(postData.created_utc),
    comments: [], // Will be populated separately
  };
}

/**
 * Direct comment transformation (single-pass recursive)
 */
function transformCommentsDirectly(rawComments: any[]): any[] {
  const result: any[] = [];

  function processComment(rawComment: any): any | null {
    // Skip non-comment items
    if (!rawComment?.data || rawComment.kind !== 't1') {
      return null;
    }

    const data = rawComment.data;

    // Skip deleted/removed comments early
    if (data.body === '[deleted]' || data.body === '[removed]') {
      return null;
    }

    // Build URL from permalink or generate as fallback
    const url = data.permalink ? `https://reddit.com${data.permalink}` : '';

    const transformed = {
      id: data.name, // Already has t1_ prefix
      content: data.body,
      author: data.author || '[deleted]',
      score: typeof data.score === 'number' ? Math.max(0, data.score) : 0,
      created_at: formatTimestamp(data.created_utc),
      parent_id: extractParentId(data.parent_id),
      url,
    };

    return transformed;
  }

  function traverse(commentList: any[]) {
    commentList.forEach((rawComment) => {
      const transformed = processComment(rawComment);
      if (transformed) {
        result.push(transformed);
      }

      // Process replies recursively - Reddit's nested structure
      if (rawComment?.data?.replies?.data?.children) {
        traverse(rawComment.data.replies.data.children);
      }
    });
  }

  traverse(rawComments);
  return result;
}

/**
 * Helper functions for single-pass processing
 */
function formatTimestamp(timestamp: number | string): string {
  try {
    const ts = typeof timestamp === 'string' ? parseFloat(timestamp) : timestamp;
    if (isNaN(ts)) {
      return new Date().toISOString();
    }
    return new Date(ts * 1000).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function extractParentId(parentId?: string): string | null {
  if (!parentId) return null;

  // Reddit parent IDs come in format "t1_commentid" or "t3_postid"
  // Keep the prefixes to denote type (t1_ for comment, t3_ for post)
  if (parentId.startsWith('t1_') || parentId.startsWith('t3_')) {
    return parentId; // Keep the full ID with prefix
  }

  // If it's a top-level comment (parent is post), return null
  return null;
}
