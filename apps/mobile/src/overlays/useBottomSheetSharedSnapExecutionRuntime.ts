import React from 'react';

import {
  cancelAnimation,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import type { BottomSheetSharedRuntimeConfigSharedValues } from './bottomSheetSharedRuntimeContract';
import type {
  BottomSheetSharedDispatchSnapChange,
  BottomSheetSharedNotifyHidden,
  BottomSheetSharedNotifySnapStart,
  BottomSheetSharedNotifySnapSettleComplete,
  BottomSheetSharedSnapExecutionResult,
} from './bottomSheetSharedSnapRuntimeContract';
import type {
  BottomSheetMotionCommand,
  BottomSheetSnap,
  BottomSheetSnapChangeSource,
} from './bottomSheetMotionTypes';
import {
  PROGRAMMATIC_SNAP_MAX_VELOCITY,
  PROGRAMMATIC_SNAP_MIN_VELOCITY,
  PROGRAMMATIC_SNAP_VELOCITY_PER_PX,
  SNAP_GATE_FALLBACK_PX,
  resolveHeaderGatedSnapPoint,
  resolveSnapKeyFromValues,
} from './bottomSheetSharedRuntimeUtils';
import { clampValue, SHEET_SPRING_CONFIG } from './sheetUtils';
import { overlaySheetEditLockValue } from './overlaySheetEditLockRuntime';
import { overlaySheetSceneSnapLockValue } from './overlaySheetSceneSnapLockRuntime';

type RuntimeSnapValues = {
  expanded: number;
  middle: number;
  collapsed: number;
  hidden: number | undefined;
  preventSwipeDismiss: boolean;
};

type UseBottomSheetSharedSnapExecutionRuntimeArgs = {
  visible: boolean;
  motionCommandValue?: SharedValue<BottomSheetMotionCommand | null>;
  preservePositionOnSnapPointsChange: boolean;
  preventSwipeDismiss: boolean;
  initialSnapValue: number;
  hiddenOrCollapsed: number;
  expandedSnap: number;
  middleSnap: number;
  collapsedSnap: number;
  hiddenSnap?: number;
  sheetYValue?: SharedValue<number>;
  sheetY: SharedValue<number>;
  headerHeight: SharedValue<number>;
  currentSnapKeyRef: React.MutableRefObject<BottomSheetSnap>;
  isDragging: SharedValue<boolean>;
  isSettling: SharedValue<boolean>;
  settlingToHidden: SharedValue<boolean>;
  hasUserDrivenSheet: SharedValue<boolean>;
  hasNotifiedHidden: SharedValue<boolean>;
  springTargetY: SharedValue<number>;
  springId: SharedValue<number>;
  wasVisible: React.MutableRefObject<boolean>;
  notifyHidden: BottomSheetSharedNotifyHidden;
  dispatchSnapChange: BottomSheetSharedDispatchSnapChange;
  notifySnapStart: BottomSheetSharedNotifySnapStart;
  notifySnapSettleComplete: BottomSheetSharedNotifySnapSettleComplete;
  runtimeConfigValues?: BottomSheetSharedRuntimeConfigSharedValues;
  isSearchResultsSheet: boolean;
};

export const useBottomSheetSharedSnapExecutionRuntime = ({
  visible,
  motionCommandValue,
  preservePositionOnSnapPointsChange,
  preventSwipeDismiss,
  initialSnapValue,
  hiddenOrCollapsed,
  expandedSnap,
  middleSnap,
  collapsedSnap,
  hiddenSnap,
  sheetYValue,
  sheetY,
  headerHeight,
  currentSnapKeyRef,
  isDragging,
  isSettling,
  settlingToHidden,
  hasUserDrivenSheet,
  hasNotifiedHidden,
  springTargetY,
  springId,
  wasVisible,
  notifyHidden,
  dispatchSnapChange,
  notifySnapStart,
  notifySnapSettleComplete,
  runtimeConfigValues,
  isSearchResultsSheet,
}: UseBottomSheetSharedSnapExecutionRuntimeArgs): BottomSheetSharedSnapExecutionResult => {
  void isSearchResultsSheet;

  const snapCandidates = React.useMemo(() => {
    const points = [expandedSnap, middleSnap, collapsedSnap];
    if (typeof hiddenSnap === 'number' && !preventSwipeDismiss) {
      points.push(hiddenSnap);
    }
    points.sort((a, b) => a - b);
    const deduped: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const candidate = points[i];
      const previous = deduped[deduped.length - 1];
      if (previous === undefined || Math.abs(candidate - previous) >= 0.5) {
        deduped.push(candidate);
      }
    }
    return deduped;
  }, [collapsedSnap, expandedSnap, hiddenSnap, middleSnap, preventSwipeDismiss]);

  const resolveRuntimeSnapValues = React.useCallback(() => {
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
      preventSwipeDismiss: runtimePreventSwipeDismiss,
    };
  }, [
    collapsedSnap,
    expandedSnap,
    hiddenSnap,
    middleSnap,
    preventSwipeDismiss,
    runtimeConfigValues,
  ]);

  const resolveRuntimeSnapCandidates = React.useCallback((values: RuntimeSnapValues): number[] => {
    'worklet';
    const points = [values.expanded, values.middle, values.collapsed];
    if (typeof values.hidden === 'number' && !values.preventSwipeDismiss) {
      points.push(values.hidden);
    }
    points.sort((a, b) => a - b);
    const deduped: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const candidate = points[i];
      const previous = deduped[deduped.length - 1];
      if (previous === undefined || Math.abs(candidate - previous) >= 0.5) {
        deduped.push(candidate);
      }
    }
    return deduped;
  }, []);

  const resolveDestination = React.useCallback(
    (value: number, velocity: number, gestureStartValue: number): number => {
      'worklet';
      const runtimeSnapValues = resolveRuntimeSnapValues();
      // Expanded pin: while the §8.11 edit-lock (dynamic) or the scene-foundation snapLock
      // (static, presented scene's spec) is set, every gesture release resolves back to
      // expanded — the gesture runtime already rubber-bands the drag itself, and this keeps
      // a hard downward flick from gating past the lock. Inert when both unset (0).
      if (overlaySheetEditLockValue.value === 1 || overlaySheetSceneSnapLockValue.value === 1) {
        return runtimeSnapValues.expanded;
      }
      const upperBound = runtimeSnapValues.preventSwipeDismiss
        ? runtimeSnapValues.collapsed
        : (runtimeSnapValues.hidden ?? runtimeSnapValues.collapsed);
      const clampedValue = clampValue(value, runtimeSnapValues.expanded, upperBound);
      return resolveHeaderGatedSnapPoint({
        value: clampedValue,
        velocity,
        gestureStartValue,
        gateDistance: Math.min(headerHeight.value || SNAP_GATE_FALLBACK_PX, SNAP_GATE_FALLBACK_PX),
        points: runtimeConfigValues
          ? resolveRuntimeSnapCandidates(runtimeSnapValues)
          : snapCandidates,
      });
    },
    [
      headerHeight,
      resolveRuntimeSnapCandidates,
      resolveRuntimeSnapValues,
      runtimeConfigValues,
      snapCandidates,
    ]
  );

  const startSpring = React.useCallback(
    (
      target: number,
      velocity = 0,
      shouldNotifyHidden = false,
      source: BottomSheetSnapChangeSource = 'programmatic',
      settleToken?: number | null,
      snapValuesOverride?: RuntimeSnapValues
    ) => {
      'worklet';
      springId.value += 1;
      const localSpringId = springId.value;
      const localSource = source;
      const localSettleToken = settleToken ?? null;
      const shouldClampOvershoot = localSource !== 'gesture' && !hasUserDrivenSheet.value;
      // A transition command carries the TARGET scene's snap set (atomic shell+target commit);
      // start/settle snap keys must resolve against it — the shared runtime config may still
      // hold the OUTGOING scene's shell for a few frames after dispatch.
      const runtimeSnapValues = snapValuesOverride ?? resolveRuntimeSnapValues();
      const snapKeyAtStart = resolveSnapKeyFromValues(
        target,
        runtimeSnapValues.expanded,
        runtimeSnapValues.middle,
        runtimeSnapValues.collapsed,
        runtimeSnapValues.hidden
      );
      if (snapKeyAtStart && snapKeyAtStart !== 'hidden') {
        runOnJS(notifySnapStart)(snapKeyAtStart, localSource);
      }
      springTargetY.value = target;
      settlingToHidden.value =
        runtimeSnapValues.hidden !== undefined && target === runtimeSnapValues.hidden;
      if (runtimeSnapValues.hidden !== undefined && target !== runtimeSnapValues.hidden) {
        hasNotifiedHidden.value = false;
      }
      isSettling.value = true;
      isDragging.value = false;
      sheetY.value = withSpring(
        target,
        {
          ...SHEET_SPRING_CONFIG,
          overshootClamping: shouldClampOvershoot ? true : SHEET_SPRING_CONFIG.overshootClamping,
          velocity,
        },
        (finished) => {
          'worklet';
          if (!finished || springId.value !== localSpringId) {
            return;
          }
          isSettling.value = false;
          settlingToHidden.value = false;
          springTargetY.value = target;
          const snapKey = resolveSnapKeyFromValues(
            target,
            runtimeSnapValues.expanded,
            runtimeSnapValues.middle,
            runtimeSnapValues.collapsed,
            runtimeSnapValues.hidden
          );
          if (snapKey) {
            runOnJS(dispatchSnapChange)(snapKey, localSource);
            if (snapKey === 'hidden' && shouldNotifyHidden && !hasNotifiedHidden.value) {
              hasNotifiedHidden.value = true;
              runOnJS(notifyHidden)();
            }
          }
          if (localSettleToken != null) {
            runOnJS(notifySnapSettleComplete)(localSettleToken);
          }
        }
      );
    },
    [
      dispatchSnapChange,
      hasNotifiedHidden,
      hasUserDrivenSheet,
      isDragging,
      isSettling,
      notifyHidden,
      notifySnapStart,
      notifySnapSettleComplete,
      resolveRuntimeSnapValues,
      settlingToHidden,
      sheetY,
      springId,
      springTargetY,
    ]
  );

  const startSpringOnJS = React.useCallback(
    (
      target: number,
      velocity = 0,
      shouldNotifyHidden = false,
      source: BottomSheetSnapChangeSource = 'programmatic',
      settleToken?: number | null
    ) => {
      runOnUI(startSpring)(target, velocity, shouldNotifyHidden, source, settleToken ?? null);
    },
    [startSpring]
  );

  const resolveSnapValue = React.useCallback(
    (snapKey: BottomSheetSnap) => {
      const runtimeSnapValues = resolveRuntimeSnapValues();
      switch (snapKey) {
        case 'expanded':
          return runtimeSnapValues.expanded;
        case 'middle':
          return runtimeSnapValues.middle;
        case 'collapsed':
          return runtimeSnapValues.collapsed;
        case 'hidden':
          return runtimeSnapValues.hidden ?? runtimeSnapValues.collapsed;
        default:
          return undefined;
      }
    },
    [resolveRuntimeSnapValues]
  );

  useAnimatedReaction(
    () => motionCommandValue?.value ?? null,
    (nextCommand, previousCommand) => {
      if (nextCommand == null) {
        return;
      }

      const nextToken = nextCommand.token;
      const previousToken = previousCommand?.token ?? null;
      if (nextToken === previousToken) {
        return;
      }
      const clearConsumedCommand = () => {
        'worklet';
        if (motionCommandValue?.value?.token === nextToken) {
          motionCommandValue.value = null;
        }
      };

      let target: number | undefined;
      // Atomic shell+target commit: a transition command carries the TARGET scene's snap set —
      // resolve against IT, never the shared runtime config, which still holds the OUTGOING
      // scene's shell until the frame flip syncs it (~50ms after dispatch). Commands without
      // snapPoints (bootstrap, non-transition requests) use the live config as before.
      const liveSnapValues = resolveRuntimeSnapValues();
      const commandSnapPoints = nextCommand.snapPoints;
      const runtimeSnapValues: RuntimeSnapValues = commandSnapPoints
        ? {
            expanded: commandSnapPoints.expanded,
            middle: commandSnapPoints.middle,
            collapsed: commandSnapPoints.collapsed,
            hidden: commandSnapPoints.hidden,
            preventSwipeDismiss: liveSnapValues.preventSwipeDismiss,
          }
        : liveSnapValues;
      switch (nextCommand.snapTo) {
        case 'expanded':
          target = runtimeSnapValues.expanded;
          break;
        case 'middle':
          target = runtimeSnapValues.middle;
          break;
        case 'collapsed':
          target = runtimeSnapValues.collapsed;
          break;
        case 'hidden':
          target = runtimeSnapValues.hidden ?? runtimeSnapValues.collapsed;
          break;
        default:
          target = undefined;
      }

      if (target === undefined) {
        clearConsumedCommand();
        return;
      }

      if (nextCommand.mode === 'instant') {
        springId.value += 1;
        cancelAnimation(sheetY);
        sheetY.value = target;
        springTargetY.value = target;
        isSettling.value = false;
        settlingToHidden.value = false;
        isDragging.value = false;
        const snapKey = resolveSnapKeyFromValues(
          target,
          runtimeSnapValues.expanded,
          runtimeSnapValues.middle,
          runtimeSnapValues.collapsed,
          runtimeSnapValues.hidden
        );
        if (snapKey) {
          if (snapKey !== 'hidden') {
            runOnJS(notifySnapStart)(snapKey, 'programmatic');
          }
          runOnJS(dispatchSnapChange)(snapKey, 'programmatic', {
            force: true,
          });
          if (snapKey === 'hidden' && !hasNotifiedHidden.value) {
            hasNotifiedHidden.value = true;
            runOnJS(notifyHidden)();
          }
        }
        if (nextCommand.settleToken != null) {
          runOnJS(notifySnapSettleComplete)(nextCommand.settleToken);
        }
        clearConsumedCommand();
        return;
      }

      if (Math.abs(sheetY.value - target) < 0.5) {
        runOnJS(dispatchSnapChange)(nextCommand.snapTo, 'programmatic', {
          force: true,
        });
        if (nextCommand.snapTo === 'hidden' && !hasNotifiedHidden.value) {
          hasNotifiedHidden.value = true;
          runOnJS(notifyHidden)();
        }
        if (nextCommand.settleToken != null) {
          runOnJS(notifySnapSettleComplete)(nextCommand.settleToken);
        }
        clearConsumedCommand();
        return;
      }

      if (runtimeSnapValues.hidden !== undefined && target !== runtimeSnapValues.hidden) {
        hasNotifiedHidden.value = false;
      }

      const explicitVelocity = nextCommand.velocity;
      let velocity = explicitVelocity ?? 0;
      if (explicitVelocity == null) {
        const delta = target - sheetY.value;
        if (Math.abs(delta) >= 0.5) {
          const direction = delta > 0 ? 1 : -1;
          const magnitude = Math.min(
            PROGRAMMATIC_SNAP_MAX_VELOCITY,
            Math.max(
              PROGRAMMATIC_SNAP_MIN_VELOCITY,
              Math.abs(delta) * PROGRAMMATIC_SNAP_VELOCITY_PER_PX
            )
          );
          velocity = direction * magnitude;
        }
      }

      startSpring(
        target,
        velocity,
        nextCommand.snapTo === 'hidden',
        'programmatic',
        nextCommand.settleToken ?? null,
        commandSnapPoints ? runtimeSnapValues : undefined
      );
      clearConsumedCommand();
    },
    [
      dispatchSnapChange,
      hasNotifiedHidden,
      motionCommandValue,
      notifyHidden,
      notifySnapSettleComplete,
      resolveRuntimeSnapValues,
      sheetY,
      startSpring,
    ]
  );

  useAnimatedReaction(
    () => runtimeConfigValues?.visible.value ?? null,
    (nextVisible, previousVisible) => {
      if (
        runtimeConfigValues == null ||
        nextVisible == null ||
        previousVisible == null ||
        nextVisible === previousVisible ||
        sheetYValue
      ) {
        return;
      }
      const target = nextVisible
        ? runtimeConfigValues.initialSnapValue.value
        : runtimeConfigValues.hiddenOrCollapsed.value;
      const shouldNotifyHidden = previousVisible && !nextVisible;
      const runtimeHiddenSnap = runtimeConfigValues.hasHiddenSnap.value
        ? runtimeConfigValues.hiddenSnap.value
        : undefined;
      if (runtimeHiddenSnap !== undefined && target !== runtimeHiddenSnap) {
        hasNotifiedHidden.value = false;
      }
      startSpring(target, 0, shouldNotifyHidden);
    },
    [hasNotifiedHidden, runtimeConfigValues, sheetYValue, startSpring]
  );

  React.useEffect(() => {
    if (sheetYValue) {
      return;
    }
    if (wasVisible.current === visible) {
      return;
    }
    const target = visible ? initialSnapValue : hiddenOrCollapsed;
    const shouldNotifyHidden = wasVisible.current && !visible;
    if (hiddenSnap !== undefined && target !== hiddenSnap) {
      hasNotifiedHidden.value = false;
    }
    wasVisible.current = visible;
    startSpringOnJS(target, 0, shouldNotifyHidden);
  }, [
    hasNotifiedHidden,
    hiddenOrCollapsed,
    hiddenSnap,
    initialSnapValue,
    sheetYValue,
    startSpringOnJS,
    visible,
    wasVisible,
  ]);

  React.useEffect(() => {
    if (sheetYValue) {
      return;
    }
    if (preservePositionOnSnapPointsChange) {
      return;
    }
    if (currentSnapKeyRef.current === 'hidden') {
      return;
    }
    const target = resolveSnapValue(currentSnapKeyRef.current);
    if (target === undefined) {
      return;
    }
    if (Math.abs(sheetY.value - target) < 0.5) {
      return;
    }
    startSpringOnJS(target, 0, false);
  }, [
    currentSnapKeyRef,
    preservePositionOnSnapPointsChange,
    resolveSnapValue,
    sheetY,
    sheetYValue,
    startSpringOnJS,
  ]);

  return {
    resolveDestination,
    startSpring,
  };
};
