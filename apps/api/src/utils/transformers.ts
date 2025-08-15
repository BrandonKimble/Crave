import { format, parseISO, isValid } from 'date-fns';
import { chunk, flatten, omit, pick } from 'lodash-es';

/**
 * Transformer Utilities
 * 
 * Pure functions for transforming data between formats.
 * Replaces transformation logic scattered across services.
 */

/**
 * Transform Unix timestamp to Date
 */
export function unixToDate(timestamp: number | string): Date {
  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  return new Date(ts * 1000);
}

/**
 * Transform Date to Unix timestamp
 */
export function dateToUnix(date: Date | string): number {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return Math.floor(d.getTime() / 1000);
}

/**
 * Normalize Reddit ID (remove prefixes)
 */
export function normalizeRedditId(id: string): string {
  return id.replace(/^t[0-9]_/, '');
}

/**
 * Add Reddit ID prefix
 */
export function addRedditPrefix(id: string, type: 'post' | 'comment'): string {
  const prefix = type === 'post' ? 't3_' : 't1_';
  return id.startsWith(prefix) ? id : `${prefix}${id}`;
}

/**
 * Transform Reddit API response to internal format
 */
export function transformRedditPost(post: any): {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  url: string;
  selftext?: string;
  permalink: string;
  num_comments: number;
} {
  return {
    id: normalizeRedditId(post.id || post.name || ''),
    title: post.title || '',
    author: post.author || '[deleted]',
    subreddit: post.subreddit || post.subreddit_name_prefixed?.replace('r/', '') || '',
    created_utc: post.created_utc || post.created || 0,
    score: post.score || post.ups || 0,
    url: post.url || '',
    selftext: post.selftext || undefined,
    permalink: post.permalink || '',
    num_comments: post.num_comments || 0,
  };
}

/**
 * Transform Reddit comment to internal format
 */
export function transformRedditComment(comment: any): {
  id: string;
  body: string;
  author: string;
  created_utc: number;
  score: number;
  subreddit: string;
  link_id: string;
  parent_id?: string;
  permalink: string;
} {
  return {
    id: normalizeRedditId(comment.id || comment.name || ''),
    body: comment.body || '',
    author: comment.author || '[deleted]',
    created_utc: comment.created_utc || comment.created || 0,
    score: comment.score || comment.ups || 0,
    subreddit: comment.subreddit || '',
    link_id: comment.link_id || '',
    parent_id: comment.parent_id || undefined,
    permalink: comment.permalink || '',
  };
}

/**
 * Transform array to chunks for batch processing
 */
export function toChunks<T>(
  items: T[],
  chunkSize: number
): T[][] {
  return chunk(items, chunkSize);
}

/**
 * Flatten nested arrays
 */
export function flattenDeep<T>(arrays: any[]): T[] {
  return flatten(arrays);
}

/**
 * Transform object by picking specific keys
 */
export function pickFields<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  return pick(obj, keys);
}

/**
 * Transform object by omitting specific keys
 */
export function omitFields<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  return omit(obj, keys) as Omit<T, K>;
}

/**
 * Transform to snake_case
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Transform to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    .replace(/^([A-Z])/, (_, letter) => letter.toLowerCase());
}

/**
 * Transform object keys to snake_case
 */
export function keysToSnakeCase<T extends object>(obj: T): any {
  const result: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = value;
  }
  
  return result;
}

/**
 * Transform object keys to camelCase
 */
export function keysToCamelCase<T extends object>(obj: T): any {
  const result: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    result[camelKey] = value;
  }
  
  return result;
}

/**
 * Transform to URL-safe slug
 */
export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Transform HTML to plain text (basic)
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Transform to title case
 */
export function toTitleCase(str: string): string {
  return str.replace(
    /\w\S*/g,
    txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Transform score to quality rating
 */
export function scoreToQuality(score: number, max: number = 100): {
  rating: 'poor' | 'fair' | 'good' | 'excellent';
  percentage: number;
  stars: number;
} {
  const percentage = (score / max) * 100;
  
  let rating: 'poor' | 'fair' | 'good' | 'excellent';
  let stars: number;
  
  if (percentage >= 90) {
    rating = 'excellent';
    stars = 5;
  } else if (percentage >= 70) {
    rating = 'good';
    stars = 4;
  } else if (percentage >= 50) {
    rating = 'fair';
    stars = 3;
  } else {
    rating = 'poor';
    stars = 2;
  }
  
  return { rating, percentage, stars };
}

/**
 * Transform nested comments to flat array
 */
export function flattenComments(
  comments: any[],
  parentId: string | null = null
): Array<{
  id: string;
  body: string;
  author: string;
  parent_id: string | null;
  depth: number;
}> {
  const result: any[] = [];
  
  function traverse(items: any[], depth: number = 0, parent: string | null = null) {
    for (const item of items) {
      if (item.kind === 't1' || item.body) {
        const comment = item.data || item;
        result.push({
          id: normalizeRedditId(comment.id || ''),
          body: comment.body || '',
          author: comment.author || '[deleted]',
          parent_id: parent,
          depth,
        });
        
        if (comment.replies?.data?.children) {
          traverse(comment.replies.data.children, depth + 1, comment.id);
        }
      }
    }
  }
  
  traverse(comments, 0, parentId);
  return result;
}

/**
 * Transform to percentage
 */
export function toPercentage(value: number, total: number, decimals: number = 2): string {
  if (total === 0) return '0%';
  const percentage = (value / total) * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Transform bytes to human readable format
 */
export function bytesToHuman(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Transform duration to human readable format
 */
export function durationToHuman(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Transform error to serializable format
 */
export function errorToObject(error: any): {
  message: string;
  name: string;
  stack?: string;
  code?: string;
  details?: any;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      code: (error as any).code,
      details: (error as any).details,
    };
  }
  
  return {
    message: String(error),
    name: 'UnknownError',
  };
}