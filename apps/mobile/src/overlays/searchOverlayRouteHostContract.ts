import type React from 'react';
import type { FlashListProps, FlashListRef } from '@shopify/flash-list';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import type {
  BottomSheetWithFlashListBaseProps,
  DualListSelection,
} from './bottomSheetWithFlashListContract';
import type { OverlayKey, OverlaySheetFrameSpec } from './types';
// F5421 — the search-route scene-body twins alias the canonical scene-list-item type
// (`unknown`, the stricter of the two) rather than re-spelling their own `any`.
import type { AppRouteSceneListItem } from '../navigation/runtime/app-route-scene-descriptor-contract';
import { createNullableShapeEquality, createShapeEquality, sameFieldRef } from './shape-equality';
import type { SearchInteractionSnapshot } from '../screens/Search/context/SearchInteractionContext';
import type { SceneBodyContentInsets } from './bottomSheetSurfaceStyleUtils';

export type { SearchRouteHostVisualState } from './searchRouteHostVisualState';

export type SearchRoutePanelInteractionRef = React.MutableRefObject<SearchInteractionSnapshot>;
type SearchRouteSceneSheetHostOwnedField = keyof Pick<
  OverlaySheetFrameSpec,
  | 'initialSnapPoint'
  | 'dismissThreshold'
  | 'onHidden'
  | 'onSnapStart'
  | 'onSnapChange'
  | 'preventSwipeDismiss'
  | 'runtimeModel'
  | 'shellSnapRequest'
>;

export type SearchRouteSceneShellSpec = Omit<
  OverlaySheetFrameSpec,
  SearchRouteSceneSheetHostOwnedField
>;
export type SearchRouteSceneStackShellSpec = SearchRouteSceneShellSpec & {
  surfaceKind: 'scene-stack';
};

export type SearchRouteSceneSecondaryListContentPublication = {
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

export type SearchRouteSceneSecondaryListTransportPublication = {
  listRef?: React.RefObject<FlashListRef<AppRouteSceneListItem> | null>;
  scrollIndicatorInsets?: ScrollViewProps['scrollIndicatorInsets'];
  contentContainerStyle?: SceneBodyContentInsets;
  flashListProps?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['flashListProps'];
  testID?: string;
};

export type SearchRouteMountedSceneBodyKey =
  | 'lists'
  | 'home'
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
  | 'lists'
  | 'home'
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
      data: ReadonlyArray<AppRouteSceneListItem>;
      renderItem: FlashListProps<AppRouteSceneListItem>['renderItem'];
      keyExtractor?: FlashListProps<AppRouteSceneListItem>['keyExtractor'];
      estimatedItemSize: number;
      ListChromeComponent?: React.ReactNode;
      ListHeaderComponent?: FlashListProps<AppRouteSceneListItem>['ListHeaderComponent'];
      ListFooterComponent?: FlashListProps<AppRouteSceneListItem>['ListFooterComponent'];
      ListEmptyComponent?: FlashListProps<AppRouteSceneListItem>['ListEmptyComponent'];
      ItemSeparatorComponent?: FlashListProps<AppRouteSceneListItem>['ItemSeparatorComponent'];
      extraData?: FlashListProps<AppRouteSceneListItem>['extraData'];
      secondaryList?: SearchRouteSceneSecondaryListContentPublication | null;
      listKey?: string;
      onEndReached?: FlashListProps<AppRouteSceneListItem>['onEndReached'];
      onEndReachedThreshold?: FlashListProps<AppRouteSceneListItem>['onEndReachedThreshold'];
    };

