import React from 'react';

import type { OverlayContentSpec } from './types';
import { useRestaurantPanelSpec } from './panels/RestaurantPanel';
import type { RestaurantHeaderLiveState } from './restaurant-header-live-state';
import type {
  RestaurantRoutePanelContract,
  RestaurantRoutePanelHostConfig,
} from './restaurantRoutePanelContract';

type UseRestaurantRouteContentSpecRuntimeArgs = {
  panel: RestaurantRoutePanelContract | null;
  hostConfig: RestaurantRoutePanelHostConfig | null;
  navBarTop?: number;
  searchBarTop?: number;
};

export type RestaurantRouteContentSpecRuntime = {
  spec: OverlayContentSpec<unknown> | null;
  // P3 persistent header: the SAME freeze-retained data + handlers the (now header-less) spec is
  // built from, exposed so RestaurantRouteSceneInputHost can publish the winning entry's header
  // inputs to the restaurant-header-live-state store for the hoisted persistent header.
  headerState: RestaurantHeaderLiveState | null;
};

export const useRestaurantRouteContentSpecRuntime = ({
  panel,
  hostConfig,
  navBarTop = 0,
  searchBarTop = 0,
}: UseRestaurantRouteContentSpecRuntimeArgs): RestaurantRouteContentSpecRuntime => {
  const visibleDataRef = React.useRef(panel?.data ?? null);
  const incomingRestaurantId = panel?.data?.restaurant.restaurantId ?? null;
  const visibleRestaurantId = visibleDataRef.current?.restaurant.restaurantId ?? null;

  if (
    !hostConfig?.shouldFreezeContent ||
    visibleDataRef.current == null ||
    (incomingRestaurantId != null && incomingRestaurantId !== visibleRestaurantId)
  ) {
    visibleDataRef.current = panel?.data ?? null;
  }

  const restaurantData = hostConfig?.shouldFreezeContent
    ? (visibleDataRef.current ?? panel?.data ?? null)
    : (panel?.data ?? null);
  const spec = useRestaurantPanelSpec({
    data: restaurantData,
    onDismiss: panel?.onRequestClose ?? (() => undefined),
    navBarTop,
    searchBarTop,
    interactionEnabled: hostConfig?.interactionEnabled,
    containerStyle: hostConfig?.containerStyle,
  });

  const headerState = React.useMemo<RestaurantHeaderLiveState | null>(
    () =>
      panel == null
        ? null
        : {
            data: restaurantData,
            onToggleFavorite: panel.onToggleFavorite,
            onRequestClose: panel.onRequestClose,
          },
    [panel, restaurantData]
  );

  return React.useMemo(
    () => ({
      spec: spec as OverlayContentSpec<unknown> | null,
      headerState,
    }),
    [headerState, spec]
  );
};
