import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';

type SearchRootSubmitUiResultsPresentationPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  | 'getIsProfilePresentationActive'
  | 'clearMapHighlightedRestaurantId'
  | 'onPageOneResultsCommitted'
  | 'onShortcutSearchCoverageSnapshot'
>;

type UseSearchRootSubmitUiResultsPresentationPortsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  resultsPresentationOwner: ResultsPresentationOwner;
  profileOwner: ProfileOwner;
};

export const useSearchRootSubmitUiResultsPresentationPorts = ({
  stateFoundationLane,
  resultsPresentationOwner,
  profileOwner,
}: UseSearchRootSubmitUiResultsPresentationPortsArgs): SearchRootSubmitUiResultsPresentationPorts => {
  const { sessionPrimitivesLane } = stateFoundationLane;

  return React.useMemo(
    () => ({
      getIsProfilePresentationActive: () =>
        profileOwner.profileViewState.presentation.isPresentationActive,
      clearMapHighlightedRestaurantId: profileOwner.profileActions.clearMapHighlightedRestaurantId,
      onPageOneResultsCommitted: (payload) => {
        resultsPresentationOwner.handlePageOneResultsCommitted({
          surfaceTransactionMutationKind:
            payload.presentationIntentKind === 'search_this_area' ? 'search_this_area' : undefined,
          expectedResultsDataKey: payload.resultsDataKey ?? payload.resultsHydrationKey,
          dataReadyFrom: payload.dataReadyFrom,
          searchInputKey: payload.searchInputKey,
        });
      },
      onShortcutSearchCoverageSnapshot:
        sessionPrimitivesLane.primitives.handleShortcutSearchCoverageSnapshot,
    }),
    [
      profileOwner.profileActions.clearMapHighlightedRestaurantId,
      profileOwner.profileViewState.presentation.isPresentationActive,
      resultsPresentationOwner,
      sessionPrimitivesLane.primitives.handleShortcutSearchCoverageSnapshot,
    ]
  );
};
