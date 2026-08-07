import React from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';

import type {
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from '../navigation/runtime/app-route-scene-descriptor-contract';
import type { RouteShellSceneInputLane } from '../navigation/runtime/app-route-scene-runtime';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import type { SearchOverlayLocalRestaurantSheetHostSnapshot } from '../screens/Search/runtime/shared/search-overlay-local-restaurant-sheet-host-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetHostAuthority } from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import {
  selectSearchSurfaceVisualPolicy,
  useSearchSurfaceRuntimeSelector,
} from '../screens/Search/runtime/surface/search-surface-runtime';
import { publishRestaurantHeaderLiveState } from './restaurant-header-live-state';
import { createRestaurantRoutePanelHostConfig } from './restaurantRoutePanelContract';
import { normalizeSearchRouteSceneStackShellSpec } from './searchOverlayRouteHostContract';
import { isSearchRestaurantRouteEntry } from './searchRestaurantRouteController';
import { isOverlayListContentSpec, type OverlayContentSpec } from './types';
import { useRestaurantRouteContentSpecRuntime } from './useRestaurantRouteContentSpecRuntime';
import { useRestaurantRouteEntryRuntime } from './useRestaurantRouteEntryRuntime';

type RestaurantRouteSceneInputHostProps = {
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
  routeSceneInputLane: RouteShellSceneInputLane;
};

type RestaurantRouteSceneDescriptor = {
  shellSpec: AppRouteSceneStackShellSpec;
  sceneChrome: AppRouteSceneChromePublication;
  sceneBodyContent: AppRouteSceneBodyContentSpec;
  sceneBodyTransport: AppRouteSceneBodyTransportSpec;
};

const createRestaurantSharedSceneDescriptor = (
  spec: OverlayContentSpec<unknown> | null
): RestaurantRouteSceneDescriptor | null => {
  if (spec == null) {
    return null;
  }

  const {
    underlayComponent,
    backgroundComponent,
    headerComponent,
    overlayComponent,
    contentContainerStyle,
    keyboardShouldPersistTaps,
    scrollIndicatorInsets,
    onScrollOffsetChange,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumBeginJS,
    onMomentumEndJS,
    showsVerticalScrollIndicator,
    keyboardDismissMode,
    testID,
    activeList,
    flashListProps,
    contentSurfaceStyle,
    listRef,
  } = spec;

  const shellSpec = normalizeSearchRouteSceneStackShellSpec({
    ...spec,
    overlayKey: 'restaurant',
    semanticOverlayKey: 'restaurant',
    sceneIdentityKey: spec.sceneIdentityKey ?? 'restaurant',
    underlayComponent: undefined,
    backgroundComponent: undefined,
    headerComponent: undefined,
    overlayComponent: undefined,
    animateOnMount: false,
  });

  const sceneChrome: AppRouteSceneChromePublication = {
    surfaceKind: 'inline',
    underlayComponent: underlayComponent ?? null,
    backgroundComponent: backgroundComponent ?? null,
    headerComponent: headerComponent ?? null,
    overlayComponent: overlayComponent ?? null,
  };

  const sceneBodyContent: AppRouteSceneBodyContentSpec = isOverlayListContentSpec(spec)
    ? {
        surfaceKind: 'list',
        data: spec.data,
        renderItem: spec.renderItem,
        keyExtractor: spec.keyExtractor,
        estimatedItemSize: spec.estimatedItemSize,
        ListHeaderComponent: spec.ListHeaderComponent,
        ListFooterComponent: spec.ListFooterComponent,
        ListEmptyComponent: spec.ListEmptyComponent,
        ItemSeparatorComponent: spec.ItemSeparatorComponent,
        extraData: spec.extraData,
        secondaryList:
          spec.secondaryList == null
            ? undefined
            : {
                data: spec.secondaryList.data,
                renderItem: spec.secondaryList.renderItem,
                keyExtractor: spec.secondaryList.keyExtractor,
                estimatedItemSize: spec.secondaryList.estimatedItemSize,
                extraData: spec.secondaryList.extraData,
                ListHeaderComponent: spec.secondaryList.ListHeaderComponent,
                ListFooterComponent: spec.secondaryList.ListFooterComponent,
                ListEmptyComponent: spec.secondaryList.ListEmptyComponent,
                ItemSeparatorComponent: spec.secondaryList.ItemSeparatorComponent,
                onEndReached: spec.secondaryList.onEndReached,
                listKey: spec.secondaryList.listKey,
              },
        listKey: spec.listKey,
        onEndReached: spec.onEndReached,
        onEndReachedThreshold: spec.onEndReachedThreshold,
      }
    : {
        surfaceKind: 'content',
        contentComponent: spec.contentComponent,
        contentScrollMode: spec.contentScrollMode ?? 'scroll',
      };

  const sceneBodyTransport: AppRouteSceneBodyTransportSpec = {
    contentContainerStyle,
    keyboardShouldPersistTaps,
    scrollIndicatorInsets,
    onScrollOffsetChange,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumBeginJS,
    onMomentumEndJS,
    showsVerticalScrollIndicator,
    keyboardDismissMode,
    testID,
    activeList,
    flashListProps,
    contentSurfaceStyle,
    listRef,
    secondaryList:
      isOverlayListContentSpec(spec) && spec.secondaryList != null
        ? {
            listRef: spec.secondaryList.listRef,
            scrollIndicatorInsets: spec.secondaryList.scrollIndicatorInsets,
            contentContainerStyle: spec.secondaryList.contentContainerStyle,
            flashListProps: spec.secondaryList.flashListProps,
            testID: spec.secondaryList.testID,
          }
        : undefined,
  };

  return {
    shellSpec,
    sceneChrome,
    sceneBodyContent,
    sceneBodyTransport,
  };
};

