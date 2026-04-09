import React from 'react';

import OverlaySheetShell from './OverlaySheetShell';
import type { RestaurantRouteHostModel } from './restaurantRouteHostContract';
import { useResolvedRestaurantRouteHostModel } from './useResolvedRestaurantRouteHostModel';
import { useRestaurantOverlayPanelSurfaceRuntime } from './useRestaurantOverlayPanelSurfaceRuntime';
import { useRestaurantOverlaySheetConfigRuntime } from './useRestaurantOverlaySheetConfigRuntime';

const ResolvedRestaurantRouteLayerHost = ({
  hostModel,
}: {
  hostModel: RestaurantRouteHostModel;
}) => {
  const {
    panel,
    hostState: {
      hostConfig,
      navBarTop,
      searchBarTop,
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
  } = hostModel;

  const sheetConfig = useRestaurantOverlaySheetConfigRuntime({
    ...(hostConfig ?? null),
    navBarTop,
    searchBarTop,
  });
  const surfaceModel = useRestaurantOverlayPanelSurfaceRuntime({
    snapshotPayload: panel.snapshotPayload,
    shouldFreezeContent: hostConfig?.shouldFreezeContent,
    onRequestClose: panel.onRequestClose,
    onToggleFavorite: panel.onToggleFavorite,
  });
  const overlaySheetSpec = React.useMemo(
    () => ({
      overlayKey: 'restaurant' as const,
      surfaceKind: 'content' as const,
      snapPersistenceKey: null,
      snapPoints: sheetConfig.snapPoints,
      initialSnapPoint: sheetConfig.initialSnapPoint,
      animateOnMount: sheetConfig.animateOnMount,
      contentComponent: surfaceModel.contentComponent,
      contentContainerStyle: surfaceModel.contentContainerStyle,
      backgroundComponent: surfaceModel.backgroundComponent,
      style: sheetConfig.style,
      onHidden: sheetConfig.onHidden,
      dismissThreshold: sheetConfig.dismissThreshold,
      preventSwipeDismiss: sheetConfig.preventSwipeDismiss,
      interactionEnabled: sheetConfig.interactionEnabled,
    }),
    [sheetConfig, surfaceModel]
  );

  return (
    <OverlaySheetShell
      visible
      spec={overlaySheetSpec}
      sheetY={presentationState.sheetY}
      scrollOffset={presentationState.scrollOffset}
      momentumFlag={presentationState.momentumFlag}
      headerActionProgress={headerActionProgress}
      headerActionMode={headerActionMode}
      navBarHeight={navBarHeight}
      applyNavBarCutout={applyNavBarCutout}
      navBarCutoutProgress={navBarCutoutProgress}
      navBarHiddenTranslateY={navBarHiddenTranslateY}
      navBarCutoutIsHiding={navBarCutoutIsHiding}
      runtimeModel={{
        presentationState,
        snapController,
      }}
    />
  );
};

const RestaurantRouteLayerHost = () => {
  const restaurantRouteHostModel = useResolvedRestaurantRouteHostModel();

  if (!restaurantRouteHostModel) {
    return null;
  }

  return <ResolvedRestaurantRouteLayerHost hostModel={restaurantRouteHostModel} />;
};

export default React.memo(RestaurantRouteLayerHost);
