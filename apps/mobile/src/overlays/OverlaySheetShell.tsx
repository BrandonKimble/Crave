import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';

import Reanimated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated';

import BottomSheetWithFlashList from './BottomSheetWithFlashList';
import type { BottomSheetWithFlashListProps as BottomSheetComponentProps } from './BottomSheetWithFlashList';
import { useBottomSheetHostCommandRuntime } from './useBottomSheetHostCommandRuntime';
import { OVERLAY_STACK_ZINDEX, overlaySheetStyles } from './overlaySheetStyles';
import type { OverlayResolvedSpec, OverlaySheetSnap, OverlaySheetSnapRequest } from './types';
import { isOverlayListContentSpec } from './types';
import type {
  BottomSheetProgrammaticRuntimeModel,
  BottomSheetRuntimeModel,
} from './useBottomSheetRuntime';
import { useBottomSheetRuntimeModel } from './useBottomSheetRuntime';
import {
  useOverlayHeaderActionController,
  type OverlayHeaderActionMode,
} from './useOverlayHeaderActionController';
import { useOverlayStore } from '../store/overlayStore';
import { logger } from '../utils';
import { useOverlaySheetDefaultSnapRuntime } from './useOverlaySheetDefaultSnapRuntime';
import { useOverlaySheetListRuntime } from './useOverlaySheetListRuntime';
import { useOverlaySheetResolvedSnapRuntime } from './useOverlaySheetResolvedSnapRuntime';
import { useOverlaySheetSnapRequestRuntime } from './useOverlaySheetSnapRequestRuntime';
import {
  getSearchRouteMountedSceneShellSnapRequest,
  useSearchRouteMountedSceneRegistryStore,
} from './searchRouteMountedSceneRegistryStore';
import { SEARCH_CHROME_FADE_ZONE_PX } from '../screens/Search/constants/search';

type OverlaySheetShellProps = {
  visible: boolean;
  spec: OverlayResolvedSpec<unknown> | null;
  shellSnapRequest?: OverlaySheetSnapRequest | null;
  sheetY?: SharedValue<number>;
  scrollOffset?: SharedValue<number>;
  momentumFlag?: SharedValue<boolean>;
  chromeTransitionProgress?: SharedValue<number>;
  backdropDimProgress?: SharedValue<number>;
  headerActionProgress?: SharedValue<number>;
  headerActionMode?: OverlayHeaderActionMode;
  navBarHeight?: number;
  applyNavBarCutout?: boolean;
  navBarCutoutProgress?: SharedValue<number>;
  navBarHiddenTranslateY?: number;
  navBarCutoutIsHiding?: boolean;
  runtimeModel?: BottomSheetRuntimeModel | BottomSheetProgrammaticRuntimeModel;
};

