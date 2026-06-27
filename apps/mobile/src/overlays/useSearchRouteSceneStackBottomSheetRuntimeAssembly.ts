import React from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Platform } from 'react-native';

import type {
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyRuntimeAuthority,
  BottomSheetSceneStackBodyRuntimeSnapshot,
  BottomSheetSceneStackBodyScrollRuntime,
} from './bottomSheetSceneStackHostContract';
import { overlaySheetStyles } from './overlaySheetStyles';
import { useBottomSheetSharedRuntime } from './useBottomSheetSharedRuntime';
import type {
  AppRouteSheetHostRuntimeConfigAuthority,
  AppRouteSheetHostSurfaceBodySnapshot,
} from '../navigation/runtime/app-route-sheet-host-surface-runtime-contract';

export type SearchRouteSceneStackBottomSheetRuntimeAssembly = {
  sheetGesture: ReturnType<
    typeof useBottomSheetSharedRuntime
  >['gestureRuntime']['gestures']['sheet'];
  touchBlockingAuthority: ReturnType<
    typeof useBottomSheetSharedRuntime
  >['gestureRuntime']['touchBlockingAuthority'];
  shadowShellStyle: StyleProp<ViewStyle>;
  surfaceStyle: StyleProp<ViewStyle>;
  sheetViewStyle: StyleProp<ViewStyle>;
  sheetYValue: SharedValue<number>;
  scrollHeaderSyncStyle: StyleProp<ViewStyle>;
  onHeaderLayout: (event: LayoutChangeEvent) => void;
  onScrollHeaderLayout: (event: LayoutChangeEvent) => void;
  bodyRuntimeAuthority: BottomSheetSceneStackBodyRuntimeAuthority;
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
};

const composeViewStyles = (
  ...styles: Array<StyleProp<ViewStyle> | null | undefined>
): StyleProp<ViewStyle> => {
  const composed: Array<Exclude<StyleProp<ViewStyle>, null | undefined | false>> = [];
  const appendStyle = (style: StyleProp<ViewStyle> | null | undefined) => {
    if (!style) {
      return;
    }
    if (Array.isArray(style)) {
      style.forEach((entry) => appendStyle(entry as StyleProp<ViewStyle>));
      return;
    }
    composed.push(style);
  };

  styles.forEach((style) => appendStyle(style));
  return composed;
};

type RenderableAppRouteSheetHostSurfaceBodySnapshot = AppRouteSheetHostSurfaceBodySnapshot & {
  chromeEntry: NonNullable<AppRouteSheetHostSurfaceBodySnapshot['chromeEntry']>;
  scrollSharedRuntimeEntry: NonNullable<
    AppRouteSheetHostSurfaceBodySnapshot['scrollSharedRuntimeEntry']
  >;
  scrollBodyDefaultsEntry: NonNullable<
    AppRouteSheetHostSurfaceBodySnapshot['scrollBodyDefaultsEntry']
  >;
  motionStateEntry: NonNullable<AppRouteSheetHostSurfaceBodySnapshot['motionStateEntry']>;
};

const useBottomSheetSceneStackBodyRuntimeAuthority = ({
  bodyDefaults,
  bodyScrollRuntime,
}: {
  bodyDefaults: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime: BottomSheetSceneStackBodyScrollRuntime;
}): BottomSheetSceneStackBodyRuntimeAuthority => {
  const latestSnapshot = React.useMemo<BottomSheetSceneStackBodyRuntimeSnapshot>(
    () => ({
      bodyDefaults,
      bodyScrollRuntime,
    }),
    [bodyDefaults, bodyScrollRuntime]
  );
  const latestSnapshotRef = React.useRef(latestSnapshot);
  const sceneAuthoritiesRef = React.useRef<
    Map<
      string,
      ReturnType<BottomSheetSceneStackBodyRuntimeAuthority['getSceneBodyRuntimeAuthority']>
    >
  >(new Map());

  latestSnapshotRef.current = latestSnapshot;

  return React.useMemo<BottomSheetSceneStackBodyRuntimeAuthority>(
    () => ({
      getSceneBodyRuntimeAuthority: (sceneKey) => {
        const existingAuthority = sceneAuthoritiesRef.current.get(sceneKey);
        if (existingAuthority != null) {
          return existingAuthority;
        }
        const authority = {
          subscribe: () => () => {},
          getSnapshot: () => latestSnapshotRef.current,
        };
        sceneAuthoritiesRef.current.set(sceneKey, authority);
        return authority;
      },
    }),
    []
  );
};

