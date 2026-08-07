import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';

// F5701 — this hook used to build `getIsProfilePresentationActive` and
// `clearMapHighlightedRestaurantId` too, and depended on
// `profileOwner.profileViewState.presentation.isPresentationActive` to keep the first
// fresh. Neither had a reader: the submit owner never destructured them. That dependency
// was the head of a four-link memo chain (resultsPresentationPorts -> presentationUiPorts
// -> uiPortsBase -> uiPorts), so every profile-presentation flip re-minted the whole
// uiPorts object for an output that never changed. With them gone the hook needs no
// profileOwner at all.
type SearchRootSubmitUiResultsPresentationPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  'onPageOneResultsCommitted'
>;

type UseSearchRootSubmitUiResultsPresentationPortsArgs = {
  resultsPresentationOwner: ResultsPresentationOwner;
};

export const useSearchRootSubmitUiResultsPresentationPorts = ({
  resultsPresentationOwner,
}: UseSearchRootSubmitUiResultsPresentationPortsArgs): SearchRootSubmitUiResultsPresentationPorts => {
  return React.useMemo(
    () => ({
      onPageOneResultsCommitted: (payload) => {
        resultsPresentationOwner.handlePageOneResultsCommitted({
          operationToken: payload.operationToken,
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
    [resultsPresentationOwner]
  );
};
