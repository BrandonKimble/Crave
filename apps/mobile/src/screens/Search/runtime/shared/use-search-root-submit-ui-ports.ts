import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootRecentActivityAuthorityRuntime,
  SearchRootResultsScrollAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { useSearchRootSubmitUiPresentationPorts } from './use-search-root-submit-ui-presentation-ports';
import { useSearchRootSubmitUiResultsPorts } from './use-search-root-submit-ui-results-ports';
import { useSearchRootSubmitUiSearchPorts } from './use-search-root-submit-ui-search-ports';

type SearchRootSubmitUiPorts = Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'];

type UseSearchRootSubmitUiPortsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
  resultsScrollAuthorityRuntime: SearchRootResultsScrollAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  profileOwner: ProfileOwner;
  submitReadModel: Parameters<typeof useSearchSubmitOwnerValue>[0]['readModel'];
};

export const useSearchRootSubmitUiPorts = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  recentActivityAuthorityRuntime,
  resultsScrollAuthorityRuntime,
  resultsPresentationOwner,
  profileOwner,
  submitReadModel,
}: UseSearchRootSubmitUiPortsArgs): SearchRootSubmitUiPorts => {
  const searchUiPorts = useSearchRootSubmitUiSearchPorts({
    stateFoundationLane,
  });
  const resultsUiPorts = useSearchRootSubmitUiResultsPorts({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    recentActivityAuthorityRuntime,
    resultsScrollAuthorityRuntime,
  });
  const presentationUiPorts = useSearchRootSubmitUiPresentationPorts({
    stateFoundationLane,
    resultsPresentationOwner,
    profileOwner,
    submitReadModel,
  });

  return React.useMemo(
    () => ({
      ...searchUiPorts,
      ...resultsUiPorts,
      ...presentationUiPorts,
    }),
    [presentationUiPorts, resultsUiPorts, searchUiPorts]
  );
};
