import React from 'react';
import { useWindowDimensions } from 'react-native';

import { useSharedValue } from 'react-native-reanimated';

import type {
  BottomSheetSharedRuntimeConfigSharedValues,
  BottomSheetSharedRuntimeConfigSnapshot,
  BottomSheetSharedRuntimeProps,
  BottomSheetSharedRuntimeResult,
} from './bottomSheetSharedRuntimeContract';
import type { BottomSheetSnap } from './bottomSheetMotionTypes';
import { useBottomSheetSharedActiveListRuntime } from './useBottomSheetSharedActiveListRuntime';
import { useBottomSheetSharedGestureRuntime } from './useBottomSheetSharedGestureRuntime';
import { useBottomSheetSharedAnimatedSurfaceRuntime } from './useBottomSheetSharedAnimatedSurfaceRuntime';
import { useBottomSheetSharedPublicationRuntime } from './useBottomSheetSharedPublicationRuntime';
import { useBottomSheetSharedScrollContainerRuntime } from './useBottomSheetSharedScrollContainerRuntime';
import { useBottomSheetSharedScrollEventsRuntime } from './useBottomSheetSharedScrollEventsRuntime';
import { useBottomSheetSharedSnapExecutionRuntime } from './useBottomSheetSharedSnapExecutionRuntime';
import { useBottomSheetSharedSnapPublicationRuntime } from './useBottomSheetSharedSnapPublicationRuntime';
import { withSearchNavSwitchRuntimeAttribution } from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';

const createRuntimeConfigSnapshot = ({
  visible,
  listScrollEnabled = true,
  snapPoints,
  initialSnapPoint = 'middle',
  dismissThreshold,
  preventSwipeDismiss = false,
  interactionEnabled = true,
}: Pick<
  BottomSheetSharedRuntimeProps,
  | 'visible'
  | 'listScrollEnabled'
  | 'snapPoints'
  | 'initialSnapPoint'
  | 'dismissThreshold'
  | 'preventSwipeDismiss'
  | 'interactionEnabled'
>): BottomSheetSharedRuntimeConfigSnapshot => ({
  visible,
  listScrollEnabled,
  snapPoints,
  initialSnapPoint,
  dismissThreshold,
  preventSwipeDismiss,
  interactionEnabled,
});

const syncRuntimeConfigValues = (
  values: BottomSheetSharedRuntimeConfigSharedValues,
  snapshot: BottomSheetSharedRuntimeConfigSnapshot
) => {
  const hiddenSnap = snapshot.snapPoints.hidden;
  const hiddenOrCollapsed = hiddenSnap ?? snapshot.snapPoints.collapsed;
  values.visible.value = snapshot.visible;
  values.listScrollEnabled.value = snapshot.listScrollEnabled;
  values.interactionEnabled.value = snapshot.interactionEnabled;
  values.gestureEnabled.value = snapshot.visible && snapshot.interactionEnabled ? 1 : 0;
  values.shouldEnableScroll.value =
    snapshot.visible && snapshot.listScrollEnabled && snapshot.interactionEnabled;
  values.preventSwipeDismiss.value = snapshot.preventSwipeDismiss;
  values.dismissThreshold.value =
    typeof snapshot.dismissThreshold === 'number' ? snapshot.dismissThreshold : null;
  values.expandedSnap.value = snapshot.snapPoints.expanded;
  values.middleSnap.value = snapshot.snapPoints.middle;
  values.collapsedSnap.value = snapshot.snapPoints.collapsed;
  values.hasHiddenSnap.value = typeof hiddenSnap === 'number';
  values.hiddenSnap.value = hiddenOrCollapsed;
  values.initialSnapValue.value = snapshot.snapPoints[snapshot.initialSnapPoint];
  values.hiddenOrCollapsed.value = hiddenOrCollapsed;
};

