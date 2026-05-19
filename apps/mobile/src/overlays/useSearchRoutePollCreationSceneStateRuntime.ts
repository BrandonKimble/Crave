import React from 'react';

import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';

type UseSearchRoutePollCreationSceneStateRuntimeArgs = {
  activeOverlayRoute: OverlayRouteEntry;
};

export type SearchRoutePollCreationSceneStateRuntime = {
  pollCreationBounds:
    | NonNullable<OverlayRouteEntry<'pollCreation'>['params']>['bounds']
    | null;
  pollCreationMarketKey: string | null;
  pollCreationMarketName: string | null;
  shouldShowPollCreationPanel: boolean;
};

const isPollCreationRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'pollCreation'> => {
  if (route.key !== 'pollCreation') {
    return false;
  }
  const params = route.params as OverlayRouteEntry<'pollCreation'>['params'];
  return params?.parentSceneKey === 'polls' && params?.ownerSceneKey === 'polls';
};

export const useSearchRoutePollCreationSceneStateRuntime = ({
  activeOverlayRoute,
}: UseSearchRoutePollCreationSceneStateRuntimeArgs): SearchRoutePollCreationSceneStateRuntime =>
  React.useMemo(() => {
    const activePollCreationRoute = isPollCreationRouteEntry(activeOverlayRoute)
      ? activeOverlayRoute
      : null;
    const shouldShowPollCreationPanel = activePollCreationRoute != null;

    return {
      pollCreationMarketKey: shouldShowPollCreationPanel
        ? (activePollCreationRoute.params?.marketKey ?? null)
        : null,
      pollCreationMarketName: shouldShowPollCreationPanel
        ? (activePollCreationRoute.params?.marketName ?? null)
        : null,
      pollCreationBounds: shouldShowPollCreationPanel
        ? (activePollCreationRoute.params?.bounds ?? null)
        : null,
      shouldShowPollCreationPanel,
    };
  }, [activeOverlayRoute]);
