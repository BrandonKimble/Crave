import React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { createBottomSheetSharedPublicationController } from './bottomSheetSharedPublicationController';
import type {
  BottomSheetSharedPublicationSnapshot,
  BottomSheetSharedTouchBlockingAuthority,
} from './bottomSheetSharedPublicationController';

// F982: `dynamicScrollIndicator`, `subscribeTouchBlockingToReact` and the
// `scrollOffset`/`scrollTopOffset` values that only the dead scroll-position reaction
// read are gone from the argument shape, along with the two flags' declarations on
// `bottomSheetSharedRuntimeContract` and their threading through
// `useBottomSheetSharedRuntime`.
type UseBottomSheetSharedPublicationRuntimeArgs = {
  showsVerticalScrollIndicator?: boolean;
  scrollHeaderComponent?: React.ReactNode;
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

export const useBottomSheetSharedPublicationRuntime = ({
  showsVerticalScrollIndicator,
  scrollHeaderComponent,
}: UseBottomSheetSharedPublicationRuntimeArgs): UseBottomSheetSharedPublicationRuntimeResult => {
  const headerHeight = useSharedValue(0);
  const controllerRef = React.useRef(
    createBottomSheetSharedPublicationController(getInitialSnapshot(showsVerticalScrollIndicator))
  );
  const publicationController = controllerRef.current;
  const publicationSnapshot = React.useSyncExternalStore(
    publicationController.outputAuthority.subscribe,
    publicationController.outputAuthority.getSnapshot,
    publicationController.outputAuthority.getSnapshot
  );
  // F982(b): `subscribeTouchBlockingToReact` was `false` at the ONE live call site, so
  // this resolved to `useSyncExternalStore(subscribeNoop, getFalseSnapshot, ...)` — a
  // permanent `false` whose result was then DISCARDED in favour of a direct
  // `getSnapshot()` read on the very next line. Three hooks and two module constants
  // implementing a branch nobody takes, and the branch that ran ignoring it. What is
  // left is what actually happened: a direct read.
  const touchBlockingEnabled = publicationController.touchBlockingAuthority.getSnapshot();
  const setEffectiveShowsVerticalScrollIndicator = React.useMemo(
    () => publicationController.inputAuthority.setEffectiveShowsVerticalScrollIndicator,
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
  // F982(a): `dynamicScrollIndicator` was `false` at the ONE live call site (the only
  // other consumer was the dead second sheet deleted in F968), so the `useAnimatedReaction`
  // that used to live here ALWAYS took its early exit — its entire scroll-position branch
  // was unreachable while the reaction still paid its per-frame cost, every frame, for the
  // life of the sheet. The honest remainder is the effect: publish the indicator flag when
  // it changes. `dynamicScrollIndicator` should the feature return: it belongs with the
  // scroll-position reaction that would make it mean something, not ahead of it.
  React.useEffect(() => {
    setEffectiveShowsVerticalScrollIndicator(Boolean(showsVerticalScrollIndicator));
  }, [setEffectiveShowsVerticalScrollIndicator, showsVerticalScrollIndicator]);

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
