import { usePollCreationPanelSpec } from './panels/PollCreationPanel';
import type { SearchRouteSceneLayoutState } from './searchRouteSceneLayoutContract';
import type { AppRouteSceneRuntime } from '../navigation/runtime/app-route-scene-runtime';
import type { SearchRoutePublishedSceneParts } from './searchOverlayRouteHostContract';

type PollCreationPanelParams = Parameters<typeof usePollCreationPanelSpec>[0];

type UseSearchRoutePollCreationPanelSpecArgs = {
  routeSceneRuntime: AppRouteSceneRuntime;
  sceneLayout: SearchRouteSceneLayoutState;
  pollCreationPlaceName: PollCreationPanelParams['placeName'];
  pollCreationBounds: PollCreationPanelParams['bounds'];
  shouldShowPollCreationPanel: boolean;
};

export const useSearchRoutePollCreationPanelSpec = ({
  routeSceneRuntime,
  sceneLayout,
  pollCreationPlaceName,
  pollCreationBounds,
  shouldShowPollCreationPanel,
}: UseSearchRoutePollCreationPanelSpecArgs): SearchRoutePublishedSceneParts | null => {
  const pollCreationPublishedSceneParts = usePollCreationPanelSpec({
    visible: shouldShowPollCreationPanel,
    placeName: pollCreationPlaceName,
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
        },
        snap: 'expanded',
      });
      routeSceneRuntime.routeOverlayRouteCommandRuntime.closeActiveRoute();
    },
  });

  return pollCreationPublishedSceneParts;
};
