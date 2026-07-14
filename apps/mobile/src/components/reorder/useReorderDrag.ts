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
  /** The lifted item's live translateX from its LIFT slot (grids only; 0 in a row stack). */
  dragTranslateX: SharedValue<number>;
  /** The slot index the lifted row currently occupies (post live-swaps). */
  activeSlotIndex: SharedValue<number>;
  /** The slot index the row was lifted FROM — the drag translate's base. */
  liftSlotIndex: SharedValue<number>;
  /**
   * The lifted item's TOP offset in the stack at lift time (px). Uniform mode:
   * liftSlotIndex · rowHeight; variable-height mode: the frozen slotBoundaries entry.
   * The render base for the finger-pinned transform (`liftTop + dragTranslateY`).
   */
  liftTop: SharedValue<number>;
  createRowGestures: (
    key: string,
    rowIndex: SharedValue<number>
  ) => {
    handleGesture: ReturnType<typeof Gesture.Pan>;
    bodyGesture: ReturnType<typeof Gesture.Pan>;
  };
};

type UseReorderDragArgs = {
  /** Vertical slot stride (slot height INCLUDING inter-row gap). */
  rowHeight: number;
  /** Slot-map shape (default 1 — the classic row stack). Grids pass their column count. */
  columns?: number;
  /** Horizontal slot stride (cell width INCLUDING gap). Required when columns > 1. */
  columnStride?: number;
  itemCount: number;
  pinnedLeadingCount: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  scrollAdapter?: ReorderScrollAdapter | null;
  /** Viewport bounds (absolute Y) for the auto-scroll edge bands. */
  viewportTopY: number;
  viewportBottomY: number;
  /**
   * §1.4 chrome clamp: per-drag floor on the finger translation (screen-space top
   * clamp — see reorder-drag-math). Owned and written by the consumer at lift
   * (it knows the lifted item's absolute rect); reset on drop. Absent = no clamp.
   */
  minTranslationY?: SharedValue<number> | null;
  /**
   * VARIABLE-HEIGHT slot map (leg 10 step 6): the LIVE prefix boundaries of the
   * 1-column stack (length itemCount + 1 — see reorder-drag-math). The hook FREEZES
   * a copy at lift; the hit-test runs against the frozen geometry for the whole drag
   * (no swap oscillation), while the consumer keeps animating settled rows with the
   * live value. Null/absent = the uniform-stride math, unchanged.
   */
  slotBoundaries?: SharedValue<readonly number[] | null> | null;
};

