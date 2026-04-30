import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type {
  RestaurantRouteHostPresentationState,
  RestaurantRouteHostSnapController,
  RestaurantRoutePanelContract,
  RestaurantRoutePanelHostConfig,
} from './restaurantRouteHostContract';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';
import type { OverlayKey } from './types';

type UseRestaurantRouteStateRuntimeArgs = {
  panel: RestaurantRoutePanelContract | null;
  hostConfig: RestaurantRoutePanelHostConfig | null;
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
  navBarCutoutProgress?: SharedValue<number>;
  navBarHiddenTranslateY?: number;
  navBarCutoutIsHiding?: boolean;
};

export type RestaurantRouteStateRuntime = {
  panel: RestaurantRoutePanelContract | null;
  hostConfig: RestaurantRoutePanelHostConfig | null;
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
  presentationState: RestaurantRouteHostPresentationState | null;
  snapController: RestaurantRouteHostSnapController | null;
  visible: boolean;
  navBarTop: number;
  searchBarTop: number;
  headerActionProgress?: SharedValue<number>;
  headerActionMode: OverlayHeaderActionMode;
  navBarHeight: number;
  navBarCutoutProgress?: SharedValue<number>;
  navBarHiddenTranslateY: number;
  navBarCutoutIsHiding: boolean;
};

export const useRestaurantRouteStateRuntime = ({
  panel,
  hostConfig,
  activeOverlayRouteKey,
  rootOverlayKey,
  overlayRouteStackLength,
  presentationState,
  snapController,
  visible,
  navBarTop = 0,
  searchBarTop = 0,
  headerActionProgress,
  headerActionMode = 'fixed-close',
  navBarHeight = 0,
  navBarCutoutProgress,
  navBarHiddenTranslateY = 0,
  navBarCutoutIsHiding = false,
}: UseRestaurantRouteStateRuntimeArgs): RestaurantRouteStateRuntime =>
  React.useMemo(
    () => ({
      panel,
      hostConfig,
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
    }),
    [
      activeOverlayRouteKey,
      headerActionMode,
      headerActionProgress,
      hostConfig,
      navBarCutoutIsHiding,
      navBarCutoutProgress,
      navBarHeight,
      navBarHiddenTranslateY,
      navBarTop,
      overlayRouteStackLength,
      panel,
      presentationState,
      rootOverlayKey,
      searchBarTop,
      snapController,
      visible,
    ]
  );
