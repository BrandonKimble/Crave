import React from 'react';

import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

import type { SheetDiagSnapshot } from './bottomSheetSharedRuntimeContract';
import type {
  BottomSheetSharedDispatchSnapChange,
  BottomSheetSharedNotifyHidden,
  BottomSheetSharedNotifySnapStart,
  BottomSheetSharedNotifySnapSettleComplete,
  BottomSheetSharedSnapChangeOptions,
  BottomSheetSharedSnapPublicationArgs,
  BottomSheetSharedSnapPublicationResult,
} from './bottomSheetSharedSnapRuntimeContract';
import type { BottomSheetSnap, BottomSheetSnapChangeSource } from './bottomSheetMotionTypes';
import { shouldLogSearchNavSwitchDiagnosticLogs } from '../screens/Search/runtime/shared/search-nav-switch-perf-probe';
import { withSearchNavSwitchRuntimeAttribution } from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { logger } from '../utils';

export const useBottomSheetSharedSnapPublicationRuntime = ({
  visible,
  listScrollEnabled,
  interactionEnabled,
  shouldEnableScroll,
  gestureEnabled,
  activeList,
  screenHeight,
  testID,
  listKey,
  dataCount,
  secondaryDataCount,
  scrollHeaderHeight,
  touchBlockingEnabled,
  isSearchResultsSheet,
  sheetYObserver,
  onHidden,
  onSnapStart,
  onSnapChange,
  onDragStateChange,
  onSettleStateChange,
  onSnapSettleComplete,
  sheetY,
  currentSnapKeyRef,
  isDragging,
  isSettling,
  settlingToHidden,
  setTouchBlockingEnabled,
}: BottomSheetSharedSnapPublicationArgs): BottomSheetSharedSnapPublicationResult => {
  const setTouchBlockingEnabledFromWorklet = React.useCallback(
    (value: boolean) => {
      withSearchNavSwitchRuntimeAttribution(
        'bottomSheetSharedSnap',
        'setTouchBlockingEnabled',
        () => {
          setTouchBlockingEnabled(value);
        }
      );
    },
    [setTouchBlockingEnabled]
  );

  useAnimatedReaction(
    () => {
      const offscreenThreshold = screenHeight - 0.5;
      const isOffscreen = sheetY.value >= offscreenThreshold;
      return settlingToHidden.value || isOffscreen;
    },
    (next, prev) => {
      if (prev === undefined || next === prev) {
        return;
      }
      runOnJS(setTouchBlockingEnabledFromWorklet)(next);
    },
    [screenHeight, setTouchBlockingEnabledFromWorklet, sheetY, settlingToHidden]
  );

  useAnimatedReaction(
    () => sheetY.value,
    (value) => {
      if (sheetYObserver) {
        sheetYObserver.value = value;
      }
    },
    [sheetYObserver]
  );

  const onHiddenRef = React.useRef(onHidden);
  const onSnapStartRef = React.useRef(onSnapStart);
  const onSnapChangeRef = React.useRef(onSnapChange);
  const onDragStateChangeRef = React.useRef(onDragStateChange);
  const onSettleStateChangeRef = React.useRef(onSettleStateChange);
  const onSnapSettleCompleteRef = React.useRef(onSnapSettleComplete);
  onHiddenRef.current = onHidden;
  onSnapStartRef.current = onSnapStart;
  onSnapChangeRef.current = onSnapChange;
  onDragStateChangeRef.current = onDragStateChange;
  onSettleStateChangeRef.current = onSettleStateChange;
  onSnapSettleCompleteRef.current = onSnapSettleComplete;

  const notifyHidden = React.useCallback<BottomSheetSharedNotifyHidden>(() => {
    withSearchNavSwitchRuntimeAttribution('bottomSheetSharedSnap', 'notifyHidden', () => {
      if (isSearchResultsSheet && shouldLogSearchNavSwitchDiagnosticLogs()) {
        logger.info('[BOTTOM-SHEET-DIAG] hidden', {
          testID,
          listKey,
        });
      }
      onHiddenRef.current?.();
    });
  }, [isSearchResultsSheet, listKey, testID]);

  const notifySnapChange = React.useCallback(
    (
      snapKey: BottomSheetSnap,
      source: BottomSheetSnapChangeSource,
      options?: BottomSheetSharedSnapChangeOptions
    ) => {
      withSearchNavSwitchRuntimeAttribution(
        'bottomSheetSharedSnap',
        `notifySnapChange:${source}:${snapKey}`,
        () => {
          if (!options?.force && currentSnapKeyRef.current === snapKey) {
            return;
          }
          if (isSearchResultsSheet && shouldLogSearchNavSwitchDiagnosticLogs()) {
            logger.info('[BOTTOM-SHEET-DIAG] snapChange', {
              testID,
              listKey,
              snapKey,
              source,
              force: Boolean(options?.force),
            });
          }
          currentSnapKeyRef.current = snapKey;
          onSnapChangeRef.current?.(snapKey, { source });
        }
      );
    },
    [currentSnapKeyRef, isSearchResultsSheet, listKey, testID]
  );

  const dispatchSnapChange = React.useCallback<BottomSheetSharedDispatchSnapChange>(
    (snapKey, source, options) => {
      withSearchNavSwitchRuntimeAttribution('bottomSheetSharedSnap', 'dispatchSnapChange', () => {
        notifySnapChange(snapKey, source, options);
      });
    },
    [notifySnapChange]
  );

  const notifySnapStart = React.useCallback<BottomSheetSharedNotifySnapStart>(
    (snapKey, source) => {
      withSearchNavSwitchRuntimeAttribution(
        'bottomSheetSharedSnap',
        `notifySnapStart:${source}:${snapKey}`,
        () => {
          if (isSearchResultsSheet && shouldLogSearchNavSwitchDiagnosticLogs()) {
            logger.info('[BOTTOM-SHEET-DIAG] snapStart', {
              testID,
              listKey,
              snapKey,
              source,
            });
          }
          onSnapStartRef.current?.(snapKey, { source });
        }
      );
    },
    [isSearchResultsSheet, listKey, testID]
  );

  const notifySnapSettleComplete = React.useCallback<BottomSheetSharedNotifySnapSettleComplete>(
    (settleToken) => {
      withSearchNavSwitchRuntimeAttribution(
        'bottomSheetSharedSnap',
        'notifySnapSettleComplete',
        () => {
          onSnapSettleCompleteRef.current?.(settleToken);
        }
      );
    },
    []
  );

  const notifyDragStateChange = React.useCallback((value: boolean) => {
    withSearchNavSwitchRuntimeAttribution(
      'bottomSheetSharedSnap',
      `notifyDragStateChange:${value ? 'dragging' : 'idle'}`,
      () => {
        onDragStateChangeRef.current?.(value);
      }
    );
  }, []);

  const notifySettleStateChange = React.useCallback((value: boolean) => {
    withSearchNavSwitchRuntimeAttribution(
      'bottomSheetSharedSnap',
      `notifySettleStateChange:${value ? 'settling' : 'idle'}`,
      () => {
        onSettleStateChangeRef.current?.(value);
      }
    );
  }, []);

  useAnimatedReaction(
    () => isDragging.value,
    (value, prev) => {
      if (prev === undefined || prev === null || value === prev) {
        return;
      }
      runOnJS(notifyDragStateChange)(value);
    },
    [notifyDragStateChange]
  );

  useAnimatedReaction(
    () => isSettling.value,
    (value, prev) => {
      if (prev === undefined || prev === null || value === prev) {
        return;
      }
      runOnJS(notifySettleStateChange)(value);
    },
    [notifySettleStateChange]
  );

  const sheetDiagRef = React.useRef<SheetDiagSnapshot | null>(null);
  React.useEffect(() => {
    if (!isSearchResultsSheet || !shouldLogSearchNavSwitchDiagnosticLogs()) {
      return;
    }
    const nextSnapshot: SheetDiagSnapshot = {
      visible,
      listScrollEnabled,
      interactionEnabled,
      shouldEnableScroll,
      gestureEnabled,
      activeList,
      currentSnapKey: currentSnapKeyRef.current,
      dataCount,
      secondaryDataCount,
      touchBlockingEnabled,
      scrollHeaderHeight,
    };
    const previousSnapshot = sheetDiagRef.current;
    if (
      previousSnapshot &&
      previousSnapshot.visible === nextSnapshot.visible &&
      previousSnapshot.listScrollEnabled === nextSnapshot.listScrollEnabled &&
      previousSnapshot.interactionEnabled === nextSnapshot.interactionEnabled &&
      previousSnapshot.shouldEnableScroll === nextSnapshot.shouldEnableScroll &&
      previousSnapshot.gestureEnabled === nextSnapshot.gestureEnabled &&
      previousSnapshot.activeList === nextSnapshot.activeList &&
      previousSnapshot.currentSnapKey === nextSnapshot.currentSnapKey &&
      previousSnapshot.dataCount === nextSnapshot.dataCount &&
      previousSnapshot.secondaryDataCount === nextSnapshot.secondaryDataCount &&
      previousSnapshot.touchBlockingEnabled === nextSnapshot.touchBlockingEnabled &&
      previousSnapshot.scrollHeaderHeight === nextSnapshot.scrollHeaderHeight
    ) {
      return;
    }
    logger.info('[BOTTOM-SHEET-DIAG] props', {
      testID,
      listKey,
      ...nextSnapshot,
    });
    sheetDiagRef.current = nextSnapshot;
  }, [
    activeList,
    currentSnapKeyRef,
    dataCount,
    gestureEnabled,
    interactionEnabled,
    isSearchResultsSheet,
    listKey,
    listScrollEnabled,
    scrollHeaderHeight,
    secondaryDataCount,
    shouldEnableScroll,
    testID,
    touchBlockingEnabled,
    visible,
  ]);

  return {
    notifyHidden,
    dispatchSnapChange,
    notifySnapStart,
    notifySnapSettleComplete,
  };
};
