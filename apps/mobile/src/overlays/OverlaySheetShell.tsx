import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';

import Reanimated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { BottomSheetContentSurface } from './BottomSheetContentSurface';
import { BottomSheetFlashListSurface } from './BottomSheetFlashListSurface';
import { BottomSheetHostShell } from './BottomSheetHostShell';
import { useBottomSheetHostCommandRuntime } from './useBottomSheetHostCommandRuntime';
import { useBottomSheetNativeEventRuntime } from './useBottomSheetNativeEventRuntime';
import { useBottomSheetNativeHostPropsRuntime } from './useBottomSheetNativeHostPropsRuntime';
import { OVERLAY_STACK_ZINDEX, overlaySheetStyles } from './overlaySheetStyles';
import type { OverlayContentSpec, OverlaySheetSnap } from './types';
import { isOverlayListContentSpec } from './types';
import type { BottomSheetRuntimeModel } from './useBottomSheetRuntime';
import {
  useOverlayHeaderActionController,
  type OverlayHeaderActionMode,
} from './useOverlayHeaderActionController';
import { useOverlayStore } from '../store/overlayStore';
import { useBottomSheetContentContainerStyleRuntime } from './useBottomSheetContentContainerStyleRuntime';
import { useBottomSheetFlashListVisualPropsRuntime } from './useBottomSheetFlashListVisualPropsRuntime';
import { useBottomSheetHostActiveScrollRuntime } from './useBottomSheetHostActiveScrollRuntime';
import { useBottomSheetHostScrollIndicatorRuntime } from './useBottomSheetHostScrollIndicatorRuntime';
import { useBottomSheetPrimaryScrollHandlerRuntime } from './useBottomSheetPrimaryScrollHandlerRuntime';
import { useBottomSheetRuntimeModel } from './useBottomSheetRuntime';
import { useBottomSheetSecondaryScrollHandlerRuntime } from './useBottomSheetSecondaryScrollHandlerRuntime';
import { useBottomSheetSurfaceRefsRuntime } from './useBottomSheetSurfaceRefsRuntime';
import { useBottomSheetSurfaceScrollCallbacksRuntime } from './useBottomSheetSurfaceScrollCallbacksRuntime';
import { useOverlaySheetDefaultSnapRuntime } from './useOverlaySheetDefaultSnapRuntime';
import { useOverlaySheetListRuntime } from './useOverlaySheetListRuntime';
import { useOverlaySheetRequestedSnapRuntime } from './useOverlaySheetRequestedSnapRuntime';
import { useOverlaySheetResolvedSnapRuntime } from './useOverlaySheetResolvedSnapRuntime';
import { useOverlaySheetSnapRequestRuntime } from './useOverlaySheetSnapRequestRuntime';

type OverlaySheetShellProps = {
  visible: boolean;
  spec: OverlayContentSpec<unknown> | null;
  sheetY: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  momentumFlag: SharedValue<boolean>;
  headerActionProgress?: SharedValue<number>;
  headerActionMode?: OverlayHeaderActionMode;
  navBarHeight?: number;
  applyNavBarCutout?: boolean;
  navBarCutoutProgress?: SharedValue<number>;
  navBarHiddenTranslateY?: number;
  navBarCutoutIsHiding?: boolean;
  runtimeModel?: BottomSheetRuntimeModel;
};

