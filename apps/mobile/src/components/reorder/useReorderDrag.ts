import React from 'react';

import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { computeDragFrame } from './reorder-drag-math';
import type { ReorderScrollAdapter } from './reorder-types';

// Row-body lift timing (page-registry §8.14, owner-confirmed): movement within the
// first ~0.3s = scroll; stillness through 0.3s = lift. RNGH's activateAfterLongPress
// implements exactly this — the pan FAILS if the pointer travels past slop before the
// duration, letting the outer native scroll take the touch.
const ROW_BODY_LIFT_MS = 300;

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
  // Last gesture sample, replayed by the auto-scroll pump so a STATIONARY finger still
  // gets per-frame slot/translate recomputes while the container scrolls under it.
  const lastTranslationY = useSharedValue(0);
  const lastAbsoluteY = useSharedValue(0);

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

  // Shared slot/translate recompute — the ONE drag-frame math both drive paths call:
  // pan onUpdate (finger moves) and the auto-scroll pump (finger stationary, container
  // scrolling). Worklet-pure: reads only shared values + captured constants.
  const applyDragFrame = React.useCallback(
    (translationY: number, absoluteY: number) => {
      'worklet';
      if (activeKey.value == null) {
        return;
      }
      const frame = computeDragFrame({
        translationY,
        absoluteY,
        scrollOffset: effectiveScrollOffset.value,
        liftScrollOffset: liftScrollOffset.value,
        liftSlotIndex: liftSlotIndex.value,
        rowHeight,
        pinnedLeadingCount,
        itemCount: itemCountSV.value,
        viewportTopY,
        viewportBottomY,
      });
      dragTranslateY.value = frame.translate;
      if (frame.slot !== activeSlotIndex.value) {
        const fromIndex = activeSlotIndex.value;
        activeSlotIndex.value = frame.slot;
        runOnJS(emitReorder)(fromIndex, frame.slot);
      }
      autoScrollStep.value = frame.autoScrollStep;
    },
    [
      activeKey,
      activeSlotIndex,
      autoScrollStep,
      dragTranslateY,
      effectiveScrollOffset,
      emitReorder,
      itemCountSV,
      liftScrollOffset,
      liftSlotIndex,
      pinnedLeadingCount,
      rowHeight,
      viewportBottomY,
      viewportTopY,
    ]
  );

  // Edge auto-scroll pump. Runs ONLY while a drag is active (the callback is toggled
  // active below) — zero cost otherwise. The scroll itself is a JS-thread imperative
  // scrollTo; the recompute below replays the LAST gesture sample against the moving
  // scroll offset each frame, so a STATIONARY finger keeps the lifted row finger-pinned
  // and keeps advancing activeSlotIndex while the container auto-scrolls under it.
  const autoScrollFrame = useFrameCallback(() => {
    'worklet';
    if (activeKey.value == null) {
      return;
    }
    if (autoScrollStep.value !== 0) {
      runOnJS(scrollByJS)(autoScrollStep.value);
    }
    applyDragFrame(lastTranslationY.value, lastAbsoluteY.value);
  }, false);
  const setAutoScrollActive = autoScrollFrame.setActive;

  return React.useMemo(() => {
    const beginDrag = (key: string, index: number, absoluteY: number) => {
      'worklet';
      activeKey.value = key;
      liftSlotIndex.value = index;
      activeSlotIndex.value = index;
      dragTranslateY.value = 0;
      liftScrollOffset.value = effectiveScrollOffset.value;
      autoScrollStep.value = 0;
      // Seed the replay sample so a pump frame before the first onUpdate is a no-op
      // recompute at the lift position, not a jump from stale coordinates.
      lastTranslationY.value = 0;
      lastAbsoluteY.value = absoluteY;
      runOnJS(setAutoScrollActive)(true);
      runOnJS(emitDragState)(true);
    };

    const updateDrag = (translationY: number, absoluteY: number) => {
      'worklet';
      // Store the sample FIRST — the auto-scroll pump replays it every frame while the
      // finger holds still, so slot + finger-pin stay live during auto-scroll.
      lastTranslationY.value = translationY;
      lastAbsoluteY.value = absoluteY;
      applyDragFrame(translationY, absoluteY);
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
        .onStart((event) => {
          'worklet';
          beginDrag(key, rowIndex.value, event.absoluteY);
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
        .onStart((event) => {
          'worklet';
          beginDrag(key, rowIndex.value, event.absoluteY);
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
    applyDragFrame,
    autoScrollStep,
    dragTranslateY,
    effectiveScrollOffset,
    emitDragState,
    lastAbsoluteY,
    lastTranslationY,
    liftScrollOffset,
    liftSlotIndex,
    setAutoScrollActive,
  ]);
};
