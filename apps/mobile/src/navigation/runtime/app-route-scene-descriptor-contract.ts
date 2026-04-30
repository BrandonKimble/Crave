import type React from 'react';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';

import type { BottomSheetWithFlashListBaseProps } from '../../overlays/bottomSheetWithFlashListContract';
import type { OverlaySheetFrameSpec } from '../../overlays/types';

type AppRouteSceneListItem = unknown;

export type AppRouteSceneStackShellSpec = OverlaySheetFrameSpec & {
  surfaceKind: 'scene-stack';
};

export type AppRouteSceneSecondaryListContentPublication = {
  data: ReadonlyArray<AppRouteSceneListItem>;
  renderItem?: FlashListProps<AppRouteSceneListItem>['renderItem'];
  keyExtractor?: FlashListProps<AppRouteSceneListItem>['keyExtractor'];
  estimatedItemSize?: number;
  extraData?: FlashListProps<AppRouteSceneListItem>['extraData'];
  ListHeaderComponent?: FlashListProps<AppRouteSceneListItem>['ListHeaderComponent'];
  ListFooterComponent?: FlashListProps<AppRouteSceneListItem>['ListFooterComponent'];
  ListEmptyComponent?: FlashListProps<AppRouteSceneListItem>['ListEmptyComponent'];
  ItemSeparatorComponent?: FlashListProps<AppRouteSceneListItem>['ItemSeparatorComponent'];
  onEndReached?: FlashListProps<AppRouteSceneListItem>['onEndReached'];
  listKey?: string;
};

export type AppRouteSceneSecondaryListTransportPublication = {
  listRef?: React.RefObject<FlashListRef<AppRouteSceneListItem> | null>;
  scrollIndicatorInsets?: ScrollViewProps['scrollIndicatorInsets'];
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  flashListProps?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['flashListProps'];
  testID?: string;
};

export type AppRouteMountedSceneBodyKey = 'bookmarks' | 'polls' | 'profile' | 'saveList' | 'search';

export type AppRouteMountedSceneChromeKey =
  | 'bookmarks'
  | 'polls'
  | 'profile'
  | 'saveList'
  | 'search';

export type AppRouteMountedSceneChromeSurface =
  | 'underlay'
  | 'background'
  | 'header'
  | 'overlay';

export type AppRouteInlineSceneChromePublication = {
  surfaceKind?: 'inline';
  underlayComponent: React.ReactNode | null;
  backgroundComponent: React.ReactNode | null;
  headerComponent: React.ReactNode | null;
  overlayComponent: React.ReactNode | null;
};

export type AppRouteMountedSceneChromePublication = {
  surfaceKind: 'mounted';
  mountedChromeKey: AppRouteMountedSceneChromeKey;
  excludedSurfaces?: readonly AppRouteMountedSceneChromeSurface[];
};

export type AppRouteSceneChromePublication =
  | AppRouteInlineSceneChromePublication
  | AppRouteMountedSceneChromePublication;

export type AppRouteSceneBodyAdmissionPolicy = {
  retainListBodyDuringTransition?: boolean;
  retainMountedBodyDuringTransition?: boolean;
  prewarmRetainedMountedBody?: boolean;
  delayFirstDataAdmission?: boolean;
  delayDataAdmissionOnActivation?: boolean;
  dataAdmissionDelayMs?: number;
  keepDataSubscribedAfterActivation?: boolean;
};

const isInlineAppRouteSceneChromePublication = (
  publication: AppRouteSceneChromePublication
): publication is AppRouteInlineSceneChromePublication =>
  (publication.surfaceKind ?? 'inline') === 'inline';

const areAppRouteMountedSceneChromeSurfacesEqual = (
  left: readonly AppRouteMountedSceneChromeSurface[] | null | undefined,
  right: readonly AppRouteMountedSceneChromeSurface[] | null | undefined
): boolean => {
  if (left === right) {
    return true;
  }
  if ((left?.length ?? 0) !== (right?.length ?? 0)) {
    return false;
  }
  if (!left || !right) {
    return true;
  }
  return left.every((surface, index) => surface === right[index]);
};

