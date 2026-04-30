import React from 'react';

import type { RestaurantPanelSnapshotNativePayload } from './RestaurantPanelSnapshotNativeView';
import type { OverlayContentSpec } from './types';
import type {
  RestaurantRoutePanelContract,
  RestaurantRoutePanelHostConfig,
} from './restaurantRoutePanelContract';
import { useRestaurantOverlayPanelSurfaceRuntime } from './useRestaurantOverlayPanelSurfaceRuntime';
import { useRestaurantOverlaySheetConfigRuntime } from './useRestaurantOverlaySheetConfigRuntime';

type UseRestaurantRouteContentSpecRuntimeArgs = {
  panel: RestaurantRoutePanelContract | null;
  hostConfig: RestaurantRoutePanelHostConfig | null;
  navBarTop?: number;
  searchBarTop?: number;
};

export type RestaurantRouteContentSpecRuntime = {
  spec: OverlayContentSpec<unknown>;
};

const EMPTY_RESTAURANT_PANEL_SNAPSHOT_PAYLOAD: RestaurantPanelSnapshotNativePayload = {
  restaurantId: null,
  restaurantName: '',
  primaryAddress: '',
  shareMessage: null,
  restaurantScore: '',
  queryScoreLabel: '',
  queryScoreValue: '',
  priceLabel: '',
  hoursSummary: '',
  locationsLabel: '',
  websiteUrl: null,
  websiteSearchQuery: null,
  phoneNumber: null,
  phoneSearchQuery: null,
  isLoading: true,
  isFavorite: false,
  favoriteEnabled: false,
  showWebsiteAction: false,
  showCallAction: false,
  matchedTags: [],
  dishes: [],
};

export const useRestaurantRouteContentSpecRuntime = ({
  panel,
  hostConfig,
  navBarTop = 0,
  searchBarTop = 0,
}: UseRestaurantRouteContentSpecRuntimeArgs): RestaurantRouteContentSpecRuntime => {
  const sheetConfig = useRestaurantOverlaySheetConfigRuntime({
    ...(hostConfig ?? null),
    navBarTop,
    searchBarTop,
  });
  const surfaceModel = useRestaurantOverlayPanelSurfaceRuntime({
    snapshotPayload: panel?.snapshotPayload ?? EMPTY_RESTAURANT_PANEL_SNAPSHOT_PAYLOAD,
    shouldFreezeContent: hostConfig?.shouldFreezeContent,
    onRequestClose: panel?.onRequestClose ?? (() => undefined),
    onToggleFavorite: panel?.onToggleFavorite ?? (() => undefined),
  });

  const spec = React.useMemo<OverlayContentSpec<unknown>>(
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
      style: sheetConfig.style as never,
      onHidden: sheetConfig.onHidden,
      dismissThreshold: sheetConfig.dismissThreshold,
      preventSwipeDismiss: sheetConfig.preventSwipeDismiss,
      interactionEnabled: sheetConfig.interactionEnabled,
    }),
    [sheetConfig, surfaceModel]
  );

  return React.useMemo(
    () => ({
      spec,
    }),
    [spec]
  );
};
