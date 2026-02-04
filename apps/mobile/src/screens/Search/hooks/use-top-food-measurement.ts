import React from 'react';
import { type LayoutChangeEvent } from 'react-native';

import searchPerfDebug from '../search-perf-debug';

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const MAX_TOP_FOOD_WIDTH_CACHE_ITEMS = 750;
const MORE_WIDTH_TEMPLATE_DIGIT = '8';
const MORE_WIDTH_TEMPLATE_MAX_DIGITS = 4;
// Keep this small; avoid rendering tokens that end up ellipsizing/clipping.
const MORE_WIDTH_FIT_SLACK_PX = 8;

const getMoreWidthTemplateCount = (hiddenCount: number): number => {
  const digits = Math.max(1, hiddenCount.toString().length);
  const templateDigits = Math.min(MORE_WIDTH_TEMPLATE_MAX_DIGITS, digits);
  return Number(MORE_WIDTH_TEMPLATE_DIGIT.repeat(templateDigits));
};

class LruWidthCache<TKey> {
  private maxSize: number;
  private map: Map<TKey, number>;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key: TKey): number | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Refresh recency
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: TKey, value: number): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value as TKey | undefined;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
  }
}

const topFoodItemWidthCache = new LruWidthCache<string>(MAX_TOP_FOOD_WIDTH_CACHE_ITEMS);
const topFoodMoreWidthCache = new LruWidthCache<number>(250);

type TopFoodItem = {
  connectionId: string;
  foodName: string;
};

type TopFoodMeasurementOptions = {
  /**
   * List of food items to potentially display
   */
  topFoodItems: readonly TopFoodItem[];

  /**
   * Total number of dishes for the restaurant (used for "+N more" count).
   * Defaults to `topFoodItems.length` if not provided.
   */
  totalTopFoodCount?: number;

  /**
   * Maximum number of items to consider rendering
   */
  maxToRender: number;

  /**
   * Available width for the inline list (already padded/inset).
   */
  availableWidth?: number;

  /**
   * Gap between items in pixels
   */
  itemGap: number;

  /**
   * Whether the parent is currently being dragged/scrolled.
   * When true, layout measurements are skipped to prevent JS thread blocking.
   */
  isDragging?: boolean;

  /**
   * When false, measurement work is skipped (perf diagnostics).
   */
  enabled?: boolean;

  /**
   * Ref-based interaction state to avoid re-renders during drag.
   */
  isDraggingRef?: React.RefObject<{ isInteracting: boolean }>;

  /**
   * Debounce delay for layout updates in milliseconds.
   * Default: 50ms
   */
  debounceMs?: number;
};

type MeasurementState = {
  itemWidths: Map<string, number>;
  moreWidths: Map<number, number>;
};

type TopFoodMeasurementResult = {
  /**
   * Food items that should be visible given the available width
   */
  visibleTopFoods: readonly TopFoodItem[];

  /**
   * Number of items hidden (for "+N more" display)
   */
  hiddenTopFoodCount: number;

  /**
   * Callback factory for individual item layouts
   */
  onItemLayout: (connectionId: string) => (event: LayoutChangeEvent) => void;

  /**
   * Callback factory for "+N more" badge layouts
   */
  onMoreLayout: (hiddenCount: number) => (event: LayoutChangeEvent) => void;

  /**
   * Whether all required measurements have been taken
   */
  hasMeasured: boolean;

  /**
   * Items considered for measurement (first N items)
   */
  candidateTopFoods: readonly TopFoodItem[];

  /**
   * "+N more" counts to measure
   */
  topFoodMoreCounts: number[];
};

/**
 * A hook that manages the complex layout measurement logic for dynamic
 * top food truncation in RestaurantResultCard.
 *
 * This hook optimizes performance by:
 * 1. Debouncing layout measurements to batch updates
 * 2. Skipping measurements entirely during drag/scroll operations
 * 3. Deferring heavy calculations until interactions are idle
 * 4. Caching measurement callbacks to prevent re-renders
 *
 * @example
 * ```tsx
 * const {
 *   visibleTopFoods,
 *   hiddenTopFoodCount,
 *   onItemLayout,
 *   onMoreLayout,
 *   candidateTopFoods,
 *   topFoodMoreCounts,
 * } = useTopFoodMeasurement({
 *   topFoodItems: restaurant.topFood,
 *   maxToRender: 5,
 *   availableWidth,
 *   itemGap: 8,
 *   isDraggingRef,
 * });
 * ```
 */
