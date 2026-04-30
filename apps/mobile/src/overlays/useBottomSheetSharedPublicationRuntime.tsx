import React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import {
  createBottomSheetSharedPublicationController,
} from './bottomSheetSharedPublicationController';
import type {
  BottomSheetSharedPublicationSnapshot,
  BottomSheetSharedTouchBlockingAuthority,
} from './bottomSheetSharedPublicationController';
import { isAtScrollTop } from './bottomSheetSharedRuntimeUtils';

type UseBottomSheetSharedPublicationRuntimeArgs = {
  showsVerticalScrollIndicator?: boolean;
  dynamicScrollIndicator?: boolean;
  scrollHeaderComponent?: React.ReactNode;
  subscribeTouchBlockingToReact?: boolean;
  scrollOffset: SharedValue<number>;
  scrollTopOffset: SharedValue<number>;
};

type UseBottomSheetSharedPublicationRuntimeResult = {
  headerHeight: SharedValue<number>;
  effectiveShowsVerticalScrollIndicator: boolean;
  scrollHeaderHeight: number;
  touchBlockingEnabled: boolean;
  touchBlockingAuthority: BottomSheetSharedTouchBlockingAuthority;
  setTouchBlockingEnabled: (value: boolean) => void;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  onScrollHeaderLayout: (event: LayoutChangeEvent) => void;
};

const getInitialSnapshot = (
  showsVerticalScrollIndicator?: boolean
): BottomSheetSharedPublicationSnapshot => ({
  effectiveShowsVerticalScrollIndicator: Boolean(showsVerticalScrollIndicator),
  scrollHeaderHeight: 0,
  touchBlockingEnabled: false,
});

const subscribeNoop = (): (() => void) => () => undefined;

const getFalseSnapshot = (): boolean => false;

export const useBottomSheetSharedPublicationRuntime = ({
  showsVerticalScrollIndicator,
  dynamicScrollIndicator = true,
  scrollHeaderComponent,
  subscribeTouchBlockingToReact = true,
  scrollOffset,
  scrollTopOffset,
}: UseBottomSheetSharedPublicationRuntimeArgs): UseBottomSheetSharedPublicationRuntimeResult => {
  const headerHeight = useSharedValue(0);
  const controllerRef = React.useRef(
    createBottomSheetSharedPublicationController(
      getInitialSnapshot(showsVerticalScrollIndicator)
    )
  );
  const publicationController = controllerRef.current;
  const publicationSnapshot = React.useSyncExternalStore(
    publicationController.outputAuthority.subscribe,
    publicationController.outputAuthority.getSnapshot,
    publicationController.outputAuthority.getSnapshot
  );
  const touchBlockingSubscribe = subscribeTouchBlockingToReact
    ? publicationController.touchBlockingAuthority.subscribe
    : subscribeNoop;
  const getTouchBlockingSnapshot = subscribeTouchBlockingToReact
    ? publicationController.touchBlockingAuthority.getSnapshot
    : getFalseSnapshot;
  const subscribedTouchBlockingEnabled = React.useSyncExternalStore(
    touchBlockingSubscribe,
    getTouchBlockingSnapshot,
    getTouchBlockingSnapshot
  );
  const touchBlockingEnabled = subscribeTouchBlockingToReact
    ? subscribedTouchBlockingEnabled
    : publicationController.touchBlockingAuthority.getSnapshot();
  const setEffectiveShowsVerticalScrollIndicator = React.useMemo(
    () =>
      publicationController.inputAuthority
        .setEffectiveShowsVerticalScrollIndicator,
    [publicationController]
  );
  const setScrollHeaderHeight = React.useMemo(
    () => publicationController.inputAuthority.setScrollHeaderHeight,
    [publicationController]
  );
  const resetScrollHeaderHeight = React.useMemo(
    () => publicationController.inputAuthority.resetScrollHeaderHeight,
    [publicationController]
  );
  const setTouchBlockingEnabled = React.useMemo(
    () => publicationController.inputAuthority.setTouchBlockingEnabled,
    [publicationController]
  );
  const baseShowsVerticalScrollIndicatorSV = useSharedValue(
    Boolean(showsVerticalScrollIndicator)
  );
  const dynamicScrollIndicatorSV = useSharedValue(dynamicScrollIndicator);

  React.useEffect(() => {
    const next = Boolean(showsVerticalScrollIndicator);
    dynamicScrollIndicatorSV.value = dynamicScrollIndicator;
    baseShowsVerticalScrollIndicatorSV.value = next;
    if (!dynamicScrollIndicator || !next) {
      setEffectiveShowsVerticalScrollIndicator(next);
    }
  }, [
    baseShowsVerticalScrollIndicatorSV,
    dynamicScrollIndicator,
    dynamicScrollIndicatorSV,
    setEffectiveShowsVerticalScrollIndicator,
    showsVerticalScrollIndicator,
  ]);

  useAnimatedReaction(
    () => {
      if (!dynamicScrollIndicatorSV.value) {
        return baseShowsVerticalScrollIndicatorSV.value;
      }
      const atTop = isAtScrollTop(scrollOffset.value, scrollTopOffset.value);
      return baseShowsVerticalScrollIndicatorSV.value && !atTop;
    },
    (shouldShow, previousShouldShow) => {
      if (shouldShow === previousShouldShow) {
        return;
      }
      runOnJS(setEffectiveShowsVerticalScrollIndicator)(shouldShow);
    },
    [
      baseShowsVerticalScrollIndicatorSV,
      dynamicScrollIndicatorSV,
      scrollOffset,
      scrollTopOffset,
      setEffectiveShowsVerticalScrollIndicator,
    ]
  );

  const onHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      if (Math.abs(headerHeight.value - nextHeight) < 0.5) {
        return;
      }
      headerHeight.value = nextHeight;
    },
    [headerHeight]
  );

  const onScrollHeaderLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      setScrollHeaderHeight(event.nativeEvent.layout.height);
    },
    [setScrollHeaderHeight]
  );

  React.useEffect(() => {
    if (scrollHeaderComponent != null) {
      return;
    }
    resetScrollHeaderHeight();
  }, [resetScrollHeaderHeight, scrollHeaderComponent]);

  React.useEffect(
    () => () => {
      publicationController.dispose();
    },
    [publicationController]
  );

  return {
    headerHeight,
    effectiveShowsVerticalScrollIndicator:
      publicationSnapshot.effectiveShowsVerticalScrollIndicator,
    scrollHeaderHeight: publicationSnapshot.scrollHeaderHeight,
    touchBlockingEnabled,
    touchBlockingAuthority: publicationController.touchBlockingAuthority,
    setTouchBlockingEnabled,
    onHeaderLayout,
    onScrollHeaderLayout,
  };
};
