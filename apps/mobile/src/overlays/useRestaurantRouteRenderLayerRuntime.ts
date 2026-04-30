import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import {
  createSearchAppOverlayRestaurantRenderLayerModel,
  type SearchAppOverlaySheetRenderLayerModel,
} from '../screens/Search/runtime/shared/search-app-shell-render-contract';
import type {
  RestaurantOverlayData,
  RestaurantRoutePanelContract,
  RestaurantRoutePanelDraft,
  RestaurantRoutePanelHostConfig,
} from './restaurantRoutePanelContract';
import type {
  RestaurantRouteHostPresentationState,
  RestaurantRouteHostSnapController,
} from './restaurantRouteHostContract';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';
import type { OverlayKey } from './types';
import { useRestaurantRouteContentSpecRuntime } from './useRestaurantRouteContentSpecRuntime';
import { useRestaurantRouteEntryRuntime } from './useRestaurantRouteEntryRuntime';
import { useRestaurantRoutePresentationModelRuntime } from './useRestaurantRoutePresentationModelRuntime';
import { useRestaurantRouteStateRuntime } from './useRestaurantRouteStateRuntime';

type RestaurantRouteRenderLayerSource =
  | {
      panelDraft: RestaurantRoutePanelDraft | null;
      data?: never;
      onToggleFavorite?: never;
    }
  | {
      panelDraft?: never;
      data: RestaurantOverlayData | null;
      onToggleFavorite: RestaurantRoutePanelContract['onToggleFavorite'];
    };

type UseRestaurantRouteRenderLayerRuntimeArgs = RestaurantRouteRenderLayerSource & {
  restaurantRouteSource: 'search' | 'global';
  onRequestClose: RestaurantRoutePanelContract['onRequestClose'];
  hostConfig: RestaurantRoutePanelHostConfig | null;
  isActive: boolean;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
  presentationState: RestaurantRouteHostPresentationState | null;
  snapController: RestaurantRouteHostSnapController | null;
  visible: boolean;
  navBarTop?: number;
  searchBarTop?: number;
  headerActionProgress?: SharedValue<number>;
  headerActionMode?: OverlayHeaderActionMode;
  navBarHeight?: number;
  applyNavBarCutout?: boolean;
  navBarCutoutProgress?: SharedValue<number>;
  navBarHiddenTranslateY?: number;
  navBarCutoutIsHiding?: boolean;
  layerKey: 'global-restaurant-sheet' | 'local-restaurant-sheet';
};

export const useRestaurantRouteRenderLayerRuntime = ({
  restaurantRouteSource,
  onRequestClose,
  hostConfig,
  isActive,
  onProfilerRender,
  activeOverlayRouteKey,
  rootOverlayKey,
  overlayRouteStackLength,
  presentationState,
  snapController,
  visible,
  navBarTop,
  searchBarTop,
  headerActionProgress,
  headerActionMode,
  navBarHeight,
  applyNavBarCutout,
  navBarCutoutProgress,
  navBarHiddenTranslateY,
  navBarCutoutIsHiding,
  layerKey,
  ...source
}: UseRestaurantRouteRenderLayerRuntimeArgs): SearchAppOverlaySheetRenderLayerModel | null => {
  const entryRuntime = useRestaurantRouteEntryRuntime({
    ...source,
    onRequestClose,
    hostConfig,
    isActive,
    onProfilerRender,
  });

  const stateRuntime = useRestaurantRouteStateRuntime({
    panel: entryRuntime.panel,
    hostConfig: entryRuntime.hostConfig,
    activeOverlayRouteKey,
    rootOverlayKey,
    overlayRouteStackLength,
    presentationState,
    snapController,
    visible,
    navBarTop,
    searchBarTop,
    headerActionProgress,
    headerActionMode,
    navBarHeight,
    navBarCutoutProgress,
    navBarHiddenTranslateY,
    navBarCutoutIsHiding,
  });

  const specRuntime = useRestaurantRouteContentSpecRuntime({
    panel: stateRuntime.panel,
    hostConfig: stateRuntime.hostConfig,
    navBarTop: stateRuntime.navBarTop,
    searchBarTop: stateRuntime.searchBarTop,
  });

  const presentationModel =
    useRestaurantRoutePresentationModelRuntime({
      spec: stateRuntime.panel == null ? null : specRuntime.spec,
      restaurantRouteSource,
      activeOverlayRouteKey: stateRuntime.activeOverlayRouteKey,
      rootOverlayKey: stateRuntime.rootOverlayKey,
      overlayRouteStackLength: stateRuntime.overlayRouteStackLength,
      presentationState: stateRuntime.presentationState,
      snapController: stateRuntime.snapController,
      headerActionProgress: stateRuntime.headerActionProgress,
      headerActionMode: stateRuntime.headerActionMode,
      navBarHeight: stateRuntime.navBarHeight,
      applyNavBarCutout,
      navBarCutoutProgress: stateRuntime.navBarCutoutProgress,
      navBarHiddenTranslateY: stateRuntime.navBarHiddenTranslateY,
      navBarCutoutIsHiding: stateRuntime.navBarCutoutIsHiding,
      visible: stateRuntime.visible,
    }).presentationModel;

  return React.useMemo(
    () =>
      createSearchAppOverlayRestaurantRenderLayerModel({
        presentationModel,
        layerKey,
        onProfilerRender: entryRuntime.onProfilerRender ?? undefined,
      }),
    [entryRuntime.onProfilerRender, layerKey, presentationModel]
  );
};
