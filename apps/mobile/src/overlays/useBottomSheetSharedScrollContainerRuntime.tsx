import React from 'react';
import type { ScrollView, ScrollViewProps } from 'react-native';

import type { GestureType } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

import BottomSheetScrollContainer from './BottomSheetScrollContainer';

type UseBottomSheetSharedScrollContainerRuntimeArgs = {
  expandPanGesture: GestureType;
  collapsePanGesture: GestureType;
  overscrollPanGesture: GestureType;
  contentOverscroll: SharedValue<number>;
  maxScrollOffset: SharedValue<number>;
  scrollViewportHeight: SharedValue<number>;
  boundaryFactsKnown: SharedValue<boolean>;
  shouldEnableScrollShared: SharedValue<boolean>;
  scrollHeaderComponent?: React.ReactNode;
};

type UseBottomSheetSharedScrollContainerRuntimeResult = {
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
};

// ONE ScrollComponent for every sheet body (plans/sheet-scroll-primitive.md §3.2): the container
// mints a per-instance native gesture, so any number of co-mounted legs/lists render through the
// SAME component type — the old SecondaryScrollComponent (one-gesture-one-detector workaround) is
// gone. The component TYPE is deliberately mount-stable (frame-drop fix, red-team-validated
// 2026-07-02): inputs are read from refs on each render of the stable instance so a pan re-mint
// never remounts FlashList's scroll container. Unlike the old shape, staleness here can no longer
// kill scroll: scrollEnabled rides the UI-thread SharedValue inside the container (no React
// liveness needed) and the native gesture is per-instance and always enabled.
export const useBottomSheetSharedScrollContainerRuntime = ({
  expandPanGesture,
  collapsePanGesture,
  overscrollPanGesture,
  contentOverscroll,
  maxScrollOffset,
  scrollViewportHeight,
  boundaryFactsKnown,
  shouldEnableScrollShared,
  scrollHeaderComponent,
}: UseBottomSheetSharedScrollContainerRuntimeArgs): UseBottomSheetSharedScrollContainerRuntimeResult => {
  const transparent = scrollHeaderComponent != null;

  const expandPanRef = React.useRef(expandPanGesture);
  expandPanRef.current = expandPanGesture;
  const collapsePanRef = React.useRef(collapsePanGesture);
  collapsePanRef.current = collapsePanGesture;
  const overscrollPanRef = React.useRef(overscrollPanGesture);
  overscrollPanRef.current = overscrollPanGesture;
  const contentOverscrollRef = React.useRef(contentOverscroll);
  contentOverscrollRef.current = contentOverscroll;
  const maxScrollOffsetRef = React.useRef(maxScrollOffset);
  maxScrollOffsetRef.current = maxScrollOffset;
  const scrollViewportHeightRef = React.useRef(scrollViewportHeight);
  scrollViewportHeightRef.current = scrollViewportHeight;
  const boundaryFactsKnownRef = React.useRef(boundaryFactsKnown);
  boundaryFactsKnownRef.current = boundaryFactsKnown;

  const shouldEnableScrollSharedRef = React.useRef(shouldEnableScrollShared);
  shouldEnableScrollSharedRef.current = shouldEnableScrollShared;
  const transparentRef = React.useRef(transparent);
  transparentRef.current = transparent;

  // RELATION-STALENESS: the revision-subscription guard is REVERTED (2026-07-24) —
  // with pan identities that can re-mint on host renders, forcing every container to
  // re-render and re-attach its Gesture.Native cancelled in-flight scrolls (the
  // owner's all-pages freeze). The latent stale-relation vector is RECORDED, unfixed:
  // its proper cure is making the PANS mount-stable in the gesture runtime (identity
  // that never changes), not re-attachment churn here. Until then: refs-only.
  const ScrollComponent = React.useMemo(() => {
    const Component = React.forwardRef<ScrollView, ScrollViewProps>((props, ref) => (
      <BottomSheetScrollContainer
        {...props}
        ref={ref}
        expandPanGesture={expandPanRef.current}
        collapsePanGesture={collapsePanRef.current}
        overscrollPanGesture={overscrollPanRef.current}
        contentOverscroll={contentOverscrollRef.current}
        maxScrollOffset={maxScrollOffsetRef.current}
        scrollViewportHeight={scrollViewportHeightRef.current}
        boundaryFactsKnown={boundaryFactsKnownRef.current}
        shouldEnableScrollShared={shouldEnableScrollSharedRef.current}
        transparent={transparentRef.current}
      />
    ));
    Component.displayName = 'OverlaySheetScrollView';
    return Component;
    // Deliberately mount-stable: every input is read from a ref (stable identity).
  }, []);

  return {
    ScrollComponent,
  };
};
