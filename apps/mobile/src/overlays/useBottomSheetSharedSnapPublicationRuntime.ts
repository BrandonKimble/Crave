import React from 'react';

import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

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
import { withSearchNavSwitchRuntimeAttribution } from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';

export const useBottomSheetSharedSnapPublicationRuntime = ({
  screenHeight,
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
      onHiddenRef.current?.();
    });
  }, []);

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
          currentSnapKeyRef.current = snapKey;
          onSnapChangeRef.current?.(snapKey, { source });
        }
      );
    },
    [currentSnapKeyRef]
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
          onSnapStartRef.current?.(snapKey, { source });
        }
      );
    },
    []
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

  const notifyDragStateChange = React.useCallback(
    (value: boolean) => {
      withSearchNavSwitchRuntimeAttribution(
        'bottomSheetSharedSnap',
        `notifyDragStateChange:${value ? 'dragging' : 'idle'}`,
        () => {
          onDragStateChangeRef.current?.(value);
        }
      );
    },
    []
  );

  const notifySettleStateChange = React.useCallback(
    (value: boolean) => {
      withSearchNavSwitchRuntimeAttribution(
        'bottomSheetSharedSnap',
        `notifySettleStateChange:${value ? 'settling' : 'idle'}`,
        () => {
          onSettleStateChangeRef.current?.(value);
        }
      );
    },
    []
  );

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

  return {
    notifyHidden,
    dispatchSnapChange,
    notifySnapStart,
    notifySnapSettleComplete,
  };
};
