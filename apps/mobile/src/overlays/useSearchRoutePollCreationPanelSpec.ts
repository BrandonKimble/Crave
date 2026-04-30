import React from 'react';

import { createSearchRouteSceneShellSnapRequest } from './searchRouteSceneShellMotionContract';
import { usePollCreationPanelSpec } from './panels/PollCreationPanel';
import type { SearchRouteSceneLayoutState } from './searchRouteSceneLayoutContract';
import type { AppRouteSheetSnapSessionActions } from '../navigation/runtime/app-route-sheet-snap-session-runtime';
import type { AppRouteSceneRuntime } from '../navigation/runtime/app-route-scene-runtime';
import type { SearchRoutePublishedSceneParts } from './searchOverlayRouteHostContract';
import type { OverlaySheetSnap } from './types';

type PollCreationPanelParams = Parameters<typeof usePollCreationPanelSpec>[0];

type UseSearchRoutePollCreationPanelSpecArgs = {
  routeSceneRuntime: AppRouteSceneRuntime;
  sceneLayout: SearchRouteSceneLayoutState;
  pollCreationMarketKey: PollCreationPanelParams['marketKey'];
  pollCreationMarketName: PollCreationPanelParams['marketName'];
  pollCreationBounds: PollCreationPanelParams['bounds'];
  shouldShowPollCreationPanel: boolean;
  pollCreationSnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
  setPollCreationSnapRequest: AppRouteSheetSnapSessionActions['setPollCreationSnapRequest'];
};

export const useSearchRoutePollCreationPanelSpec = ({
  routeSceneRuntime,
  sceneLayout,
  pollCreationMarketKey,
  pollCreationMarketName,
  pollCreationBounds,
  shouldShowPollCreationPanel,
  pollCreationSnapRequest,
  setPollCreationSnapRequest,
}: UseSearchRoutePollCreationPanelSpecArgs): SearchRoutePublishedSceneParts | null => {
  const pollCreationSheetMotionRequest = React.useMemo(
    () => createSearchRouteSceneShellSnapRequest(pollCreationSnapRequest),
    [pollCreationSnapRequest]
  );
  React.useEffect(() => {
    routeSceneRuntime.routeSceneMotionRuntime.requestLocalSheetMotion(
      'pollCreation',
      shouldShowPollCreationPanel ? pollCreationSheetMotionRequest : null
    );
  }, [
    pollCreationSheetMotionRequest,
    routeSceneRuntime.routeSceneMotionRuntime,
    shouldShowPollCreationPanel,
  ]);
  React.useEffect(
    () => () => {
      routeSceneRuntime.routeSceneMotionRuntime.requestLocalSheetMotion('pollCreation', null);
    },
    [routeSceneRuntime.routeSceneMotionRuntime]
  );

  const pollCreationPublishedSceneParts = usePollCreationPanelSpec({
    visible: shouldShowPollCreationPanel,
    marketKey: pollCreationMarketKey,
    marketName: pollCreationMarketName,
    bounds: pollCreationBounds,
    searchBarTop: sceneLayout.searchBarTop,
    snapPoints: sceneLayout.snapPoints,
    onClose: () => {
      setPollCreationSnapRequest(null);
      routeSceneRuntime.routeOverlayRouteCommandRuntime.closeActiveRoute();
    },
    onCreated: (poll) => {
      setPollCreationSnapRequest(null);
      routeSceneRuntime.routeSearchCommandActions.openAppSearchRoutePollsHome({
        params: {
          pollId: poll.pollId,
          marketKey: poll.marketKey ?? pollCreationMarketKey ?? null,
          marketName: poll.marketName ?? pollCreationMarketName ?? null,
          pinnedMarket: true,
        },
        snap: 'expanded',
      });
      routeSceneRuntime.routeOverlayRouteCommandRuntime.closeActiveRoute();
    },
    onSnapChange: (snap) => {
      routeSceneRuntime.routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
        sceneKey: 'polls',
        snap,
      });
      if (pollCreationSnapRequest && pollCreationSnapRequest === snap) {
        setPollCreationSnapRequest(null);
      }
    },
  });

  return pollCreationPublishedSceneParts;
};
