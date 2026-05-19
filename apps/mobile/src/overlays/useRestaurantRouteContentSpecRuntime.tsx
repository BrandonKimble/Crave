import React from 'react';

import type { OverlayContentSpec } from './types';
import { useRestaurantPanelSpec } from './panels/RestaurantPanel';
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
    ? visibleDataRef.current ?? panel?.data ?? null
    : panel?.data ?? null;
  const spec = useRestaurantPanelSpec({
    data: restaurantData,
    onDismiss: panel?.onRequestClose ?? (() => undefined),
    onRequestClose: panel?.onRequestClose ?? (() => undefined),
    onToggleFavorite: panel?.onToggleFavorite ?? (() => undefined),
    navBarTop,
    searchBarTop,
    interactionEnabled: hostConfig?.interactionEnabled,
    containerStyle: hostConfig?.containerStyle,
  });

  return React.useMemo(
    () => ({
      spec: spec as OverlayContentSpec<unknown> | null,
    }),
    [spec]
  );
};
