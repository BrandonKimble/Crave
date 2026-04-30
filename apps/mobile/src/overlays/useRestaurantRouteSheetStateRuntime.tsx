import React from 'react';

import type { OverlayContentSpec, OverlayKey } from './types';
import type {
  BottomSheetProgrammaticRuntimeModel,
  BottomSheetRuntimeModel,
} from './useBottomSheetRuntime';
import { useOverlaySheetListRuntime } from './useOverlaySheetListRuntime';
import type { RestaurantRouteLayerPresentationModel } from './restaurantRouteHostContract';
import { isOverlayListContentSpec } from './types';

export type RestaurantRouteSheetStateRuntime = {
  restaurantRouteSource: 'search' | 'global';
  activeShellSpec: OverlayContentSpec<unknown>;
  visible: boolean;
  activeSceneIdentityKey: string;
  resolvedShellIdentityKey: string;
  activeSemanticOverlayKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
  snapPoints: OverlayContentSpec<unknown>['snapPoints'];
  initialSnapPoint: Exclude<
    NonNullable<OverlayContentSpec<unknown>['initialSnapPoint']>,
    'hidden'
  >;
  sheetStyle: OverlayContentSpec<unknown>['style'];
  resolvedRuntimeModel: BottomSheetRuntimeModel | BottomSheetProgrammaticRuntimeModel;
  sheetY: BottomSheetRuntimeModel['presentationState']['sheetY'];
  scrollOffset: BottomSheetRuntimeModel['presentationState']['scrollOffset'];
  momentumFlag: BottomSheetRuntimeModel['presentationState']['momentumFlag'];
  handleScrollOffsetChange: (offsetY: number) => void;
  handleDragStateChange: (isDragging: boolean) => void;
  handleSettleStateChange: (isSettling: boolean) => void;
  expandedSnapPoint: number;
  middleSnapPoint: number;
  collapsedSnapPoint: number;
  resolvedInteractionEnabled: boolean;
};

export const useRestaurantRouteSheetStateRuntime = ({
  visible,
  spec,
  activeOverlayRouteKey,
  rootOverlayKey,
  overlayRouteStackLength,
  presentationState,
  snapController,
  restaurantRouteSource,
}: RestaurantRouteLayerPresentationModel): RestaurantRouteSheetStateRuntime | null => {
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
  const resolvedRuntimeModel = React.useMemo(
    () =>
      ({
        presentationState,
        snapController,
      }) satisfies BottomSheetRuntimeModel | BottomSheetProgrammaticRuntimeModel,
    [presentationState, snapController]
  );
  const { resolvedListRef, handleScrollOffsetChange } = useOverlaySheetListRuntime({
    visible,
    spec: resolvedSpec,
    sceneIdentityKey: activeSceneIdentityKey,
    scrollOffset: resolvedRuntimeModel.presentationState.scrollOffset,
  });

  const handleDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      resolvedSpec?.onDragStateChange?.(isDragging);
    },
    [resolvedSpec]
  );
  const handleSettleStateChange = React.useCallback(
    (isSettling: boolean) => {
      resolvedSpec?.onSettleStateChange?.(isSettling);
    },
    [resolvedSpec]
  );

  const activeShellSpec = React.useMemo(() => {
    if (!resolvedSpec) {
      return null;
    }

    if (!isOverlayListContentSpec(resolvedSpec)) {
      return resolvedSpec;
    }

    return {
      ...resolvedSpec,
      listRef: resolvedListRef,
    };
  }, [resolvedListRef, resolvedSpec]);

  if (!activeShellSpec) {
    return null;
  }

  const {
    snapPoints,
    runtimeModel: specRuntimeModel,
    shellSnapRequest: specShellSnapRequest,
    style: sheetStyle,
    initialSnapPoint = 'middle',
    renderWrapper: _renderWrapper,
  } = activeShellSpec;
  void specRuntimeModel;
  void specShellSnapRequest;
  void _renderWrapper;

  return React.useMemo(
    () => ({
      restaurantRouteSource,
      activeShellSpec,
      visible,
      activeSceneIdentityKey,
      resolvedShellIdentityKey,
      activeSemanticOverlayKey,
      rootOverlayKey,
      overlayRouteStackLength,
      snapPoints,
      initialSnapPoint,
      sheetStyle,
      resolvedRuntimeModel,
      sheetY: resolvedRuntimeModel.presentationState.sheetY,
      scrollOffset: resolvedRuntimeModel.presentationState.scrollOffset,
      momentumFlag: resolvedRuntimeModel.presentationState.momentumFlag,
      handleScrollOffsetChange,
      handleDragStateChange,
      handleSettleStateChange,
      expandedSnapPoint: snapPoints.expanded,
      middleSnapPoint: snapPoints.middle,
      collapsedSnapPoint: snapPoints.collapsed,
      resolvedInteractionEnabled: activeShellSpec.interactionEnabled ?? true,
    }),
    [
      activeSceneIdentityKey,
      activeSemanticOverlayKey,
      activeShellSpec,
      handleDragStateChange,
      handleScrollOffsetChange,
      handleSettleStateChange,
      initialSnapPoint,
      overlayRouteStackLength,
      restaurantRouteSource,
      resolvedRuntimeModel,
      resolvedRuntimeModel.presentationState.momentumFlag,
      resolvedRuntimeModel.presentationState.scrollOffset,
      resolvedRuntimeModel.presentationState.sheetY,
      resolvedShellIdentityKey,
      rootOverlayKey,
      sheetStyle,
      snapPoints,
      visible,
    ]
  );
};