export type SearchRouteSceneBodyTransportSpec = {
  contentContainerStyle?: SceneBodyContentInsets;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  scrollIndicatorInsets?: ScrollViewProps['scrollIndicatorInsets'];
  onScrollOffsetChange?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onScrollOffsetChange'];
  onScrollBeginDrag?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onScrollBeginDrag'];
  /** Fired from the list's live onScroll with the current offsetY. The gesture-handoff
   * scroll container never produces native drag events (the finger is on the sheet's
   * GestureDetector; scrolling is worklet-driven), so consumers needing 'a real user scroll
   * happened' (pagination's anti-auto-load gate) key on THIS, not onScrollBeginDrag. distanceFromEnd
   * (content minus viewport minus offset) lets consumers derive end-proximity — FlashList's
   * onEndReached also never fires under handoff scrolling, so pagination triggers off THIS. */
  onUserListScrollActivity?: (offsetY: number, distanceFromEnd: number) => void;
  onScrollEndDrag?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onScrollEndDrag'];
  onMomentumBeginJS?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onMomentumBeginJS'];
  onMomentumEndJS?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['onMomentumEndJS'];
  showsVerticalScrollIndicator?: boolean;
  keyboardDismissMode?: ScrollViewProps['keyboardDismissMode'];
  // Over-scroll behavior is owned by the track's single FlashList (TrackSheetPage.tsx, R8);
  // not configurable per scene. (The old BottomSheetScrollContainer enforcer died in R8.)
  testID?: string;
  activeList?: DualListSelection;
  flashListProps?: BottomSheetWithFlashListBaseProps<AppRouteSceneListItem>['flashListProps'];
  contentSurfaceStyle?: StyleProp<ViewStyle>;
  listRef?: React.RefObject<FlashListRef<AppRouteSceneListItem> | null>;
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

const areSearchRouteSceneSecondaryListContentPublicationsEqual =
  createNullableShapeEquality<SearchRouteSceneSecondaryListContentPublication>({
    data: sameFieldRef,
    renderItem: sameFieldRef,
    keyExtractor: sameFieldRef,
    estimatedItemSize: sameFieldRef,
    extraData: sameFieldRef,
    ListHeaderComponent: sameFieldRef,
    ListFooterComponent: sameFieldRef,
    ListEmptyComponent: sameFieldRef,
    ItemSeparatorComponent: sameFieldRef,
    onEndReached: sameFieldRef,
    listKey: sameFieldRef,
  });

const areSearchRouteSceneSecondaryListTransportPublicationsEqual =
  createNullableShapeEquality<SearchRouteSceneSecondaryListTransportPublication>({
    listRef: sameFieldRef,
    scrollIndicatorInsets: sameFieldRef,
    contentContainerStyle: sameFieldRef,
    flashListProps: sameFieldRef,
    testID: sameFieldRef,
  });

// The content spec is a DISCRIMINATED UNION: one field map PER variant, dispatched by
// surfaceKind. Different kinds are never equal (a 'list' body and a 'content' body are
// different bodies, whatever their fields say).
const areContentSurfaceSpecsEqual = createShapeEquality<
  Extract<SearchRouteSceneBodyContentSpec, { surfaceKind: 'content' }>
>({
  surfaceKind: sameFieldRef,
  contentComponent: sameFieldRef,
  contentScrollMode: sameFieldRef,
});

const areMountedSurfaceSpecsEqual = createShapeEquality<
  Extract<SearchRouteSceneBodyContentSpec, { surfaceKind: 'mounted' }>
>({
  surfaceKind: sameFieldRef,
  mountedBodyKey: sameFieldRef,
  // Preserves the hand-written arm's defaulting: an absent mode IS 'scroll'.
  contentScrollMode: (left, right) => (left ?? 'scroll') === (right ?? 'scroll'),
});

const areListSurfaceSpecsEqual = createShapeEquality<
  Extract<SearchRouteSceneBodyContentSpec, { surfaceKind: 'list' }>
>({
  surfaceKind: sameFieldRef,
  data: sameFieldRef,
  renderItem: sameFieldRef,
  keyExtractor: sameFieldRef,
  estimatedItemSize: sameFieldRef,
  ListChromeComponent: sameFieldRef,
  ListHeaderComponent: sameFieldRef,
  ListFooterComponent: sameFieldRef,
  ListEmptyComponent: sameFieldRef,
  ItemSeparatorComponent: sameFieldRef,
  extraData: sameFieldRef,
  secondaryList: areSearchRouteSceneSecondaryListContentPublicationsEqual,
  listKey: sameFieldRef,
  onEndReached: sameFieldRef,
  onEndReachedThreshold: sameFieldRef,
});

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
    return areContentSurfaceSpecsEqual(left, right);
  }
  if (left.surfaceKind === 'mounted' && right.surfaceKind === 'mounted') {
    return areMountedSurfaceSpecsEqual(left, right);
  }
  if (left.surfaceKind === 'list' && right.surfaceKind === 'list') {
    return areListSurfaceSpecsEqual(left, right);
  }

  return false;
};

export const areSearchRouteSceneBodyTransportSpecsEqual =
  createNullableShapeEquality<SearchRouteSceneBodyTransportSpec>({
    contentContainerStyle: sameFieldRef,
    keyboardShouldPersistTaps: sameFieldRef,
    scrollIndicatorInsets: sameFieldRef,
    onScrollOffsetChange: sameFieldRef,
    onScrollBeginDrag: sameFieldRef,
    onUserListScrollActivity: sameFieldRef,
    onScrollEndDrag: sameFieldRef,
    onMomentumBeginJS: sameFieldRef,
    onMomentumEndJS: sameFieldRef,
    showsVerticalScrollIndicator: sameFieldRef,
    keyboardDismissMode: sameFieldRef,
    testID: sameFieldRef,
    activeList: sameFieldRef,
    flashListProps: sameFieldRef,
    contentSurfaceStyle: sameFieldRef,
    listRef: sameFieldRef,
    secondaryList: areSearchRouteSceneSecondaryListTransportPublicationsEqual,
  });