function useTopFoodMeasurement(options: TopFoodMeasurementOptions): TopFoodMeasurementResult {
  const {
    topFoodItems,
    totalTopFoodCount,
    maxToRender,
    availableWidth,
    itemGap,
    isDragging = false,
    enabled = true,
    isDraggingRef,
    debounceMs = 50,
  } = options;
  const shouldLogTopFoodMeasurement =
    searchPerfDebug.enabled && searchPerfDebug.logTopFoodMeasurement;
  const topFoodMeasurementMinMs = searchPerfDebug.logTopFoodMeasurementMinMs;
  const isEnabled = enabled;
  const resolvedTotalTopFoodCount = Math.max(
    totalTopFoodCount ?? topFoodItems.length,
    topFoodItems.length
  );

  // Consolidated measurement state
  const [measurements, setMeasurements] = React.useState<MeasurementState>({
    itemWidths: new Map(),
    moreWidths: new Map(),
  });

  // Refs for debouncing and pending updates
  const debounceTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = React.useRef<Partial<MeasurementState>>({});

  // Cleanup
  React.useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Items we'll actually consider for display
  const candidateTopFoods = React.useMemo(
    () => topFoodItems.slice(0, maxToRender),
    [topFoodItems, maxToRender]
  );

  // Possible "more" counts we need to measure
  const topFoodMoreCounts = React.useMemo(() => {
    if (candidateTopFoods.length === 0) return [];
    // Measure the actual "+N more" strings we might render. With `maxToRender` this is small,
    // and it produces a more liberal (but still safe) fit than digit-template widths.
    const counts = new Set<number>();
    for (let count = 0; count <= candidateTopFoods.length; count++) {
      const hiddenCount = resolvedTotalTopFoodCount - count;
      if (hiddenCount > 0) {
        counts.add(hiddenCount);
      }
    }
    return Array.from(counts);
  }, [candidateTopFoods.length, resolvedTotalTopFoodCount]);

  // Apply pending updates with debouncing
  const flushPendingUpdates = React.useCallback(() => {
    const start = shouldLogTopFoodMeasurement ? getPerfNow() : 0;
    const pending = pendingUpdatesRef.current;
    const pendingItemCount = pending.itemWidths?.size ?? 0;
    const pendingMoreCount = pending.moreWidths?.size ?? 0;
    if (Object.keys(pending).length === 0) return;

    setMeasurements((prev) => {
      const next = { ...prev };
      let hasChanges = false;
      let hasItemChanges = false;
      let hasMoreChanges = false;

      if (pending.itemWidths) {
        const newItemWidths = new Map(prev.itemWidths);
        pending.itemWidths.forEach((width, key) => {
          const existing = prev.itemWidths.get(key);
          if (existing === undefined || Math.abs(existing - width) >= 0.1) {
            newItemWidths.set(key, width);
            hasItemChanges = true;
          }
        });
        if (hasItemChanges) {
          next.itemWidths = newItemWidths;
          hasChanges = true;
        }
      }

      if (pending.moreWidths) {
        const newMoreWidths = new Map(prev.moreWidths);
        pending.moreWidths.forEach((width, key) => {
          const existing = prev.moreWidths.get(key);
          if (existing === undefined || Math.abs(existing - width) >= 0.1) {
            newMoreWidths.set(key, width);
            hasMoreChanges = true;
          }
        });
        if (hasMoreChanges) {
          next.moreWidths = newMoreWidths;
          hasChanges = true;
        }
      }

      pendingUpdatesRef.current = {};
      return hasChanges ? next : prev;
    });
    if (shouldLogTopFoodMeasurement) {
      logTopFoodMeasurement(
        'flush',
        getPerfNow() - start,
        `items=${pendingItemCount} more=${pendingMoreCount}`
      );
    }
  }, []);

  const getIsDragging = React.useCallback(() => {
    if (isDraggingRef?.current) {
      const snapshot = isDraggingRef.current as unknown as Record<string, unknown>;
      // Prefer specific flags if present; avoid treating "settling" as a drag/scroll interaction
      // so measurements can complete promptly when the sheet is animating.
      const isResultsSheetDragging = snapshot.isResultsSheetDragging;
      const isResultsListScrolling = snapshot.isResultsListScrolling;
      if (typeof isResultsSheetDragging === 'boolean' || typeof isResultsListScrolling === 'boolean') {
        return Boolean(isResultsSheetDragging) || Boolean(isResultsListScrolling);
      }
      return Boolean(snapshot.isInteracting);
    }
    return isDragging;
  }, [isDragging, isDraggingRef]);

  const logTopFoodMeasurement = React.useCallback(
    (label: string, duration: number, extra?: string) => {
      if (!shouldLogTopFoodMeasurement || duration < topFoodMeasurementMinMs) {
        return;
      }
      const suffix = extra ? ` ${extra}` : '';
      // eslint-disable-next-line no-console
      console.log(
        `[SearchPerf] TopFood ${label} ${duration.toFixed(1)}ms drag=${getIsDragging()}${suffix}`
      );
    },
    [getIsDragging, shouldLogTopFoodMeasurement, topFoodMeasurementMinMs]
  );

  // Schedule debounced update and wait for the sheet to be idle.
  const scheduleUpdate = React.useCallback(() => {
    if (!isEnabled) {
      return;
    }
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      debounceTimeoutRef.current = null;
      if (getIsDragging()) {
        scheduleUpdate();
        return;
      }
      flushPendingUpdates();
    }, debounceMs);
  }, [debounceMs, flushPendingUpdates, getIsDragging, isEnabled]);

  // Cache for item layout callbacks
  const itemLayoutCallbacksRef = React.useRef(
    new Map<string, (event: LayoutChangeEvent) => void>()
  );

  const onItemLayout = React.useCallback(
    (connectionId: string) => {
      let callback = itemLayoutCallbacksRef.current.get(connectionId);
      if (!callback) {
        callback = (event: LayoutChangeEvent) => {
          if (!isEnabled) {
            return;
          }
          const nextWidth = event.nativeEvent.layout.width;
          topFoodItemWidthCache.set(connectionId, nextWidth);

          if (getIsDragging()) {
            if (!pendingUpdatesRef.current.itemWidths) {
              pendingUpdatesRef.current.itemWidths = new Map();
            }
            pendingUpdatesRef.current.itemWidths.set(connectionId, nextWidth);
            scheduleUpdate();
            return;
          }

          if (!pendingUpdatesRef.current.itemWidths) {
            pendingUpdatesRef.current.itemWidths = new Map();
          }
          pendingUpdatesRef.current.itemWidths.set(connectionId, nextWidth);
          scheduleUpdate();
        };
        itemLayoutCallbacksRef.current.set(connectionId, callback);
      }
      return callback;
    },
    [getIsDragging, isEnabled, scheduleUpdate]
  );

  // Cache for "more" layout callbacks
  const moreLayoutCallbacksRef = React.useRef(
    new Map<number, (event: LayoutChangeEvent) => void>()
  );

  const onMoreLayout = React.useCallback(
    (hiddenCount: number) => {
      let callback = moreLayoutCallbacksRef.current.get(hiddenCount);
      if (!callback) {
        callback = (event: LayoutChangeEvent) => {
          if (!isEnabled) {
            return;
          }
          const nextWidth = event.nativeEvent.layout.width;
          topFoodMoreWidthCache.set(hiddenCount, nextWidth);

          if (getIsDragging()) {
            if (!pendingUpdatesRef.current.moreWidths) {
              pendingUpdatesRef.current.moreWidths = new Map();
            }
            pendingUpdatesRef.current.moreWidths.set(hiddenCount, nextWidth);
            scheduleUpdate();
            return;
          }

          if (!pendingUpdatesRef.current.moreWidths) {
            pendingUpdatesRef.current.moreWidths = new Map();
          }
          pendingUpdatesRef.current.moreWidths.set(hiddenCount, nextWidth);
          scheduleUpdate();
        };
        moreLayoutCallbacksRef.current.set(hiddenCount, callback);
      }
      return callback;
    },
    [getIsDragging, isEnabled, scheduleUpdate]
  );

  // Calculate visible items based on measurements
  const { visibleTopFoods, hiddenTopFoodCount } = React.useMemo(() => {
    const start = shouldLogTopFoodMeasurement ? getPerfNow() : 0;
    let result: { visibleTopFoods: readonly TopFoodItem[]; hiddenTopFoodCount: number };

    if (!isEnabled) {
      const visible = candidateTopFoods;
      result = {
        visibleTopFoods: visible,
        hiddenTopFoodCount: Math.max(0, resolvedTotalTopFoodCount - visible.length),
      };
    } else {
      const { itemWidths, moreWidths } = measurements;
      const containerWidth = availableWidth ?? 0;

      if (candidateTopFoods.length === 0) {
        result = { visibleTopFoods: [] as readonly TopFoodItem[], hiddenTopFoodCount: 0 };
      } else if (!containerWidth) {
        result = {
          visibleTopFoods: candidateTopFoods,
          hiddenTopFoodCount: 0,
        };
      } else {
        const measuredWidths = candidateTopFoods.map(
          (food) => itemWidths.get(food.connectionId) ?? topFoodItemWidthCache.get(food.connectionId)
        );
        const resolvedMeasuredWidths = measuredWidths.filter(
          (width): width is number => typeof width === 'number'
        );
        const computeTokensOnlyCount = (): number => {
          if (!containerWidth) return 0;
          let totalWidth = 0;
          let count = 0;
          for (let idx = 0; idx < resolvedMeasuredWidths.length; idx++) {
            const width = resolvedMeasuredWidths[idx];
            const nextTotal = totalWidth + width + (count > 0 ? itemGap : 0);
            if (nextTotal <= containerWidth + MORE_WIDTH_FIT_SLACK_PX) {
              totalWidth = nextTotal;
              count += 1;
              continue;
            }
            break;
          }
          return count;
        };

        // If we don't yet have all item widths, still show the prefix that we *can* prove fits.
        if (resolvedMeasuredWidths.length !== measuredWidths.length) {
          const tokensOnlyCount = computeTokensOnlyCount();
          result = {
            visibleTopFoods: candidateTopFoods.slice(0, tokensOnlyCount),
            hiddenTopFoodCount: Math.max(0, resolvedTotalTopFoodCount - tokensOnlyCount),
          };
        } else {
          const getMoreWidth = (hiddenCount: number): number | undefined => {
            const direct =
              moreWidths.get(hiddenCount) ?? topFoodMoreWidthCache.get(hiddenCount);
            if (typeof direct === 'number') return direct;
            const templateCount = getMoreWidthTemplateCount(hiddenCount);
            return (
              moreWidths.get(templateCount) ?? topFoodMoreWidthCache.get(templateCount)
            );
          };

          let hasMeasurements = false;
          let bestCount: number | null = null;

          for (let count = candidateTopFoods.length; count >= 0; count--) {
            const hiddenCount = resolvedTotalTopFoodCount - count;
            const needsMore = hiddenCount > 0;
            const moreWidth = needsMore
              ? getMoreWidth(hiddenCount)
              : 0;
            if (needsMore && typeof moreWidth !== 'number') {
              continue;
            }
            hasMeasurements = true;
            const widths = measuredWidths.slice(0, count) as number[];
            const elementCount = count + (needsMore ? 1 : 0);
            const gapWidth = Math.max(0, elementCount - 1) * itemGap;
            const totalWidth =
              widths.reduce((sum, width) => sum + width, 0) +
              gapWidth +
              (needsMore ? moreWidth ?? 0 : 0);
            // Be a bit liberal with fit checks, but prefer conservative "+N more" widths via
            // digit-template fallback when exact measurement isn't available.
            if (totalWidth <= containerWidth + MORE_WIDTH_FIT_SLACK_PX) {
              bestCount = count;
              break;
            }
          }

          if (!hasMeasurements) {
            const tokensOnlyCount = computeTokensOnlyCount();
            result = {
              visibleTopFoods: candidateTopFoods.slice(0, tokensOnlyCount),
              hiddenTopFoodCount: Math.max(0, resolvedTotalTopFoodCount - tokensOnlyCount),
            };
          } else {
            const resolvedBestCount = bestCount ?? 0;
            // If "+N more" fits but zero tokens fit alongside it, prefer showing at least the
            // first token (if it fits on its own) over showing only "+N more".
            if (
              resolvedBestCount === 0 &&
              candidateTopFoods.length > 0 &&
              typeof resolvedMeasuredWidths[0] === 'number' &&
              resolvedMeasuredWidths[0] <= containerWidth + MORE_WIDTH_FIT_SLACK_PX
            ) {
              result = {
                visibleTopFoods: candidateTopFoods.slice(0, 1),
                hiddenTopFoodCount: 0,
              };
            } else {
              const hiddenCount = Math.max(0, resolvedTotalTopFoodCount - resolvedBestCount);
              result = {
                visibleTopFoods: candidateTopFoods.slice(0, resolvedBestCount),
                hiddenTopFoodCount: hiddenCount,
              };
            }
          }
        }
      }
    }

    if (shouldLogTopFoodMeasurement) {
      logTopFoodMeasurement('compute', getPerfNow() - start);
    }

    return result;
  }, [
    availableWidth,
    candidateTopFoods,
    isEnabled,
    itemGap,
    logTopFoodMeasurement,
    measurements,
    shouldLogTopFoodMeasurement,
    resolvedTotalTopFoodCount,
  ]);

  // Check if we have all the measurements we need
  const hasMeasured = React.useMemo(() => {
    if (!isEnabled) return true;
    if (!availableWidth) return false;
    if (candidateTopFoods.length === 0) return true;
    const hasItems = candidateTopFoods.every(
      (food) =>
        measurements.itemWidths.has(food.connectionId) ||
        typeof topFoodItemWidthCache.get(food.connectionId) === 'number'
    );
    const hasMoreTemplates = topFoodMoreCounts.every(
      (count) =>
        measurements.moreWidths.has(count) || typeof topFoodMoreWidthCache.get(count) === 'number'
    );
    return hasItems && hasMoreTemplates;
  }, [availableWidth, candidateTopFoods, isEnabled, measurements, topFoodMoreCounts]);

  return {
    visibleTopFoods,
    hiddenTopFoodCount,
    onItemLayout,
    onMoreLayout,
    hasMeasured,
    candidateTopFoods,
    topFoodMoreCounts,
  };
}

export { useTopFoodMeasurement, type TopFoodMeasurementOptions, type TopFoodMeasurementResult };
