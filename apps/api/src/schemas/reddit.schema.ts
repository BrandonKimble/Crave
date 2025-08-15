import { z } from 'zod';

/**
 * Reddit Data Schemas
 * 
 * Type-safe validation schemas for Reddit data structures.
 * Replaces custom validators and type definitions.
 */

// ==========================================
// Base Schemas
// ==========================================

export const RedditIdSchema = z.string().regex(/^[a-z0-9]+$/i);

export const RedditAuthorSchema = z.string().default('[deleted]');

export const RedditScoreSchema = z.number().int().default(0);

export const RedditTimestampSchema = z.number().int().positive();

export const RedditPermalinkSchema = z.string().startsWith('/');

// ==========================================
// Post Schemas
// ==========================================

export const RedditPostSchema = z.object({
  id: RedditIdSchema,
  title: z.string().min(1).max(300),
  author: RedditAuthorSchema,
  subreddit: z.string().min(1).max(50),
  created_utc: RedditTimestampSchema,
  score: RedditScoreSchema,
  url: z.string().url(),
  selftext: z.string().optional(),
  permalink: RedditPermalinkSchema,
  num_comments: z.number().int().min(0).default(0),
  over_18: z.boolean().default(false),
  spoiler: z.boolean().default(false),
  locked: z.boolean().default(false),
  stickied: z.boolean().default(false),
  distinguished: z.string().nullable().optional(),
  edited: z.union([z.boolean(), z.number()]).default(false),
  awards: z.array(z.any()).optional(),
});

export type RedditPost = z.infer<typeof RedditPostSchema>;

// Minimal post schema for processing
export const MinimalRedditPostSchema = RedditPostSchema.pick({
  id: true,
  title: true,
  author: true,
  subreddit: true,
  created_utc: true,
  score: true,
  selftext: true,
  permalink: true,
});

export type MinimalRedditPost = z.infer<typeof MinimalRedditPostSchema>;

// ==========================================
// Comment Schemas
// ==========================================

export const RedditCommentSchema = z.object({
  id: RedditIdSchema,
  body: z.string().min(1),
  author: RedditAuthorSchema,
  created_utc: RedditTimestampSchema,
  score: RedditScoreSchema,
  subreddit: z.string().min(1).max(50),
  link_id: z.string().regex(/^t3_[a-z0-9]+$/i),
  parent_id: z.string().regex(/^t[1-3]_[a-z0-9]+$/i).optional(),
  permalink: RedditPermalinkSchema,
  depth: z.number().int().min(0).default(0),
  edited: z.union([z.boolean(), z.number()]).default(false),
  distinguished: z.string().nullable().optional(),
  stickied: z.boolean().default(false),
  collapsed: z.boolean().default(false),
  is_submitter: z.boolean().default(false),
});

export type RedditComment = z.infer<typeof RedditCommentSchema>;

// Minimal comment schema for processing
export const MinimalRedditCommentSchema = RedditCommentSchema.pick({
  id: true,
  body: true,
  author: true,
  created_utc: true,
  score: true,
  subreddit: true,
  link_id: true,
  parent_id: true,
  permalink: true,
});

export type MinimalRedditComment = z.infer<typeof MinimalRedditCommentSchema>;

// ==========================================
// API Response Schemas
// ==========================================

export const RedditListingSchema = z.object({
  kind: z.literal('Listing'),
  data: z.object({
    after: z.string().nullable(),
    before: z.string().nullable(),
    children: z.array(z.object({
      kind: z.enum(['t1', 't3']),
      data: z.any(),
    })),
    dist: z.number().nullable(),
    modhash: z.string().nullable(),
  }),
});

export type RedditListing = z.infer<typeof RedditListingSchema>;

export const RedditApiErrorSchema = z.object({
  error: z.number(),
  message: z.string(),
  reason: z.string().optional(),
});

export type RedditApiError = z.infer<typeof RedditApiErrorSchema>;

// ==========================================
// Search Schemas
// ==========================================

export const RedditSearchOptionsSchema = z.object({
  q: z.string().min(1),
  sort: z.enum(['relevance', 'hot', 'top', 'new', 'comments']).default('relevance'),
  time: z.enum(['all', 'year', 'month', 'week', 'day', 'hour']).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  after: z.string().optional(),
  before: z.string().optional(),
  include_over_18: z.boolean().default(false),
  restrict_sr: z.boolean().default(false),
  type: z.enum(['link', 'self', 'image', 'video', 'videogif', 'gif']).optional(),
  syntax: z.enum(['cloudsearch', 'lucene', 'plain']).default('plain'),
});

export type RedditSearchOptions = z.infer<typeof RedditSearchOptionsSchema>;

// ==========================================
// Batch Processing Schemas
// ==========================================

export const RedditContentBatchSchema = z.object({
  posts: z.array(MinimalRedditPostSchema),
  comments: z.array(MinimalRedditCommentSchema),
  subreddit: z.string(),
  batchId: z.string().uuid(),
  timestamp: z.date(),
  source: z.enum(['api', 'pushshift', 'stream']),
  metadata: z.record(z.any()).optional(),
});

export type RedditContentBatch = z.infer<typeof RedditContentBatchSchema>;

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Validate Reddit post data
 */
export function validateRedditPost(data: unknown): RedditPost {
  return RedditPostSchema.parse(data);
}

/**
 * Safe validation that returns null on failure
 */
export function safeValidateRedditPost(data: unknown): RedditPost | null {
  const result = RedditPostSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate Reddit comment data
 */
export function validateRedditComment(data: unknown): RedditComment {
  return RedditCommentSchema.parse(data);
}

/**
 * Safe validation that returns null on failure
 */
export function safeValidateRedditComment(data: unknown): RedditComment | null {
  const result = RedditCommentSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate array of posts
 */
export function validateRedditPosts(data: unknown[]): RedditPost[] {
  return z.array(RedditPostSchema).parse(data);
}

/**
 * Validate array of comments
 */
export function validateRedditComments(data: unknown[]): RedditComment[] {
  return z.array(RedditCommentSchema).parse(data);
}

/**
 * Transform and validate Reddit API response
 */
export function parseRedditListing(data: unknown): {
  posts: RedditPost[];
  comments: RedditComment[];
  after: string | null;
  before: string | null;
} {
  const listing = RedditListingSchema.parse(data);
  const posts: RedditPost[] = [];
  const comments: RedditComment[] = [];
  
  for (const child of listing.data.children) {
    if (child.kind === 't3') {
      const post = safeValidateRedditPost(child.data);
      if (post) posts.push(post);
    } else if (child.kind === 't1') {
      const comment = safeValidateRedditComment(child.data);
      if (comment) comments.push(comment);
    }
  }
  
  return {
    posts,
    comments,
    after: listing.data.after,
    before: listing.data.before,
  };
}