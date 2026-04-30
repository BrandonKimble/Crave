import type React from 'react';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import type {
  BottomSheetWithFlashListBaseProps,
  DualListSelection,
} from './bottomSheetWithFlashListContract';
import type { OverlayKey, OverlaySheetFrameSpec } from './types';
import type { SearchInteractionSnapshot } from '../screens/Search/context/SearchInteractionContext';

export type { SearchRouteHostVisualState } from './searchRouteHostVisualState';

export type SearchRoutePanelInteractionRef = React.MutableRefObject<SearchInteractionSnapshot>;
export type SearchRouteSceneShellSpec = OverlaySheetFrameSpec;
export type SearchRouteSceneStackShellSpec = SearchRouteSceneShellSpec & {
  surfaceKind: 'scene-stack';
};

export type SearchRouteSceneSecondaryListContentPublication = {
  data: ReadonlyArray<any>;
  renderItem?: FlashListProps<any>['renderItem'];
  keyExtractor?: FlashListProps<any>['keyExtractor'];
  estimatedItemSize?: number;
  extraData?: FlashListProps<any>['extraData'];
  ListHeaderComponent?: FlashListProps<any>['ListHeaderComponent'];
  ListFooterComponent?: FlashListProps<any>['ListFooterComponent'];
  ListEmptyComponent?: FlashListProps<any>['ListEmptyComponent'];
  ItemSeparatorComponent?: FlashListProps<any>['ItemSeparatorComponent'];
  onEndReached?: FlashListProps<any>['onEndReached'];
  listKey?: string;
};

export type SearchRouteSceneSecondaryListTransportPublication = {
  listRef?: React.RefObject<FlashListRef<any> | null>;
  scrollIndicatorInsets?: ScrollViewProps['scrollIndicatorInsets'];
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  flashListProps?: BottomSheetWithFlashListBaseProps<any>['flashListProps'];
  testID?: string;
};

export type SearchRouteMountedSceneBodyKey =
  | 'bookmarks'
  | 'polls'
  | 'profile'
  | 'saveList'
  | 'search';

export type SearchRouteMountedSceneChromeKey =
  | 'bookmarks'
  | 'polls'
  | 'profile'
  | 'saveList'
  | 'search';

export type SearchRouteMountedSceneChromeSurface =
  | 'underlay'
  | 'background'
  | 'header'
  | 'overlay';

export type SearchRouteInlineSceneChromePublication = {
  surfaceKind?: 'inline';
  underlayComponent: React.ReactNode | null;
  backgroundComponent: React.ReactNode | null;
  headerComponent: React.ReactNode | null;
  overlayComponent: React.ReactNode | null;
};

export type SearchRouteMountedSceneChromePublication = {
  surfaceKind: 'mounted';
  mountedChromeKey: SearchRouteMountedSceneChromeKey;
  excludedSurfaces?: readonly SearchRouteMountedSceneChromeSurface[];
};

export type SearchRouteSceneChromePublication =
  | SearchRouteInlineSceneChromePublication
  | SearchRouteMountedSceneChromePublication;

const isInlineSearchRouteSceneChromePublication = (
  publication: SearchRouteSceneChromePublication
): publication is SearchRouteInlineSceneChromePublication =>
  (publication.surfaceKind ?? 'inline') === 'inline';

export type SearchRouteSceneBodyContentSpec =
  | {
      surfaceKind: 'content';
      contentComponent: React.ReactNode;
      contentScrollMode: 'scroll' | 'static';
    }
  | {
      surfaceKind: 'mounted';
      mountedBodyKey: SearchRouteMountedSceneBodyKey;
      contentScrollMode?: 'scroll' | 'static';
    }
  | {
      surfaceKind: 'mountedList';
      mountedBodyKey: SearchRouteMountedSceneBodyKey;
    }
  | {
      surfaceKind: 'list';
      data: ReadonlyArray<any>;
      renderItem: FlashListProps<any>['renderItem'];
      keyExtractor?: FlashListProps<any>['keyExtractor'];
      estimatedItemSize: number;
      ListHeaderComponent?: FlashListProps<any>['ListHeaderComponent'];
      ListFooterComponent?: FlashListProps<any>['ListFooterComponent'];
      ListEmptyComponent?: FlashListProps<any>['ListEmptyComponent'];
      ItemSeparatorComponent?: FlashListProps<any>['ItemSeparatorComponent'];
      extraData?: FlashListProps<any>['extraData'];
      secondaryList?: SearchRouteSceneSecondaryListContentPublication | null;
      listKey?: string;
      onEndReached?: FlashListProps<any>['onEndReached'];
      onEndReachedThreshold?: FlashListProps<any>['onEndReachedThreshold'];
    };

