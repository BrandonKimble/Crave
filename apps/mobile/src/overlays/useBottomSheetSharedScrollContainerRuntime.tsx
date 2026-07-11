import React from 'react';
import type { ScrollView, ScrollViewProps } from 'react-native';

import type { ComposedGesture, GestureType } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

import BottomSheetScrollContainer from './BottomSheetScrollContainer';

type UseBottomSheetSharedScrollContainerRuntimeArgs = {
  gesturesScroll: GestureType | ComposedGesture;
  // Distinct gesture instance for the secondary co-mounted list's container — one RNGH gesture
  // cannot be attached to two GestureDetectors, so dual-list surfaces need one per container.
  gesturesScrollSecondary: GestureType | ComposedGesture;
  scrollHeaderComponent?: React.ReactNode;
  // Always-scrollable bounce gate inputs (see BottomSheetScrollContainer `touchDirection` doc).
  // Per-list offsets: each container gates on ITS OWN scroll position, not the active list's.
  bodyTouchDirection: SharedValue<number>;
  primaryScrollOffset: SharedValue<number>;
  secondaryScrollOffset: SharedValue<number>;
  primaryScrollTopOffset: SharedValue<number>;
  secondaryScrollTopOffset: SharedValue<number>;
};

type UseBottomSheetSharedScrollContainerRuntimeResult = {
  ScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
  SecondaryScrollComponent: React.ComponentType<ScrollViewProps & React.RefAttributes<ScrollView>>;
};

export const useBottomSheetSharedScrollContainerRuntime = ({
  gesturesScroll,
  gesturesScrollSecondary,
  scrollHeaderComponent,
  bodyTouchDirection,
  primaryScrollOffset,
  secondaryScrollOffset,
  primaryScrollTopOffset,
  secondaryScrollTopOffset,
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
  // (The shared values below are stable object identities for the runtime's lifetime — safe to
  // close over directly in the type-stable components.)
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
        touchDirection={bodyTouchDirection}
        scrollOffset={primaryScrollOffset}
        scrollTopOffset={primaryScrollTopOffset}
      />
    ));
    Component.displayName = 'OverlaySheetScrollView';
    return Component;
    // Deliberately mount-stable: every input is a ref or SharedValue (stable identity).
  }, []);

  const SecondaryScrollComponent = React.useMemo(() => {
    const Component = React.forwardRef<ScrollView, ScrollViewProps>((props, ref) => (
      <BottomSheetScrollContainer
        {...props}
        ref={ref}
        gesture={gesturesScrollSecondaryRef.current}
        transparent={transparentRef.current}
        touchDirection={bodyTouchDirection}
        scrollOffset={secondaryScrollOffset}
        scrollTopOffset={secondaryScrollTopOffset}
      />
    ));
    Component.displayName = 'OverlaySheetSecondaryScrollView';
    return Component;
    // Deliberately mount-stable: every input is a ref or SharedValue (stable identity).
  }, []);

  return {
    ScrollComponent,
    SecondaryScrollComponent,
  };
};
