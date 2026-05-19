import React from 'react';

import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SearchRootProfileBridgeAuthorityRuntime } from './search-root-control-ports-runtime-contract';

type UseSearchRootProfileBridgePublicationRuntimeArgs = {
  profileBridgeAuthorityRuntime: SearchRootProfileBridgeAuthorityRuntime;
  profileOwner: ProfileOwner;
};

export const useSearchRootProfileBridgePublicationRuntime = ({
  profileBridgeAuthorityRuntime,
  profileOwner,
}: UseSearchRootProfileBridgePublicationRuntimeArgs): void => {
  React.useEffect(() => {
    profileBridgeAuthorityRuntime.profileBridge.profilePresentationActiveRef.current =
      profileOwner.profileViewState.presentation.isPresentationActive;
    profileBridgeAuthorityRuntime.profileBridge.closeRestaurantProfileRef.current =
      profileOwner.profileActions.closeRestaurantProfile;
    profileBridgeAuthorityRuntime.profileBridge.prepareRestaurantProfileForTerminalSearchDismissRef.current =
      profileOwner.profileActions.prepareRestaurantProfileForTerminalSearchDismiss;
    profileBridgeAuthorityRuntime.profileBridge.clearRestaurantProfileForSearchDismissRef.current =
      profileOwner.profileActions.clearRestaurantProfileForSearchDismiss;
    profileBridgeAuthorityRuntime.profileBridge.resetRestaurantProfileFocusSessionRef.current =
      profileOwner.profileActions.resetRestaurantProfileFocusSession;
  }, [
    profileBridgeAuthorityRuntime.profileBridge.clearRestaurantProfileForSearchDismissRef,
    profileBridgeAuthorityRuntime.profileBridge.closeRestaurantProfileRef,
    profileBridgeAuthorityRuntime.profileBridge.prepareRestaurantProfileForTerminalSearchDismissRef,
    profileBridgeAuthorityRuntime.profileBridge.profilePresentationActiveRef,
    profileBridgeAuthorityRuntime.profileBridge.resetRestaurantProfileFocusSessionRef,
    profileOwner.profileActions.clearRestaurantProfileForSearchDismiss,
    profileOwner.profileActions.closeRestaurantProfile,
    profileOwner.profileActions.prepareRestaurantProfileForTerminalSearchDismiss,
    profileOwner.profileActions.resetRestaurantProfileFocusSession,
    profileOwner.profileViewState.presentation.isPresentationActive,
  ]);
};
