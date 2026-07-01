import React from 'react';

import type {
  SearchRuntimeBus,
  SearchRuntimeProfileShellState,
} from '../shared/search-runtime-bus';
import type {
  CameraSnapshot,
  RestaurantPanelSnapshot,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import { publishMapMarkerSource } from '../shared/search-mounted-results-data-store';

export type ProfileShellStatePublisher = {
  publishProfileShellState: (
    update:
      | Partial<SearchRuntimeProfileShellState>
      | ((prev: SearchRuntimeProfileShellState) => SearchRuntimeProfileShellState)
  ) => void;
  setProfileCameraPadding: (padding: SearchRuntimeProfileShellState['mapCameraPadding']) => void;
  setMapHighlightedRestaurantId: (
    restaurantId: SearchRuntimeProfileShellState['mapHighlightedRestaurantId']
  ) => void;
  setRestaurantPanelSnapshot: (
    update:
      | RestaurantPanelSnapshot
      | null
      | ((prev: RestaurantPanelSnapshot | null) => RestaurantPanelSnapshot | null)
  ) => void;
};

type UseProfileShellStatePublisherArgs = {
  searchRuntimeBus: SearchRuntimeBus;
};

const areCameraPaddingsEqual = (
  left: CameraSnapshot['padding'],
  right: CameraSnapshot['padding']
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.paddingTop === right.paddingTop &&
    left.paddingBottom === right.paddingBottom &&
    left.paddingLeft === right.paddingLeft &&
    left.paddingRight === right.paddingRight);

const areProfileShellStatesEqual = (
  left: SearchRuntimeProfileShellState,
  right: SearchRuntimeProfileShellState
): boolean =>
  left.transitionStatus === right.transitionStatus &&
  left.restaurantPanelSnapshot === right.restaurantPanelSnapshot &&
  areCameraPaddingsEqual(left.mapCameraPadding, right.mapCameraPadding) &&
  left.mapHighlightedRestaurantId === right.mapHighlightedRestaurantId;

export const useProfileShellStatePublisher = ({
  searchRuntimeBus,
}: UseProfileShellStatePublisherArgs): ProfileShellStatePublisher => {
  const publishProfileShellState = React.useCallback<
    ProfileShellStatePublisher['publishProfileShellState']
  >(
    (update) => {
      const currentProfileShellState = searchRuntimeBus.getState().profileShellState;
      const nextProfileShellState =
        typeof update === 'function'
          ? update(currentProfileShellState)
          : {
              ...currentProfileShellState,
              ...update,
            };
      if (areProfileShellStatesEqual(currentProfileShellState, nextProfileShellState)) {
        return;
      }
      searchRuntimeBus.publish({
        profileShellState: nextProfileShellState,
      });
    },
    [searchRuntimeBus]
  );

  const setProfileCameraPadding = React.useCallback<
    ProfileShellStatePublisher['setProfileCameraPadding']
  >(
    (padding) => {
      publishProfileShellState({
        mapCameraPadding: padding,
      });
    },
    [publishProfileShellState]
  );

  const setMapHighlightedRestaurantId = React.useCallback<
    ProfileShellStatePublisher['setMapHighlightedRestaurantId']
  >(
    (restaurantId) => {
      // The seeded map marker source is bound to the profile highlight: it is published when a
      // profile hydrates with geometry and must clear exactly when the highlight clears. This is the
      // single funnel every clear path (close, search dismiss, runtime-state-owner) routes through.
      if (restaurantId == null) {
        publishMapMarkerSource(null);
      }
      publishProfileShellState({
        mapHighlightedRestaurantId: restaurantId,
      });
    },
    [publishProfileShellState]
  );

  const setRestaurantPanelSnapshot = React.useCallback<
    ProfileShellStatePublisher['setRestaurantPanelSnapshot']
  >(
    (update) => {
      publishProfileShellState((prev) => ({
        ...prev,
        restaurantPanelSnapshot:
          typeof update === 'function' ? update(prev.restaurantPanelSnapshot) : update,
      }));
    },
    [publishProfileShellState]
  );

  return React.useMemo<ProfileShellStatePublisher>(
    () => ({
      publishProfileShellState,
      setProfileCameraPadding,
      setMapHighlightedRestaurantId,
      setRestaurantPanelSnapshot,
    }),
    [
      publishProfileShellState,
      setProfileCameraPadding,
      setMapHighlightedRestaurantId,
      setRestaurantPanelSnapshot,
    ]
  );
};
