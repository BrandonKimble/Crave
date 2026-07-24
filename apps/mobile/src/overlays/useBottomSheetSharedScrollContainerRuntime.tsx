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

  const shouldEnableScrollSharedRef = React.useRef(shouldEnableScrollShared);
  shouldEnableScrollSharedRef.current = shouldEnableScrollShared;
  const transparentRef = React.useRef(transparent);
  transparentRef.current = transparent;

  // RELATION-STALENESS GUARD (red-team ledger #3 — applied for real this round; the
  // 99e020f9 edit silently no-op'd on a drifted anchor): the mount-stable component
  // reads the pans from refs at ITS render, but nothing forced that render when the
  // pans re-mint — a container's Gesture.Native could keep requireExternalGestureToFail
  // relations against DETACHED pan instances (a frozen-scroll vector). Pan identity is
  // now a subscription: a re-mint bumps the store, every live instance re-renders.
  const panRevisionRef = React.useRef({ revision: 0, listeners: new Set<() => void>() });
  const panRevision = panRevisionRef.current;
  React.useEffect(() => {
    panRevision.revision += 1;
    panRevision.listeners.forEach((listener) => listener());
  }, [expandPanGesture, collapsePanGesture, overscrollPanGesture, panRevision]);

  const ScrollComponent = React.useMemo(() => {
    const subscribe = (listener: () => void) => {
      panRevision.listeners.add(listener);
      return () => {
        panRevision.listeners.delete(listener);
      };
    };
    const getRevision = () => panRevision.revision;
    const Component = React.forwardRef<ScrollView, ScrollViewProps>((props, ref) => {
      React.useSyncExternalStore(subscribe, getRevision, getRevision);
      return (
        <BottomSheetScrollContainer
          {...props}
          ref={ref}
          expandPanGesture={expandPanRef.current}
          collapsePanGesture={collapsePanRef.current}
          overscrollPanGesture={overscrollPanRef.current}
          contentOverscroll={contentOverscrollRef.current}
          maxScrollOffset={maxScrollOffsetRef.current}
          scrollViewportHeight={scrollViewportHeightRef.current}
          shouldEnableScrollShared={shouldEnableScrollSharedRef.current}
          transparent={transparentRef.current}
        />
      );
    });
    Component.displayName = 'OverlaySheetScrollView';
    return Component;
    // Mount-stable: inputs read from refs; pan identity via the revision subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ScrollComponent,
  };
};
