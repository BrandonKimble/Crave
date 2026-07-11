import type React from 'react';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import type {
  BottomSheetWithFlashListBaseProps,
  DualListSelection,
} from './bottomSheetWithFlashListContract';
import type { OverlayKey, OverlaySheetFrameSpec } from './types';
import type { SearchInteractionSnapshot } from '../screens/Search/context/SearchInteractionContext';
import type { SceneBodyContentInsets } from './bottomSheetSurfaceStyleUtils';

export type { SearchRouteHostVisualState } from './searchRouteHostVisualState';

export type SearchRoutePanelInteractionRef = React.MutableRefObject<SearchInteractionSnapshot>;
type SearchRouteSceneSheetHostOwnedField =
  | 'initialSnapPoint'
  | 'dismissThreshold'
  | 'onHidden'
  | 'onSnapStart'
  | 'onSnapChange'
  | 'preventSwipeDismiss'
  | 'runtimeModel'
  | 'shellSnapRequest';

export type SearchRouteSceneShellSpec = Omit<
  OverlaySheetFrameSpec,
  SearchRouteSceneSheetHostOwnedField
>;
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
  contentContainerStyle?: SceneBodyContentInsets;
  flashListProps?: BottomSheetWithFlashListBaseProps<any>['flashListProps'];
  testID?: string;
};

export type SearchRouteMountedSceneBodyKey =
  | 'bookmarks'
  | 'polls'
  | 'profile'
  | 'saveList'
  | 'search'
  | 'userProfile'
  | 'listDetail'
  | 'followList'
  | 'notifications'
  | 'settings'
  | 'editProfile'
  | 'postPhotos'
  | 'messagesInbox'
  | 'dmSession';

export type SearchRouteMountedSceneChromeKey =
  | 'bookmarks'
  | 'polls'
  | 'profile'
  | 'saveList'
  | 'userProfile'
  | 'listDetail'
  | 'followList'
  | 'notifications'
  | 'settings'
  | 'editProfile'
  | 'postPhotos'
  | 'messagesInbox'
  | 'dmSession';

export type SearchRouteMountedSceneChromeSurface = 'underlay' | 'background' | 'header' | 'overlay';

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

// Surface-kind guidance: use `'list'` for ANY scrollable body — it's the only
// kind with the sheet-drag → list-scroll handoff and working item taps. `'mounted'`
// / `'content'` are static-only (the sheet pan swallows taps on scrollable
// children). See AppRouteSceneBodyContentSpec in app-route-scene-descriptor-contract
// for the full rationale.
export type SearchRouteSceneBodyContentSpec =
  | {
      surfaceKind: 'content';
      contentComponent: React.ReactNode;
      contentScrollMode: 'scroll' | 'static';
    }
  | {
      /** Static body only — no scroll handoff; swallows taps on scrollable children. */
      surfaceKind: 'mounted';
      mountedBodyKey: SearchRouteMountedSceneBodyKey;
      contentScrollMode?: 'scroll' | 'static';
    }
  | {
      /** Scrollable bodies — gesture-coordinated FlashList with drag→scroll handoff + taps. */
      surfaceKind: 'list';
      data: ReadonlyArray<any>;
      renderItem: FlashListProps<any>['renderItem'];
      keyExtractor?: FlashListProps<any>['keyExtractor'];
      estimatedItemSize: number;
      ListChromeComponent?: React.ReactNode;
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
  contentContainerStyle?: SceneBodyContentInsets;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  scrollIndicatorInsets?: ScrollViewProps['scrollIndicatorInsets'];
  onScrollOffsetChange?: BottomSheetWithFlashListBaseProps<any>['onScrollOffsetChange'];
  onScrollBeginDrag?: BottomSheetWithFlashListBaseProps<any>['onScrollBeginDrag'];
  /** Fired from the list's live onScroll with the current offsetY. The gesture-handoff
   * scroll container never produces native drag events (the finger is on the sheet's
   * GestureDetector; scrolling is worklet-driven), so consumers needing 'a real user scroll
   * happened' (pagination's anti-auto-load gate) key on THIS, not onScrollBeginDrag. distanceFromEnd
   * (content minus viewport minus offset) lets consumers derive end-proximity — FlashList's
   * onEndReached also never fires under handoff scrolling, so pagination triggers off THIS. */
  onUserListScrollActivity?: (offsetY: number, distanceFromEnd: number) => void;
  onScrollEndDrag?: BottomSheetWithFlashListBaseProps<any>['onScrollEndDrag'];
  onMomentumBeginJS?: BottomSheetWithFlashListBaseProps<any>['onMomentumBeginJS'];
  onMomentumEndJS?: BottomSheetWithFlashListBaseProps<any>['onMomentumEndJS'];
  showsVerticalScrollIndicator?: boolean;
  keyboardDismissMode?: ScrollViewProps['keyboardDismissMode'];
  // Over-scroll is enforced no-bounce structurally by BottomSheetScrollContainer (the handoff
  // requires it); not configurable per scene. See SHEET_BODY_NO_OVERSCROLL.
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

const SEARCH_ROUTE_SHEET_SHELL_IDENTITY_KEY = 'search-route-sheet';

export const normalizeSearchRouteSceneStackShellSpec = (
  shellSpec: SearchRouteSceneShellSpec
): SearchRouteSceneStackShellSpec => ({
  ...shellSpec,
  shellIdentityKey: shellSpec.shellIdentityKey ?? SEARCH_ROUTE_SHEET_SHELL_IDENTITY_KEY,
  sceneIdentityKey: shellSpec.sceneIdentityKey ?? shellSpec.overlayKey,
  surfaceKind: 'scene-stack',
});

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
  if (left.surfaceKind === 'list' && right.surfaceKind === 'list') {
    return (
      left.data === right.data &&
      left.renderItem === right.renderItem &&
      left.keyExtractor === right.keyExtractor &&
      left.estimatedItemSize === right.estimatedItemSize &&
      left.ListChromeComponent === right.ListChromeComponent &&
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
    left.onUserListScrollActivity === right.onUserListScrollActivity &&
    left.onScrollEndDrag === right.onScrollEndDrag &&
    left.onMomentumBeginJS === right.onMomentumBeginJS &&
    left.onMomentumEndJS === right.onMomentumEndJS &&
    left.showsVerticalScrollIndicator === right.showsVerticalScrollIndicator &&
    left.keyboardDismissMode === right.keyboardDismissMode &&
    left.testID === right.testID &&
    left.activeList === right.activeList &&
    left.flashListProps === right.flashListProps &&
    left.contentSurfaceStyle === right.contentSurfaceStyle &&
    left.listRef === right.listRef &&
    areSearchRouteSceneSecondaryListTransportPublicationsEqual(
      left.secondaryList,
      right.secondaryList
    ));
