import React from 'react';

import type { ProfileActionExecutionPorts } from './profile-action-runtime-port-contract';
import type { ProfileAppExecutionRuntime } from './profile-app-execution-runtime-contract';
import type { ProfileAnalyticsModel } from './profile-owner-runtime-contract';
import type { ProfilePreparedPresentationRuntime } from './profile-prepared-presentation-runtime-contract';

type UseProfileOwnerActionExternalPortsRuntimeArgs = {
  analyticsModel: ProfileAnalyticsModel;
  appExecutionRuntime: ProfileAppExecutionRuntime;
  preparedPresentationRuntime: Pick<
    ProfilePreparedPresentationRuntime,
    | 'openPreparedProfilePresentation'
    | 'closePreparedProfilePresentation'
    | 'focusPreparedProfileCamera'
  >;
};

export const useProfileOwnerActionExternalPortsRuntime = ({
  analyticsModel,
  appExecutionRuntime,
  preparedPresentationRuntime,
}: UseProfileOwnerActionExternalPortsRuntimeArgs): Pick<
  ProfileActionExecutionPorts,
  | 'prepareForegroundUiForProfileOpen'
  | 'deferRecentlyViewedTrack'
  | 'recordRestaurantView'
  | 'prepareForProfileClose'
  | 'openPreparedProfilePresentation'
  | 'closePreparedProfilePresentation'
  | 'focusPreparedProfileCamera'
> => {
  const { deferRecentlyViewedTrack, recordRestaurantView } = analyticsModel;

  return React.useMemo(
    () => ({
      prepareForegroundUiForProfileOpen:
        appExecutionRuntime.shellExecutionModel.foregroundExecutionModel
          .prepareForegroundUiForProfileOpen,
      deferRecentlyViewedTrack,
      recordRestaurantView,
      prepareForProfileClose:
        appExecutionRuntime.shellExecutionModel.closeExecutionModel.prepareForProfileClose,
      openPreparedProfilePresentation: preparedPresentationRuntime.openPreparedProfilePresentation,
      closePreparedProfilePresentation:
        preparedPresentationRuntime.closePreparedProfilePresentation,
      focusPreparedProfileCamera: preparedPresentationRuntime.focusPreparedProfileCamera,
    }),
    [
      appExecutionRuntime,
      deferRecentlyViewedTrack,
      preparedPresentationRuntime,
      recordRestaurantView,
    ]
  );
};
