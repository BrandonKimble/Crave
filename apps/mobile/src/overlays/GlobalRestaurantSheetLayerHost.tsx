import React from 'react';

import RestaurantRouteSheetSurface from './RestaurantRouteSheetSurface';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useBottomSheetProgrammaticRuntimeModel } from './useBottomSheetRuntime';
import { useRestaurantRouteSheetMotionTargetRegistration } from './useRestaurantRouteSheetMotionTargetRegistration';
import { useRestaurantRouteRenderLayerRuntime } from './useRestaurantRouteRenderLayerRuntime';
import type { SearchOverlayGlobalRestaurantHostAuthority } from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import type { RouteGlobalRestaurantOverlaySnapshot } from '../navigation/runtime/route-global-restaurant-overlay-snapshot-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';

type GlobalRestaurantSheetLayerHostProps = {
  overlayGlobalRestaurantHostAuthority: SearchOverlayGlobalRestaurantHostAuthority;
};

const GlobalRestaurantSheetLayerHost = ({
  overlayGlobalRestaurantHostAuthority,
}: GlobalRestaurantSheetLayerHostProps) => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const closeRuntime = React.useMemo(
    () => routeSceneRuntime.routeGlobalRestaurantRouteActions,
    [routeSceneRuntime.routeGlobalRestaurantRouteActions]
  );
  const restaurantSnapshot = useRouteAuthoritySelector<
    RouteGlobalRestaurantOverlaySnapshot,
    RouteGlobalRestaurantOverlaySnapshot
  >({
    subscribe: React.useCallback(
      (listener: () => void) => overlayGlobalRestaurantHostAuthority.subscribe(listener),
      [overlayGlobalRestaurantHostAuthority]
    ),
    getSnapshot: overlayGlobalRestaurantHostAuthority.getSnapshot,
    selector: React.useCallback((snapshot) => snapshot, []),
    attributionOwner: 'GlobalRestaurantSheetLayerHost',
    attributionOperation: 'restaurantSnapshotSelector',
  });
  const presentationDraft = restaurantSnapshot.presentationDraft;
  const publishedGlobalRestaurantSessionToken = presentationDraft?.sessionToken ?? null;
  const globalRestaurantProgrammaticRuntime = useBottomSheetProgrammaticRuntimeModel({
    onProgrammaticHidden: () => {
      closeRuntime.closeRestaurantRoute(presentationDraft?.sessionToken ?? null);
    },
  });
  useRestaurantRouteSheetMotionTargetRegistration({
    enabled: presentationDraft != null,
    source: 'global',
    snapController: globalRestaurantProgrammaticRuntime.snapController,
  });
  const globalRestaurantLayer = useRestaurantRouteRenderLayerRuntime({
    restaurantRouteSource: 'global',
    panelDraft: presentationDraft?.panelDraft ?? null,
    onRequestClose: () => {
      if (presentationDraft == null) {
        return;
      }
      const currentSessionToken = closeRuntime.getActiveRestaurantRouteSessionToken();
      if (currentSessionToken !== presentationDraft.sessionToken) {
        return;
      }
      closeRuntime.closeRestaurantRoute(presentationDraft.sessionToken);
    },
    hostConfig: null,
    isActive: true,
    onProfilerRender: null,
    activeOverlayRouteKey: restaurantSnapshot.activeOverlayRouteKey,
    rootOverlayKey: restaurantSnapshot.rootOverlayKey,
    overlayRouteStackLength: restaurantSnapshot.overlayRouteStackLength,
    presentationState:
      presentationDraft == null ? null : globalRestaurantProgrammaticRuntime.presentationState,
    snapController:
      presentationDraft == null ? null : globalRestaurantProgrammaticRuntime.snapController,
    visible: true,
    layerKey: 'global-restaurant-sheet',
  });

  const sheetLayer =
    publishedGlobalRestaurantSessionToken != null &&
    restaurantSnapshot.activeSessionToken === publishedGlobalRestaurantSessionToken
      ? globalRestaurantLayer?.sheetLayer ?? null
      : null;
  if (!sheetLayer) {
    return null;
  }

  const renderedSheet = (
    <React.Profiler id="AppOverlayRouteHost" onRender={sheetLayer.onProfilerRender}>
      <RestaurantRouteSheetSurface presentationModel={sheetLayer.presentationModel} />
    </React.Profiler>
  );

  return sheetLayer.wrapRenderedSheet(renderedSheet);
};

export default React.memo(GlobalRestaurantSheetLayerHost);
