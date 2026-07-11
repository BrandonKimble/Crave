import React from 'react';

import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { ReorderScrollAdapter } from './reorder-types';

// Row-body lift timing (page-registry §8.14, owner-confirmed): movement within the
// first ~0.3s = scroll; stillness through 0.3s = lift. RNGH's activateAfterLongPress
// implements exactly this — the pan FAILS if the pointer travels past slop before the
// duration, letting the outer native scroll take the touch.
const ROW_BODY_LIFT_MS = 300;

// Edge auto-scroll: hovering the lifted row within this many px of the viewport
// edge scrolls the container, proportional to how deep into the band the finger is.
const AUTO_SCROLL_EDGE_BAND_PX = 96;
const AUTO_SCROLL_MAX_STEP_PX = 14;

export type ReorderDragRuntime = {
  /** Key of the row currently lifted, or null. Drives per-row active styling. */
  activeKey: SharedValue<string | null>;
  /** The lifted row's live translateY from its LIFT slot (finger + auto-scroll compensation). */
  dragTranslateY: SharedValue<number>;
  /** The slot index the lifted row currently occupies (post live-swaps). */
  activeSlotIndex: SharedValue<number>;
  /** The slot index the row was lifted FROM — the drag translate's base. */
  liftSlotIndex: SharedValue<number>;
  createRowGestures: (
    key: string,
    rowIndex: SharedValue<number>
  ) => {
    handleGesture: ReturnType<typeof Gesture.Pan>;
    bodyGesture: ReturnType<typeof Gesture.Pan>;
  };
};

type UseReorderDragArgs = {
  rowHeight: number;
  itemCount: number;
  pinnedLeadingCount: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  scrollAdapter?: ReorderScrollAdapter | null;
  /** Viewport bounds (absolute Y) for the auto-scroll edge bands. */
  viewportTopY: number;
  viewportBottomY: number;
};

