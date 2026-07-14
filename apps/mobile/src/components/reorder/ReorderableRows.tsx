import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Feather } from '@expo/vector-icons';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { ReorderDragRuntime } from './useReorderDrag';
import { useReorderDrag } from './useReorderDrag';
import type { ReorderableRowsProps } from './reorder-types';

// Reusable vertical drag-reorder rows (page-registry §8.11 + §8.14). NOT a list — a
// stack of absolutely-positioned rows meant to live inside a scroll container the
// consumer owns (the shared sheet scroll). 60fps approach: uniform row height ⇒ every
// slot position is `index * rowHeight`; VARIABLE-HEIGHT mode (leg 10 step 6) ⇒ rows
// self-measure and slot positions are prefix sums mirrored to the UI thread. Finger
// tracking and slot resolution are pure UI-thread worklets; the ONLY JS-thread traffic
// during a drag is the rare slot-crossing callback (consumer state swap) and edge
// auto-scroll steps. Rows shuffle live via per-row withTiming toward their slot offset.

const SLOT_SHUFFLE_MS = 180;

const ROW_ACTIVE_SCALE = 1.02;

type RowProps<T> = {
  item: T;
  rowKey: string;
  index: number;
  rowHeight: number;
  variableHeights: boolean;
  /** Live slot boundaries (variable-height mode; null in uniform mode). */
  slotBoundaries: SharedValue<readonly number[] | null>;
  onMeasureRow: (key: string, height: number) => void;
  isDraggable: boolean;
  accessibilityMode: boolean;
  itemCount: number;
  pinnedLeadingCount: number;
  drag: ReorderDragRuntime;
  renderRowContent: ReorderableRowsProps<T>['renderRowContent'];
  onReorder: ReorderableRowsProps<T>['onReorder'];
  testIDPrefix?: string;
};

