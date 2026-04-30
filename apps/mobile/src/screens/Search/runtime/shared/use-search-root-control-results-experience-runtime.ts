import { useSearchRootResultsControlRuntime } from './use-search-root-results-control-runtime';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type {
  SearchRootResultsInteractionPorts,
} from './search-root-control-ports-runtime-contract';
import type {
  SearchRootResultsPresentationControlLane,
  SubmitRuntimeResult,
} from './use-search-root-control-plane-runtime-contract';
import type { useSearchRootProfileControlRuntime } from './use-search-root-profile-control-runtime';

type UseSearchRootControlResultsExperienceRuntimeArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  resultsPresentationControlLane: SearchRootResultsPresentationControlLane;
  resultsInteractionPorts: SearchRootResultsInteractionPorts;
  profileControlRuntime: ReturnType<typeof useSearchRootProfileControlRuntime>;
  submitRuntimeResult: SubmitRuntimeResult;
};

export const useSearchRootControlResultsExperienceRuntime = ({
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  resultsPresentationControlLane,
  resultsInteractionPorts,
  profileControlRuntime,
  submitRuntimeResult,
}: UseSearchRootControlResultsExperienceRuntimeArgs) =>
  useSearchRootResultsControlRuntime({
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    resultsPresentationOwner:
      resultsPresentationControlLane.resultsPresentationOwner,
    resultsInteractionPorts,
    profileOwner: profileControlRuntime.profileOwner,
    submitRuntimeResult,
  });
