import { usePollDetailPanelSpec } from './panels/PollDetailPanel';
import type { SearchRouteSceneLayoutState } from './searchRouteSceneLayoutContract';
import type { AppRouteSceneRuntime } from '../navigation/runtime/app-route-scene-runtime';
import type { SearchRoutePublishedSceneParts } from './searchOverlayRouteHostContract';
import type { Poll } from '../services/polls';

type UseSearchRoutePollDetailPanelSpecArgs = {
  routeSceneRuntime: AppRouteSceneRuntime;
  sceneLayout: SearchRouteSceneLayoutState;
  pollDetailPollId: string | null;
  pollDetailPoll: Poll | null;
  pollDetailCommentAnchorId: string | null;
  shouldShowPollDetailPanel: boolean;
};

export const useSearchRoutePollDetailPanelSpec = ({
  routeSceneRuntime,
  sceneLayout,
  pollDetailPollId,
  pollDetailPoll,
  pollDetailCommentAnchorId,
  shouldShowPollDetailPanel,
}: UseSearchRoutePollDetailPanelSpecArgs): SearchRoutePublishedSceneParts | null =>
  usePollDetailPanelSpec({
    visible: shouldShowPollDetailPanel,
    pollId: pollDetailPollId,
    poll: pollDetailPoll,
    commentAnchorId: pollDetailCommentAnchorId,
    searchBarTop: sceneLayout.searchBarTop,
    snapPoints: sceneLayout.snapPoints,
    onClose: () => {
      routeSceneRuntime.routeOverlayRouteCommandRuntime.closeActiveRoute();
    },
  });
