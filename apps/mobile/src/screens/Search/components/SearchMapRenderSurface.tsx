import React from 'react';

import type { SearchMapRenderHostAuthority } from '../runtime/shared/search-root-host-authority-contract';
import type { SearchMapRenderHostLayerRuntime } from '../runtime/shared/search-map-render-host-layer-runtime-contract';
import { useRouteAuthoritySelector } from '../../../navigation/runtime/use-route-authority-selector';
import { SearchMapRenderHostLayers } from './SearchMapRenderHostLayers';

type SearchMapRenderShellGateSnapshot = {
  highlightedRestaurantId: SearchMapRenderHostLayerRuntime['engineInputs']['highlightedRestaurantId'];
  restaurantOnlyId: SearchMapRenderHostLayerRuntime['engineInputs']['restaurantOnlyId'];
  styleURL: string;
  mapCenter: SearchMapRenderHostLayerRuntime['presentationProps']['mapCenter'];
  mapZoom: SearchMapRenderHostLayerRuntime['presentationProps']['mapZoom'];
  mapCameraAnimation: SearchMapRenderHostLayerRuntime['presentationProps']['mapCameraAnimation'];
  cameraPadding: SearchMapRenderHostLayerRuntime['presentationProps']['cameraPadding'];
  isFollowingUser: SearchMapRenderHostLayerRuntime['presentationProps']['isFollowingUser'];
  userLocation: SearchMapRenderHostLayerRuntime['presentationProps']['userLocation'];
  userLocationSnapshot: SearchMapRenderHostLayerRuntime['presentationProps']['userLocationSnapshot'];
  disableMarkers: SearchMapRenderHostLayerRuntime['presentationProps']['disableMarkers'];
  disableBlur: SearchMapRenderHostLayerRuntime['presentationProps']['disableBlur'];
};

const selectSearchMapRenderShellGate = (
  snapshot: SearchMapRenderHostLayerRuntime
): SearchMapRenderShellGateSnapshot => ({
  highlightedRestaurantId: snapshot.engineInputs.highlightedRestaurantId,
  restaurantOnlyId: snapshot.engineInputs.restaurantOnlyId,
  styleURL: snapshot.hostConfig.styleURL,
  mapCenter: snapshot.presentationProps.mapCenter,
  mapZoom: snapshot.presentationProps.mapZoom,
  mapCameraAnimation: snapshot.presentationProps.mapCameraAnimation,
  cameraPadding: snapshot.presentationProps.cameraPadding,
  isFollowingUser: snapshot.presentationProps.isFollowingUser,
  userLocation: snapshot.presentationProps.userLocation,
  userLocationSnapshot: snapshot.presentationProps.userLocationSnapshot,
  disableMarkers: snapshot.presentationProps.disableMarkers,
  disableBlur: snapshot.presentationProps.disableBlur,
});

const areSearchMapRenderShellGateSnapshotsEqual = (
  left: SearchMapRenderShellGateSnapshot,
  right: SearchMapRenderShellGateSnapshot
): boolean =>
  left.styleURL === right.styleURL &&
  left.highlightedRestaurantId === right.highlightedRestaurantId &&
  left.restaurantOnlyId === right.restaurantOnlyId &&
  left.mapCenter === right.mapCenter &&
  left.mapZoom === right.mapZoom &&
  left.mapCameraAnimation === right.mapCameraAnimation &&
  left.cameraPadding === right.cameraPadding &&
  left.isFollowingUser === right.isFollowingUser &&
  left.userLocation === right.userLocation &&
  left.userLocationSnapshot === right.userLocationSnapshot &&
  left.disableMarkers === right.disableMarkers &&
  left.disableBlur === right.disableBlur;

export const SearchMapRenderSurface = React.memo(
  ({
    mapRenderHostAuthority,
  }: {
    mapRenderHostAuthority: SearchMapRenderHostAuthority;
  }) => {
    const subscribeShellGate = React.useCallback(
      (
        selector: (
          snapshot: SearchMapRenderHostLayerRuntime
        ) => SearchMapRenderShellGateSnapshot,
        listener: () => void,
        isEqual = Object.is,
        attributionLabel?: string
      ) =>
        mapRenderHostAuthority.subscribeSelector?.(
          selector,
          listener,
          isEqual,
          attributionLabel
        ) ?? mapRenderHostAuthority.subscribe(listener),
      [mapRenderHostAuthority]
    );

    useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => mapRenderHostAuthority.subscribe(listener),
        [mapRenderHostAuthority]
      ),
      subscribeSelector: subscribeShellGate,
      getSnapshot: mapRenderHostAuthority.getSnapshot,
      selector: selectSearchMapRenderShellGate,
      isEqual: areSearchMapRenderShellGateSnapshotsEqual,
      attributionOwner: 'SearchMapRenderSurface',
      attributionOperation: 'shellGateSelector',
    });

    const hostLayerRuntime = mapRenderHostAuthority.getSnapshot();

    return <SearchMapRenderHostLayers hostLayerRuntime={hostLayerRuntime} />;
  }
);
