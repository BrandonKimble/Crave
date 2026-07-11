import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Feather } from '@expo/vector-icons';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
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
// fixed-height stack of absolutely-positioned rows meant to live inside a scroll
// container the consumer owns (the shared sheet scroll). 60fps approach: uniform row
// height ⇒ every slot position is `index * rowHeight`, finger tracking and slot
// resolution are pure UI-thread worklets, and the ONLY JS-thread traffic during a drag
// is the rare slot-crossing callback (consumer state swap) and edge auto-scroll steps.
// Rows shuffle live via per-row withTiming toward their (JS-updated) slot index.

const SLOT_SHUFFLE_MS = 180;

const ROW_ACTIVE_SCALE = 1.02;

type RowProps<T> = {
  item: T;
  rowKey: string;
  index: number;
  rowHeight: number;
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
      // UI-thread values, no JS in the frame loop.
      return {
        transform: [
          { translateY: drag.liftSlotIndex.value * rowHeight + drag.dragTranslateY.value },
          { scale: ROW_ACTIVE_SCALE },
        ],
        zIndex: 10,
        elevation: 10,
      };
    }
    return {
      transform: [
        { translateY: withTiming(rowIndexSV.value * rowHeight, { duration: SLOT_SHUFFLE_MS }) },
        { scale: withTiming(1, { duration: SLOT_SHUFFLE_MS }) },
      ],
      zIndex: 0,
      elevation: 0,
    };
  }, [drag.activeKey, drag.dragTranslateY, drag.liftSlotIndex, rowHeight, rowIndexSV, rowKey]);

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
    <GestureDetector gesture={gestures.handleGesture}>
      <View
        style={styles.handle}
        accessibilityLabel="Drag to reorder"
        testID={testIDPrefix ? `${testIDPrefix}-handle-${rowKey}` : undefined}
      >
        <Feather name="menu" size={18} color="#475569" />
      </View>
    </GestureDetector>
  ) : null;

  const rowInner = (
    <View style={[styles.rowInner, { height: rowHeight }]}>
      <View style={styles.rowContent}>{content}</View>
      {rowAffordance}
    </View>
  );

  return (
    <Animated.View
      style={[styles.rowShell, { height: rowHeight }, animatedStyle]}
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
  pinnedLeadingCount = 0,
  renderRowContent,
  onReorder,
  onDragStateChange,
  accessibilityMode = false,
  scrollAdapter,
  testIDPrefix,
}: ReorderableRowsProps<T>) => {
  const { height: windowHeight } = useWindowDimensions();
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
  });

  return (
    <View style={{ height: items.length * rowHeight }}>
      {items.map((item, index) => {
        const rowKey = keyExtractor(item);
        return (
          <ReorderRowShell
            key={rowKey}
            item={item}
            rowKey={rowKey}
            index={index}
            rowHeight={rowHeight}
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
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowContent: {
    flex: 1,
  },
  handle: {
    paddingHorizontal: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  a11yControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  a11yButton: {
    padding: 6,
  },
});
