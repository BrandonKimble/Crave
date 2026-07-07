import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';

type SearchRootSubmitUiResultsPresentationPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  'getIsProfilePresentationActive' | 'clearMapHighlightedRestaurantId' | 'onPageOneResultsCommitted'
>;

type UseSearchRootSubmitUiResultsPresentationPortsArgs = {
  resultsPresentationOwner: ResultsPresentationOwner;
  profileOwner: ProfileOwner;
};

export const useSearchRootSubmitUiResultsPresentationPorts = ({
  resultsPresentationOwner,
  profileOwner,
}: UseSearchRootSubmitUiResultsPresentationPortsArgs): SearchRootSubmitUiResultsPresentationPorts => {
  return React.useMemo(
    () => ({
      getIsProfilePresentationActive: () =>
        profileOwner.profileViewState.presentation.isPresentationActive,
      clearMapHighlightedRestaurantId: profileOwner.profileActions.clearMapHighlightedRestaurantId,
      onPageOneResultsCommitted: (payload) => {
        resultsPresentationOwner.handlePageOneResultsCommitted({
          surfaceTransactionMutationKind:
            payload.presentationIntentKind === 'search_this_area'
              ? 'search_this_area'
              : payload.presentationIntentKind === 'variant_rerun'
                ? 'variant_rerun'
                : undefined,
          expectedResultsDataKey: payload.resultsDataKey ?? payload.resultsIdentityKey,
          dataReadyFrom: payload.dataReadyFrom,
          searchInputKey: payload.searchInputKey,
        });
      },
    }),
    [
      profileOwner.profileActions.clearMapHighlightedRestaurantId,
      profileOwner.profileViewState.presentation.isPresentationActive,
      resultsPresentationOwner,
    ]
  );
};
