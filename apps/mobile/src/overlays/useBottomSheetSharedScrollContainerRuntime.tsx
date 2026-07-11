import React from 'react';
import type { ScrollView, ScrollViewProps } from 'react-native';

import type { ComposedGesture, GestureType } from 'react-native-gesture-handler';

import BottomSheetScrollContainer from './BottomSheetScrollContainer';

type UseBottomSheetSharedScrollContainerRuntimeArgs = {
  gesturesScroll: GestureType | ComposedGesture;
  // Distinct gesture instance for the secondary co-mounted list's container — one RNGH gesture
  // cannot be attached to two GestureDetectors, so dual-list surfaces need one per container.
  gesturesScrollSecondary: GestureType | ComposedGesture;
  scrollHeaderComponent?: React.ReactNode;
};

type UseBottomSheetSharedScrollContainerRuntimeResult = {
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
  SecondaryScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
};

export const useBottomSheetSharedScrollContainerRuntime = ({
  gesturesScroll,
  gesturesScrollSecondary,
  scrollHeaderComponent,
}: UseBottomSheetSharedScrollContainerRuntimeArgs): UseBottomSheetSharedScrollContainerRuntimeResult => {
  const transparent = scrollHeaderComponent != null;

  // Frame-drop fix (red-team-validated 2026-07-02): ScrollComponent used to be memoized on
  // [gesturesScroll, transparent], so it RE-CREATED (a new component TYPE) whenever the scroll
  // gesture re-minted. The scroll gesture re-mints on EVERY page switch because it bakes
  // `.enabled(shouldEnableScroll)` and shouldEnableScroll toggles with the transition's transient
  // interactionEnabled. A new ScrollComponent type forces FlashList to REMOUNT its scroll container
  // (~36ms — the residual per-switch list cost). Keep the component TYPE stable and read the live
  // gesture/transparent from refs: the gesture still flows to BottomSheetScrollContainer (which
  // hands it to a GestureDetector that re-attaches on prop change — no remount), so the drag→scroll
  // handoff is preserved, but a gesture re-mint no longer remounts the list. The refs are read on
  // each render of the stable component instance (which re-renders on scroll/layout/list updates),
  // so any staleness window is confined to a mid-transition frame where interaction is blocked.
  const gesturesScrollRef = React.useRef(gesturesScroll);
  gesturesScrollRef.current = gesturesScroll;
  const gesturesScrollSecondaryRef = React.useRef(gesturesScrollSecondary);
  gesturesScrollSecondaryRef.current = gesturesScrollSecondary;
  const transparentRef = React.useRef(transparent);
  transparentRef.current = transparent;

  const ScrollComponent = React.useMemo(() => {
    const Component = React.forwardRef<ScrollView, ScrollViewProps>((props, ref) => (
      <BottomSheetScrollContainer
        {...props}
        ref={ref}
        gesture={gesturesScrollRef.current}
        transparent={transparentRef.current}
      />
    ));
    Component.displayName = 'OverlaySheetScrollView';
    return Component;
    // Deliberately mount-stable: every input is read from a ref (stable identity).
  }, []);

  const SecondaryScrollComponent = React.useMemo(() => {
    const Component = React.forwardRef<ScrollView, ScrollViewProps>((props, ref) => (
      <BottomSheetScrollContainer
        {...props}
        ref={ref}
        gesture={gesturesScrollSecondaryRef.current}
        transparent={transparentRef.current}
      />
    ));
    Component.displayName = 'OverlaySheetSecondaryScrollView';
    return Component;
    // Deliberately mount-stable: every input is read from a ref (stable identity).
  }, []);

  return {
    ScrollComponent,
    SecondaryScrollComponent,
  };
};
