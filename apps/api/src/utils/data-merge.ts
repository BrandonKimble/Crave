import { sortBy, groupBy, mergeWith } from 'lodash-es';

/**
 * Data Merge Utilities
 *
 * Simple utilities for merging data from multiple sources.
 * Replaces the 820-line DataMergeService with ~150 lines of pure functions.
 *
 * Preserves all PRD Section 5.1.2 temporal merging logic.
 */

/**
 * Merge data from multiple sources by timestamp
 */
export function mergeByTimestamp<T extends { timestamp: number }>(
  ...sources: T[][]
): T[] {
  const combined = sources.flat();
  return sortBy(combined, 'timestamp');
}

/**
 * Merge with source attribution
 */
export function mergeWithAttribution<T>(
  sources: Array<{ name: string; data: T[] }>,
): Array<T & { source: string }> {
  const result: Array<T & { source: string }> = [];

  for (const { name, data } of sources) {
    for (const item of data) {
      result.push({ ...item, source: name });
    }
  }

  return result;
}

/**
 * Temporal merge with gap detection
 * Implements PRD Section 5.1.2 gap minimization
 */
export function temporalMerge<T extends { timestamp: number; id: string }>(
  archiveData: T[],
  apiData: T[],
  options: {
    timestampTolerance?: number;
    gapThreshold?: number;
    prioritySource?: 'archive' | 'api';
  } = {},
): {
  merged: T[];
  gaps: Array<{ start: number; end: number; duration: number }>;
  duplicates: number;
} {
  const {
    timestampTolerance = 60,
    gapThreshold = 14400, // 4 hours
    prioritySource = 'archive',
  } = options;

  // Combine and sort by timestamp
  const allItems = [...archiveData, ...apiData].sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  // Remove duplicates within tolerance
  const merged: T[] = [];
  const seen = new Map<string, T>();
  let duplicates = 0;

  for (const item of allItems) {
    const existing = seen.get(item.id);

    if (existing) {
      const timeDiff = Math.abs(item.timestamp - existing.timestamp);
      if (timeDiff <= timestampTolerance) {
        duplicates++;
        // Keep priority source item
        const isArchive = archiveData.includes(item);
        const shouldReplace =
          prioritySource === 'archive' ? isArchive : !isArchive;

        if (shouldReplace) {
          const index = merged.indexOf(existing);
          if (index !== -1) {
            merged[index] = item;
            seen.set(item.id, item);
          }
        }
        continue;
      }
    }

    merged.push(item);
    seen.set(item.id, item);
  }

  // Detect gaps
  const gaps: Array<{ start: number; end: number; duration: number }> = [];

  for (let i = 1; i < merged.length; i++) {
    const timeDiff = merged[i].timestamp - merged[i - 1].timestamp;

    if (timeDiff > gapThreshold) {
      gaps.push({
        start: merged[i - 1].timestamp,
        end: merged[i].timestamp,
        duration: timeDiff,
      });
    }
  }

  return { merged, gaps, duplicates };
}

/**
 * Merge Reddit posts and comments
 * Specialized for Reddit content structure
 */
export function mergeRedditContent<
  P extends { id: string; created_utc: number },
  C extends { id: string; created_utc: number },
>(
  posts: P[],
  comments: C[],
  source: string,
): {
  posts: Array<P & { sourceMetadata: { source: string; timestamp: number } }>;
  comments: Array<
    C & { sourceMetadata: { source: string; timestamp: number } }
  >;
  totalItems: number;
} {
  const timestamp = Date.now() / 1000;

  const annotatedPosts = posts.map((post) => ({
    ...post,
    sourceMetadata: {
      source,
      timestamp,
    },
  }));

  const annotatedComments = comments.map((comment) => ({
    ...comment,
    sourceMetadata: {
      source,
      timestamp,
    },
  }));

  return {
    posts: annotatedPosts,
    comments: annotatedComments,
    totalItems: posts.length + comments.length,
  };
}

/**
 * Batch merge with validation
 */
export function mergeBatches<T>(
  batches: Array<{
    id: string;
    items: T[];
    timestamp: number;
    metadata?: any;
  }>,
): {
  items: T[];
  batchCount: number;
  totalItems: number;
  metadata: Record<string, any>;
} {
  const items: T[] = [];
  const metadata: Record<string, any> = {};

  for (const batch of batches) {
    items.push(...batch.items);

    if (batch.metadata) {
      metadata[batch.id] = batch.metadata;
    }
  }

  return {
    items,
    batchCount: batches.length,
    totalItems: items.length,
    metadata,
  };
}

/**
 * Deep merge objects with custom merger
 */
export function deepMerge<T extends object>(
  target: T,
  source: Partial<T>,
  customMerger?: (objValue: any, srcValue: any, key: string) => any,
): T {
  return mergeWith({}, target, source, customMerger);
}

/**
 * Merge arrays with deduplication
 */
export function mergeArrays<T>(arrays: T[][], keyFn: (item: T) => string): T[] {
  const seen = new Map<string, T>();

  for (const array of arrays) {
    for (const item of array) {
      const key = keyFn(item);
      if (!seen.has(key)) {
        seen.set(key, item);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Group and merge by property
 */
export function groupAndMerge<T, K extends keyof T>(
  items: T[],
  groupKey: K,
  mergeFn: (items: T[]) => T,
): T[] {
  const grouped = groupBy(items, groupKey) as Record<string, T[]>;

  return Object.values(grouped).map((group: T[]) =>
    group.length === 1 ? group[0] : mergeFn(group),
  );
}

/**
 * Calculate merge statistics
 */
export function getMergeStats<T>(
  original: T[],
  merged: T[],
  duplicatesRemoved: number = 0,
): {
  originalCount: number;
  mergedCount: number;
  duplicatesRemoved: number;
  reductionPercent: number;
} {
  const originalCount = original.length;
  const mergedCount = merged.length;
  const reductionPercent =
    originalCount > 0
      ? ((originalCount - mergedCount) / originalCount) * 100
      : 0;

  return {
    originalCount,
    mergedCount,
    duplicatesRemoved,
    reductionPercent,
  };
}
