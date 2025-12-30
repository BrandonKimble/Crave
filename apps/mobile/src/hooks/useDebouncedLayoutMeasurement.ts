import React from 'react';
import { InteractionManager, type LayoutChangeEvent } from 'react-native';

/**
 * Layout dimensions returned by the hook.
 */
type LayoutState = {
  width: number;
  height: number;
  x: number;
  y: number;
};

/**
 * Options for the useDebouncedLayoutMeasurement hook.
 */
type LayoutMeasurementOptions = {
  /**
   * Debounce delay in milliseconds. Default: 16 (one frame at 60fps).
   * Set to 0 for immediate updates.
   */
  debounceMs?: number;

  /**
   * Whether to process layout updates. Set to false during drag/scroll
   * to prevent layout thrashing. Default: true.
   */
  enabled?: boolean;

  /**
   * Threshold for considering dimensions as changed.
   * Prevents re-renders from sub-pixel differences. Default: 0.5.
   */
  threshold?: number;

  /**
   * Whether to defer the first measurement to after interactions complete.
   * Useful for list items that measure during initial render. Default: false.
   */
  deferInitial?: boolean;
};

/**
 * Checks if two layout states are equal within the given threshold.
 */
function areLayoutsEqual(
  a: LayoutState,
  b: LayoutState,
  threshold: number
): boolean {
  return (
    Math.abs(a.width - b.width) < threshold &&
    Math.abs(a.height - b.height) < threshold &&
    Math.abs(a.x - b.x) < threshold &&
    Math.abs(a.y - b.y) < threshold
  );
}

/**
 * A hook that provides debounced layout measurement with the ability to pause
 * during gestures/interactions.
 *
 * This prevents layout thrashing that occurs when:
 * 1. Multiple onLayout callbacks fire during scroll/drag
 * 2. State updates trigger re-renders during animation
 * 3. Sub-pixel layout differences cause unnecessary updates
 *
 * @example
 * ```tsx
 * function Card({ isDragging }: { isDragging: boolean }) {
 *   const { layout, onLayout } = useDebouncedLayoutMeasurement({
 *     enabled: !isDragging,
 *     debounceMs: 100,
 *   });
 *
 *   return (
 *     <View onLayout={onLayout}>
 *       {layout && <Text>Width: {layout.width}</Text>}
 *     </View>
 *   );
 * }
 * ```
 */
function useDebouncedLayoutMeasurement(options?: LayoutMeasurementOptions): {
  layout: LayoutState | null;
  onLayout: (event: LayoutChangeEvent) => void;
  measureNow: (event: LayoutChangeEvent) => void;
} {
  const {
    debounceMs = 16,
    enabled = true,
    threshold = 0.5,
    deferInitial = false,
  } = options ?? {};

  const [layout, setLayout] = React.useState<LayoutState | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLayoutRef = React.useRef<LayoutState | null>(null);
  const isFirstMeasureRef = React.useRef(true);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Process pending layout when enabled becomes true
  React.useEffect(() => {
    if (enabled && pendingLayoutRef.current) {
      const pending = pendingLayoutRef.current;
      pendingLayoutRef.current = null;

      setLayout((prev) => {
        if (prev && areLayoutsEqual(prev, pending, threshold)) {
          return prev;
        }
        return pending;
      });
    }
  }, [enabled, threshold]);

  const updateLayout = React.useCallback(
    (nextLayout: LayoutState) => {
      setLayout((prev) => {
        if (prev && areLayoutsEqual(prev, nextLayout, threshold)) {
          return prev;
        }
        return nextLayout;
      });
    },
    [threshold]
  );

  const onLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height, x, y } = event.nativeEvent.layout;
      const nextLayout: LayoutState = {
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(x),
        y: Math.round(y),
      };

      // If disabled, store pending layout but don't update state
      if (!enabled) {
        pendingLayoutRef.current = nextLayout;
        return;
      }

      // Clear any pending debounce
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Handle first measurement
      if (isFirstMeasureRef.current) {
        isFirstMeasureRef.current = false;

        if (deferInitial) {
          // Defer to after interactions complete
          void InteractionManager.runAfterInteractions(() => {
            updateLayout(nextLayout);
          });
        } else {
          // Immediate first measurement
          updateLayout(nextLayout);
        }
        return;
      }

      // Debounce subsequent measurements
      if (debounceMs > 0) {
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          updateLayout(nextLayout);
        }, debounceMs);
      } else {
        updateLayout(nextLayout);
      }
    },
    [enabled, debounceMs, deferInitial, updateLayout]
  );

  // Immediate measurement (bypasses debounce)
  const measureNow = React.useCallback(
    (event: LayoutChangeEvent) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const { width, height, x, y } = event.nativeEvent.layout;
      updateLayout({
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(x),
        y: Math.round(y),
      });
    },
    [updateLayout]
  );

  return { layout, onLayout, measureNow };
}

