import React from 'react';

import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import {
  ProfileControllerState,
  createInitialProfileControllerState,
} from './profile-runtime-state-record';
import type { ProfileRuntimeStateOwner } from './profile-runtime-state-contract';
import type { ProfileShellStatePublisher } from './profile-shell-state-publisher';
import { useProfileShellStatePublisher } from './profile-shell-state-publisher';
import { useProfileShellStateSelector } from './profile-shell-state-selector';
import { setProfileTransitionStatusOnRecord } from './profile-transition-state-record';

type UseProfileControllerShellRuntimeStateOwnerArgs = {
  searchRuntimeBus: SearchRuntimeBus;
};

export type ProfileControllerShellRuntimeStateOwner = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
  shellRuntimeState: ProfileRuntimeStateOwner['shellRuntimeState'];
  setProfileTransitionStatus: ProfileRuntimeStateOwner['transitionRuntimeState']['setProfileTransitionStatus'];
  publishRestaurantPanelSnapshot: ProfileShellStatePublisher['setRestaurantPanelSnapshot'];
};

export const useProfileControllerShellRuntimeStateOwner = ({
  searchRuntimeBus,
}: UseProfileControllerShellRuntimeStateOwnerArgs): ProfileControllerShellRuntimeStateOwner => {
  const profileControllerStateRef = React.useRef<ProfileControllerState>(
    createInitialProfileControllerState()
  );
  const runtimeProfileShellState = useProfileShellStateSelector({
    searchRuntimeBus,
  });
  const {
    publishProfileShellState,
    setProfileCameraPadding,
    setRestaurantPanelSnapshot: publishRestaurantPanelSnapshot,
  } = useProfileShellStatePublisher({
    searchRuntimeBus,
  });

  const setProfileTransitionStatus = React.useCallback(
    (transitionStatus: typeof runtimeProfileShellState.transitionStatus) => {
      setProfileTransitionStatusOnRecord(profileControllerStateRef.current, transitionStatus);
      publishProfileShellState({
        transitionStatus,
      });
    },
    [publishProfileShellState]
  );

  const shellRuntimeState = React.useMemo<ProfileRuntimeStateOwner['shellRuntimeState']>(
    () => ({
      profileShellState: runtimeProfileShellState,
      setProfileCameraPadding,
    }),
    [runtimeProfileShellState, setProfileCameraPadding]
  );

  return React.useMemo(
    () => ({
      profileControllerStateRef,
      shellRuntimeState,
      setProfileTransitionStatus,
      publishRestaurantPanelSnapshot,
    }),
    [publishRestaurantPanelSnapshot, setProfileTransitionStatus, shellRuntimeState]
  );
};