export type SearchRouteSceneBodyTransportSpec = {
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  scrollIndicatorInsets?: ScrollViewProps['scrollIndicatorInsets'];
  onScrollOffsetChange?: BottomSheetWithFlashListBaseProps<any>['onScrollOffsetChange'];
  onScrollBeginDrag?: BottomSheetWithFlashListBaseProps<any>['onScrollBeginDrag'];
  onScrollEndDrag?: BottomSheetWithFlashListBaseProps<any>['onScrollEndDrag'];
  onMomentumBeginJS?: BottomSheetWithFlashListBaseProps<any>['onMomentumBeginJS'];
  onMomentumEndJS?: BottomSheetWithFlashListBaseProps<any>['onMomentumEndJS'];
  showsVerticalScrollIndicator?: boolean;
  keyboardDismissMode?: ScrollViewProps['keyboardDismissMode'];
  bounces?: ScrollViewProps['bounces'];
  alwaysBounceVertical?: ScrollViewProps['alwaysBounceVertical'];
  overScrollMode?: ScrollViewProps['overScrollMode'];
  testID?: string;
  activeList?: DualListSelection;
  flashListProps?: BottomSheetWithFlashListBaseProps<any>['flashListProps'];
  contentSurfaceStyle?: StyleProp<ViewStyle>;
  listRef?: React.RefObject<FlashListRef<any> | null>;
  secondaryList?: SearchRouteSceneSecondaryListTransportPublication | null;
};

export type SearchRoutePublishedSceneParts = {
  shellSpec: SearchRouteSceneStackShellSpec;
  sceneChrome: SearchRouteSceneChromePublication | null;
  sceneBodyContent: SearchRouteSceneBodyContentSpec | null;
  sceneBodyTransport: SearchRouteSceneBodyTransportSpec | null;
};
export type SearchRouteHostSelectionState = {
  rootOverlayKey: OverlayKey | null;
  activeOverlayRouteKey: OverlayKey | null;
  searchRouteOverlayKey: 'search' | 'polls' | null;
  overlaySheetKey: OverlayKey | null;
  activeSceneKey: OverlayKey | null;
  resolvedOverlaySheetVisible: boolean;
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  isPersistentPollLane: boolean;
  isSearchOverlay: boolean;
  showPollsOverlay: boolean;
  showBookmarksOverlay: boolean;
  showProfileOverlay: boolean;
  showSaveListOverlay: boolean;
};

const SEARCH_ROUTE_SHEET_SHELL_IDENTITY_KEY = 'search-route-sheet';

export const normalizeSearchRouteSceneStackShellSpec = (
  shellSpec: SearchRouteSceneShellSpec
): SearchRouteSceneStackShellSpec => ({
  ...shellSpec,
  shellIdentityKey: shellSpec.shellIdentityKey ?? SEARCH_ROUTE_SHEET_SHELL_IDENTITY_KEY,
  sceneIdentityKey: shellSpec.sceneIdentityKey ?? shellSpec.overlayKey,
  surfaceKind: 'scene-stack',
});

