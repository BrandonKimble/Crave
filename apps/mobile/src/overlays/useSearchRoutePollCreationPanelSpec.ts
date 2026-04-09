import type {
  SearchRouteOverlayCommandActions,
  SearchRouteOverlayCommandState,
} from './searchRouteOverlayCommandRuntimeContract';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import { usePollCreationPanelSpec } from './panels/PollCreationPanel';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from './searchResolvedRouteHostModelContract';
import { appOverlayRouteController } from './useAppOverlayRouteController';
import type { OverlayContentSpec } from './types';
import type { OverlaySheetSnap, OverlaySheetSnapRequest } from './types';

type PollCreationPanelParams = Parameters<typeof usePollCreationPanelSpec>[0];

type UseSearchRoutePollCreationPanelSpecArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  pollCreationCoverageKey: PollCreationPanelParams['coverageKey'];
  pollCreationCoverageName: PollCreationPanelParams['coverageName'];
  shouldShowPollCreationPanel: boolean;
  commandState: SearchRouteOverlayCommandState;
  commandActions: SearchRouteOverlayCommandActions;
};

const buildShellSnapRequest = (
  snap: OverlaySheetSnap | null | undefined
): OverlaySheetSnapRequest | null => (snap ? { snap, token: null } : null);

export const useSearchRoutePollCreationPanelSpec = ({
  publishedVisualState,
  pollCreationCoverageKey,
  pollCreationCoverageName,
  shouldShowPollCreationPanel,
  commandState,
  commandActions,
}: UseSearchRoutePollCreationPanelSpecArgs): OverlayContentSpec<unknown> | null => {
  const visualState = publishedVisualState ?? EMPTY_SEARCH_ROUTE_VISUAL_STATE;
  const { pollCreationSnapRequest } = commandState;
  const { setPollCreationSnapRequest, setPollsSheetSnap } = commandActions;

  const pollCreationPanelSpec = usePollCreationPanelSpec({
    visible: shouldShowPollCreationPanel,
    coverageKey: pollCreationCoverageKey,
    coverageName: pollCreationCoverageName,
    searchBarTop: visualState.searchBarTop,
    snapPoints: visualState.snapPoints,
    shellSnapRequest: buildShellSnapRequest(pollCreationSnapRequest),
    onClose: () => {
      setPollCreationSnapRequest(null);
      appOverlayRouteController.closeActiveRoute();
    },
    onCreated: (poll) => {
      setPollCreationSnapRequest(null);
      appOverlayRouteController.updateRoute('polls', {
        pollId: poll.pollId,
        coverageKey: poll.coverageKey ?? pollCreationCoverageKey ?? null,
      });
      appOverlayRouteController.closeActiveRoute();
    },
    onSnapChange: (snap) => {
      setPollsSheetSnap(snap);
      if (pollCreationSnapRequest && pollCreationSnapRequest === snap) {
        setPollCreationSnapRequest(null);
      }
    },
  });

  return pollCreationPanelSpec;
};
