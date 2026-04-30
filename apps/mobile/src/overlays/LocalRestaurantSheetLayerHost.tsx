import React from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';

import RestaurantRouteSheetSurface from './RestaurantRouteSheetSurface';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from './searchRouteOverlayRuntimeContract';
import { createRestaurantRoutePanelHostConfig } from './restaurantRoutePanelContract';
import { useRestaurantRoutePresentationStateRuntime } from './useRestaurantRoutePresentationStateRuntime';
import { useRestaurantRouteRenderLayerRuntime } from './useRestaurantRouteRenderLayerRuntime';
import { useRestaurantRouteSheetMotionTargetRegistration } from './useRestaurantRouteSheetMotionTargetRegistration';
import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import type { SearchOverlayLocalRestaurantSheetHostAuthority } from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import type { SearchOverlayLocalRestaurantSheetHostSnapshot } from '../screens/Search/runtime/shared/search-overlay-local-restaurant-sheet-host-snapshot-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';

const isLocalRestaurantRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'restaurant'> =>
  route.key === 'restaurant' &&
  (!route.params || !('source' in route.params) || route.params.source !== 'global');

export type LocalRestaurantSheetLayerHostProps = {
  overlayLocalRestaurantSheetHostAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;
};

const LocalRestaurantSheetLayerHost = ({
  overlayLocalRestaurantSheetHostAuthority,
}: LocalRestaurantSheetLayerHostProps) => {
  const {
    restaurantSessionSnapshot,
    restaurantControlSelectionSnapshot,
    shouldRenderSearchOverlay,
    routeHostVisualSnapshot,
    onProfilerRender,
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
    attributionOwner: 'LocalRestaurantSheetLayerHost',
    attributionOperation: 'restaurantSheetSnapshotSelector',
  });
  const fallbackVisualState = EMPTY_SEARCH_ROUTE_VISUAL_STATE;
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
  const isActiveLocalRestaurant = isLocalRestaurantRouteEntry(
    restaurantSessionSnapshot.activeOverlayRoute
  );
  const restaurantSheetSnapController = isActiveLocalRestaurant
    ? restaurantControlSelectionSnapshot.restaurantSheetSnapController
    : null;
  const restaurantHostConfig = React.useMemo(
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
  const restaurantPresentationStateRuntime = useRestaurantRoutePresentationStateRuntime({
    visualState: {
      sheetTranslateY:
        routeHostVisualSnapshot?.resultsSheetRuntimeOwner.sheetTranslateY ??
        fallbackVisualState.sheetTranslateY,
      resultsScrollOffset:
        routeHostVisualSnapshot?.resultsSheetRuntimeOwner.resultsScrollOffset ??
        fallbackVisualState.resultsScrollOffset,
      resultsMomentum:
        routeHostVisualSnapshot?.resultsSheetRuntimeOwner.resultsMomentum ??
        fallbackVisualState.resultsMomentum,
    },
  });
  useRestaurantRouteSheetMotionTargetRegistration({
    enabled: restaurantSheetSnapController != null,
    source: 'search',
    snapController: restaurantSheetSnapController,
  });
  const localRestaurantRenderLayer = useRestaurantRouteRenderLayerRuntime({
    restaurantRouteSource: 'search',
    data: isActiveLocalRestaurant
      ? restaurantControlSelectionSnapshot.restaurantPanelSnapshot
      : null,
    onToggleFavorite: restaurantControlSelectionSnapshot.onToggleFavorite,
    onRequestClose: restaurantControlSelectionSnapshot.closeRestaurantProfile,
    hostConfig: restaurantHostConfig,
    isActive: isActiveLocalRestaurant,
    onProfilerRender: isActiveLocalRestaurant ? onProfilerRender : null,
    activeOverlayRouteKey: restaurantSessionSnapshot.activeOverlayRouteKey,
    rootOverlayKey: restaurantSessionSnapshot.rootOverlayKey,
    overlayRouteStackLength: restaurantSessionSnapshot.overlayRouteStackLength,
    presentationState: restaurantPresentationStateRuntime.presentationState,
    snapController: restaurantSheetSnapController,
    visible: shouldRenderSearchOverlay && isActiveLocalRestaurant,
    navBarTop: routeHostVisualSnapshot?.visualRuntime.navBarTop ?? 0,
    searchBarTop: routeHostVisualSnapshot?.overlayGeometryRuntime.searchBarTop ?? 0,
    headerActionProgress:
      routeHostVisualSnapshot?.visualRuntime.overlayHeaderActionProgress ??
      fallbackVisualState.overlayHeaderActionProgress,
    navBarHeight: routeHostVisualSnapshot?.overlayGeometryRuntime.navBarCutoutHeight ?? 0,
    navBarCutoutProgress:
      routeHostVisualSnapshot?.visualRuntime.navBarCutoutProgress ??
      fallbackVisualState.navBarCutoutProgress,
    navBarHiddenTranslateY:
      routeHostVisualSnapshot?.overlayGeometryRuntime.bottomNavHiddenTranslateY ?? 0,
    navBarCutoutIsHiding: routeHostVisualSnapshot?.visualRuntime.navBarCutoutIsHiding ?? false,
    layerKey: 'local-restaurant-sheet',
  });
  const sheetLayer = localRestaurantRenderLayer?.sheetLayer ?? null;
  if (!sheetLayer) {
    return null;
  }

  const renderedSheet = (
    <React.Profiler id="LocalRestaurantRouteHost" onRender={sheetLayer.onProfilerRender}>
      <RestaurantRouteSheetSurface presentationModel={sheetLayer.presentationModel} />
    </React.Profiler>
  );

  return sheetLayer.wrapRenderedSheet(renderedSheet);
};

export default React.memo(LocalRestaurantSheetLayerHost);