export type AppRouteSceneBodyContentSpec =
  | {
      surfaceKind: 'content';
      contentComponent: React.ReactNode;
      contentScrollMode: 'scroll' | 'static';
    }
  | {
      surfaceKind: 'mounted';
      mountedBodyKey: AppRouteMountedSceneBodyKey;
      contentScrollMode?: 'scroll' | 'static';
    }
  | {
      surfaceKind: 'mountedList';
      mountedBodyKey: AppRouteMountedSceneBodyKey;
    }
  | {
      surfaceKind: 'list';
      data: ReadonlyArray<AppRouteSceneListItem>;
      renderItem: FlashListProps<AppRouteSceneListItem>['renderItem'];
      keyExtractor?: FlashListProps<AppRouteSceneListItem>['keyExtractor'];
      estimatedItemSize: number;
      ListHeaderComponent?: FlashListProps<AppRouteSceneListItem>['ListHeaderComponent'];
      ListFooterComponent?: FlashListProps<AppRouteSceneListItem>['ListFooterComponent'];
      ListEmptyComponent?: FlashListProps<AppRouteSceneListItem>['ListEmptyComponent'];
      ItemSeparatorComponent?: FlashListProps<AppRouteSceneListItem>['ItemSeparatorComponent'];
      extraData?: FlashListProps<AppRouteSceneListItem>['extraData'];
      secondaryList?: AppRouteSceneSecondaryListContentPublication | null;
      listKey?: string;
      onEndReached?: FlashListProps<AppRouteSceneListItem>['onEndReached'];
      onEndReachedThreshold?: FlashListProps<AppRouteSceneListItem>['onEndReachedThreshold'];
    };

export type AppRouteSceneBodyTransportSpec = {
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  scrollIndicatorInsets?: ScrollViewProps['scrollIndicatorInsets'];
  onScrollOffsetChange?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onScrollOffsetChange'];
  onScrollBeginDrag?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onScrollBeginDrag'];
  onScrollEndDrag?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onScrollEndDrag'];
  onMomentumBeginJS?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onMomentumBeginJS'];
  onMomentumEndJS?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onMomentumEndJS'];
  showsVerticalScrollIndicator?: boolean;
  keyboardDismissMode?: ScrollViewProps['keyboardDismissMode'];
  bounces?: ScrollViewProps['bounces'];
  alwaysBounceVertical?: ScrollViewProps['alwaysBounceVertical'];
  overScrollMode?: ScrollViewProps['overScrollMode'];
  testID?: string;
  activeList?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['activeList'];
  flashListProps?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['flashListProps'];
  contentSurfaceStyle?: StyleProp<ViewStyle>;
  listRef?: React.RefObject<FlashListRef<AppRouteSceneListItem> | null>;
  secondaryList?: AppRouteSceneSecondaryListTransportPublication | null;
};

