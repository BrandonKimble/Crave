import type { SearchRootEnvironment } from './search-root-environment-contract';
import { useSearchRootProfileControlRuntime } from './use-search-root-profile-control-runtime';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type {
  SearchRootClearRestoreAuthorityRuntime,
  SearchRootProfileBridgeAuthorityRuntime,
  SearchRootRecentActivityAuthorityRuntime,
} from './search-root-control-ports-runtime-contract';
import type { SearchRootResultsPresentationControlLane } from './use-search-root-control-plane-runtime-contract';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';

type UseSearchRootControlProfileExperienceRuntimeArgs = {
  sessionCoreLane: SearchRootSessionCoreLane;
  stateFoundationLane: SearchRootStateFoundationLane;
  rootOverlayFoundationRuntime: SearchRootOverlayFoundationRuntime;
  insets: Pick<SearchRootEnvironment, 'insets'>['insets'];
  isSignedIn: boolean;
  userLocation: Pick<SearchRootEnvironment, 'userLocation'>['userLocation'];
  userLocationRef: Pick<SearchRootEnvironment, 'userLocationRef'>['userLocationRef'];
  profileBridgeAuthorityRuntime: SearchRootProfileBridgeAuthorityRuntime;
  recentActivityAuthorityRuntime: SearchRootRecentActivityAuthorityRuntime;
  clearRestoreAuthorityRuntime: SearchRootClearRestoreAuthorityRuntime;
  resultsPresentationControlLane: SearchRootResultsPresentationControlLane;
};

export const useSearchRootControlProfileExperienceRuntime = ({
  sessionCoreLane,
  stateFoundationLane,
  rootOverlayFoundationRuntime,
  insets,
  isSignedIn,
  userLocation,
  userLocationRef,
  profileBridgeAuthorityRuntime,
  recentActivityAuthorityRuntime,
  clearRestoreAuthorityRuntime,
  resultsPresentationControlLane,
}: UseSearchRootControlProfileExperienceRuntimeArgs) =>
  useSearchRootProfileControlRuntime({
    sessionCoreLane,
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    insets,
    isSignedIn,
    userLocation,
    userLocationRef,
    profileBridgeAuthorityRuntime,
    recentActivityAuthorityRuntime,
    clearRestoreAuthorityRuntime,
    resultsPresentationOwner:
      resultsPresentationControlLane.resultsPresentationOwner,
  });
