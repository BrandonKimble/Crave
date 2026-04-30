import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type {
  SearchRootRecentActivityAuthorityRuntime,
  SearchRootRequestExecutionAuthorityRuntime,
  SearchRootResultsScrollAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SubmitRuntimeResult } from './use-search-root-control-plane-runtime-contract';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { useSearchRootSubmitReadModel } from './use-search-root-submit-read-model';
import { useSearchRootSubmitRuntimePorts } from './use-search-root-submit-runtime-ports';
import { useSearchRootSubmitUiPorts } from './use-search-root-submit-ui-ports';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type UseSearchRootSubmitControlRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  requestExecutionAuthorityRuntime: SearchRootRequestExecutionAuthorityRuntime;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
  resultsScrollAuthorityRuntime: SearchRootResultsScrollAuthorityRuntime;
  resultsPresentationOwner: ResultsPresentationOwner;
  profileOwner: ProfileOwner;
  userLocation: SearchRootEnvironment['userLocation'];
};

export const useSearchRootSubmitControlRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  requestExecutionAuthorityRuntime,
  recentActivityAuthorityRuntime,
  resultsScrollAuthorityRuntime,
  resultsPresentationOwner,
  profileOwner,
  userLocation,
}: UseSearchRootSubmitControlRuntimeArgs): SubmitRuntimeResult => {
  const readModel = useSearchRootSubmitReadModel({
    stateFoundationLane,
  });
  const uiPorts = useSearchRootSubmitUiPorts({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    recentActivityAuthorityRuntime,
    resultsScrollAuthorityRuntime,
    resultsPresentationOwner,
    profileOwner,
    submitReadModel: readModel,
  });
  const runtimePorts = useSearchRootSubmitRuntimePorts({
    sessionCoreLane,
    stateFoundationLane,
    requestExecutionAuthorityRuntime,
    userLocation,
  });

  return useSearchSubmitOwnerValue({
    readModel,
    uiPorts,
    runtimePorts,
  });
};