export const areAppRouteSceneShellSpecsEqual = (
  previousSpec: AppRouteSceneStackShellSpec | null | undefined,
  nextSpec: AppRouteSceneStackShellSpec | null | undefined
): boolean => {
  if (previousSpec === nextSpec) {
    return true;
  }
  if (!previousSpec || !nextSpec) {
    return false;
  }

  return (
    previousSpec.overlayKey === nextSpec.overlayKey &&
    previousSpec.semanticOverlayKey === nextSpec.semanticOverlayKey &&
    previousSpec.shellIdentityKey === nextSpec.shellIdentityKey &&
    previousSpec.sceneIdentityKey === nextSpec.sceneIdentityKey &&
    previousSpec.snapPersistenceKey === nextSpec.snapPersistenceKey &&
    previousSpec.renderWrapper === nextSpec.renderWrapper &&
    previousSpec.nativeHostKey === nextSpec.nativeHostKey &&
    previousSpec.listScrollEnabled === nextSpec.listScrollEnabled &&
    previousSpec.initialSnapPoint === nextSpec.initialSnapPoint &&
    previousSpec.preservePositionOnSnapPointsChange ===
      nextSpec.preservePositionOnSnapPointsChange &&
    previousSpec.onHidden === nextSpec.onHidden &&
    previousSpec.onSnapStart === nextSpec.onSnapStart &&
    previousSpec.onSnapChange === nextSpec.onSnapChange &&
    previousSpec.onDragStateChange === nextSpec.onDragStateChange &&
    previousSpec.onSettleStateChange === nextSpec.onSettleStateChange &&
    previousSpec.runtimeModel === nextSpec.runtimeModel &&
    previousSpec.dismissThreshold === nextSpec.dismissThreshold &&
    previousSpec.preventSwipeDismiss === nextSpec.preventSwipeDismiss &&
    previousSpec.interactionEnabled === nextSpec.interactionEnabled &&
    previousSpec.animateOnMount === nextSpec.animateOnMount &&
    previousSpec.style === nextSpec.style &&
    previousSpec.surfaceStyle === nextSpec.surfaceStyle &&
    previousSpec.shadowStyle === nextSpec.shadowStyle &&
    previousSpec.surfaceKind === nextSpec.surfaceKind &&
    previousSpec.snapPoints.expanded === nextSpec.snapPoints.expanded &&
    previousSpec.snapPoints.middle === nextSpec.snapPoints.middle &&
    previousSpec.snapPoints.collapsed === nextSpec.snapPoints.collapsed &&
    previousSpec.snapPoints.hidden === nextSpec.snapPoints.hidden
  );
};

const areAppRouteSceneSecondaryListContentPublicationsEqual = (
  left: AppRouteSceneSecondaryListContentPublication | null | undefined,
  right: AppRouteSceneSecondaryListContentPublication | null | undefined
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.data === right.data &&
    left.renderItem === right.renderItem &&
    left.keyExtractor === right.keyExtractor &&
    left.estimatedItemSize === right.estimatedItemSize &&
    left.extraData === right.extraData &&
    left.ListHeaderComponent === right.ListHeaderComponent &&
    left.ListFooterComponent === right.ListFooterComponent &&
    left.ListEmptyComponent === right.ListEmptyComponent &&
    left.ItemSeparatorComponent === right.ItemSeparatorComponent &&
    left.onEndReached === right.onEndReached &&
    left.listKey === right.listKey);

const areAppRouteSceneSecondaryListTransportPublicationsEqual = (
  left: AppRouteSceneSecondaryListTransportPublication | null | undefined,
  right: AppRouteSceneSecondaryListTransportPublication | null | undefined
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.listRef === right.listRef &&
    left.scrollIndicatorInsets === right.scrollIndicatorInsets &&
    left.contentContainerStyle === right.contentContainerStyle &&
    left.flashListProps === right.flashListProps &&
    left.testID === right.testID);

export const areAppRouteSceneChromePublicationsEqual = (
  left: AppRouteSceneChromePublication | null | undefined,
  right: AppRouteSceneChromePublication | null | undefined
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.surfaceKind === 'mounted' &&
    right.surfaceKind === 'mounted' &&
    left.mountedChromeKey === right.mountedChromeKey &&
    areAppRouteMountedSceneChromeSurfacesEqual(
      left.excludedSurfaces,
      right.excludedSurfaces
    )) ||
  (left != null &&
    right != null &&
    isInlineAppRouteSceneChromePublication(left) &&
    isInlineAppRouteSceneChromePublication(right) &&
    left.underlayComponent === right.underlayComponent &&
    left.backgroundComponent === right.backgroundComponent &&
    left.headerComponent === right.headerComponent &&
    left.overlayComponent === right.overlayComponent);

