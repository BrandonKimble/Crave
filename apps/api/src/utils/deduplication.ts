import { uniqBy } from 'lodash-es';

/**
 * Deduplication Utilities
 *
 * Simple, functional utilities for removing duplicates.
 * Replaces the 687-line DuplicateDetectionService with ~50 lines of pure functions.
 *
 * These utilities:
 * - Use native JavaScript features (Map, Set)
 * - Are pure functions with no side effects
 * - Can be easily tested and composed
 * - Have zero dependencies on NestJS or DI
 */

/**
 * Remove duplicates by a key function
 * Most common deduplication pattern
 */
export function removeDuplicatesByKey<T>(
  items: T[],
  keyFn: (item: T) => string,
): T[] {
  const seen = new Map<string, T>();

  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  return Array.from(seen.values());
}

/**
 * Remove duplicates by ID property
 * Specialized version for objects with ID
 */
export function removeDuplicatesById<T extends { id: string | number }>(
  items: T[],
): T[] {
  return removeDuplicatesByKey(items, (item) => String(item.id));
}

/**
 * Remove duplicates using lodash (for complex comparisons)
 */
export function removeDuplicatesByProperty<T, K extends keyof T>(
  items: T[],
  property: K,
): T[] {
  return uniqBy(items, property);
}

/**
 * Find duplicates in an array
 * Returns items that appear more than once
 */
export function findDuplicates<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Map<string, number>();
  const duplicates: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);

    if (count === 1) {
      // Second occurrence - add to duplicates
      duplicates.push(item);
    }
  }

  return duplicates;
}

/**
 * Merge duplicate items using a reducer
 * Useful for combining data from duplicates
 */
export function mergeDuplicates<T>(
  items: T[],
  keyFn: (item: T) => string,
  mergeFn: (existing: T, duplicate: T) => T,
): T[] {
  const merged = new Map<string, T>();

  for (const item of items) {
    const key = keyFn(item);
    const existing = merged.get(key);

    if (existing) {
      merged.set(key, mergeFn(existing, item));
    } else {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values());
}

/**
 * Deduplicate with time window
 * Removes items with same key within a time window
 */
export function deduplicateWithTimeWindow<T>(
  items: T[],
  keyFn: (item: T) => string,
  timestampFn: (item: T) => number,
  windowSeconds: number,
): T[] {
  // Sort by timestamp first
  const sorted = [...items].sort((a, b) => timestampFn(a) - timestampFn(b));

  const result: T[] = [];
  const lastSeen = new Map<string, number>();

  for (const item of sorted) {
    const key = keyFn(item);
    const timestamp = timestampFn(item);
    const lastTimestamp = lastSeen.get(key);

    if (!lastTimestamp || timestamp - lastTimestamp > windowSeconds) {
      result.push(item);
      lastSeen.set(key, timestamp);
    }
  }

  return result;
}

/**
 * Create a deduplication context with state
 * For when you need to track duplicates across multiple calls
 */
export function createDeduplicationContext<T>() {
  const seen = new Set<string>();

  return {
    /**
     * Check if item is duplicate
     */
    isDuplicate(key: string): boolean {
      return seen.has(key);
    },

    /**
     * Mark item as seen
     */
    markSeen(key: string): void {
      seen.add(key);
    },

    /**
     * Filter duplicates from array
     */
    filter(items: T[], keyFn: (item: T) => string): T[] {
      const unique: T[] = [];

      for (const item of items) {
        const key = keyFn(item);
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(item);
        }
      }

      return unique;
    },

    /**
     * Clear seen items
     */
    clear(): void {
      seen.clear();
    },

    /**
     * Get statistics
     */
    getStats(): { totalSeen: number } {
      return {
        totalSeen: seen.size,
      };
    },
  };
}

/**
 * Batch deduplication for large datasets
 * Process in chunks to avoid memory issues
 */
export async function* deduplicateBatch<T>(
  items: AsyncIterable<T[]> | Iterable<T[]>,
  keyFn: (item: T) => string,
): AsyncGenerator<T[], void, unknown> {
  const seen = new Set<string>();

  for await (const batch of items) {
    const unique: T[] = [];

    for (const item of batch) {
      const key = keyFn(item);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }

    if (unique.length > 0) {
      yield unique;
    }
  }
}

/**
 * Type-safe Reddit content deduplication
 * Specialized for Reddit posts and comments
 */
export const redditDeduplication = {
  /**
   * Deduplicate Reddit posts by ID
   */
  posts<T extends { id: string }>(posts: T[]): T[] {
    return removeDuplicatesById(posts);
  },

  /**
   * Deduplicate Reddit comments by ID
   */
  comments<T extends { id: string }>(comments: T[]): T[] {
    return removeDuplicatesById(comments);
  },

  /**
   * Deduplicate mixed Reddit content
   */
  content<T extends { id: string; type: 'post' | 'comment' }>(items: T[]): T[] {
    return removeDuplicatesByKey(items, (item) => `${item.type}:${item.id}`);
  },

  /**
   * Remove Reddit ID prefixes and deduplicate
   */
  normalizedIds<T extends { id: string }>(items: T[]): T[] {
    return removeDuplicatesByKey(items, (item) => {
      // Remove Reddit prefixes (t1_, t3_, etc.)
      return item.id.replace(/^t[0-9]_/, '');
    });
  },
};