export const areSearchRouteSceneShellSpecsEqual = (
  previousSpec: SearchRouteSceneStackShellSpec | null | undefined,
  nextSpec: SearchRouteSceneStackShellSpec | null | undefined
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

const areSearchRouteSceneSecondaryListContentPublicationsEqual = (
  left: SearchRouteSceneSecondaryListContentPublication | null | undefined,
  right: SearchRouteSceneSecondaryListContentPublication | null | undefined
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

const areSearchRouteSceneSecondaryListTransportPublicationsEqual = (
  left: SearchRouteSceneSecondaryListTransportPublication | null | undefined,
  right: SearchRouteSceneSecondaryListTransportPublication | null | undefined
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.listRef === right.listRef &&
    left.scrollIndicatorInsets === right.scrollIndicatorInsets &&
    left.contentContainerStyle === right.contentContainerStyle &&
    left.flashListProps === right.flashListProps &&
    left.testID === right.testID);

const areSearchRouteMountedSceneChromeSurfacesEqual = (
  left: readonly SearchRouteMountedSceneChromeSurface[] | null | undefined,
  right: readonly SearchRouteMountedSceneChromeSurface[] | null | undefined
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

export const areSearchRouteSceneChromePublicationsEqual = (
  left: SearchRouteSceneChromePublication | null | undefined,
  right: SearchRouteSceneChromePublication | null | undefined
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.surfaceKind === 'mounted' &&
    right.surfaceKind === 'mounted' &&
    left.mountedChromeKey === right.mountedChromeKey &&
    areSearchRouteMountedSceneChromeSurfacesEqual(
      left.excludedSurfaces,
      right.excludedSurfaces
    )) ||
  (left != null &&
    right != null &&
    isInlineSearchRouteSceneChromePublication(left) &&
    isInlineSearchRouteSceneChromePublication(right) &&
    left.underlayComponent === right.underlayComponent &&
    left.backgroundComponent === right.backgroundComponent &&
    left.headerComponent === right.headerComponent &&
    left.overlayComponent === right.overlayComponent);

export const areSearchRouteSceneBodyContentSpecsEqual = (
  left: SearchRouteSceneBodyContentSpec | null | undefined,
  right: SearchRouteSceneBodyContentSpec | null | undefined
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
      areSearchRouteSceneSecondaryListContentPublicationsEqual(
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

export const areSearchRouteSceneBodyTransportSpecsEqual = (
  left: SearchRouteSceneBodyTransportSpec | null | undefined,
  right: SearchRouteSceneBodyTransportSpec | null | undefined
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
    areSearchRouteSceneSecondaryListTransportPublicationsEqual(
      left.secondaryList,
      right.secondaryList
    ));

export const areSearchRoutePublishedScenePartsEqual = (
  left: SearchRoutePublishedSceneParts | null,
  right: SearchRoutePublishedSceneParts | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    areSearchRouteSceneShellSpecsEqual(left.shellSpec, right.shellSpec) &&
    areSearchRouteSceneChromePublicationsEqual(left.sceneChrome, right.sceneChrome) &&
    areSearchRouteSceneBodyContentSpecsEqual(left.sceneBodyContent, right.sceneBodyContent) &&
    areSearchRouteSceneBodyTransportSpecsEqual(left.sceneBodyTransport, right.sceneBodyTransport));

export const EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF: SearchRoutePanelInteractionRef | null = null;
export const EMPTY_SEARCH_ROUTE_HOST_SELECTION_STATE: SearchRouteHostSelectionState = {
  rootOverlayKey: null,
  activeOverlayRouteKey: null,
  searchRouteOverlayKey: null,
  overlaySheetKey: null,
  activeSceneKey: null,
  resolvedOverlaySheetVisible: false,
  overlaySheetVisible: false,
  overlaySheetApplyNavBarCutout: false,
  isPersistentPollLane: false,
  isSearchOverlay: false,
  showPollsOverlay: false,
  showBookmarksOverlay: false,
  showProfileOverlay: false,
  showSaveListOverlay: false,
};

export type SearchRouteOverlayRenderPolicy = {
  shouldShowSearchPanel: boolean;
  shouldShowDockedPollsPanel: boolean;
  shouldSuppressSearchAndTabSheetsForForegroundEditing: boolean;
  shouldSuppressTabSheetsForSuggestions: boolean;
};

export const EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY: SearchRouteOverlayRenderPolicy = {
  shouldShowSearchPanel: false,
  shouldShowDockedPollsPanel: false,
  shouldSuppressSearchAndTabSheetsForForegroundEditing: false,
  shouldSuppressTabSheetsForSuggestions: false,
};
