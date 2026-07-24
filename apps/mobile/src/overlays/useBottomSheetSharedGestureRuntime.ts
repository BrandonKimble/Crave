import React from 'react';

import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { BottomSheetSnapChangeSource } from './bottomSheetMotionTypes';
import type { BottomSheetSharedRuntimeConfigSharedValues } from './bottomSheetSharedRuntimeContract';
import { overlaySheetEditLockValue } from './overlaySheetEditLockRuntime';
import { overlaySheetSceneSnapLockValue } from './overlaySheetSceneSnapLockRuntime';
import {
  AXIS_LOCK_HORIZONTAL,
  AXIS_LOCK_NONE,
  AXIS_LOCK_RATIO,
  AXIS_LOCK_SLOP_PX,
  AXIS_LOCK_VERTICAL,
  DRAG_EPSILON,
  GESTURE_OWNER_SCROLL,
  GESTURE_OWNER_SHEET,
  applyElasticBounds,
  isAtScrollTop,
  inverseNativeRubberBandDistance,
  nativeRubberBandDistance,
} from './bottomSheetSharedRuntimeUtils';

type HandoffOptions = {
  clampToExpanded?: boolean;
};

type GestureStateManagerLike = {
  activate: () => void;
  fail: () => void;
};

// The rebound spring (native baseline): CRITICALLY DAMPED — native scroll bounce never
// overshoots; it returns asymptotically in ~450ms. damping = 2·√(stiffness·mass).
const OVERSCROLL_REBOUND_SPRING = { mass: 1, stiffness: 170, damping: 26 } as const;

type UseBottomSheetSharedGestureRuntimeArgs = {
  gestureEnabled: boolean;
  /** Boundary-physics law: the runtime-owned overscroll value + the active list's max
   *  interior offset (the atBottom fact). */
  contentOverscroll: SharedValue<number>;
  maxScrollOffset: SharedValue<number>;
  scrollViewportHeight: SharedValue<number>;
  preventSwipeDismiss: boolean;
  expandedSnap: number;
  middleSnap: number;
  collapsedSnap: number;
  hiddenSnap?: number;
  headerHeight: SharedValue<number>;
  expandTouchInHeader: SharedValue<boolean>;
  expandGestureOwner: SharedValue<number>;
  expandHandoffLocked: SharedValue<boolean>;
  expandStartedBelowExpanded: SharedValue<boolean>;
  expandAllowTopElastic: SharedValue<boolean>;
  collapseTouchInHeader: SharedValue<boolean>;
  expandPanActive: SharedValue<boolean>;
  expandDidHandoffToScroll: SharedValue<boolean>;
  expandStartSheetY: SharedValue<number>;
  expandStartTouchX: SharedValue<number>;
  expandStartTouchY: SharedValue<number>;
  expandLastTouchX: SharedValue<number>;
  expandLastTouchY: SharedValue<number>;
  expandAxisLock: SharedValue<number>;
  collapsePanActive: SharedValue<boolean>;
  collapseStartSheetY: SharedValue<number>;
  collapseStartTouchX: SharedValue<number>;
  collapseStartTouchY: SharedValue<number>;
  collapseLastTouchX: SharedValue<number>;
  collapseLastTouchY: SharedValue<number>;
  collapseAxisLock: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  scrollTopOffset: SharedValue<number>;
  sheetY: SharedValue<number>;
  isDragging: SharedValue<boolean>;
  isInMomentum: SharedValue<boolean>;
  isSettling: SharedValue<boolean>;
  hasUserDrivenSheet: SharedValue<boolean>;
  dragStartY: SharedValue<number>;
  springTargetY: SharedValue<number>;
  springId: SharedValue<number>;
  resolveDestination: (value: number, velocity: number, gestureStartValue: number) => number;
  startSpring: (
    target: number,
    velocity?: number,
    shouldNotifyHidden?: boolean,
    source?: BottomSheetSnapChangeSource
  ) => void;
  runtimeConfigValues?: BottomSheetSharedRuntimeConfigSharedValues;
};

