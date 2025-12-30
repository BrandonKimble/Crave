import React from 'react';
import { type LayoutChangeEvent, InteractionManager } from 'react-native';

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
};

/**
 * A hook that manages the complex layout measurement logic for dynamic
 * top food truncation in RestaurantResultCard.
 *
 * This hook optimizes performance by:
 * 1. Debouncing layout measurements to batch updates
 * 2. Skipping measurements entirely during drag/scroll operations
 * 3. Using InteractionManager to defer heavy calculations
 * 4. Caching measurement callbacks to prevent re-renders
 *
 * @example
 * ```tsx
 * const {
 *   visibleTopFoods,
 *   hiddenTopFoodCount,
 *   onItemLayout,
 *   onMoreLayout,
 * } = useTopFoodMeasurement({
 *   topFoodItems: restaurant.topFood,
 *   maxToRender: 5,
 *   availableWidth,
 *   itemGap: 8,
 *   isDragging,
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
    debounceMs = 50,
  } = options;

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
    const pending = pendingUpdatesRef.current;
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
  }, []);

  // Schedule debounced update
  const scheduleUpdate = React.useCallback(() => {
    if (isDragging) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      debounceTimeoutRef.current = null;
      // Defer to after interactions for better perceived performance
      void InteractionManager.runAfterInteractions(() => {
        flushPendingUpdates();
      });
    }, debounceMs);
  }, [isDragging, debounceMs, flushPendingUpdates]);

  // Process any pending updates when dragging stops
  React.useEffect(() => {
    if (!isDragging && Object.keys(pendingUpdatesRef.current).length > 0) {
      scheduleUpdate();
    }
  }, [isDragging, scheduleUpdate]);

  // Cache for item layout callbacks
  const itemLayoutCallbacksRef = React.useRef(
    new Map<string, (event: LayoutChangeEvent) => void>()
  );

  const onItemLayout = React.useCallback(
    (connectionId: string) => {
      let callback = itemLayoutCallbacksRef.current.get(connectionId);
      if (!callback) {
        callback = (event: LayoutChangeEvent) => {
          const nextWidth = Math.round(event.nativeEvent.layout.width);

          if (isDragging) {
            if (!pendingUpdatesRef.current.itemWidths) {
              pendingUpdatesRef.current.itemWidths = new Map();
            }
            pendingUpdatesRef.current.itemWidths.set(connectionId, nextWidth);
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
    [isDragging, scheduleUpdate]
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
          const nextWidth = Math.round(event.nativeEvent.layout.width);

          if (isDragging) {
            if (!pendingUpdatesRef.current.moreWidths) {
              pendingUpdatesRef.current.moreWidths = new Map();
            }
            pendingUpdatesRef.current.moreWidths.set(hiddenCount, nextWidth);
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
    [isDragging, scheduleUpdate]
  );

  // Calculate visible items based on measurements
  const { visibleTopFoods, hiddenTopFoodCount } = React.useMemo(() => {
    const { itemWidths, moreWidths } = measurements;
    const containerWidth = Math.round(availableWidth ?? 0);

    // No items to show
    if (candidateTopFoods.length === 0) {
      return { visibleTopFoods: [] as readonly TopFoodItem[], hiddenTopFoodCount: 0 };
    }

    // No container width yet - show all candidates as placeholder
    if (!containerWidth) {
      return {
        visibleTopFoods: candidateTopFoods,
        hiddenTopFoodCount: 0,
      };
    }

    const measuredWidths = candidateTopFoods.map((food) => itemWidths.get(food.connectionId));
    if (measuredWidths.some((width) => width === undefined)) {
      return {
        visibleTopFoods: candidateTopFoods,
        hiddenTopFoodCount: 0,
      };
    }

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
        widths.reduce((sum, width) => sum + width, 0) + gapWidth + (needsMore ? moreWidth ?? 0 : 0);
      if (totalWidth <= containerWidth) {
        bestCount = count;
        break;
      }
      if (count === 1) {
        bestCount = 1;
      }
    }

    if (!hasMeasurements) {
      return {
        visibleTopFoods: candidateTopFoods,
        hiddenTopFoodCount: 0,
      };
    }

    const hiddenCount = Math.max(0, topFoodItems.length - bestCount);

    return {
      visibleTopFoods: candidateTopFoods.slice(0, bestCount),
      hiddenTopFoodCount: hiddenCount,
    };
  }, [availableWidth, measurements, candidateTopFoods, topFoodItems.length, itemGap]);

  // Check if we have all the measurements we need
  const hasMeasured = React.useMemo(() => {
    if (!availableWidth) return false;
    return candidateTopFoods.every((food) => measurements.itemWidths.has(food.connectionId));
  }, [availableWidth, measurements, candidateTopFoods]);

  return {
    visibleTopFoods,
    hiddenTopFoodCount,
    onItemLayout,
    onMoreLayout,
    hasMeasured,
    // Also expose these for the measurement elements
    candidateTopFoods,
    topFoodMoreCounts,
  } as TopFoodMeasurementResult & {
    candidateTopFoods: readonly TopFoodItem[];
    topFoodMoreCounts: number[];
  };
}

export { useTopFoodMeasurement, type TopFoodMeasurementOptions, type TopFoodMeasurementResult };