export const areAppRouteSceneBodyAdmissionPoliciesEqual = (
  left: AppRouteSceneBodyAdmissionPolicy | null | undefined,
  right: AppRouteSceneBodyAdmissionPolicy | null | undefined
): boolean =>
  left === right ||
  ((left?.retainListBodyDuringTransition ?? false) ===
    (right?.retainListBodyDuringTransition ?? false) &&
    (left?.retainMountedBodyDuringTransition ?? false) ===
      (right?.retainMountedBodyDuringTransition ?? false) &&
    (left?.prewarmRetainedMountedBody ?? false) ===
      (right?.prewarmRetainedMountedBody ?? false) &&
    (left?.delayFirstDataAdmission ?? false) === (right?.delayFirstDataAdmission ?? false) &&
    (left?.delayDataAdmissionOnActivation ?? false) ===
      (right?.delayDataAdmissionOnActivation ?? false) &&
    (left?.dataAdmissionDelayMs ?? 0) === (right?.dataAdmissionDelayMs ?? 0) &&
    (left?.keepDataSubscribedAfterActivation ?? false) ===
      (right?.keepDataSubscribedAfterActivation ?? false));

export const areAppRouteSceneBodyContentSpecsEqual = (
  left: AppRouteSceneBodyContentSpec | null | undefined,
  right: AppRouteSceneBodyContentSpec | null | undefined
): boolean => {
  if (left === right) {
    return true;
  }
  if (left == null || right == null || left.surfaceKind !== right.surfaceKind) {
    return false;
  }
  if (left.surfaceKind === 'content' && right.surfaceKind === 'content') {
    return (
      left.contentComponent === right.contentComponent &&
      left.contentScrollMode === right.contentScrollMode
    );
  }
  if (left.surfaceKind === 'mounted' && right.surfaceKind === 'mounted') {
    return (
      left.mountedBodyKey === right.mountedBodyKey &&
      (left.contentScrollMode ?? 'scroll') === (right.contentScrollMode ?? 'scroll')
    );
  }
  if (left.surfaceKind === 'mountedList' && right.surfaceKind === 'mountedList') {
    return left.mountedBodyKey === right.mountedBodyKey;
  }
  if (left.surfaceKind === 'list' && right.surfaceKind === 'list') {
    return (
      left.data === right.data &&
      left.renderItem === right.renderItem &&
      left.keyExtractor === right.keyExtractor &&
      left.estimatedItemSize === right.estimatedItemSize &&
      left.ListHeaderComponent === right.ListHeaderComponent &&
      left.ListFooterComponent === right.ListFooterComponent &&
      left.ListEmptyComponent === right.ListEmptyComponent &&
      left.ItemSeparatorComponent === right.ItemSeparatorComponent &&
      left.extraData === right.extraData &&
      areAppRouteSceneSecondaryListContentPublicationsEqual(
        left.secondaryList,
        right.secondaryList
      ) &&
      left.listKey === right.listKey &&
      left.onEndReached === right.onEndReached &&
      left.onEndReachedThreshold === right.onEndReachedThreshold
    );
  }

  return false;
};

export const areAppRouteSceneBodyTransportSpecsEqual = (
  left: AppRouteSceneBodyTransportSpec | null | undefined,
  right: AppRouteSceneBodyTransportSpec | null | undefined
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.contentContainerStyle === right.contentContainerStyle &&
    left.keyboardShouldPersistTaps === right.keyboardShouldPersistTaps &&
    left.scrollIndicatorInsets === right.scrollIndicatorInsets &&
    left.onScrollOffsetChange === right.onScrollOffsetChange &&
    left.onScrollBeginDrag === right.onScrollBeginDrag &&
    left.onScrollEndDrag === right.onScrollEndDrag &&
    left.onMomentumBeginJS === right.onMomentumBeginJS &&
    left.onMomentumEndJS === right.onMomentumEndJS &&
    left.showsVerticalScrollIndicator === right.showsVerticalScrollIndicator &&
    left.keyboardDismissMode === right.keyboardDismissMode &&
    left.bounces === right.bounces &&
    left.alwaysBounceVertical === right.alwaysBounceVertical &&
    left.overScrollMode === right.overScrollMode &&
    left.testID === right.testID &&
    left.activeList === right.activeList &&
    left.flashListProps === right.flashListProps &&
    left.contentSurfaceStyle === right.contentSurfaceStyle &&
    left.listRef === right.listRef &&
    areAppRouteSceneSecondaryListTransportPublicationsEqual(
      left.secondaryList,
      right.secondaryList
    ));
