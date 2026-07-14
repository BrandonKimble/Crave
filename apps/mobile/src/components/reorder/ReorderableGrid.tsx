import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ChevronDown, ChevronUp, ChevronsUp } from 'lucide-react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
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
import type { ReorderScrollAdapter } from './reorder-types';

// Reusable 2-column drag-reorder GRID (charter Part 4 / favorites-edit-mode-ideal
// decision 3 — the slot-map generalization of ReorderableRows). NOT a list — a
// fixed-geometry field of absolutely-positioned tile shells inside a scroll container
// the consumer owns (the shared sheet scroll). Slot index = row × columns + col; slot
// rects derive from MEASURED read-mode geometry (cellWidth / rowHeight / gap), so edit
// mode replicates the read grid's layout by construction. Same 60fps contract as the
// rows: finger tracking and slot resolution are pure UI-thread worklets; the only JS
// traffic during a drag is the rare slot-crossing callback and edge auto-scroll steps.
// Settled shells shuffle live via per-shell withTiming toward their (JS-updated) slot.

const SLOT_SHUFFLE_MS = 180;
const TILE_ACTIVE_SCALE = 1.03;

export type ReorderGridRenderContext = {
  /** False for pinned tiles (system lists) — rendered, handle-less, immovable. */
  isDraggable: boolean;
  /** True while THIS tile is lifted. */
  isActiveDrag: boolean;
  /**
   * INSTANT-lift pan for the tile's own handle affordance (the ellipsis-slot grab
   * handle) — the tile wraps its handle in a GestureDetector with this. Null for
   * pinned tiles and in accessibility mode.
   */
  handleGesture: GestureType | null;
};

export type ReorderableGridProps<T> = {
  items: readonly T[];
  keyExtractor: (item: T) => string;
  /** Measured read-mode cell width (px, excluding the inter-column gap). */
  cellWidth: number;
  /** Measured read-mode row height (px, excluding the inter-row gap). */
  rowHeight: number;
  /** Inter-slot gap on both axes (the read grid's GRID_GAP). */
  gap: number;
  columns?: number;
  /** The first N slots are PINNED: rendered, no handle, drag range clamps below them. */
  pinnedLeadingCount?: number;
  renderTile: (item: T, context: ReorderGridRenderContext) => React.ReactNode;
  /** LIVE reorder callback — fired on each slot crossing (and per a11y press). */
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  /** WCAG 2.5.7 non-drag path: overlay move buttons instead of drag handles. */
  accessibilityMode?: boolean;
  scrollAdapter?: ReorderScrollAdapter | null;
  /**
   * §1.4 chrome clamp: resolves the absolute window Y of the header's bottom edge
   * AT LIFT TIME (the header rides the sheet, so a mount-time constant would go
   * stale across snaps). The dragged tile's TOP edge never renders above this line —
   * the finger may keep going, the tile holds at the boundary and rejoins on the
   * way back. Null / resolving null = no clamp.
   */
  resolveDragClampTopY?: (() => Promise<number | null>) | null;
  testIDPrefix?: string;
};

type TileShellProps<T> = {
  item: T;
  tileKey: string;
  index: number;
  cellWidth: number;
  rowHeight: number;
  columns: number;
  columnStride: number;
  rowStride: number;
  isDraggable: boolean;
  accessibilityMode: boolean;
  itemCount: number;
  pinnedLeadingCount: number;
  drag: ReorderDragRuntime;
  renderTile: ReorderableGridProps<T>['renderTile'];
  onReorder: ReorderableGridProps<T>['onReorder'];
  testIDPrefix?: string;
};