export const useBottomSheetSharedGestureRuntime = ({
  gestureEnabled,
  contentOverscroll,
  maxScrollOffset,
  scrollViewportHeight,
  preventSwipeDismiss,
  expandedSnap,
  middleSnap,
  collapsedSnap,
  hiddenSnap,
  headerHeight,
  expandTouchInHeader,
  expandGestureOwner,
  expandHandoffLocked,
  expandStartedBelowExpanded,
  expandAllowTopElastic,
  collapseTouchInHeader,
  expandPanActive,
  expandDidHandoffToScroll,
  expandStartSheetY,
  expandStartTouchX,
  expandStartTouchY,
  expandLastTouchX,
  expandLastTouchY,
  expandAxisLock,
  collapsePanActive,
  collapseStartSheetY,
  collapseStartTouchX,
  collapseStartTouchY,
  collapseLastTouchX,
  collapseLastTouchY,
  collapseAxisLock,
  scrollOffset,
  scrollTopOffset,
  sheetY,
  isDragging,
  isInMomentum,
  isSettling,
  hasUserDrivenSheet,
  dragStartY,
  springTargetY,
  springId,
  resolveDestination,
  startSpring,
  runtimeConfigValues,
}: UseBottomSheetSharedGestureRuntimeArgs) => {
  const ownedGestureEnabledValue = useSharedValue(gestureEnabled ? 1 : 0);
  const gestureEnabledValue = runtimeConfigValues?.gestureEnabled ?? ownedGestureEnabledValue;
  // Boundary-physics local state (the bottom-overscroll pan's touch bookkeeping).
  const overscrollPanActive = useSharedValue(false);
  const overscrollAxisLock = useSharedValue(0);
  const overscrollStartTouchY = useSharedValue(0);
  const overscrollStartTouchX = useSharedValue(0);
  const overscrollCatchPull = useSharedValue(0);
  const overscrollLastTouchY = useSharedValue(0);

  React.useEffect(() => {
    if (runtimeConfigValues != null) {
      return;
    }
    ownedGestureEnabledValue.value = gestureEnabled ? 1 : 0;
  }, [gestureEnabled, ownedGestureEnabledValue, runtimeConfigValues]);

  return React.useMemo(() => {
    const resolveRuntimeSnapValues = () => {
      'worklet';
      const runtimeExpandedSnap = runtimeConfigValues?.expandedSnap.value ?? expandedSnap;
      const runtimeMiddleSnap = runtimeConfigValues?.middleSnap.value ?? middleSnap;
      const runtimeCollapsedSnap = runtimeConfigValues?.collapsedSnap.value ?? collapsedSnap;
      const runtimeHiddenSnap = runtimeConfigValues
        ? runtimeConfigValues.hasHiddenSnap.value
          ? runtimeConfigValues.hiddenSnap.value
          : undefined
        : hiddenSnap;
      const runtimePreventSwipeDismiss =
        runtimeConfigValues?.preventSwipeDismiss.value ?? preventSwipeDismiss;
      return {
        expanded: runtimeExpandedSnap,
        middle: runtimeMiddleSnap,
        collapsed: runtimeCollapsedSnap,
        hidden: runtimeHiddenSnap,
        // Expanded pin: the §8.11 edit-lock (dynamic, token-keyed) and the scene-foundation
        // snapLock (static, presented scene's spec) share this gate — upperBound = expandedSnap
        // makes applyElasticBounds rubber-band ANY downward drag. Inert when both unset (0):
        // falls through to the pre-existing expression.
        upperBound:
          overlaySheetEditLockValue.value === 1 || overlaySheetSceneSnapLockValue.value === 1
            ? runtimeExpandedSnap
            : runtimePreventSwipeDismiss
              ? runtimeCollapsedSnap
              : (runtimeHiddenSnap ?? runtimeCollapsedSnap),
      };
    };

    const beginDrag = (startY: number) => {
      'worklet';
      if (!isDragging.value) {
        isDragging.value = true;
      }
      springId.value += 1;
      isSettling.value = false;
      springTargetY.value = Number.NaN;
      hasUserDrivenSheet.value = true;
      dragStartY.value = startY;
    };

    const syncDragging = () => {
      'worklet';
      isDragging.value = expandPanActive.value || collapsePanActive.value;
    };

    const handoffExpandGestureToScroll = (
      stateManager: GestureStateManagerLike,
      options?: HandoffOptions
    ) => {
      'worklet';
      console.log('[ARBDBG] expand->scroll handoff (fail)');
      const runtimeSnapValues = resolveRuntimeSnapValues();
      const shouldClampToExpanded =
        options?.clampToExpanded ?? sheetY.value > runtimeSnapValues.expanded + DRAG_EPSILON;
      if (shouldClampToExpanded) {
        sheetY.value = runtimeSnapValues.expanded;
      }
      expandPanActive.value = false;
      expandDidHandoffToScroll.value = true;
      expandGestureOwner.value = GESTURE_OWNER_SCROLL;
      expandHandoffLocked.value = true;
      syncDragging();
      stateManager.fail();
    };

    const failExpandGesturePassThrough = (stateManager: GestureStateManagerLike) => {
      'worklet';
      expandPanActive.value = false;
      expandDidHandoffToScroll.value = true;
      syncDragging();
      stateManager.fail();
    };

    const expandPanGesture = Gesture.Pan()
      .manualActivation(true)
      .cancelsTouchesInView(false)
      .onTouchesDown((event) => {
        'worklet';
        expandPanActive.value = false;
        expandDidHandoffToScroll.value = false;
        expandAxisLock.value = AXIS_LOCK_NONE;
        const touchX = event.allTouches[0]?.absoluteX ?? 0;
        const touchY = event.allTouches[0]?.absoluteY ?? 0;
        expandLastTouchX.value = touchX;
        expandLastTouchY.value = touchY;
        expandStartTouchX.value = touchX;
        expandStartTouchY.value = touchY;
        expandStartSheetY.value = sheetY.value;
        expandTouchInHeader.value = touchY - sheetY.value <= headerHeight.value;
        const runtimeSnapValues = resolveRuntimeSnapValues();
        const startedBelowExpanded = sheetY.value > runtimeSnapValues.expanded + DRAG_EPSILON;
        expandStartedBelowExpanded.value = startedBelowExpanded;
        expandAllowTopElastic.value = !startedBelowExpanded && expandTouchInHeader.value;
        expandGestureOwner.value = GESTURE_OWNER_SHEET;
        expandHandoffLocked.value = false;
      })
      .onTouchesMove((event, stateManager) => {
        'worklet';
        if (!stateManager) {
          return;
        }
        if (gestureEnabledValue.value !== 1) {
          failExpandGesturePassThrough(stateManager);
          return;
        }
        const runtimeSnapValues = resolveRuntimeSnapValues();
        const isAtExpandedNow = sheetY.value <= runtimeSnapValues.expanded + DRAG_EPSILON;
        if (
          (expandGestureOwner.value === GESTURE_OWNER_SCROLL || expandHandoffLocked.value) &&
          isAtExpandedNow
        ) {
          handoffExpandGestureToScroll(stateManager);
          return;
        }
        const touchX = event.allTouches[0]?.absoluteX ?? expandLastTouchX.value;
        const touchY = event.allTouches[0]?.absoluteY ?? expandLastTouchY.value;
        const dx = touchX - expandLastTouchX.value;
        const dy = touchY - expandLastTouchY.value;
        expandLastTouchX.value = touchX;
        expandLastTouchY.value = touchY;
        if (!expandPanActive.value && expandAxisLock.value !== AXIS_LOCK_VERTICAL) {
          const totalDx = touchX - expandStartTouchX.value;
          const totalDy = touchY - expandStartTouchY.value;
          const absDx = Math.abs(totalDx);
          const absDy = Math.abs(totalDy);
          if (absDx + absDy >= AXIS_LOCK_SLOP_PX) {
            if (absDx > absDy * AXIS_LOCK_RATIO) {
              expandAxisLock.value = AXIS_LOCK_HORIZONTAL;
              failExpandGesturePassThrough(stateManager);
              return;
            }
            if (absDy > absDx * AXIS_LOCK_RATIO) {
              expandAxisLock.value = AXIS_LOCK_VERTICAL;
            } else {
              return;
            }
          } else if (dx !== 0 || dy !== 0) {
            return;
          }
        }
        const goingUp = dy < 0;
        const goingDown = dy > 0;
        if (!goingUp && !goingDown) {
          return;
        }
        const atExpanded = sheetY.value <= runtimeSnapValues.expanded + DRAG_EPSILON;
        const atTop = isAtScrollTop(scrollOffset.value, scrollTopOffset.value);
        const touchInHeader = expandTouchInHeader.value;
        if (expandPanActive.value) {
          const shouldHandoffAtTop =
            expandStartedBelowExpanded.value || !expandAllowTopElastic.value;
          if (atExpanded && goingUp && shouldHandoffAtTop) {
            handoffExpandGestureToScroll(stateManager);
          }
          return;
        }
        if (!atExpanded) {
          const settlingTowardExpanded =
            isSettling.value &&
            Math.abs(springTargetY.value - runtimeSnapValues.expanded) <= DRAG_EPSILON;
          if (settlingTowardExpanded && !touchInHeader && isAtExpandedNow) {
            handoffExpandGestureToScroll(stateManager, { clampToExpanded: false });
            return;
          }
          console.log('[ARBDBG] expandPan ACTIVATE (below expanded)');
          stateManager.activate();
          expandPanActive.value = true;
          beginDrag(sheetY.value);
          expandStartSheetY.value = sheetY.value;
          expandStartTouchY.value = touchY;
          return;
        }
        if (goingUp) {
          if (expandAllowTopElastic.value) {
            stateManager.activate();
            expandPanActive.value = true;
            beginDrag(sheetY.value);
            expandStartSheetY.value = sheetY.value;
            expandStartTouchY.value = touchY;
            return;
          }
          handoffExpandGestureToScroll(stateManager);
          return;
        }
        if (touchInHeader) {
          stateManager.activate();
          expandPanActive.value = true;
          beginDrag(sheetY.value);
          expandStartSheetY.value = sheetY.value;
          expandStartTouchY.value = touchY;
          return;
        }
        if (atTop && !isInMomentum.value) {
          return;
        }
        handoffExpandGestureToScroll(stateManager);
      })
      .onChange((event) => {
        'worklet';
        if (!expandPanActive.value || gestureEnabledValue.value !== 1) {
          return;
        }
        const runtimeSnapValues = resolveRuntimeSnapValues();
        const rawNext = expandStartSheetY.value + (event.absoluteY - expandStartTouchY.value);
        const allowTopElastic = expandAllowTopElastic.value && !expandHandoffLocked.value;
        // BOTH boundaries rubber-band instead of hard-clamping (the old `Math.min(upperBound, …)`
        // felt restrictive). The top stays HARD when we're not allowing top-elastic — that path
        // hands the drag off to the list scroll, so `Math.max(expanded, …)` pins it at expanded
        // while `applyElasticBounds` still lets the BOTTOM (collapsed/hidden) over-drag + spring
        // back. For a dismissable sheet (upperBound = hidden) the bottom elastic only engages past
        // hidden — off-screen — so drag-to-dismiss is unaffected.
        const next = allowTopElastic
          ? applyElasticBounds(rawNext, runtimeSnapValues.expanded, runtimeSnapValues.upperBound)
          : Math.max(
              runtimeSnapValues.expanded,
              applyElasticBounds(rawNext, runtimeSnapValues.expanded, runtimeSnapValues.upperBound)
            );
        sheetY.value = next;
      })
      .onEnd((event, success) => {
        'worklet';
        expandPanActive.value = false;
        syncDragging();
        if (!success || expandDidHandoffToScroll.value) {
          return;
        }
        const runtimeSnapValues = resolveRuntimeSnapValues();
        const destination = resolveDestination(sheetY.value, event.velocityY, dragStartY.value);
        startSpring(
          destination,
          event.velocityY,
          destination === runtimeSnapValues.hidden,
          'gesture'
        );
      })
      .onFinalize(() => {
        'worklet';
        expandPanActive.value = false;
        expandDidHandoffToScroll.value = false;
        expandAxisLock.value = AXIS_LOCK_NONE;
        syncDragging();
      });

    const collapsePanGesture = Gesture.Pan()
      .manualActivation(true)
      .cancelsTouchesInView(false)
      .onTouchesDown((event) => {
        'worklet';
        collapsePanActive.value = false;
        collapseAxisLock.value = AXIS_LOCK_NONE;
        const touchX = event.allTouches[0]?.absoluteX ?? 0;
        const touchY = event.allTouches[0]?.absoluteY ?? 0;
        collapseLastTouchX.value = touchX;
        collapseLastTouchY.value = touchY;
        collapseStartTouchX.value = touchX;
        collapseStartTouchY.value = touchY;
        collapseStartSheetY.value = sheetY.value;
        collapseTouchInHeader.value = touchY - sheetY.value <= headerHeight.value;
      })
      .onTouchesMove((event, stateManager) => {
        'worklet';
        if (!stateManager || collapsePanActive.value) {
          return;
        }
        if (gestureEnabledValue.value !== 1) {
          stateManager.fail();
          return;
        }
        const runtimeSnapValues = resolveRuntimeSnapValues();
        if (collapseTouchInHeader.value) {
          return;
        }
        const touchX = event.allTouches[0]?.absoluteX ?? collapseLastTouchX.value;
        const touchY = event.allTouches[0]?.absoluteY ?? collapseLastTouchY.value;
        const dx = touchX - collapseLastTouchX.value;
        const dy = touchY - collapseLastTouchY.value;
        collapseLastTouchX.value = touchX;
        collapseLastTouchY.value = touchY;
        if (collapseAxisLock.value !== AXIS_LOCK_VERTICAL) {
          const totalDx = touchX - collapseStartTouchX.value;
          const totalDy = touchY - collapseStartTouchY.value;
          const absDx = Math.abs(totalDx);
          const absDy = Math.abs(totalDy);
          if (absDx + absDy >= AXIS_LOCK_SLOP_PX) {
            if (absDx > absDy * AXIS_LOCK_RATIO) {
              collapseAxisLock.value = AXIS_LOCK_HORIZONTAL;
              syncDragging();
              stateManager.fail();
              return;
            }
            if (absDy > absDx * AXIS_LOCK_RATIO) {
              collapseAxisLock.value = AXIS_LOCK_VERTICAL;
            } else {
              return;
            }
          } else if (dx !== 0 || dy !== 0) {
            return;
          }
        }
        const goingDown = dy > 0;
        if (!goingDown) {
          return;
        }
        const atExpanded = sheetY.value <= runtimeSnapValues.expanded + DRAG_EPSILON;
        const atTop = isAtScrollTop(scrollOffset.value, scrollTopOffset.value);
        if (atExpanded && atTop && !isInMomentum.value) {
          console.log(`[ARBDBG] collapse ACTIVATE off=${scrollOffset.value.toFixed(1)}`);
          stateManager.activate();
          collapsePanActive.value = true;
          beginDrag(sheetY.value);
          collapseStartSheetY.value = sheetY.value;
          collapseStartTouchY.value = touchY;
        }
      })
      .onChange((event) => {
        'worklet';
        if (!collapsePanActive.value || gestureEnabledValue.value !== 1) {
          return;
        }
        const runtimeSnapValues = resolveRuntimeSnapValues();
        const rawNext = collapseStartSheetY.value + (event.absoluteY - collapseStartTouchY.value);
        const next =
          expandHandoffLocked.value && rawNext <= runtimeSnapValues.expanded
            ? runtimeSnapValues.expanded
            : applyElasticBounds(rawNext, runtimeSnapValues.expanded, runtimeSnapValues.upperBound);
        sheetY.value = next;
      })
      .onEnd((event, success) => {
        'worklet';
        collapsePanActive.value = false;
        syncDragging();
        if (!success) {
          return;
        }
        const runtimeSnapValues = resolveRuntimeSnapValues();
        const destination = resolveDestination(sheetY.value, event.velocityY, dragStartY.value);
        startSpring(
          destination,
          event.velocityY,
          destination === runtimeSnapValues.hidden,
          'gesture'
        );
      })
      .onFinalize(() => {
        'worklet';
        collapsePanActive.value = false;
        collapseAxisLock.value = AXIS_LOCK_NONE;
        syncDragging();
      });

    // THE BOTTOM-OVERSCROLL PAN (boundary-physics law §3, case: bottom boundary + sheet
    // at top snap + finger drag → runtime overscroll + rebound). Mirror of collapsePan's
    // at-top ownership: a simultaneous pan owns the boundary while native scroll is live.
    // The failed expandPan can't do this (it already handed off to scroll at expanded) —
    // this pan activates only when the list is PINNED at its bottom (bounces are off) and
    // the sheet has no higher snap to move to, and drives contentOverscroll with the ONE
    // shared rubber curve; release springs it home with the snap-spring family's feel.
    const overscrollPanGesture = Gesture.Pan()
      .manualActivation(true)
      .cancelsTouchesInView(false)
      .onTouchesDown((event) => {
        'worklet';
        overscrollPanActive.value = false;
        overscrollAxisLock.value = AXIS_LOCK_NONE;
        const touchY = event.allTouches[0]?.absoluteY ?? 0;
        overscrollLastTouchY.value = touchY;
        overscrollStartTouchY.value = touchY;
        overscrollStartTouchX.value = event.allTouches[0]?.absoluteX ?? 0;
      })
      .onTouchesMove((event, stateManager) => {
        'worklet';
        if (!stateManager || overscrollPanActive.value) {
          return;
        }
        if (gestureEnabledValue.value !== 1) {
          stateManager.fail();
          return;
        }
        const touchY = event.allTouches[0]?.absoluteY ?? overscrollLastTouchY.value;
        const dy = touchY - overscrollLastTouchY.value;
        overscrollLastTouchY.value = touchY;
        if (overscrollAxisLock.value !== AXIS_LOCK_VERTICAL) {
          const touchX = event.allTouches[0]?.absoluteX ?? 0;
          const totalDx = Math.abs(touchX - overscrollStartTouchX.value);
          const totalDy = Math.abs(touchY - overscrollStartTouchY.value);
          if (totalDx + totalDy >= AXIS_LOCK_SLOP_PX) {
            if (totalDx > totalDy * AXIS_LOCK_RATIO) {
              // Horizontal drag: this pan can never own it — FAIL like its siblings,
              // never linger undetermined for the whole touch (red-team ledger #1).
              overscrollAxisLock.value = AXIS_LOCK_HORIZONTAL;
              stateManager.fail();
              return;
            }
            overscrollAxisLock.value = AXIS_LOCK_VERTICAL;
          } else if (dy !== 0) {
            return;
          }
        }
        const goingUp = dy < 0;
        if (!goingUp) {
          return;
        }
        const runtimeSnapValues = resolveRuntimeSnapValues();
        const atExpanded = sheetY.value <= runtimeSnapValues.expanded + DRAG_EPSILON;
        // TRUSTED FACTS (law §5 addendum): max is written by the live leg's container
        // (layout-time, per-leg gated) and the active list's onScroll. max==0 is a
        // LEGAL bottom only when the viewport fact proves a live publication happened
        // (shortPage); an unknown surface (viewport 0) never activates the pan.
        // MITIGATION (red team 2, 2026-07-24): facts are HOST-shared and LINGER across
        // leg switches — a non-publishing leg (polls) inherits a stale max=0/vp pair
        // and reads as a trusted short page (probe: overscroll ACTIVATE off=0 max=0
        // vp=806 on polls → the double-motion + shake). Until facts are PER-SCENE
        // records switched with presentation (the red-team-2 redesign), the pan only
        // trusts a scroll-proven positive max; the short-page band is OFF again.
        const atBottom =
          maxScrollOffset.value > 0 &&
          scrollOffset.value >= maxScrollOffset.value - DRAG_EPSILON;
        if (atExpanded && atBottom && !isInMomentum.value) {
          console.log(`[ARBDBG] overscroll ACTIVATE off=${scrollOffset.value.toFixed(1)} max=${maxScrollOffset.value.toFixed(1)} vp=${scrollViewportHeight.value.toFixed(0)}`);
          stateManager.activate();
          overscrollPanActive.value = true;
          overscrollStartTouchY.value = touchY;
          // THE CATCH (red-team ledger #2, native semantics): a finger landing while a
          // rebound spring is in flight continues the curve from the CONTENT's live
          // position — seed the equivalent pull via the inverse curve. The plain write
          // also cancels the running spring (Reanimated write-cancels-animation).
          overscrollCatchPull.value = inverseNativeRubberBandDistance(
            contentOverscroll.value,
            scrollViewportHeight.value
          );
          contentOverscroll.value = contentOverscroll.value;
        }
      })
      .onChange((event) => {
        'worklet';
        if (!overscrollPanActive.value || gestureEnabledValue.value !== 1) {
          return;
        }
        const pulled =
          overscrollCatchPull.value + (overscrollStartTouchY.value - event.absoluteY);
        contentOverscroll.value =
          pulled > 0 ? nativeRubberBandDistance(pulled, scrollViewportHeight.value) : 0;
      })
      .onEnd(() => {
        'worklet';
        overscrollPanActive.value = false;
        contentOverscroll.value = withSpring(0, OVERSCROLL_REBOUND_SPRING);
      })
      .onFinalize(() => {
        'worklet';
        overscrollPanActive.value = false;
        overscrollAxisLock.value = AXIS_LOCK_NONE;
        if (contentOverscroll.value !== 0) {
          contentOverscroll.value = withSpring(0, OVERSCROLL_REBOUND_SPRING);
        }
      });

    // Global affordance: tapping a sheet that's resting at its docked (lowest)
    // snap springs it up to the middle snap — so a docked lane opens on a tap, not
    // only a swipe. Only fires on a clean no-move tap in the header, so it never
    // competes with the pan/scroll handoff; cancelsTouchesInView(false) leaves
    // header controls (e.g. the polls "+") fully tappable.
    const tapToMiddleGesture = Gesture.Tap()
      .maxDuration(500)
      .maxDistance(12)
      .cancelsTouchesInView(false)
      .onEnd((event, success) => {
        'worklet';
        if (!success || gestureEnabledValue.value !== 1) {
          return;
        }
        const runtimeSnapValues = resolveRuntimeSnapValues();
        const atDocked = sheetY.value >= runtimeSnapValues.collapsed - DRAG_EPSILON;
        const touchInHeader = event.absoluteY - sheetY.value <= headerHeight.value;
        const hasMiddleAbove =
          runtimeSnapValues.middle < runtimeSnapValues.collapsed - DRAG_EPSILON;
        if (atDocked && touchInHeader && hasMiddleAbove) {
          startSpring(runtimeSnapValues.middle, 0, false, 'gesture');
        }
      });

    // Native scroll gestures live PER CONTAINER INSTANCE now (BottomSheetScrollContainer mints
    // its own Gesture.Native with requireExternalGestureToFail(expandPan) +
    // simultaneousWithExternalGesture(collapsePan)). RNGH relation declarations are OR'd across
    // the pair (GestureHandlerOrchestrator.kt:740; iOS delegate), so the pans declare NOTHING
    // about scroll gestures here — any number of co-mounted scroll containers get correct
    // arbitration without the old shared-instance one-detector landmine.
    return {
      sheet: Gesture.Simultaneous(
        expandPanGesture,
        collapsePanGesture,
        overscrollPanGesture,
        tapToMiddleGesture
      ),
      expandPan: expandPanGesture,
      collapsePan: collapsePanGesture,
      overscrollPan: overscrollPanGesture,
    };
  }, [
    collapsedSnap,
    collapseAxisLock,
    collapseLastTouchX,
    collapseLastTouchY,
    collapsePanActive,
    collapseStartSheetY,
    collapseStartTouchX,
    collapseStartTouchY,
    collapseTouchInHeader,
    contentOverscroll,
    maxScrollOffset,
    scrollViewportHeight,
    overscrollAxisLock,
    overscrollCatchPull,
    overscrollStartTouchX,
    overscrollLastTouchY,
    overscrollPanActive,
    overscrollStartTouchY,
    dragStartY,
    expandAllowTopElastic,
    expandAxisLock,
    expandDidHandoffToScroll,
    expandGestureOwner,
    expandHandoffLocked,
    expandLastTouchX,
    expandLastTouchY,
    expandPanActive,
    expandStartSheetY,
    expandStartTouchX,
    expandStartTouchY,
    expandStartedBelowExpanded,
    expandTouchInHeader,
    expandedSnap,
    gestureEnabledValue,
    hasUserDrivenSheet,
    headerHeight,
    hiddenSnap,
    isDragging,
    isInMomentum,
    isSettling,
    middleSnap,
    preventSwipeDismiss,
    resolveDestination,
    runtimeConfigValues,
    scrollOffset,
    scrollTopOffset,
    sheetY,
    springId,
    springTargetY,
    startSpring,
  ]);
};