const OverlaySheetShell: React.FC<OverlaySheetShellProps> = ({
  visible,
  spec,
  shellSnapRequest = null,
  sheetY,
  scrollOffset,
  momentumFlag,
  chromeTransitionProgress,
  backdropDimProgress,
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
  const resolvedSpec = spec;
  const activeSemanticOverlayKey =
    resolvedSpec?.semanticOverlayKey ?? resolvedSpec?.overlayKey ?? activeOverlayRouteKey;
  const activeSceneIdentityKey =
    resolvedSpec?.sceneIdentityKey ??
    resolvedSpec?.semanticOverlayKey ??
    resolvedSpec?.overlayKey ??
    activeOverlayRouteKey;
  const resolvedShellIdentityKey =
    resolvedSpec?.shellIdentityKey ?? resolvedSpec?.overlayKey ?? activeOverlayRouteKey;
  const presentationStateOverride =
    sheetY && scrollOffset && momentumFlag
      ? {
          sheetY,
          scrollOffset,
          momentumFlag,
        }
      : undefined;
  const initialSheetY = React.useMemo(() => {
    if (!resolvedSpec) {
      return 0;
    }

    const resolvedInitialSnapPoint = resolvedSpec.initialSnapPoint ?? 'middle';
    const hiddenOrCollapsed = resolvedSpec.snapPoints.hidden ?? resolvedSpec.snapPoints.collapsed;

    if (!visible) {
      return hiddenOrCollapsed;
    }

    return resolvedSpec.snapPoints[resolvedInitialSnapPoint];
  }, [resolvedSpec, visible]);

  const shellSheetRuntimeModel = useBottomSheetRuntimeModel({
    presentationStateOverride,
    initialSheetY,
  });
  const resolvedRuntimeModel = runtimeModel ?? resolvedSpec?.runtimeModel ?? shellSheetRuntimeModel;
  const { resolvedListRef, handleScrollOffsetChange } = useOverlaySheetListRuntime({
    visible,
    spec: resolvedSpec,
    sceneIdentityKey: activeSceneIdentityKey,
    scrollOffset: resolvedRuntimeModel.presentationState.scrollOffset,
  });
  const {
    persistedSnap,
    resolvedSnapPersistenceKey,
    ensurePersistedSnap,
    handleSnapChange: handleSnapChangeBase,
    handleSnapStart: handleSnapStartBase,
  } = useOverlaySheetResolvedSnapRuntime({
    spec: resolvedSpec,
    resolvedShellIdentityKey,
    activeOverlayKey: activeSemanticOverlayKey,
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
  const resolvedInteractionEnabled = resolvedSpec?.interactionEnabled ?? true;
  useOverlaySheetDefaultSnapRuntime({
    visible,
    spec: resolvedSpec,
    persistedSnap,
    resolvedSnapPersistenceKey,
    ensurePersistedSnap,
    screenHeight,
    sheetY: resolvedRuntimeModel.presentationState.sheetY,
    requestShellSnap,
    requestedShellSnapRef,
    currentSnapRef,
  });
  React.useEffect(() => {
    if (!resolvedSpec) {
      requestShellSnap(null);
      return;
    }

    if (resolvedSpec.surfaceKind !== 'scene-registry') {
      requestShellSnap(shellSnapRequest ?? resolvedSpec.shellSnapRequest ?? null);
      return;
    }

    const activeSceneKey = resolvedSpec.activeSceneKey;
    let previousRequest =
      getSearchRouteMountedSceneShellSnapRequest(activeSceneKey as never) ?? null;
    requestShellSnap(previousRequest);

    const unsubscribe = useSearchRouteMountedSceneRegistryStore.subscribe((state) => {
      const nextRequest = state.sceneRegistry[activeSceneKey as never]?.shellSnapRequest ?? null;
      const requestChanged =
        previousRequest?.snap !== nextRequest?.snap ||
        (previousRequest?.token ?? null) !== (nextRequest?.token ?? null);

      if (!requestChanged) {
        return;
      }

      previousRequest = nextRequest;
      requestShellSnap(nextRequest);
    });

    return unsubscribe;
  }, [requestShellSnap, resolvedSpec, shellSnapRequest]);
  const onDragStateChangeHandler: ((isDragging: boolean) => void) | null =
    typeof resolvedSpec?.onDragStateChange === 'function' ? resolvedSpec.onDragStateChange : null;
  const onSettleStateChangeHandler: ((isSettling: boolean) => void) | null =
    typeof resolvedSpec?.onSettleStateChange === 'function'
      ? resolvedSpec.onSettleStateChange
      : null;

  const handleDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      onDragStateChangeHandler?.(isDragging);
    },
    [onDragStateChangeHandler]
  );
  const handleSettleStateChange = React.useCallback(
    (isSettling: boolean) => {
      onSettleStateChangeHandler?.(isSettling);
    },
    [onSettleStateChangeHandler]
  );

  const sheetCommand = useBottomSheetHostCommandRuntime({
    runtime: resolvedRuntimeModel,
  });
  const resolvedSheetProps =
    resolvedSpec && isOverlayListContentSpec(resolvedSpec)
      ? { ...resolvedSpec, listRef: resolvedListRef }
      : resolvedSpec;
  const shellDiagRef = React.useRef<string | null>(null);

  if (!resolvedSheetProps) {
    return null;
  }
  const activeShellSpec = resolvedSheetProps;

  const {
    snapPoints,
    shellSnapRequest: specShellSnapRequest,
    runtimeModel: specRuntimeModel,
    style: sheetStyle,
    initialSnapPoint = 'middle',
    ...sheetProps
  } = activeShellSpec;
  void specShellSnapRequest;
  void specRuntimeModel;
  const expandedSnapPoint = snapPoints.expanded;
  const middleSnapPoint = snapPoints.middle;
  const collapsedSnapPoint = snapPoints.collapsed;

  const handleProgrammaticSnapEvent =
    'handleProgrammaticSnapEvent' in resolvedRuntimeModel.snapController
      ? (
          resolvedRuntimeModel.snapController as BottomSheetProgrammaticRuntimeModel['snapController']
        ).handleProgrammaticSnapEvent
      : undefined;

  const handleSheetSnapStart = React.useCallback(
    (
      snap: OverlaySheetSnap,
      meta?: {
        source: 'gesture' | 'programmatic';
      }
    ) => {
      handleSnapStart(snap, meta);
    },
    [handleSnapStart]
  );

  const handleSheetSnapChange = React.useCallback(
    (
      snap: OverlaySheetSnap,
      meta?: {
        source: 'gesture' | 'programmatic';
      }
    ) => {
      handleProgrammaticSnapEvent?.(snap, meta?.source ?? 'gesture');
      handleSnapChange(snap, meta);
    },
    [handleProgrammaticSnapEvent, handleSnapChange]
  );
  const sharedBottomSheetProps = {
    visible,
    snapPoints,
    initialSnapPoint,
    preservePositionOnSnapPointsChange: true as const,
    sheetYValue: resolvedRuntimeModel.presentationState.sheetY,
    scrollOffsetValue: resolvedRuntimeModel.presentationState.scrollOffset,
    momentumFlag: resolvedRuntimeModel.presentationState.momentumFlag,
    snapTo: sheetCommand?.snapTo ?? null,
    snapToToken: sheetCommand?.token,
    onScrollOffsetChange: handleScrollOffsetChange,
    onSnapStart: handleSheetSnapStart,
    onSnapChange: handleSheetSnapChange,
    onDragStateChange: handleDragStateChange,
    onSettleStateChange: handleSettleStateChange,
    style: sheetStyle ?? overlaySheetStyles.container,
  };

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

  const resolvedCutoutBottom = React.useMemo(() => {
    if (!applyNavBarCutout) {
      return 0;
    }
    const progress = navBarCutoutProgress
      ? Math.max(0, Math.min(1, navBarCutoutProgress.value))
      : 1;
    const navTranslateY = Math.max(0, (1 - progress) * Math.max(0, navBarHiddenTranslateY));
    const hideLead = navBarCutoutIsHiding ? 1.18 : 1;
    return Math.max(
      0,
      Math.min(resolvedNavBarHeight, resolvedNavBarHeight - navTranslateY * hideLead)
    );
  }, [
    applyNavBarCutout,
    navBarCutoutIsHiding,
    navBarCutoutProgress,
    navBarHiddenTranslateY,
    resolvedNavBarHeight,
  ]);

  useOverlayHeaderActionController({
    visible,
    mode: headerActionMode,
    sheetY: resolvedRuntimeModel.presentationState.sheetY,
    collapseRange: {
      start: middleSnapPoint,
      end: collapsedSnapPoint,
    },
    progress: headerActionProgress,
  });

  useAnimatedReaction(
    () => {
      if ((!chromeTransitionProgress && !backdropDimProgress) || !visible) {
        return null;
      }
      const expandedY = expandedSnapPoint;
      const middleY = middleSnapPoint;
      const fadeEndY = Math.min(middleY, expandedY + SEARCH_CHROME_FADE_ZONE_PX);
      if (fadeEndY <= expandedY) {
        return {
          chrome: middleY <= expandedY ? 1 : 0,
          backdrop: middleY <= expandedY ? 0 : 1,
        };
      }
      const chrome = interpolate(
        resolvedRuntimeModel.presentationState.sheetY.value,
        [expandedY, fadeEndY],
        [0, 1],
        Extrapolation.CLAMP
      );
      return {
        chrome,
        backdrop: 1 - chrome,
      };
    },
    (next) => {
      if (next == null) {
        return;
      }
      if (chromeTransitionProgress) {
        chromeTransitionProgress.value = next.chrome;
      }
      if (backdropDimProgress) {
        backdropDimProgress.value = next.backdrop;
      }
    },
    [
      backdropDimProgress,
      chromeTransitionProgress,
      expandedSnapPoint,
      middleSnapPoint,
      resolvedRuntimeModel.presentationState.sheetY,
      visible,
    ]
  );

  React.useEffect(() => {
    const nextSnapshot = JSON.stringify({
      visible,
      resolvedOverlayKey: resolvedShellIdentityKey,
      sceneIdentityKey: activeSceneIdentityKey,
      specOverlayKey: activeShellSpec.overlayKey,
      semanticOverlayKey: activeShellSpec.semanticOverlayKey ?? null,
      initialSnapPoint,
      interactionEnabled: resolvedInteractionEnabled,
      applyNavBarCutout,
      navBarHeight: resolvedNavBarHeight,
      navBarHiddenTranslateY,
      navBarCutoutIsHiding,
      resolvedCutoutBottom,
      snapPoints: {
        expanded: snapPoints.expanded,
        middle: snapPoints.middle,
        collapsed: snapPoints.collapsed,
        hidden: snapPoints.hidden,
      },
    });

    if (shellDiagRef.current === nextSnapshot) {
      return;
    }

    shellDiagRef.current = nextSnapshot;
    logger.debug('[OVERLAY-SHEET-SHELL-DIAG] shellProps', JSON.parse(nextSnapshot));
  }, [
    applyNavBarCutout,
    initialSnapPoint,
    navBarCutoutIsHiding,
    navBarHiddenTranslateY,
    resolvedCutoutBottom,
    resolvedInteractionEnabled,
    resolvedNavBarHeight,
    resolvedShellIdentityKey,
    snapPoints.collapsed,
    snapPoints.expanded,
    snapPoints.hidden,
    snapPoints.middle,
    activeShellSpec.overlayKey,
    visible,
  ]);

  const bottomSheetElement = isOverlayListContentSpec(activeShellSpec) ? (
    <BottomSheetWithFlashList
      {...({
        ...(sheetProps as Record<string, unknown>),
        ...sharedBottomSheetProps,
        listRef: resolvedListRef,
      } as BottomSheetComponentProps<unknown>)}
    />
  ) : (
    <BottomSheetWithFlashList
      {...({
        ...(sheetProps as Record<string, unknown>),
        ...sharedBottomSheetProps,
      } as BottomSheetComponentProps<unknown>)}
    />
  );

  const renderedSheet = (
    <Reanimated.View pointerEvents="box-none" style={[styles.sheetClip, sheetClipAnimatedStyle]}>
      {activeShellSpec.underlayComponent ?? null}
      {bottomSheetElement}
    </Reanimated.View>
  );
  const renderWrapper: ((children: React.ReactNode) => React.ReactNode) | null =
    typeof activeShellSpec.renderWrapper === 'function' ? activeShellSpec.renderWrapper : null;

  return renderWrapper ? <>{renderWrapper(renderedSheet)}</> : renderedSheet;
};

const styles = StyleSheet.create({
  sheetClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: OVERLAY_STACK_ZINDEX,
  },
});

export default OverlaySheetShell;