const ReorderTileShell = <T,>({
  item,
  tileKey,
  index,
  cellWidth,
  rowHeight,
  columns,
  columnStride,
  rowStride,
  isDraggable,
  accessibilityMode,
  itemCount,
  pinnedLeadingCount,
  drag,
  renderTile,
  onReorder,
  testIDPrefix,
}: TileShellProps<T>) => {
  // The shell's current slot, mirrored to the UI thread — drives the settled position
  // AND the lift-time slot read inside the (stable) gesture worklets.
  const slotIndexSV: SharedValue<number> = useSharedValue(index);
  React.useEffect(() => {
    slotIndexSV.value = index;
  }, [index, slotIndexSV]);

  const [isActiveDrag, setIsActiveDrag] = React.useState(false);

  const gestures = React.useMemo(
    () => (isDraggable && !accessibilityMode ? drag.createRowGestures(tileKey, slotIndexSV) : null),
    [accessibilityMode, drag, isDraggable, slotIndexSV, tileKey]
  );

  const animatedStyle = useAnimatedStyle(() => {
    const isActive = drag.activeKey.value === tileKey;
    if (isActive) {
      // Finger-pinned at the LIFT slot rect + live 2-D translate — pure UI-thread values.
      const liftSlot = drag.liftSlotIndex.value;
      const liftRow = Math.floor(liftSlot / columns);
      const liftCol = liftSlot - liftRow * columns;
      return {
        transform: [
          { translateX: liftCol * columnStride + drag.dragTranslateX.value },
          { translateY: liftRow * rowStride + drag.dragTranslateY.value },
          { scale: TILE_ACTIVE_SCALE },
        ],
        zIndex: 10,
        elevation: 10,
      };
    }
    const row = Math.floor(slotIndexSV.value / columns);
    const col = slotIndexSV.value - row * columns;
    return {
      transform: [
        { translateX: withTiming(col * columnStride, { duration: SLOT_SHUFFLE_MS }) },
        { translateY: withTiming(row * rowStride, { duration: SLOT_SHUFFLE_MS }) },
        { scale: withTiming(1, { duration: SLOT_SHUFFLE_MS }) },
      ],
      zIndex: 0,
      elevation: 0,
    };
  }, [
    columnStride,
    columns,
    drag.activeKey,
    drag.dragTranslateX,
    drag.dragTranslateY,
    drag.liftSlotIndex,
    rowStride,
    slotIndexSV,
    tileKey,
  ]);

  // Mirror the UI-thread active flag into React state so renderTile can style the
  // lifted tile. Fires twice per drag — lift and drop.
  useAnimatedReaction(
    () => drag.activeKey.value === tileKey,
    (isActive, previous) => {
      if (isActive !== previous) {
        runOnJS(setIsActiveDrag)(isActive);
      }
    },
    [drag.activeKey, tileKey]
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

  const content = renderTile(item, {
    isDraggable,
    isActiveDrag,
    handleGesture: gestures?.handleGesture ?? null,
  });

  // WCAG 2.5.7 non-drag path (mirrors ReorderableRows): overlay linear-order move
  // buttons on draggable tiles — one press = one complete slot move.
  const a11yControls =
    accessibilityMode && isDraggable ? (
      <View style={styles.a11yControls}>
        <Pressable
          onPress={handleMoveToTop}
          disabled={index <= pinnedLeadingCount}
          accessibilityRole="button"
          accessibilityLabel="Move to top"
          hitSlop={6}
          style={styles.a11yButton}
          testID={testIDPrefix ? `${testIDPrefix}-move-top-${tileKey}` : undefined}
        >
          <ChevronsUp size={18} color={index <= pinnedLeadingCount ? '#cbd5e1' : '#475569'} />
        </Pressable>
        <Pressable
          onPress={handleMoveUp}
          disabled={index <= pinnedLeadingCount}
          accessibilityRole="button"
          accessibilityLabel="Move up"
          hitSlop={6}
          style={styles.a11yButton}
          testID={testIDPrefix ? `${testIDPrefix}-move-up-${tileKey}` : undefined}
        >
          <ChevronUp size={18} color={index <= pinnedLeadingCount ? '#cbd5e1' : '#475569'} />
        </Pressable>
        <Pressable
          onPress={handleMoveDown}
          disabled={index >= itemCount - 1}
          accessibilityRole="button"
          accessibilityLabel="Move down"
          hitSlop={6}
          style={styles.a11yButton}
          testID={testIDPrefix ? `${testIDPrefix}-move-down-${tileKey}` : undefined}
        >
          <ChevronDown size={18} color={index >= itemCount - 1 ? '#cbd5e1' : '#475569'} />
        </Pressable>
      </View>
    ) : null;

  const shellInner = (
    <View style={[styles.shellInner, { width: cellWidth, height: rowHeight }]}>
      {content}
      {a11yControls}
    </View>
  );

  return (
    <Animated.View
      style={[styles.shell, { width: cellWidth, height: rowHeight }, animatedStyle]}
      testID={testIDPrefix ? `${testIDPrefix}-tile-${tileKey}` : undefined}
    >
      {gestures != null ? (
        // Tile body = lift after ~0.3s stillness (movement first = scroll); the tile's
        // own handle (via context) lifts instantly.
        <GestureDetector gesture={gestures.bodyGesture}>{shellInner}</GestureDetector>
      ) : (
        shellInner
      )}
    </Animated.View>
  );
};

export const ReorderableGrid = <T,>({
  items,
  keyExtractor,
  cellWidth,
  rowHeight,
  gap,
  columns = 2,
  pinnedLeadingCount = 0,
  renderTile,
  onReorder,
  onDragStateChange,
  accessibilityMode = false,
  scrollAdapter,
  resolveDragClampTopY = null,
  testIDPrefix,
}: ReorderableGridProps<T>) => {
  const { height: windowHeight } = useWindowDimensions();
  const columnStride = cellWidth + gap;
  const rowStride = rowHeight + gap;

  // §1.4: the clamp floor on the finger translation, derived at LIFT — the grid
  // measures its own absolute top and knows the lifted slot's rect, so
  // minTranslationY = clampTopY − liftTileAbsTop (screen-space; invariant under
  // auto-scroll — see reorder-drag-math). Reset on drop.
  const containerRef = React.useRef<View>(null);
  const minTranslationY = useSharedValue(Number.NEGATIVE_INFINITY);
  const dragRef = React.useRef<ReorderDragRuntime | null>(null);
  const resolveDragClampTopYRef = React.useRef(resolveDragClampTopY);
  resolveDragClampTopYRef.current = resolveDragClampTopY;
  const onDragStateChangeRef = React.useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;
  const handleDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      if (isDragging) {
        const resolver = resolveDragClampTopYRef.current;
        if (resolver != null) {
          void Promise.resolve(resolver()).then((clampTopY) => {
            if (clampTopY == null) {
              return;
            }
            containerRef.current?.measureInWindow((_x, y) => {
              const runtime = dragRef.current;
              if (runtime == null || runtime.activeKey.value == null) {
                return; // drop landed before the measure round-trip
              }
              const liftRow = Math.floor(runtime.liftSlotIndex.value / columns);
              minTranslationY.value = clampTopY - (y + liftRow * rowStride);
            });
          });
        }
      } else {
        minTranslationY.value = Number.NEGATIVE_INFINITY;
      }
      onDragStateChangeRef.current?.(isDragging);
    },
    [columns, minTranslationY, rowStride]
  );

  const drag = useReorderDrag({
    rowHeight: rowStride,
    columns,
    columnStride,
    itemCount: items.length,
    pinnedLeadingCount,
    onReorder,
    onDragStateChange: handleDragStateChange,
    scrollAdapter,
    // Coarse viewport bands: below the persistent sheet header, above the home bar.
    // (The §1.4 clamp is exact — resolved at lift; the band only gates WHEN the
    // edge pump engages, so the coarse constant is acceptable there.)
    viewportTopY: 120,
    viewportBottomY: windowHeight - 60,
    minTranslationY,
  });
  dragRef.current = drag;

  const rowCount = Math.ceil(items.length / columns);
  const fieldHeight = rowCount > 0 ? rowCount * rowStride - gap : 0;

  return (
    <View ref={containerRef} style={{ height: fieldHeight }} collapsable={false}>
      {items.map((item, index) => {
        const tileKey = keyExtractor(item);
        return (
          <ReorderTileShell
            key={tileKey}
            item={item}
            tileKey={tileKey}
            index={index}
            cellWidth={cellWidth}
            rowHeight={rowHeight}
            columns={columns}
            columnStride={columnStride}
            rowStride={rowStride}
            isDraggable={index >= pinnedLeadingCount}
            accessibilityMode={accessibilityMode}
            itemCount={items.length}
            pinnedLeadingCount={pinnedLeadingCount}
            drag={drag}
            renderTile={renderTile}
            onReorder={onReorder}
            testIDPrefix={testIDPrefix}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  shellInner: {
    overflow: 'visible',
  },
  a11yControls: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
  },
  a11yButton: {
    padding: 6,
  },
});
