import { usePollCreationPanelSpec } from './panels/PollCreationPanel';
import type { SearchRouteSceneLayoutState } from './searchRouteSceneLayoutContract';
import type { AppRouteSceneRuntime } from '../navigation/runtime/app-route-scene-runtime';
import type { SearchRoutePublishedSceneParts } from './searchOverlayRouteHostContract';

type PollCreationPanelParams = Parameters<typeof usePollCreationPanelSpec>[0];

type UseSearchRoutePollCreationPanelSpecArgs = {
  routeSceneRuntime: AppRouteSceneRuntime;
  sceneLayout: SearchRouteSceneLayoutState;
  pollCreationMarketKey: PollCreationPanelParams['marketKey'];
  pollCreationMarketName: PollCreationPanelParams['marketName'];
  pollCreationBounds: PollCreationPanelParams['bounds'];
  shouldShowPollCreationPanel: boolean;
};

export const useSearchRoutePollCreationPanelSpec = ({
  routeSceneRuntime,
  sceneLayout,
  pollCreationMarketKey,
  pollCreationMarketName,
  pollCreationBounds,
  shouldShowPollCreationPanel,
}: UseSearchRoutePollCreationPanelSpecArgs): SearchRoutePublishedSceneParts | null => {
  const pollCreationPublishedSceneParts = usePollCreationPanelSpec({
    visible: shouldShowPollCreationPanel,
    marketKey: pollCreationMarketKey,
    marketName: pollCreationMarketName,
    bounds: pollCreationBounds,
    searchBarTop: sceneLayout.searchBarTop,
    snapPoints: sceneLayout.snapPoints,
    onClose: () => {
      routeSceneRuntime.routeOverlayRouteCommandRuntime.closeActiveRoute();
    },
    onCreated: (poll) => {
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
  });

  return pollCreationPublishedSceneParts;
};
