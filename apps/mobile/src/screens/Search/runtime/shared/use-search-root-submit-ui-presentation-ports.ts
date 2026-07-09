import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { useSearchRootSubmitUiPresentationIntentPorts } from './use-search-root-submit-ui-presentation-intent-ports';
import { useSearchRootSubmitUiResultsPresentationPorts } from './use-search-root-submit-ui-results-presentation-ports';

type SearchRootSubmitUiPresentationPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  | 'getIsProfilePresentationActive'
  | 'clearMapHighlightedRestaurantId'
  | 'onPageOneResultsCommitted'
  | 'onShortcutSearchCoverageSnapshot'
  | 'onPresentationIntentStart'
  | 'onPresentationIntentAbort'
>;

type UseSearchRootSubmitUiPresentationPortsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  resultsPresentationOwner: ResultsPresentationOwner;
  profileOwner: ProfileOwner;
  submitReadModel: Parameters<typeof useSearchSubmitOwnerValue>[0]['readModel'];
};

export const useSearchRootSubmitUiPresentationPorts = ({
  stateFoundationLane,
  resultsPresentationOwner,
  profileOwner,
  submitReadModel,
}: UseSearchRootSubmitUiPresentationPortsArgs): SearchRootSubmitUiPresentationPorts => {
  const resultsPresentationPorts = useSearchRootSubmitUiResultsPresentationPorts({
    resultsPresentationOwner,
    profileOwner,
  });
  const presentationIntentPorts = useSearchRootSubmitUiPresentationIntentPorts({
    stateFoundationLane,
    resultsPresentationOwner,
    submitReadModel,
  });

  return React.useMemo(
    () => ({
      ...resultsPresentationPorts,
      ...presentationIntentPorts,
    }),
    [presentationIntentPorts, resultsPresentationPorts]
  );
};