/**
 * A hook for measuring multiple elements by key with debouncing.
 * Useful when you need to track widths of multiple items (like truncation calculation).
 *
 * @example
 * ```tsx
 * const { measurements, registerLayout, hasMeasured } = useMultiLayoutMeasurement({
 *   keys: items.map(item => item.id),
 *   enabled: !isDragging,
 * });
 *
 * return items.map(item => (
 *   <Text key={item.id} onLayout={registerLayout(item.id)}>
 *     {item.name}
 *   </Text>
 * ));
 * ```
 */
function useMultiLayoutMeasurement<K extends string | number>(options: {
  keys: readonly K[];
  enabled?: boolean;
  debounceMs?: number;
  threshold?: number;
}): {
  measurements: Map<K, LayoutState>;
  registerLayout: (key: K) => (event: LayoutChangeEvent) => void;
  hasMeasured: (key: K) => boolean;
  hasAllMeasured: boolean;
} {
  const { keys, enabled = true, debounceMs = 50, threshold = 0.5 } = options;

  const [measurements, setMeasurements] = React.useState<Map<K, LayoutState>>(
    () => new Map()
  );
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = React.useRef<Map<K, LayoutState>>(new Map());

  // Cleanup
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Process pending measurements when enabled
  React.useEffect(() => {
    if (enabled && pendingRef.current.size > 0) {
      const pending = new Map(pendingRef.current);
      pendingRef.current.clear();

      setMeasurements((prev) => {
        const next = new Map(prev);
        let hasChanges = false;

        pending.forEach((layout, key) => {
          const existing = prev.get(key);
          if (!existing || !areLayoutsEqual(existing, layout, threshold)) {
            next.set(key, layout);
            hasChanges = true;
          }
        });

        return hasChanges ? next : prev;
      });
    }
  }, [enabled, threshold]);

  const registerLayout = React.useCallback(
    (key: K) => (event: LayoutChangeEvent) => {
      const { width, height, x, y } = event.nativeEvent.layout;
      const nextLayout: LayoutState = {
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(x),
        y: Math.round(y),
      };

      if (!enabled) {
        pendingRef.current.set(key, nextLayout);
        return;
      }

      // Batch updates with debouncing
      pendingRef.current.set(key, nextLayout);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        const pending = new Map(pendingRef.current);
        pendingRef.current.clear();

        setMeasurements((prev) => {
          const next = new Map(prev);
          let hasChanges = false;

          pending.forEach((layout, k) => {
            const existing = prev.get(k);
            if (!existing || !areLayoutsEqual(existing, layout, threshold)) {
              next.set(k, layout);
              hasChanges = true;
            }
          });

          return hasChanges ? next : prev;
        });
      }, debounceMs);
    },
    [enabled, debounceMs, threshold]
  );

  const hasMeasured = React.useCallback(
    (key: K) => measurements.has(key),
    [measurements]
  );

  const hasAllMeasured = React.useMemo(
    () => keys.every((key) => measurements.has(key)),
    [keys, measurements]
  );

  return { measurements, registerLayout, hasMeasured, hasAllMeasured };
}

export {
  useDebouncedLayoutMeasurement,
  useMultiLayoutMeasurement,
  type LayoutState,
  type LayoutMeasurementOptions,
};
