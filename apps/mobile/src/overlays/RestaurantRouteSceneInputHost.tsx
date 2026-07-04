import React from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';

import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import type {
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from '../navigation/runtime/app-route-scene-descriptor-contract';
import type { RouteShellSceneInputLane } from '../navigation/runtime/app-route-scene-runtime';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { RouteGlobalRestaurantOverlaySnapshot } from '../navigation/runtime/route-global-restaurant-overlay-snapshot-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import type { SearchOverlayLocalRestaurantSheetHostSnapshot } from '../screens/Search/runtime/shared/search-overlay-local-restaurant-sheet-host-snapshot-contract';
import type {
  SearchOverlayGlobalRestaurantHostAuthority,
  SearchOverlayLocalRestaurantSheetHostAuthority,
} from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import type { RouteSceneLayoutSnapshot } from '../screens/Search/runtime/shared/route-scene-layout-snapshot-contract';
import {
  selectSearchSurfaceVisualPolicy,
  useSearchSurfaceRuntimeSelector,
} from '../screens/Search/runtime/surface/search-surface-runtime';
import { publishRestaurantHeaderLiveState } from './restaurant-header-live-state';
import { createRestaurantRoutePanelHostConfig } from './restaurantRoutePanelContract';
import { normalizeSearchRouteSceneStackShellSpec } from './searchOverlayRouteHostContract';
import { isOverlayListContentSpec, type OverlayContentSpec } from './types';
import { useRestaurantRouteContentSpecRuntime } from './useRestaurantRouteContentSpecRuntime';
import { useRestaurantRouteEntryRuntime } from './useRestaurantRouteEntryRuntime';

type RestaurantRouteSceneInputHostProps = {
  overlayGlobalRestaurantHostAuthority: SearchOverlayGlobalRestaurantHostAuthority;
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
  routeSceneInputLane: RouteShellSceneInputLane;
};

type RestaurantRouteSceneDescriptor = {
  shellSpec: AppRouteSceneStackShellSpec;
  sceneChrome: AppRouteSceneChromePublication;
  sceneBodyContent: AppRouteSceneBodyContentSpec;
  sceneBodyTransport: AppRouteSceneBodyTransportSpec;
};

const isSearchRestaurantRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'restaurant'> => {
  if (route.key !== 'restaurant') {
    return false;
  }
  const params = route.params as OverlayRouteEntry<'restaurant'>['params'] | undefined;
  return params?.source === 'search';
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

const RestaurantRouteSceneInputHost = ({
  overlayGlobalRestaurantHostAuthority,
  overlayLocalRestaurantSheetHostAuthority,
  routeSceneInputLane,
}: RestaurantRouteSceneInputHostProps) => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const closeRuntime = React.useMemo(
    () => routeSceneRuntime.routeGlobalRestaurantRouteActions,
    [routeSceneRuntime.routeGlobalRestaurantRouteActions]
  );

  const parentRestaurantSnapshot = useRouteAuthoritySelector<
    RouteGlobalRestaurantOverlaySnapshot,
    RouteGlobalRestaurantOverlaySnapshot
  >({
    subscribe: React.useCallback(
      (listener: () => void) => overlayGlobalRestaurantHostAuthority.subscribe(listener),
      [overlayGlobalRestaurantHostAuthority]
    ),
    getSnapshot: overlayGlobalRestaurantHostAuthority.getSnapshot,
    selector: React.useCallback((snapshot) => snapshot, []),
    attributionOwner: 'RestaurantRouteSceneInputHost',
    attributionOperation: 'parentRestaurantSnapshotSelector',
  });
  const routeSceneLayoutSnapshot = useRouteAuthoritySelector<
    RouteSceneLayoutSnapshot,
    RouteSceneLayoutSnapshot
  >({
    subscribe: React.useCallback(
      (listener: () => void) => routeSceneRuntime.routeSceneLayoutAuthority.subscribe(listener),
      [routeSceneRuntime.routeSceneLayoutAuthority]
    ),
    getSnapshot: routeSceneRuntime.routeSceneLayoutAuthority.getSnapshot,
    selector: React.useCallback((snapshot) => snapshot, []),
    attributionOwner: 'RestaurantRouteSceneInputHost',
    attributionOperation: 'routeSceneLayoutSnapshotSelector',
  });

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

  const parentPresentationDraft = parentRestaurantSnapshot.presentationDraft;
  const isActiveParentRestaurant =
    parentPresentationDraft != null &&
    parentRestaurantSnapshot.activeSessionToken === parentPresentationDraft.sessionToken;
  const parentRestaurantEntryRuntime = useRestaurantRouteEntryRuntime({
    panelDraft: isActiveParentRestaurant ? parentPresentationDraft.panelDraft : null,
    onRequestClose: () => {
      if (parentPresentationDraft == null) {
        return;
      }
      const currentSessionToken = closeRuntime.getActiveRestaurantRouteSessionToken();
      if (currentSessionToken !== parentPresentationDraft.sessionToken) {
        return;
      }
      closeRuntime.closeRestaurantRoute(parentPresentationDraft.sessionToken);
    },
    hostConfig: null,
    isActive: isActiveParentRestaurant,
    onProfilerRender: null,
  });
  const parentRestaurantContentSpecRuntime = useRestaurantRouteContentSpecRuntime({
    panel: parentRestaurantEntryRuntime.panel,
    hostConfig: parentRestaurantEntryRuntime.hostConfig,
    navBarTop: routeSceneLayoutSnapshot.routeSceneLayout?.navBarTop ?? 0,
    searchBarTop: routeSceneLayoutSnapshot.routeSceneLayout?.searchBarTop ?? 0,
  });
  const parentRestaurantSceneDescriptor = React.useMemo(
    () =>
      createRestaurantSharedSceneDescriptor(
        isActiveParentRestaurant ? parentRestaurantContentSpecRuntime.spec : null
      ),
    [isActiveParentRestaurant, parentRestaurantContentSpecRuntime.spec]
  );

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
      !policy.canReleasePersistentPolls
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
    onToggleFavorite: restaurantControlSelectionSnapshot.onToggleFavorite,
    onRequestClose: restaurantControlSelectionSnapshot.closeRestaurantProfile,
    hostConfig: searchRestaurantHostConfig,
    isActive: isActiveSearchRestaurant,
    onProfilerRender: null,
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

  const activeRestaurantSceneDescriptor =
    parentRestaurantSceneDescriptor ?? searchRestaurantSceneDescriptor;
  const didPublishSceneInputRef = React.useRef(false);

  // P3 persistent header: publish the WINNING entry's header inputs (freeze-retained data +
  // favorite/close handlers) to the restaurant-header-live-state store — the exact `parent ??
  // search` resolution the scene descriptor above uses, so the hoisted persistent header always
  // shows the same restaurant the leg body does (incl. the entity-tap seeded name at frame 1 and
  // the results_dismissing preserve window).
  const activeRestaurantHeaderState =
    (isActiveParentRestaurant ? parentRestaurantContentSpecRuntime.headerState : null) ??
    (shouldUseSearchRestaurant ? searchRestaurantContentSpecRuntime.headerState : null);

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