const ReorderRowShell = <T,>({
  item,
  rowKey,
  index,
  rowHeight,
  variableHeights,
  slotBoundaries,
  onMeasureRow,
  isDraggable,
  accessibilityMode,
  itemCount,
  pinnedLeadingCount,
  drag,
  renderRowContent,
  onReorder,
  testIDPrefix,
}: RowProps<T>) => {
  // The row's current slot, mirrored to the UI thread: drives the settled translateY
  // AND the lift-time slot read inside the (stable) gesture worklets.
  const rowIndexSV: SharedValue<number> = useSharedValue(index);
  React.useEffect(() => {
    rowIndexSV.value = index;
  }, [index, rowIndexSV]);

  const [isActiveDrag, setIsActiveDrag] = React.useState(false);

  const gestures = React.useMemo(
    () => (isDraggable && !accessibilityMode ? drag.createRowGestures(rowKey, rowIndexSV) : null),
    [accessibilityMode, drag, isDraggable, rowIndexSV, rowKey]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const isActive = drag.activeKey.value === rowKey;
    if (isActive) {
      // Finger-pinned: lift-slot base + live finger/auto-scroll translate — pure
      // UI-thread values, no JS in the frame loop. liftTop is set at beginDrag
      // (uniform: liftSlot·rowHeight; variable: the frozen boundary entry).
      return {
        transform: [
          { translateY: drag.liftTop.value + drag.dragTranslateY.value },
          { scale: ROW_ACTIVE_SCALE },
        ],
        zIndex: 10,
        elevation: 10,
      };
    }
    const settledTop =
      slotBoundaries.value != null
        ? (slotBoundaries.value[rowIndexSV.value] ?? rowIndexSV.value * rowHeight)
        : rowIndexSV.value * rowHeight;
    return {
      transform: [
        { translateY: withTiming(settledTop, { duration: SLOT_SHUFFLE_MS }) },
        { scale: withTiming(1, { duration: SLOT_SHUFFLE_MS }) },
      ],
      zIndex: 0,
      elevation: 0,
    };
  }, [
    drag.activeKey,
    drag.dragTranslateY,
    drag.liftTop,
    rowHeight,
    rowIndexSV,
    rowKey,
    slotBoundaries,
  ]);

  // Mirror the UI-thread active flag into React state so renderRowContent can style
  // the lifted row (shadow/tint). Only fires twice per drag — lift and drop.
  useAnimatedReaction(
    () => drag.activeKey.value === rowKey,
    (isActive, previous) => {
      if (isActive !== previous) {
        runOnJS(setIsActiveDrag)(isActive);
      }
    },
    [drag.activeKey, rowKey]
  );

  const handleMoveUp = React.useCallback(() => {
    if (index > pinnedLeadingCount) {
      onReorder(index, index - 1);
    }
  }, [index, onReorder, pinnedLeadingCount]);
  const handleMoveDown = React.useCallback(() => {
    if (index < itemCount - 1) {
      onReorder(index, index + 1);
    }
  }, [index, itemCount, onReorder]);
  const handleMoveToTop = React.useCallback(() => {
    if (index > pinnedLeadingCount) {
      onReorder(index, pinnedLeadingCount);
    }
  }, [index, onReorder, pinnedLeadingCount]);

  React.useEffect(() => {
    if (!isActiveDrag) {
      return;
    }
    // Safety: if this row stops being draggable mid-flight (items changed), clear.
    if (!isDraggable) {
      setIsActiveDrag(false);
    }
  }, [isActiveDrag, isDraggable]);

  const content = renderRowContent(item, { isDraggable, isActiveDrag });

  const rowAffordance = accessibilityMode ? (
    isDraggable ? (
      <View style={styles.a11yControls}>
        <Pressable
          onPress={handleMoveToTop}
          disabled={index <= pinnedLeadingCount}
          accessibilityRole="button"
          accessibilityLabel="Move to top"
          hitSlop={6}
          style={styles.a11yButton}
          testID={testIDPrefix ? `${testIDPrefix}-move-top-${rowKey}` : undefined}
        >
          <Feather
            name="chevrons-up"
            size={18}
            color={index <= pinnedLeadingCount ? '#cbd5e1' : '#475569'}
          />
        </Pressable>
        <Pressable
          onPress={handleMoveUp}
          disabled={index <= pinnedLeadingCount}
          accessibilityRole="button"
          accessibilityLabel="Move up"
          hitSlop={6}
          style={styles.a11yButton}
          testID={testIDPrefix ? `${testIDPrefix}-move-up-${rowKey}` : undefined}
        >
          <Feather
            name="chevron-up"
            size={18}
            color={index <= pinnedLeadingCount ? '#cbd5e1' : '#475569'}
          />
        </Pressable>
        <Pressable
          onPress={handleMoveDown}
          disabled={index >= itemCount - 1}
          accessibilityRole="button"
          accessibilityLabel="Move down"
          hitSlop={6}
          style={styles.a11yButton}
          testID={testIDPrefix ? `${testIDPrefix}-move-down-${rowKey}` : undefined}
        >
          <Feather
            name="chevron-down"
            size={18}
            color={index >= itemCount - 1 ? '#cbd5e1' : '#475569'}
          />
        </Pressable>
      </View>
    ) : null
  ) : isDraggable && gestures != null ? (
    // Handle fades in/out on the strip-morph tempo (leg-13 "ellipsis fade sync" —
    // the overlay affordance rides the same 240ms beat as the action row).
    <Animated.View
      style={styles.handle}
      entering={FadeIn.duration(240)}
      exiting={FadeOut.duration(240)}
    >
      <GestureDetector gesture={gestures.handleGesture}>
        <View
          style={styles.handleTouchable}
          accessibilityLabel="Drag to reorder"
          testID={testIDPrefix ? `${testIDPrefix}-handle-${rowKey}` : undefined}
        >
          <Feather name="menu" size={18} color="#475569" />
        </View>
      </GestureDetector>
    </Animated.View>
  ) : null;

  const rowInner = (
    <View
      style={[styles.rowInner, variableHeights ? null : { height: rowHeight }]}
      onLayout={
        variableHeights
          ? (event) => onMeasureRow(rowKey, event.nativeEvent.layout.height)
          : undefined
      }
    >
      <View style={styles.rowContent}>{content}</View>
      {rowAffordance}
    </View>
  );

  return (
    <Animated.View
      style={[styles.rowShell, variableHeights ? null : { height: rowHeight }, animatedStyle]}
      testID={testIDPrefix ? `${testIDPrefix}-row-${rowKey}` : undefined}
    >
      {gestures != null ? (
        <GestureDetector gesture={gestures.bodyGesture}>{rowInner}</GestureDetector>
      ) : (
        rowInner
      )}
    </Animated.View>
  );
};

