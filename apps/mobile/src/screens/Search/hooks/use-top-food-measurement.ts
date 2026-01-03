import React from 'react';
import { type LayoutChangeEvent } from 'react-native';

import searchPerfDebug from '../search-perf-debug';

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

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
  }, [logTopFoodMeasurement, shouldLogTopFoodMeasurement]);

  // Items we'll actually consider for display
  const candidateTopFoods = React.useMemo(
    () => topFoodItems.slice(0, maxToRender),
    [topFoodItems, maxToRender]
  );

  // Possible "more" counts we need to measure
  const topFoodMoreCounts = React.useMemo(() => {
    if (candidateTopFoods.length === 0) return [];
    const counts = new Set<number>();
    for (let i = 1; i <= candidateTopFoods.length; i++) {
      const hiddenCount = topFoodItems.length - i;
      if (hiddenCount > 0) {
        counts.add(hiddenCount);
      }
    }
    return Array.from(counts);
  }, [candidateTopFoods.length, topFoodItems.length]);

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
          if (existing === undefined || Math.abs(existing - width) >= 0.5) {
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
          if (existing === undefined || Math.abs(existing - width) >= 0.5) {
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
      return isDraggingRef.current.isInteracting;
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
          const nextWidth = Math.round(event.nativeEvent.layout.width);

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
          const nextWidth = Math.round(event.nativeEvent.layout.width);

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
        hiddenTopFoodCount: Math.max(0, topFoodItems.length - visible.length),
      };
    } else {
      const { itemWidths, moreWidths } = measurements;
      const containerWidth = Math.round(availableWidth ?? 0);

      if (candidateTopFoods.length === 0) {
        result = { visibleTopFoods: [] as readonly TopFoodItem[], hiddenTopFoodCount: 0 };
      } else if (!containerWidth) {
        result = {
          visibleTopFoods: candidateTopFoods,
          hiddenTopFoodCount: 0,
        };
      } else {
        const measuredWidths = candidateTopFoods.map((food) => itemWidths.get(food.connectionId));
        if (measuredWidths.some((width) => width === undefined)) {
          result = {
            visibleTopFoods: candidateTopFoods,
            hiddenTopFoodCount: 0,
          };
        } else {
          let hasMeasurements = false;
          let bestCount = candidateTopFoods.length;

          for (let count = candidateTopFoods.length; count >= 1; count--) {
            const hiddenCount = topFoodItems.length - count;
            const needsMore = hiddenCount > 0;
            const moreWidth = needsMore ? moreWidths.get(hiddenCount) : 0;
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
            if (totalWidth <= containerWidth) {
              bestCount = count;
              break;
            }
            if (count === 1) {
              bestCount = 1;
            }
          }

          if (!hasMeasurements) {
            result = {
              visibleTopFoods: candidateTopFoods,
              hiddenTopFoodCount: 0,
            };
          } else {
            const hiddenCount = Math.max(0, topFoodItems.length - bestCount);
            result = {
              visibleTopFoods: candidateTopFoods.slice(0, bestCount),
              hiddenTopFoodCount: hiddenCount,
            };
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
    topFoodItems.length,
  ]);

  // Check if we have all the measurements we need
  const hasMeasured = React.useMemo(() => {
    if (!isEnabled) return true;
    if (!availableWidth) return false;
    if (candidateTopFoods.length === 0) return true;
    const hasItems = candidateTopFoods.every((food) =>
      measurements.itemWidths.has(food.connectionId)
    );
    const hasMore = topFoodMoreCounts.every((count) => measurements.moreWidths.has(count));
    return hasItems && hasMore;
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
