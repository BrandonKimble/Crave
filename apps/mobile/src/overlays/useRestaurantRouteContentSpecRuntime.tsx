import React from 'react';

import type { OverlayContentSpec } from './types';
import { useRestaurantPanelSpec } from './panels/RestaurantPanel';
import type { RestaurantHeaderLiveState } from './restaurant-header-live-state';
import type {
  RestaurantRoutePanelContract,
  RestaurantRoutePanelHostConfig,
} from './restaurantRoutePanelContract';

type UseRestaurantRouteContentSpecRuntimeArgs = {
  // F7801: `panel` is non-null now that the entry runtime narrowed it — its absence is
  // carried inside `panel.data` (nullable), not by a null panel. The off-switch is the
  // host's own `shouldUseSearchRestaurant` ternary over the scene descriptor's spec.
  panel: RestaurantRoutePanelContract;
  hostConfig: RestaurantRoutePanelHostConfig | null;
  navBarTop?: number;
  searchBarTop?: number;
};

export type RestaurantRouteContentSpecRuntime = {
  spec: OverlayContentSpec<unknown> | null;
  // P3 persistent header: the SAME freeze-retained data + handlers the (now header-less) spec is
  // built from, exposed so RestaurantRouteSceneInputHost can publish the winning entry's header
  // inputs to the restaurant-header-live-state store for the hoisted persistent header. F7801:
  // always present — the host nulls it for the off state via `shouldUseSearchRestaurant`.
  headerState: RestaurantHeaderLiveState;
};

export const useRestaurantRouteContentSpecRuntime = ({
  panel,
  hostConfig,
  navBarTop = 0,
  searchBarTop = 0,
}: UseRestaurantRouteContentSpecRuntimeArgs): RestaurantRouteContentSpecRuntime => {
  const visibleDataRef = React.useRef(panel.data);
  const incomingRestaurantId = panel.data?.restaurant.placeId ?? null;
  const visibleRestaurantId = visibleDataRef.current?.restaurant.placeId ?? null;

  if (
    !hostConfig?.shouldFreezeContent ||
    visibleDataRef.current == null ||
    (incomingRestaurantId != null && incomingRestaurantId !== visibleRestaurantId)
  ) {
    visibleDataRef.current = panel.data;
  }

  const restaurantData = hostConfig?.shouldFreezeContent
    ? (visibleDataRef.current ?? panel.data)
    : panel.data;
  const spec = useRestaurantPanelSpec({
    data: restaurantData,
    onDismiss: panel.onRequestClose,
    navBarTop,
    searchBarTop,
    interactionEnabled: hostConfig?.interactionEnabled,
    containerStyle: hostConfig?.containerStyle,
  });

  const headerState = React.useMemo<RestaurantHeaderLiveState>(
    () => ({
      data: restaurantData,
      onRequestClose: panel.onRequestClose,
    }),
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
