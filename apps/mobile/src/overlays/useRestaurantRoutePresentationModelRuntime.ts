import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type {
  RestaurantRouteHostPresentationState,
  RestaurantRouteHostSnapController,
  RestaurantRouteLayerPresentationModel,
} from './restaurantRouteHostContract';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';
import type { OverlayContentSpec, OverlayKey } from './types';

type UseRestaurantRoutePresentationModelRuntimeArgs = {
  restaurantRouteSource: 'search' | 'global';
  spec: OverlayContentSpec<unknown> | null;
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
  presentationState: RestaurantRouteHostPresentationState | null;
  snapController: RestaurantRouteHostSnapController | null;
  headerActionProgress?: SharedValue<number>;
  headerActionMode?: OverlayHeaderActionMode;
  navBarHeight?: number;
  applyNavBarCutout?: boolean;
  navBarCutoutProgress?: SharedValue<number>;
  navBarHiddenTranslateY?: number;
  navBarCutoutIsHiding?: boolean;
  visible: boolean;
};

export type RestaurantRoutePresentationModelRuntime = {
  presentationModel: RestaurantRouteLayerPresentationModel | null;
};

export const useRestaurantRoutePresentationModelRuntime = ({
  restaurantRouteSource,
  spec,
  activeOverlayRouteKey,
  rootOverlayKey,
  overlayRouteStackLength,
  presentationState,
  snapController,
  headerActionProgress,
  headerActionMode = 'fixed-close',
  navBarHeight = 0,
  applyNavBarCutout = false,
  navBarCutoutProgress,
  navBarHiddenTranslateY = 0,
  navBarCutoutIsHiding = false,
  visible,
}: UseRestaurantRoutePresentationModelRuntimeArgs): RestaurantRoutePresentationModelRuntime => {
  const presentationModel = React.useMemo(
    () =>
      presentationState == null || snapController == null || spec == null
        ? null
        : {
            restaurantRouteSource,
            visible,
            spec,
            activeOverlayRouteKey,
            rootOverlayKey,
            overlayRouteStackLength,
            presentationState,
            snapController,
            headerActionProgress,
            headerActionMode,
            navBarHeight,
            applyNavBarCutout,
            navBarCutoutProgress,
            navBarHiddenTranslateY,
            navBarCutoutIsHiding,
          },
    [
      activeOverlayRouteKey,
      applyNavBarCutout,
      headerActionMode,
      headerActionProgress,
      navBarCutoutIsHiding,
      navBarCutoutProgress,
      navBarHeight,
      navBarHiddenTranslateY,
      overlayRouteStackLength,
      presentationState,
      restaurantRouteSource,
      rootOverlayKey,
      snapController,
      spec,
      visible,
    ]
  );

  return React.useMemo(
    () => ({
      presentationModel,
    }),
    [presentationModel]
  );
};