export const useReorderDrag = ({
  rowHeight,
  itemCount,
  pinnedLeadingCount,
  onReorder,
  onDragStateChange,
  scrollAdapter,
  viewportTopY,
  viewportBottomY,
}: UseReorderDragArgs): ReorderDragRuntime => {
  const activeKey = useSharedValue<string | null>(null);
  const dragTranslateY = useSharedValue(0);
  const activeSlotIndex = useSharedValue(0);
  const liftSlotIndex = useSharedValue(0);
  const liftScrollOffset = useSharedValue(0);
  const autoScrollStep = useSharedValue(0);

  // Latest-value refs so the memoized gesture factory never captures stale JS state.
  const itemCountRef = React.useRef(itemCount);
  itemCountRef.current = itemCount;
  const onReorderRef = React.useRef(onReorder);
  onReorderRef.current = onReorder;
  const onDragStateChangeRef = React.useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;
  const scrollAdapterRef = React.useRef(scrollAdapter);
  scrollAdapterRef.current = scrollAdapter;
  const itemCountSV = useSharedValue(itemCount);
  itemCountSV.value = itemCount;

  const scrollOffsetSV = scrollAdapter?.scrollOffset ?? null;
  const fallbackScrollOffset = useSharedValue(0);
  const effectiveScrollOffset = scrollOffsetSV ?? fallbackScrollOffset;

  const emitReorder = React.useCallback((fromIndex: number, toIndex: number) => {
    onReorderRef.current(fromIndex, toIndex);
  }, []);
  const emitDragState = React.useCallback((isDragging: boolean) => {
    onDragStateChangeRef.current?.(isDragging);
  }, []);
  const scrollByJS = React.useCallback((dy: number) => {
    scrollAdapterRef.current?.scrollBy(dy);
  }, []);

  // Edge auto-scroll pump. Runs ONLY while a drag is active AND the finger sits in an
  // edge band (the callback is toggled active below) — zero cost otherwise. The scroll
  // itself is a JS-thread imperative scrollTo; the lifted row's position compensates
  // via effectiveScrollOffset in the drag math, so it stays under the finger.
  const autoScrollFrame = useFrameCallback(() => {
    'worklet';
    if (activeKey.value == null || autoScrollStep.value === 0) {
      return;
    }
    runOnJS(scrollByJS)(autoScrollStep.value);
  }, false);
  const setAutoScrollActive = autoScrollFrame.setActive;

  return React.useMemo(() => {
    const resolveSlot = (translateFromLift: number) => {
      'worklet';
      const rawSlot = liftSlotIndex.value + Math.round(translateFromLift / rowHeight);
      const minSlot = pinnedLeadingCount;
      const maxSlot = itemCountSV.value - 1;
      return Math.max(minSlot, Math.min(maxSlot, rawSlot));
    };

    const beginDrag = (key: string, index: number) => {
      'worklet';
      activeKey.value = key;
      liftSlotIndex.value = index;
      activeSlotIndex.value = index;
      dragTranslateY.value = 0;
      liftScrollOffset.value = effectiveScrollOffset.value;
      autoScrollStep.value = 0;
      runOnJS(setAutoScrollActive)(true);
      runOnJS(emitDragState)(true);
    };

    const updateDrag = (translationY: number, absoluteY: number) => {
      'worklet';
      if (activeKey.value == null) {
        return;
      }
      // Auto-scroll compensation: while the container scrolls under the finger, the
      // row's translate must grow by the scrolled distance to stay finger-pinned.
      const scrollDelta = effectiveScrollOffset.value - liftScrollOffset.value;
      const translate = translationY + scrollDelta;
      dragTranslateY.value = translate;

      const nextSlot = resolveSlot(translate);
      if (nextSlot !== activeSlotIndex.value) {
        const fromIndex = activeSlotIndex.value;
        activeSlotIndex.value = nextSlot;
        runOnJS(emitReorder)(fromIndex, nextSlot);
      }

      // Edge bands → proportional auto-scroll step (0 outside the bands).
      const topDepth = viewportTopY + AUTO_SCROLL_EDGE_BAND_PX - absoluteY;
      const bottomDepth = absoluteY - (viewportBottomY - AUTO_SCROLL_EDGE_BAND_PX);
      if (topDepth > 0) {
        autoScrollStep.value =
          -Math.min(1, topDepth / AUTO_SCROLL_EDGE_BAND_PX) * AUTO_SCROLL_MAX_STEP_PX;
      } else if (bottomDepth > 0) {
        autoScrollStep.value =
          Math.min(1, bottomDepth / AUTO_SCROLL_EDGE_BAND_PX) * AUTO_SCROLL_MAX_STEP_PX;
      } else {
        autoScrollStep.value = 0;
      }
    };

    const endDrag = () => {
      'worklet';
      if (activeKey.value == null) {
        return;
      }
      activeKey.value = null;
      dragTranslateY.value = 0;
      autoScrollStep.value = 0;
      runOnJS(setAutoScrollActive)(false);
      runOnJS(emitDragState)(false);
    };

    const createRowGestures = (key: string, rowIndex: SharedValue<number>) => {
      // The lift-time slot must be the row's CURRENT index (live swaps re-index rows),
      // and the gesture object must stay STABLE across those re-indexes (recreating an
      // RNGH gesture mid-drag breaks the in-flight recognizer). So the index rides in
      // through a per-row shared value the row mirrors on every render, and the
      // worklet reads it at lift.

      // Handle icon = INSTANT drag (§8.14: "handle icon lifts instantly").
      const handleGesture = Gesture.Pan()
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .activeOffsetY([-4, 4])
        .failOffsetX([-16, 16])
        .onStart(() => {
          'worklet';
          beginDrag(key, rowIndex.value);
        })
        .onUpdate((event) => {
          'worklet';
          updateDrag(event.translationY, event.absoluteY);
        })
        .onEnd(() => {
          'worklet';
          endDrag();
        })
        .onFinalize(() => {
          'worklet';
          endDrag();
        });

      // Row body = lift after ~0.3s stillness; movement first = scroll (the pan FAILS
      // on pre-duration movement and the outer native scroll keeps the touch).
      const bodyGesture = Gesture.Pan()
        .maxPointers(1)
        .activateAfterLongPress(ROW_BODY_LIFT_MS)
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          'worklet';
          beginDrag(key, rowIndex.value);
        })
        .onUpdate((event) => {
          'worklet';
          updateDrag(event.translationY, event.absoluteY);
        })
        .onEnd(() => {
          'worklet';
          endDrag();
        })
        .onFinalize(() => {
          'worklet';
          endDrag();
        });

      return { handleGesture, bodyGesture };
    };

    return { activeKey, dragTranslateY, activeSlotIndex, liftSlotIndex, createRowGestures };
  }, [
    activeKey,
    activeSlotIndex,
    autoScrollStep,
    dragTranslateY,
    effectiveScrollOffset,
    emitDragState,
    emitReorder,
    itemCountSV,
    liftScrollOffset,
    liftSlotIndex,
    pinnedLeadingCount,
    rowHeight,
    setAutoScrollActive,
    viewportBottomY,
    viewportTopY,
  ]);
};