const OverlaySheetShell: React.FC<OverlaySheetShellProps> = ({
  visible,
  spec,
  sheetY,
  scrollOffset,
  momentumFlag,
  headerActionProgress,
  headerActionMode = 'fixed-close',
  navBarHeight = 0,
  applyNavBarCutout = false,
  navBarCutoutProgress,
  navBarHiddenTranslateY = 0,
  navBarCutoutIsHiding = false,
  runtimeModel,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const activeOverlayRouteKey = useOverlayStore((state) => state.activeOverlayRoute.key);
  const overlayRouteStack = useOverlayStore((state) => state.overlayRouteStack);
  const rootOverlay = useOverlayStore(
    (state) => state.overlayRouteStack[0]?.key ?? state.activeOverlayRoute.key
  );
  const resolvedOverlayKey = spec?.overlayKey ?? activeOverlayRouteKey;
  const shellSheetRuntimeModel = useBottomSheetRuntimeModel({
    presentationStateOverride: {
      sheetY,
      scrollOffset,
      momentumFlag,
    },
  });
  const resolvedRuntimeModel = runtimeModel ?? spec?.runtimeModel ?? shellSheetRuntimeModel;
  const { resolvedListRef, handleScrollOffsetChange } = useOverlaySheetListRuntime({
    visible,
    spec,
    scrollOffset,
    resolvedOverlayKey,
  });
  const {
    persistedSnap,
    resolvedSnapPersistenceKey,
    ensurePersistedSnap,
    handleSnapChange: handleSnapChangeBase,
    handleSnapStart: handleSnapStartBase,
  } = useOverlaySheetResolvedSnapRuntime({
    spec,
    resolvedOverlayKey,
    rootOverlay,
    overlayRouteStackLength: overlayRouteStack.length,
  });
  const {
    handleSnapChange,
    handleSnapStart,
    requestShellSnap,
    requestedShellSnapRef,
    currentSnapRef,
  } = useOverlaySheetSnapRequestRuntime({
    runtime: resolvedRuntimeModel,
    handleSnapChangeBase,
    handleSnapStartBase,
  });
  const resolvedInteractionEnabled = spec?.interactionEnabled ?? true;
  const resolveSnapTargetY = React.useCallback(
    (snapKey: OverlaySheetSnap | 'hidden') => {
      'worklet';
      const snapPoints = spec?.snapPoints;
      if (!snapPoints) {
        return undefined;
      }
      switch (snapKey) {
        case 'expanded':
          return snapPoints.expanded;
        case 'middle':
          return snapPoints.middle;
        case 'collapsed':
          return snapPoints.collapsed;
        case 'hidden':
          return snapPoints.hidden ?? snapPoints.collapsed;
        default:
          return undefined;
      }
    },
    [spec?.snapPoints]
  );
  const hasRequestedSnap = useOverlaySheetRequestedSnapRuntime({
    visible,
    spec,
    resolvedOverlayKey,
    requestShellSnap,
    requestedShellSnapRef,
  });
  useOverlaySheetDefaultSnapRuntime({
    visible,
    spec,
    persistedSnap,
    resolvedSnapPersistenceKey,
    ensurePersistedSnap,
    screenHeight,
    sheetY,
    requestShellSnap,
    requestedShellSnapRef,
    currentSnapRef,
    hasRequestedSnap,
  });
  const handleDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      spec?.onDragStateChange?.(isDragging);
    },
    [spec]
  );
  const handleSettleStateChange = React.useCallback(
    (isSettling: boolean) => {
      spec?.onSettleStateChange?.(isSettling);
    },
    [spec]
  );
  const sheetCommand = useBottomSheetHostCommandRuntime({
    runtime: resolvedRuntimeModel,
  });
  const resolvedSheetProps =
    spec && isOverlayListContentSpec(spec) ? { ...spec, listRef: resolvedListRef } : spec;

  if (!resolvedSheetProps) {
    return null;
  }

  const {
    snapPoints,
    shellSnapRequest,
    runtimeModel: specRuntimeModel,
    style: sheetStyle,
    headerComponent,
    backgroundComponent,
    overlayComponent,
    contentContainerStyle,
    keyboardShouldPersistTaps = 'handled',
    scrollIndicatorInsets,
    onHidden,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumBeginJS,
    onMomentumEndJS,
    onEndReached,
    onEndReachedThreshold,
    showsVerticalScrollIndicator,
    keyboardDismissMode,
    bounces,
    alwaysBounceVertical,
    overScrollMode,
    testID,
    activeList = 'primary',
    listScrollEnabled = true,
    dismissThreshold,
    preventSwipeDismiss = false,
    animateOnMount = false,
    flashListProps,
    surfaceStyle,
    shadowStyle,
    contentSurfaceStyle,
    initialSnapPoint = 'middle',
    ...surfaceProps
  } = resolvedSheetProps;
  void shellSnapRequest;
  void specRuntimeModel;
  const { hostEventProps } = useBottomSheetNativeEventRuntime({
    visible,
    initialSnapPoint,
    runtime: resolvedRuntimeModel,
    resolveSnapTargetY,
    onHidden,
    onSnapStart: handleSnapStart,
    onSnapChange: handleSnapChange,
    onDragStateChange: handleDragStateChange,
    onSettleStateChange: handleSettleStateChange,
  });
  const hostProps = useBottomSheetNativeHostPropsRuntime({
    hostKey: 'app_overlay_sheet',
    visible,
    snapPoints,
    initialSnapPoint,
    preservePositionOnSnapPointsChange: true,
    preventSwipeDismiss,
    interactionEnabled: resolvedInteractionEnabled,
    animateOnMount,
    dismissThreshold,
    style: sheetStyle ?? overlaySheetStyles.container,
    hostEventProps,
    sheetCommand,
  });
  const {
    listProps,
    contentProps,
    flashListRef,
    secondaryFlashListRef,
    shouldRenderDualLists,
    resolvedActiveList,
  } = useBottomSheetSurfaceRefsRuntime({
    activeList,
    surfaceProps,
  });
  const listContentContainerStyle = useBottomSheetContentContainerStyleRuntime({
    contentContainerStyle,
  });
  const { flashListSurfaceStyle, resolvedFlashListProps } =
    useBottomSheetFlashListVisualPropsRuntime({
      flashListProps,
      listProps,
    });
  const shouldEnableScroll = visible && listScrollEnabled && resolvedInteractionEnabled;
  const { handleScrollBeginDrag, handleScrollEndDrag, handleContentScrollEndDrag } =
    useBottomSheetSurfaceScrollCallbacksRuntime({
      flashListProps,
      onScrollBeginDrag,
      onScrollEndDrag,
      onScrollOffsetChange: handleScrollOffsetChange,
      scrollOffset: resolvedRuntimeModel.presentationState.scrollOffset,
    });
  const { momentumFlag: sheetMomentumFlag } = resolvedRuntimeModel.presentationState;
  const {
    activePrimaryList,
    primaryScrollOffset,
    secondaryScrollOffset,
    primaryScrollTopOffset,
    secondaryScrollTopOffset,
    scrollTopOffset,
  } = useBottomSheetHostActiveScrollRuntime({
    activeList: resolvedActiveList,
    dualListEnabled: shouldRenderDualLists,
    scrollOffset: resolvedRuntimeModel.presentationState.scrollOffset,
  });
  const effectiveShowsVerticalScrollIndicator = useBottomSheetHostScrollIndicatorRuntime({
    showsVerticalScrollIndicator: Boolean(showsVerticalScrollIndicator),
    scrollOffset: resolvedRuntimeModel.presentationState.scrollOffset,
    scrollTopOffset,
  });
  const primaryAnimatedScrollHandler = useBottomSheetPrimaryScrollHandlerRuntime({
    activePrimaryList,
    momentumFlag: sheetMomentumFlag,
    onMomentumBegin: onMomentumBeginJS,
    onMomentumEnd: onMomentumEndJS,
    onScrollOffsetChange: handleScrollOffsetChange,
    primaryScrollOffset,
    primaryScrollTopOffset,
    scrollOffset: resolvedRuntimeModel.presentationState.scrollOffset,
    scrollTopOffset,
  });
  const secondaryAnimatedScrollHandler = useBottomSheetSecondaryScrollHandlerRuntime({
    activePrimaryList,
    momentumFlag: sheetMomentumFlag,
    onMomentumBegin: onMomentumBeginJS,
    onMomentumEnd: onMomentumEndJS,
    onScrollOffsetChange: handleScrollOffsetChange,
    secondaryScrollOffset,
    secondaryScrollTopOffset,
    scrollOffset: resolvedRuntimeModel.presentationState.scrollOffset,
    scrollTopOffset,
  });
  const sheetContent = contentProps ? (
    <BottomSheetContentSurface
      contentComponent={contentProps.contentComponent}
      shouldEnableScroll={shouldEnableScroll}
      surfaceStyle={flashListSurfaceStyle}
      contentContainerStyle={listContentContainerStyle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      primaryAnimatedScrollHandler={primaryAnimatedScrollHandler}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={handleContentScrollEndDrag}
      onMomentumBeginJS={onMomentumBeginJS}
      onMomentumEndJS={onMomentumEndJS}
      showsVerticalScrollIndicator={effectiveShowsVerticalScrollIndicator}
      keyboardDismissMode={keyboardDismissMode}
      bounces={bounces}
      alwaysBounceVertical={alwaysBounceVertical}
      overScrollMode={overScrollMode}
      testID={testID}
      scrollIndicatorInsets={scrollIndicatorInsets}
    />
  ) : listProps ? (
    <BottomSheetFlashListSurface
      listProps={listProps}
      flashListRef={flashListRef}
      secondaryFlashListRef={secondaryFlashListRef}
      shouldEnableScroll={shouldEnableScroll}
      shouldRenderDualLists={shouldRenderDualLists}
      resolvedActiveList={resolvedActiveList}
      flashListSurfaceStyle={flashListSurfaceStyle}
      contentContainerStyle={listContentContainerStyle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      primaryAnimatedScrollHandler={primaryAnimatedScrollHandler}
      secondaryAnimatedScrollHandler={secondaryAnimatedScrollHandler}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      effectiveShowsVerticalScrollIndicator={effectiveShowsVerticalScrollIndicator}
      keyboardDismissMode={keyboardDismissMode}
      bounces={bounces}
      alwaysBounceVertical={alwaysBounceVertical}
      overScrollMode={overScrollMode}
      testID={testID}
      scrollIndicatorInsets={scrollIndicatorInsets}
      flashListProps={resolvedFlashListProps}
      extraData={listProps.extraData}
    />
  ) : null;

  const resolvedNavBarHeight = Math.max(navBarHeight, 0);
  const sheetClipAnimatedStyle = useAnimatedStyle(() => {
    if (!applyNavBarCutout) {
      return { bottom: 0 };
    }
    const progress = navBarCutoutProgress
      ? Math.max(0, Math.min(1, navBarCutoutProgress.value))
      : 1;
    const navTranslateY = Math.max(0, (1 - progress) * Math.max(0, navBarHiddenTranslateY));
    const hideLead = navBarCutoutIsHiding ? 1.18 : 1;
    const cutout = Math.max(
      0,
      Math.min(resolvedNavBarHeight, resolvedNavBarHeight - navTranslateY * hideLead)
    );
    return { bottom: cutout };
  }, [
    applyNavBarCutout,
    navBarCutoutIsHiding,
    navBarCutoutProgress,
    navBarHiddenTranslateY,
    resolvedNavBarHeight,
  ]);

  useOverlayHeaderActionController({
    visible: visible && Boolean(spec),
    mode: headerActionMode,
    sheetY,
    collapseRange: {
      start: spec?.snapPoints.middle ?? 0,
      end: spec?.snapPoints.collapsed ?? 1,
    },
    progress: headerActionProgress,
  });

  const onHeaderLayout = React.useCallback((_event: unknown) => {}, []);

  const renderedSheet = (
    <Reanimated.View pointerEvents="box-none" style={[styles.sheetClip, sheetClipAnimatedStyle]}>
      {spec.underlayComponent ?? null}
      <BottomSheetHostShell
        hostProps={hostProps}
        backgroundComponent={backgroundComponent}
        headerComponent={headerComponent}
        overlayComponent={overlayComponent}
        onHeaderLayout={onHeaderLayout}
        surfaceStyle={surfaceStyle}
        shadowStyle={shadowStyle}
        contentSurfaceStyle={contentSurfaceStyle}
        content={sheetContent}
      />
    </Reanimated.View>
  );

  return spec.renderWrapper ? <>{spec.renderWrapper(renderedSheet)}</> : renderedSheet;
};

const styles = StyleSheet.create({
  sheetClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: OVERLAY_STACK_ZINDEX,
  },
});

export default OverlaySheetShell;
