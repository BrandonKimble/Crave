import React from 'react';

import type { ProfileCloseState, ProfileControllerState } from './profile-runtime-state-record';
import {
  getProfileDismissBehaviorFromRecord,
  getProfileMultiLocationZoomBaselineFromRecord,
  getProfileShouldClearSearchOnDismissFromRecord,
  setProfileDismissBehaviorOnRecord,
  setProfileMultiLocationZoomBaselineOnRecord,
  setProfileShouldClearSearchOnDismissOnRecord,
} from './profile-close-state-record';

export type ProfileClosePolicyRuntimeState = {
  getProfileDismissBehavior: () => 'restore' | 'clear';
  getProfileMultiLocationZoomBaseline: () => number | null;
  getProfileShouldClearSearchOnDismiss: () => boolean;
  setProfileDismissBehavior: (dismissBehavior: 'restore' | 'clear') => void;
  setProfileShouldClearSearchOnDismiss: (shouldClearSearchOnDismiss: boolean) => void;
  setProfileMultiLocationZoomBaseline: (zoomBaseline: number | null) => void;
};

type UseProfileClosePolicyRuntimeStateArgs = {
  profileControllerStateRef: React.RefObject<ProfileControllerState>;
};

export const useProfileClosePolicyRuntimeState = ({
  profileControllerStateRef,
}: UseProfileClosePolicyRuntimeStateArgs): ProfileClosePolicyRuntimeState => {
  const getProfileDismissBehavior = React.useCallback(
    () => getProfileDismissBehaviorFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  const setProfileDismissBehavior = React.useCallback(
    (dismissBehavior: ProfileCloseState['dismissBehavior']) => {
      setProfileDismissBehaviorOnRecord(profileControllerStateRef.current, dismissBehavior);
    },
    [profileControllerStateRef]
  );

  const getProfileShouldClearSearchOnDismiss = React.useCallback(
    () => getProfileShouldClearSearchOnDismissFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  const setProfileShouldClearSearchOnDismiss = React.useCallback(
    (shouldClearSearchOnDismiss: boolean) => {
      setProfileShouldClearSearchOnDismissOnRecord(
        profileControllerStateRef.current,
        shouldClearSearchOnDismiss
      );
    },
    [profileControllerStateRef]
  );

  const getProfileMultiLocationZoomBaseline = React.useCallback(
    () => getProfileMultiLocationZoomBaselineFromRecord(profileControllerStateRef.current),
    [profileControllerStateRef]
  );

  const setProfileMultiLocationZoomBaseline = React.useCallback(
    (multiLocationZoomBaseline: number | null) => {
      setProfileMultiLocationZoomBaselineOnRecord(
        profileControllerStateRef.current,
        multiLocationZoomBaseline
      );
    },
    [profileControllerStateRef]
  );

  return React.useMemo<ProfileClosePolicyRuntimeState>(
    () => ({
      getProfileDismissBehavior,
      getProfileMultiLocationZoomBaseline,
      getProfileShouldClearSearchOnDismiss,
      setProfileDismissBehavior,
      setProfileShouldClearSearchOnDismiss,
      setProfileMultiLocationZoomBaseline,
    }),
    [
      getProfileDismissBehavior,
      getProfileMultiLocationZoomBaseline,
      getProfileShouldClearSearchOnDismiss,
      setProfileDismissBehavior,
      setProfileMultiLocationZoomBaseline,
      setProfileShouldClearSearchOnDismiss,
    ]
  );
};
