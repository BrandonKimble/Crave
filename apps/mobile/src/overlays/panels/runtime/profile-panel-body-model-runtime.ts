import React from 'react';

import {
  PROFILE_DEFAULT_SEGMENT,
  type ProfileSegment,
} from '../profileSceneQueryOptions';
import { useProfilePanelActionsRuntime } from './profile-panel-actions-runtime';
import { useProfilePanelDataRuntime } from './profile-panel-data-runtime';
import { useProfilePanelIdentityRuntime } from './profile-panel-identity-runtime';
import type {
  ProfilePanelActionsRuntime,
  ProfileSceneHeaderProps,
  ProfileSceneRow,
} from './profile-panel-runtime-contract';
import { useProfilePanelSegmentRowsRuntime } from './profile-panel-segment-rows-runtime';

export type ProfilePanelBodyModelRuntime = {
  actionsRuntime: ProfilePanelActionsRuntime;
  headerProps: ProfileSceneHeaderProps;
  rows: readonly ProfileSceneRow[];
};

export const useProfilePanelBodyModelRuntime = ({
  shouldRenderExpandedContent,
  shouldRunDataLane,
}: {
  shouldRenderExpandedContent: boolean;
  shouldRunDataLane: boolean;
}): ProfilePanelBodyModelRuntime => {
  const [activeSegment, setActiveSegment] =
    React.useState<ProfileSegment>(PROFILE_DEFAULT_SEGMENT);
  const actionsRuntime = useProfilePanelActionsRuntime();
  const dataLaneReady = actionsRuntime.isSignedIn && shouldRunDataLane;
  const dataRuntime = useProfilePanelDataRuntime({
    activeSegment,
    dataLaneReady,
    shouldRenderExpandedContent,
  });
  const headerProps = useProfilePanelIdentityRuntime({
    activeSegment,
    onOpenSettings: actionsRuntime.handleOpenSettings,
    onSelectSegment: setActiveSegment,
    profile: dataRuntime.profile,
  });
  const rows = useProfilePanelSegmentRowsRuntime({
    activeSegment,
    dataRuntime,
    shouldRenderExpandedContent,
  });

  return React.useMemo(
    () => ({
      actionsRuntime,
      headerProps,
      rows,
    }),
    [actionsRuntime, headerProps, rows]
  );
};