export const useReorderDrag = ({
  rowHeight,
  columns = 1,
  columnStride = 0,
  itemCount,
  pinnedLeadingCount,
  onReorder,
  onDragStateChange,
  scrollAdapter,
  viewportTopY,
  viewportBottomY,
  minTranslationY = null,
  slotBoundaries = null,
}: UseReorderDragArgs): ReorderDragRuntime => {
  const activeKey = useSharedValue<string | null>(null);
  // OWNERSHIP ARBITRATION (leg-7 instrumentation finding): the handle pan and the
  // row-body long-press pan are SEPARATE recognizers over the same touch. With the
  // handle activating on touch-down, a slow drag kept the finger inside the body
  // pan's slop long enough for its 300ms long-press to ALSO activate — a second
  // beginDrag mid-drag reset the translation baseline (tile snapped to its lift slot
  // mid-hold) and re-armed the clamp. Exactly one gesture may own a drag: the first
  // to start claims it; the other's worklets are inert for that drag.
  const activeGestureOwner = useSharedValue<string | null>(null);
  const dragTranslateY = useSharedValue(0);
  const dragTranslateX = useSharedValue(0);
  const activeSlotIndex = useSharedValue(0);
  const liftSlotIndex = useSharedValue(0);
  const liftTop = useSharedValue(0);
  // FROZEN-at-lift copy of the live slotBoundaries — the hit-test geometry for the
  // whole drag (variable-height mode only; null in uniform mode).
  const liftSlotBoundaries = useSharedValue<readonly number[] | null>(null);
  const liftScrollOffset = useSharedValue(0);
  const autoScrollStep = useSharedValue(0);
  // Last gesture sample, replayed by the auto-scroll pump so a STATIONARY finger still
  // gets per-frame slot/translate recomputes while the container scrolls under it.
  const lastTranslationY = useSharedValue(0);
  const lastTranslationX = useSharedValue(0);
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
    (translationY: number, translationX: number, absoluteY: number) => {
      'worklet';
      if (activeKey.value == null) {
        return;
      }
      const frame = computeDragFrame({
        translationY,
        translationX,
        absoluteY,
        scrollOffset: effectiveScrollOffset.value,
        liftScrollOffset: liftScrollOffset.value,
        liftSlotIndex: liftSlotIndex.value,
        rowHeight,
        columns,
        columnStride,
        pinnedLeadingCount,
        itemCount: itemCountSV.value,
        viewportTopY,
        viewportBottomY,
        minTranslationY: minTranslationY?.value ?? Number.NEGATIVE_INFINITY,
        slotBoundaries: liftSlotBoundaries.value,
      });
      dragTranslateY.value = frame.translate;
      dragTranslateX.value = frame.translateX;
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
      columnStride,
      columns,
      dragTranslateX,
      dragTranslateY,
      effectiveScrollOffset,
      emitReorder,
      itemCountSV,
      liftScrollOffset,
      liftSlotIndex,
      minTranslationY,
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
    applyDragFrame(lastTranslationY.value, lastTranslationX.value, lastAbsoluteY.value);
  }, false);
  const setAutoScrollActive = autoScrollFrame.setActive;

  return React.useMemo(() => {
    const beginDrag = (owner: string, key: string, index: number, absoluteY: number) => {
      'worklet';
      if (activeKey.value != null) {
        // A drag is live (the other recognizer owns it) — never re-begin mid-drag.
        return;
      }
      activeGestureOwner.value = owner;
      activeKey.value = key;
      liftSlotIndex.value = index;
      // Freeze the slot geometry for the whole drag (variable-height mode; null in
      // uniform mode) + the lifted item's render base.
      const boundariesAtLift = slotBoundaries?.value ?? null;
      liftSlotBoundaries.value =
        boundariesAtLift != null && boundariesAtLift.length === itemCountSV.value + 1
          ? boundariesAtLift
          : null;
      liftTop.value =
        liftSlotBoundaries.value != null ? liftSlotBoundaries.value[index] : index * rowHeight;
      activeSlotIndex.value = index;
      dragTranslateY.value = 0;
      dragTranslateX.value = 0;
      liftScrollOffset.value = effectiveScrollOffset.value;
      autoScrollStep.value = 0;
      // Seed the replay sample so a pump frame before the first onUpdate is a no-op
      // recompute at the lift position, not a jump from stale coordinates.
      lastTranslationY.value = 0;
      lastTranslationX.value = 0;
      lastAbsoluteY.value = absoluteY;
      runOnJS(setAutoScrollActive)(true);
      runOnJS(emitDragState)(true);
    };

    const updateDrag = (
      owner: string,
      translationY: number,
      translationX: number,
      absoluteY: number
    ) => {
      'worklet';
      if (activeGestureOwner.value !== owner) {
        return; // inert for a drag another recognizer owns
      }
      // Store the sample FIRST — the auto-scroll pump replays it every frame while the
      // finger holds still, so slot + finger-pin stay live during auto-scroll.
      lastTranslationY.value = translationY;
      lastTranslationX.value = translationX;
      lastAbsoluteY.value = absoluteY;
      applyDragFrame(translationY, translationX, absoluteY);
    };

    const endDrag = (owner: string) => {
      'worklet';
      if (activeKey.value == null || activeGestureOwner.value !== owner) {
        return;
      }
      activeGestureOwner.value = null;
      activeKey.value = null;
      dragTranslateY.value = 0;
      dragTranslateX.value = 0;
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

      // Handle icon = INSTANT drag (§8.14: "handle icon lifts instantly") — and
      // "instantly" means ON TOUCH-DOWN (manual activation), not after a movement
      // threshold. The wave-2 §1.5 fast-grab root cause: with a distance threshold
      // (minDistance 4), a grab-and-immediately-move race let the OUTER native sheet
      // scroll recognize the same fast movement first and CANCEL the pan mid-lift —
      // the tile snapped back while the list scrolled away under the finger.
      // (Grab-then-pause only ever worked because the BODY long-press timer (300ms)
      // was doing the lifting — the hold-timer interplay the owner suspected.)
      // A dedicated drag affordance claims the touch the instant it lands (the iOS
      // reorder-control standard); activation precedes ANY movement, so no
      // recognizer race exists. Applies to rows and grids alike.
      const handleGesture = Gesture.Pan()
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .manualActivation(true)
        .onTouchesDown((_event, stateManager) => {
          stateManager.activate();
        })
        .onStart((event) => {
          'worklet';
          beginDrag(`handle:${key}`, key, rowIndex.value, event.absoluteY);
        })
        .onUpdate((event) => {
          'worklet';
          updateDrag(`handle:${key}`, event.translationY, event.translationX, event.absoluteY);
        })
        .onEnd(() => {
          'worklet';
          endDrag(`handle:${key}`);
        })
        .onFinalize(() => {
          'worklet';
          endDrag(`handle:${key}`);
        });

      // Row body = lift after ~0.3s stillness; movement first = scroll (the pan FAILS
      // on pre-duration movement and the outer native scroll keeps the touch).
      const bodyGesture = Gesture.Pan()
        .maxPointers(1)
        .activateAfterLongPress(ROW_BODY_LIFT_MS)
        .shouldCancelWhenOutside(false)
        .onStart((event) => {
          'worklet';
          beginDrag(`body:${key}`, key, rowIndex.value, event.absoluteY);
        })
        .onUpdate((event) => {
          'worklet';
          updateDrag(`body:${key}`, event.translationY, event.translationX, event.absoluteY);
        })
        .onEnd(() => {
          'worklet';
          endDrag(`body:${key}`);
        })
        .onFinalize(() => {
          'worklet';
          endDrag(`body:${key}`);
        });

      return { handleGesture, bodyGesture };
    };

    return {
      activeKey,
      dragTranslateY,
      dragTranslateX,
      activeSlotIndex,
      liftSlotIndex,
      liftTop,
      createRowGestures,
    };
  }, [
    activeGestureOwner,
    activeKey,
    activeSlotIndex,
    applyDragFrame,
    autoScrollStep,
    dragTranslateX,
    dragTranslateY,
    effectiveScrollOffset,
    emitDragState,
    itemCountSV,
    lastAbsoluteY,
    lastTranslationX,
    lastTranslationY,
    liftScrollOffset,
    liftSlotBoundaries,
    liftSlotIndex,
    liftTop,
    rowHeight,
    setAutoScrollActive,
    slotBoundaries,
  ]);
};