const useBottomSheetSharedRuntimeConfigValues = ({
  fallbackSnapshot,
  runtimeConfigAuthority,
}: {
  fallbackSnapshot: BottomSheetSharedRuntimeConfigSnapshot;
  runtimeConfigAuthority: BottomSheetSharedRuntimeProps['runtimeConfigAuthority'];
}): BottomSheetSharedRuntimeConfigSharedValues => {
  const initialSnapshot = runtimeConfigAuthority?.getSnapshot() ?? fallbackSnapshot;
  const hiddenSnap = initialSnapshot.snapPoints.hidden;
  const hiddenOrCollapsed = hiddenSnap ?? initialSnapshot.snapPoints.collapsed;
  const visibleValue = useSharedValue(initialSnapshot.visible);
  const listScrollEnabledValue = useSharedValue(initialSnapshot.listScrollEnabled);
  const interactionEnabledValue = useSharedValue(initialSnapshot.interactionEnabled);
  const gestureEnabledValue = useSharedValue(
    initialSnapshot.visible && initialSnapshot.interactionEnabled ? 1 : 0
  );
  const shouldEnableScrollValue = useSharedValue(
    initialSnapshot.visible &&
      initialSnapshot.listScrollEnabled &&
      initialSnapshot.interactionEnabled
  );
  const preventSwipeDismissValue = useSharedValue(initialSnapshot.preventSwipeDismiss);
  const dismissThresholdValue = useSharedValue<number | null>(
    typeof initialSnapshot.dismissThreshold === 'number' ? initialSnapshot.dismissThreshold : null
  );
  const expandedSnapValue = useSharedValue(initialSnapshot.snapPoints.expanded);
  const middleSnapValue = useSharedValue(initialSnapshot.snapPoints.middle);
  const collapsedSnapValue = useSharedValue(initialSnapshot.snapPoints.collapsed);
  const hiddenSnapValue = useSharedValue(hiddenOrCollapsed);
  const hasHiddenSnapValue = useSharedValue(typeof hiddenSnap === 'number');
  const initialSnapValue = useSharedValue(
    initialSnapshot.snapPoints[initialSnapshot.initialSnapPoint]
  );
  const hiddenOrCollapsedValue = useSharedValue(hiddenOrCollapsed);

  const values = React.useMemo<BottomSheetSharedRuntimeConfigSharedValues>(
    () => ({
      visible: visibleValue,
      listScrollEnabled: listScrollEnabledValue,
      interactionEnabled: interactionEnabledValue,
      gestureEnabled: gestureEnabledValue,
      shouldEnableScroll: shouldEnableScrollValue,
      preventSwipeDismiss: preventSwipeDismissValue,
      dismissThreshold: dismissThresholdValue,
      expandedSnap: expandedSnapValue,
      middleSnap: middleSnapValue,
      collapsedSnap: collapsedSnapValue,
      hiddenSnap: hiddenSnapValue,
      hasHiddenSnap: hasHiddenSnapValue,
      initialSnapValue,
      hiddenOrCollapsed: hiddenOrCollapsedValue,
    }),
    [
      collapsedSnapValue,
      dismissThresholdValue,
      expandedSnapValue,
      gestureEnabledValue,
      hasHiddenSnapValue,
      hiddenOrCollapsedValue,
      hiddenSnapValue,
      initialSnapValue,
      interactionEnabledValue,
      listScrollEnabledValue,
      middleSnapValue,
      preventSwipeDismissValue,
      shouldEnableScrollValue,
      visibleValue,
    ]
  );

  React.useLayoutEffect(() => {
    if (runtimeConfigAuthority == null) {
      withSearchNavSwitchRuntimeAttribution(
        'bottomSheetSharedRuntimeConfig',
        'sync:fallbackLayoutEffect',
        () => {
          syncRuntimeConfigValues(values, fallbackSnapshot);
        }
      );
      return undefined;
    }
    if (runtimeConfigAuthority.registerSharedValues != null) {
      return runtimeConfigAuthority.registerSharedValues(values);
    }
    const sync = () => {
      withSearchNavSwitchRuntimeAttribution(
        'bottomSheetSharedRuntimeConfig',
        'sync:authority',
        () => {
          syncRuntimeConfigValues(values, runtimeConfigAuthority.getSnapshot());
        }
      );
    };
    sync();
    return runtimeConfigAuthority.subscribe(() => {
      withSearchNavSwitchRuntimeAttribution(
        'bottomSheetSharedRuntimeConfig',
        'subscriptionWakeup',
        sync
      );
    });
  }, [fallbackSnapshot, runtimeConfigAuthority, values]);

  return values;
};