export const ReorderableRows = <T,>({
  items,
  keyExtractor,
  rowHeight,
  variableHeights = false,
  pinnedLeadingCount = 0,
  renderRowContent,
  onReorder,
  onDragStateChange,
  accessibilityMode = false,
  scrollAdapter,
  testIDPrefix,
}: ReorderableRowsProps<T>) => {
  const { height: windowHeight } = useWindowDimensions();

  // ── Variable-height slot map (leg 10 step 6) ──────────────────────────────────────
  // Rows self-measure (onLayout, spacing INSIDE the row); the slot boundaries are the
  // prefix sums over the CURRENT order, recomputed on JS on the rare measure/order
  // change and mirrored to the UI thread. The drag hook freezes its own copy at lift.
  const [rowHeightsByKey, setRowHeightsByKey] = React.useState<Record<string, number>>({});
  const handleMeasureRow = React.useCallback((key: string, height: number) => {
    setRowHeightsByKey((previous) => {
      const known = previous[key];
      if (known != null && Math.abs(known - height) < 0.5) {
        return previous;
      }
      return { ...previous, [key]: height };
    });
  }, []);
  const slotBoundariesArray = React.useMemo<readonly number[] | null>(() => {
    if (!variableHeights) {
      return null;
    }
    const boundaries: number[] = [0];
    let top = 0;
    for (const item of items) {
      top += rowHeightsByKey[keyExtractor(item)] ?? rowHeight;
      boundaries.push(top);
    }
    return boundaries;
  }, [items, keyExtractor, rowHeight, rowHeightsByKey, variableHeights]);
  const slotBoundariesSV = useSharedValue<readonly number[] | null>(slotBoundariesArray);
  React.useEffect(() => {
    slotBoundariesSV.value = slotBoundariesArray;
  }, [slotBoundariesArray, slotBoundariesSV]);

  const drag = useReorderDrag({
    rowHeight,
    itemCount: items.length,
    pinnedLeadingCount,
    onReorder,
    onDragStateChange,
    scrollAdapter,
    // Coarse viewport bands: below the persistent sheet header, above the home bar.
    viewportTopY: 120,
    viewportBottomY: windowHeight - 60,
    slotBoundaries: variableHeights ? slotBoundariesSV : null,
  });

  const stackHeight =
    slotBoundariesArray != null
      ? (slotBoundariesArray[items.length] ?? items.length * rowHeight)
      : items.length * rowHeight;

  return (
    <View style={{ height: stackHeight }}>
      {items.map((item, index) => {
        const rowKey = keyExtractor(item);
        return (
          <ReorderRowShell
            key={rowKey}
            item={item}
            rowKey={rowKey}
            index={index}
            rowHeight={rowHeight}
            variableHeights={variableHeights}
            slotBoundaries={slotBoundariesSV}
            onMeasureRow={handleMeasureRow}
            isDraggable={index >= pinnedLeadingCount}
            accessibilityMode={accessibilityMode}
            itemCount={items.length}
            pinnedLeadingCount={pinnedLeadingCount}
            drag={drag}
            renderRowContent={renderRowContent}
            onReorder={onReorder}
            testIDPrefix={testIDPrefix}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  rowShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  // Wave-3 §2.8 root fix (the edit-mode layout squeeze): the handle is an OVERLAY on
  // the row's center-right (§3.2 — the inline rank bubble frees that region), never a
  // flex column beside the content. The content keeps its full read-mode width in edit
  // mode by construction — entering edit cannot narrow (or "squeeze") the cards.
  rowInner: {
    position: 'relative',
  },
  rowContent: {
    width: '100%',
  },
  handle: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  handleTouchable: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  a11yControls: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  a11yButton: {
    padding: 6,
  },
});