export const useSearchRouteSceneStackBottomSheetRuntimeAssembly = ({
  surfaceBodySnapshot,
  routeSheetRuntimeConfigAuthority,
}: {
  surfaceBodySnapshot: RenderableAppRouteSheetHostSurfaceBodySnapshot;
  routeSheetRuntimeConfigAuthority: AppRouteSheetHostRuntimeConfigAuthority;
}): SearchRouteSceneStackBottomSheetRuntimeAssembly => {
  const chromeEntry = surfaceBodySnapshot.chromeEntry;
  const scrollSharedRuntimeEntry = surfaceBodySnapshot.scrollSharedRuntimeEntry;
  const scrollBodyDefaultsEntry = surfaceBodySnapshot.scrollBodyDefaultsEntry;
  const motionStateEntry = surfaceBodySnapshot.motionStateEntry;
  const motionCallbacksEntry = surfaceBodySnapshot.motionCallbacksEntry;
  const { gestureRuntime, scrollRuntime, surfaceRuntime } = useBottomSheetSharedRuntime({
    visible: motionStateEntry.visible,
    listScrollEnabled: scrollSharedRuntimeEntry.listScrollEnabled,
    snapPoints: motionStateEntry.snapPoints,
    initialSnapPoint: motionStateEntry.initialSnapPoint,
    preservePositionOnSnapPointsChange: true,
    onHidden: scrollSharedRuntimeEntry.onHidden,
    onSnapStart: motionCallbacksEntry.onSnapStart,
    onSnapChange: motionCallbacksEntry.onSnapChange,
    onScrollOffsetChange: scrollSharedRuntimeEntry.onScrollOffsetChange,
    onMomentumBeginJS: scrollSharedRuntimeEntry.onMomentumBeginJS,
    onMomentumEndJS: scrollSharedRuntimeEntry.onMomentumEndJS,
    showsVerticalScrollIndicator: scrollSharedRuntimeEntry.showsVerticalScrollIndicator,
    dynamicScrollIndicator: false,
    testID: scrollSharedRuntimeEntry.testID,
    onDragStateChange: motionCallbacksEntry.onDragStateChange,
    onSettleStateChange: motionCallbacksEntry.onSettleStateChange,
    onSnapSettleComplete: motionCallbacksEntry.onSnapSettleComplete,
    motionCommandValue: motionStateEntry.motionCommandValue,
    dismissThreshold: scrollSharedRuntimeEntry.dismissThreshold,
    preventSwipeDismiss: scrollSharedRuntimeEntry.preventSwipeDismiss ?? false,
    interactionEnabled: scrollSharedRuntimeEntry.interactionEnabled ?? true,
    animateOnMount: scrollSharedRuntimeEntry.animateOnMount ?? false,
    sheetYValue: motionStateEntry.sheetYValue,
    scrollOffsetValue: motionStateEntry.scrollOffsetValue,
    momentumFlag: motionStateEntry.momentumFlag,
    dataCount: 0,
    secondaryDataCount: 0,
    runtimeConfigAuthority: routeSheetRuntimeConfigAuthority,
    subscribeTouchBlockingToReact: false,
  });

  const resolvedShadowStyle = chromeEntry.shadowStyle ?? overlaySheetStyles.shadowShell;
  const resolvedSurfaceStyle = chromeEntry.surfaceStyle ?? overlaySheetStyles.surface;
  const shadowShellStyle = React.useMemo(
    () => [
      resolvedShadowStyle,
      Platform.OS === 'android' ? overlaySheetStyles.shadowShellAndroid : null,
    ],
    [resolvedShadowStyle]
  );
  const surfaceStyle = React.useMemo(
    () => composeViewStyles(overlaySheetStyles.surface, resolvedSurfaceStyle),
    [resolvedSurfaceStyle]
  );

  const bodyDefaults = React.useMemo<BottomSheetSceneStackBodyDefaults>(
    () => ({
      scrollHeaderComponent: null,
      scrollHeaderHeight: scrollRuntime.scrollHeaderHeight,
      effectiveShowsVerticalScrollIndicator: scrollRuntime.effectiveShowsVerticalScrollIndicator,
      resolvedKeyboardShouldPersistTaps: scrollBodyDefaultsEntry.keyboardShouldPersistTaps,
      resolvedKeyboardDismissMode: scrollBodyDefaultsEntry.keyboardDismissMode,
      resolvedScrollIndicatorInsets: scrollBodyDefaultsEntry.scrollIndicatorInsets,
      resolvedTestID: scrollBodyDefaultsEntry.testID,
      resolvedContentContainerStyle: scrollBodyDefaultsEntry.contentContainerStyle,
      activeFlashListProps: scrollBodyDefaultsEntry.flashListProps,
    }),
    [
      scrollRuntime.effectiveShowsVerticalScrollIndicator,
      scrollBodyDefaultsEntry.contentContainerStyle,
      scrollBodyDefaultsEntry.flashListProps,
      scrollBodyDefaultsEntry.keyboardDismissMode,
      scrollBodyDefaultsEntry.keyboardShouldPersistTaps,
      scrollBodyDefaultsEntry.scrollIndicatorInsets,
      scrollBodyDefaultsEntry.testID,
      scrollRuntime.scrollHeaderHeight,
    ]
  );

  const bodyScrollRuntime = React.useMemo<BottomSheetSceneStackBodyScrollRuntime>(
    () => ({
      shouldEnableScroll: scrollRuntime.shouldEnableScroll,
      ScrollComponent: scrollRuntime.ScrollComponent,
      primaryScrollViewOnScroll: scrollRuntime.primaryScrollViewOnScroll,
      primaryListOnScroll: scrollRuntime.primaryListOnScroll,
      secondaryListOnScroll: scrollRuntime.secondaryListOnScroll,
      scrollOffset: scrollRuntime.scrollOffset,
    }),
    [
      scrollRuntime.ScrollComponent,
      scrollRuntime.primaryListOnScroll,
      scrollRuntime.primaryScrollViewOnScroll,
      scrollRuntime.scrollOffset,
      scrollRuntime.secondaryListOnScroll,
      scrollRuntime.shouldEnableScroll,
    ]
  );

  const resolvedContainerStyle = chromeEntry.style ?? overlaySheetStyles.container;
  const sheetViewStyle = React.useMemo(
    () =>
      composeViewStyles(
        overlaySheetStyles.container,
        resolvedContainerStyle,
        surfaceRuntime.sheetHeightStyle,
        surfaceRuntime.animatedSheetStyle
      ),
    [resolvedContainerStyle, surfaceRuntime.animatedSheetStyle, surfaceRuntime.sheetHeightStyle]
  );
  const bodyRuntimeAuthority = useBottomSheetSceneStackBodyRuntimeAuthority({
    bodyDefaults,
    bodyScrollRuntime,
  });

  return {
    sheetGesture: gestureRuntime.gestures.sheet,
    touchBlockingAuthority: gestureRuntime.touchBlockingAuthority,
    shadowShellStyle,
    surfaceStyle,
    sheetViewStyle,
    sheetYValue: motionStateEntry.sheetYValue,
    scrollHeaderSyncStyle: surfaceRuntime.scrollHeaderSyncStyle,
    onHeaderLayout: scrollRuntime.onHeaderLayout,
    onScrollHeaderLayout: scrollRuntime.onScrollHeaderLayout,
    bodyRuntimeAuthority,
    bodyDefaults,
    bodyScrollRuntime,
  };
};
