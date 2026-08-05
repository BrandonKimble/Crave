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
  // F1031 family: assigned in an effect (good) but with no unmount cleanup — after this
  // instance unmounts these refs kept pointing at its dead closures, reachable from whatever
  // reads the profile bridge. Same fix shape as F1326: restore the inert defaults on cleanup.
  React.useEffect(() => {
    profileBridgeAuthorityRuntime.profileBridge.profilePresentationActiveRef.current =
      profileOwner.profileViewState.presentation.isPresentationActive;
    profileBridgeAuthorityRuntime.profileBridge.closeRestaurantProfileRef.current =
      profileOwner.profileActions.closeRestaurantProfile;
    profileBridgeAuthorityRuntime.profileBridge.resetRestaurantProfileFocusSessionRef.current =
      profileOwner.profileActions.resetRestaurantProfileFocusSession;
    return () => {
      profileBridgeAuthorityRuntime.profileBridge.profilePresentationActiveRef.current = false;
      profileBridgeAuthorityRuntime.profileBridge.closeRestaurantProfileRef.current = () => {};
      profileBridgeAuthorityRuntime.profileBridge.resetRestaurantProfileFocusSessionRef.current =
        () => {};
    };
  }, [
    profileBridgeAuthorityRuntime.profileBridge.closeRestaurantProfileRef,
    profileBridgeAuthorityRuntime.profileBridge.profilePresentationActiveRef,
    profileBridgeAuthorityRuntime.profileBridge.resetRestaurantProfileFocusSessionRef,
    profileOwner.profileActions.closeRestaurantProfile,
    profileOwner.profileActions.resetRestaurantProfileFocusSession,
    profileOwner.profileViewState.presentation.isPresentationActive,
  ]);
};