// F5000: this host used to resolve `parent ?? search`. The parent-scoped
// (global-restaurant-draft) leg is GONE — its only producer, `openRestaurantRoute`, had no
// callers, so its draft was never written and `parent` was structurally always null. Every
// real opener (polls / lists / profile, via the entity-ref executor's `restaurantWorld`
// action) routes through the COMMITTED search world, i.e. the search leg below.
const RestaurantRouteSceneInputHost = ({
  overlayLocalRestaurantSheetHostAuthority,
  routeSceneInputLane,
}: RestaurantRouteSceneInputHostProps) => {
  const {
    restaurantSessionSnapshot,
    restaurantControlSelectionSnapshot,
    shouldRenderSearchOverlay,
    routeHostVisualSnapshot,
  } = useRouteAuthoritySelector<
    SearchOverlayLocalRestaurantSheetHostSnapshot,
    SearchOverlayLocalRestaurantSheetHostSnapshot
  >({
    subscribe: React.useCallback(
      (listener: () => void) => overlayLocalRestaurantSheetHostAuthority.subscribe(listener),
      [overlayLocalRestaurantSheetHostAuthority]
    ),
    getSnapshot: overlayLocalRestaurantSheetHostAuthority.getSnapshot,
    selector: React.useCallback((snapshot) => snapshot, []),
    attributionOwner: 'RestaurantRouteSceneInputHost',
    attributionOperation: 'searchRestaurantSnapshotSelector',
  });

  const restaurantOverlayAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity:
        restaurantControlSelectionSnapshot.shouldSuppressRestaurantOverlay &&
        restaurantControlSelectionSnapshot.suggestionProgress != null
          ? 1 - restaurantControlSelectionSnapshot.suggestionProgress.value
          : 1,
    }),
    [
      restaurantControlSelectionSnapshot.shouldSuppressRestaurantOverlay,
      restaurantControlSelectionSnapshot.suggestionProgress,
    ]
  );
  const isActiveSearchRestaurant = isSearchRestaurantRouteEntry(
    restaurantSessionSnapshot.activeOverlayRoute
  );
  const shouldPreserveSearchRestaurantForDismiss = useSearchSurfaceRuntimeSelector((snapshot) => {
    const policy = selectSearchSurfaceVisualPolicy(snapshot);
    return (
      policy.phase === 'results_dismissing' &&
      policy.outgoingSheetSceneKey === 'restaurant' &&
      !policy.canReleaseDockedScene
    );
  }, Object.is);
  const shouldUseSearchRestaurant =
    (shouldRenderSearchOverlay && isActiveSearchRestaurant) ||
    shouldPreserveSearchRestaurantForDismiss;
  const searchRestaurantHostConfig = React.useMemo(
    () =>
      createRestaurantRoutePanelHostConfig({
        shouldFreezeContent: restaurantControlSelectionSnapshot.shouldFreezeRestaurantPanelContent,
        interactionEnabled:
          restaurantControlSelectionSnapshot.shouldEnableRestaurantOverlayInteraction,
        containerStyle: restaurantOverlayAnimatedStyle,
      }),
    [
      restaurantOverlayAnimatedStyle,
      restaurantControlSelectionSnapshot.shouldEnableRestaurantOverlayInteraction,
      restaurantControlSelectionSnapshot.shouldFreezeRestaurantPanelContent,
    ]
  );
  const searchRestaurantEntryRuntime = useRestaurantRouteEntryRuntime({
    data: shouldUseSearchRestaurant
      ? restaurantControlSelectionSnapshot.restaurantPanelSnapshot
      : null,
    onRequestClose: restaurantControlSelectionSnapshot.closeRestaurantProfile,
    hostConfig: searchRestaurantHostConfig,
  });
  const searchRestaurantContentSpecRuntime = useRestaurantRouteContentSpecRuntime({
    panel: searchRestaurantEntryRuntime.panel,
    hostConfig: searchRestaurantEntryRuntime.hostConfig,
    navBarTop: routeHostVisualSnapshot?.visualRuntime.navBarTop ?? 0,
    searchBarTop: routeHostVisualSnapshot?.overlayGeometryRuntime.searchBarTop ?? 0,
  });
  const searchRestaurantSceneDescriptor = React.useMemo(
    () =>
      createRestaurantSharedSceneDescriptor(
        shouldUseSearchRestaurant ? searchRestaurantContentSpecRuntime.spec : null
      ),
    [searchRestaurantContentSpecRuntime.spec, shouldUseSearchRestaurant]
  );

  const activeRestaurantSceneDescriptor = searchRestaurantSceneDescriptor;
  const didPublishSceneInputRef = React.useRef(false);

  // P3 persistent header: publish the entry's header inputs (freeze-retained data + close
  // handler) to the restaurant-header-live-state store, so the hoisted persistent header always
  // shows the same restaurant the leg body does (incl. the entity-tap seeded name at frame 1 and
  // the results_dismissing preserve window).
  const activeRestaurantHeaderState = shouldUseSearchRestaurant
    ? searchRestaurantContentSpecRuntime.headerState
    : null;

  React.useLayoutEffect(() => {
    publishRestaurantHeaderLiveState(activeRestaurantHeaderState);
  }, [activeRestaurantHeaderState]);

  React.useEffect(
    () => () => {
      publishRestaurantHeaderLiveState(null);
    },
    []
  );

  React.useLayoutEffect(() => {
    if (activeRestaurantSceneDescriptor == null) {
      if (didPublishSceneInputRef.current) {
        routeSceneInputLane.clearRouteSceneInput('restaurant');
        didPublishSceneInputRef.current = false;
      }
      return;
    }

    routeSceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'restaurant',
      ...activeRestaurantSceneDescriptor,
    });
    didPublishSceneInputRef.current = true;
  }, [activeRestaurantSceneDescriptor, routeSceneInputLane]);

  React.useEffect(
    () => () => {
      if (didPublishSceneInputRef.current) {
        routeSceneInputLane.clearRouteSceneInput('restaurant');
      }
    },
    [routeSceneInputLane]
  );

  return null;
};

export default React.memo(RestaurantRouteSceneInputHost);
