import type {
  SearchRouteOverlayCommandActions,
  SearchRouteOverlayCommandState,
} from './searchRouteOverlayCommandRuntimeContract';
import {
  coerceSearchRouteSceneDefinition,
  type SearchRouteSceneDefinition,
} from './searchOverlayRouteHostContract';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import { usePollCreationPanelSpec } from './panels/PollCreationPanel';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from './searchResolvedRouteHostModelContract';
import { openSearchRoutePollsHome } from './searchRouteOverlayCommandStore';
import { appOverlayRouteController } from './useAppOverlayRouteController';
import type { OverlaySheetSnap, OverlaySheetSnapRequest } from './types';

type PollCreationPanelParams = Parameters<typeof usePollCreationPanelSpec>[0];

type UseSearchRoutePollCreationPanelSpecArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  pollCreationMarketKey: PollCreationPanelParams['marketKey'];
  pollCreationMarketName: PollCreationPanelParams['marketName'];
  pollCreationBounds: PollCreationPanelParams['bounds'];
  shouldShowPollCreationPanel: boolean;
  pollCreationSnapRequest: SearchRouteOverlayCommandState['pollCreationSnapRequest'];
  setPollCreationSnapRequest: SearchRouteOverlayCommandActions['setPollCreationSnapRequest'];
  setPollsSheetSnap: SearchRouteOverlayCommandActions['setPollsSheetSnap'];
};

const buildShellSnapRequest = (
  snap: OverlaySheetSnap | null | undefined
): OverlaySheetSnapRequest | null => (snap ? { snap, token: null } : null);

export const useSearchRoutePollCreationPanelSpec = ({
  publishedVisualState,
  pollCreationMarketKey,
  pollCreationMarketName,
  pollCreationBounds,
  shouldShowPollCreationPanel,
  pollCreationSnapRequest,
  setPollCreationSnapRequest,
  setPollsSheetSnap,
}: UseSearchRoutePollCreationPanelSpecArgs): SearchRouteSceneDefinition | null => {
  const visualState = publishedVisualState ?? EMPTY_SEARCH_ROUTE_VISUAL_STATE;

  const pollCreationPanelSpec = usePollCreationPanelSpec({
    visible: shouldShowPollCreationPanel,
    marketKey: pollCreationMarketKey,
    marketName: pollCreationMarketName,
    bounds: pollCreationBounds,
    searchBarTop: visualState.searchBarTop,
    snapPoints: visualState.snapPoints,
    shellSnapRequest: buildShellSnapRequest(pollCreationSnapRequest),
    onClose: () => {
      setPollCreationSnapRequest(null);
      appOverlayRouteController.closeActiveRoute();
    },
    onCreated: (poll) => {
      setPollCreationSnapRequest(null);
      openSearchRoutePollsHome({
        params: {
          pollId: poll.pollId,
          marketKey: poll.marketKey ?? pollCreationMarketKey ?? null,
          marketName: poll.marketName ?? pollCreationMarketName ?? null,
          pinnedMarket: true,
        },
        snap: 'expanded',
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

  return coerceSearchRouteSceneDefinition(pollCreationPanelSpec);
};