export const useBottomSheetSharedRuntime = ({
  visible,
  listScrollEnabled = true,
  snapPoints,
  initialSnapPoint = 'middle',
  preservePositionOnSnapPointsChange = false,
  scrollHeaderComponent,
  onHidden,
  onSnapStart,
  onSnapChange,
  onScrollOffsetChange,
  onMomentumBeginJS,
  onMomentumEndJS,
  showsVerticalScrollIndicator,
  dynamicScrollIndicator,
  testID,
  activeList = 'primary',
  onDragStateChange,
  onSettleStateChange,
  onSnapSettleComplete,
  motionCommandValue,
  dismissThreshold,
  preventSwipeDismiss = false,
  interactionEnabled = true,
  animateOnMount = false,
  sheetYValue,
  sheetYObserver,
  scrollOffsetValue,
  momentumFlag,
  listKey,
  dataCount,
  secondaryDataCount,
  runtimeConfigAuthority,
  subscribeTouchBlockingToReact = true,
}: BottomSheetSharedRuntimeProps): BottomSheetSharedRuntimeResult => {
  const { height: screenHeight } = useWindowDimensions();
  const fallbackRuntimeConfigSnapshot = React.useMemo(
    () =>
      createRuntimeConfigSnapshot({
        visible,
        listScrollEnabled,
        snapPoints,
        initialSnapPoint,
        dismissThreshold,
        preventSwipeDismiss,
        interactionEnabled,
      }),
    [
      dismissThreshold,
      initialSnapPoint,
      interactionEnabled,
      listScrollEnabled,
      preventSwipeDismiss,
      snapPoints,
      visible,
    ]
  );
  const runtimeConfigValues = useBottomSheetSharedRuntimeConfigValues({
    fallbackSnapshot: fallbackRuntimeConfigSnapshot,
    runtimeConfigAuthority,
  });
  const isSearchResultsSheet = testID === 'search-results-flatlist';
  const expandedSnap = snapPoints.expanded;
  const middleSnap = snapPoints.middle;
  const collapsedSnap = snapPoints.collapsed;
  const hiddenSnap = snapPoints.hidden;
  const initialSnapValue = snapPoints[initialSnapPoint];
  const hiddenOrCollapsed = hiddenSnap ?? collapsedSnap;
  const shouldAnimateOnMount = animateOnMount && visible && !sheetYValue;
  const initialSheetY = shouldAnimateOnMount
    ? hiddenOrCollapsed
    : visible
      ? initialSnapValue
      : hiddenOrCollapsed;
  const sheetY = sheetYValue ?? useSharedValue(initialSheetY);
  const currentSnapKeyRef = React.useRef<BottomSheetSnap>(
    visible ? initialSnapPoint : hiddenSnap !== undefined ? 'hidden' : 'collapsed'
  );
  const gestureEnabled = visible && interactionEnabled;
  const expandTouchInHeader = useSharedValue(false);
  const expandGestureOwner = useSharedValue(0);
  const expandHandoffLocked = useSharedValue(false);
  const expandStartedBelowExpanded = useSharedValue(false);
  const expandAllowTopElastic = useSharedValue(false);
  const collapseTouchInHeader = useSharedValue(false);
  const expandPanActive = useSharedValue(false);
  const expandDidHandoffToScroll = useSharedValue(false);
  const expandStartSheetY = useSharedValue(0);
  const expandStartTouchX = useSharedValue(0);
  const expandStartTouchY = useSharedValue(0);
  const expandLastTouchX = useSharedValue(0);
  const expandLastTouchY = useSharedValue(0);
  const expandAxisLock = useSharedValue(0);
  const collapsePanActive = useSharedValue(false);
  const collapseStartSheetY = useSharedValue(0);
  const collapseStartTouchX = useSharedValue(0);
  const collapseStartTouchY = useSharedValue(0);
  const collapseLastTouchX = useSharedValue(0);
  const collapseLastTouchY = useSharedValue(0);
  const collapseAxisLock = useSharedValue(0);
  // Call useSharedValue unconditionally (hooks must never be conditional) then coalesce — the
  // fallback shared value is used only when no external scrollOffsetValue was provided.
  const fallbackScrollOffset = useSharedValue(0);
  const scrollOffset = scrollOffsetValue ?? fallbackScrollOffset;
  // THE BOUNDARY-PHYSICS VALUE (boundary-physics law §1): <0 past the list top, >0 past
  // the bottom, 0 inside. Native bounce stays OFF forever — the runtime owns everything
  // beyond a boundary. Slice 1 mints the value and signs consumers up (plate follows a
  // negative offset); the physics writers (pans + momentum edge) land in later slices.
  const contentOverscroll = useSharedValue(0);
  const maxScrollOffset = useSharedValue(0);
  const scrollTopOffset = useSharedValue(0);
  const primaryScrollOffset = useSharedValue(0);
  const secondaryScrollOffset = useSharedValue(0);
  const primaryScrollTopOffset = useSharedValue(0);
  const secondaryScrollTopOffset = useSharedValue(0);
  const activePrimaryList = useSharedValue(true);
  const isInMomentum = momentumFlag ?? useSharedValue(false);
  const wasVisible = React.useRef(visible);
  const hasNotifiedHidden = useSharedValue(false);
  const resolvedActiveList = secondaryDataCount > 0 ? activeList : 'primary';
  const isDragging = useSharedValue(false);
  const isSettling = useSharedValue(false);
  const settlingToHidden = useSharedValue(false);
  const hasUserDrivenSheet = useSharedValue(false);
  const dragStartY = useSharedValue(initialSheetY);
  const springTargetY = useSharedValue(initialSheetY);
  const springId = useSharedValue(0);

  const publicationRuntime = useBottomSheetSharedPublicationRuntime({
    showsVerticalScrollIndicator,
    dynamicScrollIndicator,
    scrollHeaderComponent,
    subscribeTouchBlockingToReact,
    scrollOffset,
    scrollTopOffset,
  });
  const shouldEnableScroll = visible && listScrollEnabled && interactionEnabled;

  useBottomSheetSharedActiveListRuntime({
    resolvedActiveList,
    activePrimaryList,
    scrollOffset,
    scrollTopOffset,
    primaryScrollOffset,
    secondaryScrollOffset,
    primaryScrollTopOffset,
    secondaryScrollTopOffset,
  });

  const { primaryListOnScroll, secondaryListOnScroll, primaryScrollViewOnScroll } =
    useBottomSheetSharedScrollEventsRuntime({
      maxScrollOffset,
      contentOverscroll,
      activePrimaryList,
      isInMomentum,
      onMomentumBeginJS,
      onMomentumEndJS,
      onScrollOffsetChange,
      scrollOffset,
      scrollTopOffset,
      primaryScrollOffset,
      secondaryScrollOffset,
      primaryScrollTopOffset,
      secondaryScrollTopOffset,
    });

  const snapPublicationRuntime = useBottomSheetSharedSnapPublicationRuntime({
    visible,
    listScrollEnabled,
    interactionEnabled,
    shouldEnableScroll,
    gestureEnabled,
    activeList: resolvedActiveList,
    screenHeight,
    testID,
    listKey,
    dataCount,
    secondaryDataCount,
    scrollHeaderHeight: publicationRuntime.scrollHeaderHeight,
    touchBlockingEnabled: publicationRuntime.touchBlockingEnabled,
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
    setTouchBlockingEnabled: publicationRuntime.setTouchBlockingEnabled,
  });

  const { resolveDestination, startSpring } = useBottomSheetSharedSnapExecutionRuntime({
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
    headerHeight: publicationRuntime.headerHeight,
    currentSnapKeyRef,
    isDragging,
    isSettling,
    settlingToHidden,
    hasUserDrivenSheet,
    hasNotifiedHidden,
    springTargetY,
    springId,
    wasVisible,
    notifyHidden: snapPublicationRuntime.notifyHidden,
    dispatchSnapChange: snapPublicationRuntime.dispatchSnapChange,
    notifySnapStart: snapPublicationRuntime.notifySnapStart,
    notifySnapSettleComplete: snapPublicationRuntime.notifySnapSettleComplete,
    runtimeConfigValues,
    isSearchResultsSheet,
  });

  const gestures = useBottomSheetSharedGestureRuntime({
    gestureEnabled,
    contentOverscroll,
    maxScrollOffset,
    preventSwipeDismiss,
    expandedSnap,
    middleSnap,
    collapsedSnap,
    hiddenSnap,
    headerHeight: publicationRuntime.headerHeight,
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
  });
  const scrollContainerRuntime = useBottomSheetSharedScrollContainerRuntime({
    expandPanGesture: gestures.expandPan,
    collapsePanGesture: gestures.collapsePan,
    overscrollPanGesture: gestures.overscrollPan,
    contentOverscroll,
    shouldEnableScrollShared: runtimeConfigValues.shouldEnableScroll,
    scrollHeaderComponent,
  });
  const animatedSurfaceRuntime = useBottomSheetSharedAnimatedSurfaceRuntime({
    scrollOffset,
    scrollTopOffset,
    sheetY,
  });

  return {
    gestureRuntime: {
      gestures,
      touchBlockingEnabled: publicationRuntime.touchBlockingEnabled,
      touchBlockingAuthority: publicationRuntime.touchBlockingAuthority,
    },
    scrollRuntime: {
      ScrollComponent: scrollContainerRuntime.ScrollComponent,
      shouldEnableScroll,
      // UI-thread mirror of shouldEnableScroll. scrollEnabled is now applied INSIDE
      // BottomSheetScrollContainer from this SharedValue (the single authority —
      // plans/sheet-scroll-primitive.md §3.1); exposed here only for non-render readers.
      shouldEnableScrollShared: runtimeConfigValues.shouldEnableScroll,
      effectiveShowsVerticalScrollIndicator:
        publicationRuntime.effectiveShowsVerticalScrollIndicator,
      scrollHeaderHeight: publicationRuntime.scrollHeaderHeight,
      scrollOffset,
      contentOverscroll,
      onHeaderLayout: publicationRuntime.onHeaderLayout,
      onScrollHeaderLayout: publicationRuntime.onScrollHeaderLayout,
      primaryListOnScroll,
      secondaryListOnScroll,
      primaryScrollViewOnScroll,
    },
    surfaceRuntime: {
      sheetHeightStyle: animatedSurfaceRuntime.sheetHeightStyle,
      animatedSheetStyle: animatedSurfaceRuntime.animatedSheetStyle,
      scrollHeaderSyncStyle: animatedSurfaceRuntime.scrollHeaderSyncStyle,
    },
  };
};

export type {
  BottomSheetSharedRuntimeProps,
  BottomSheetSharedRuntimeResult,
} from './bottomSheetSharedRuntimeContract';
