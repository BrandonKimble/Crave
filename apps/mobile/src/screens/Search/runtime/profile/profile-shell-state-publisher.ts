import React from 'react';

import type {
  SearchRuntimeBus,
  SearchRuntimeProfileShellState,
} from '../shared/search-runtime-bus';
import type { RestaurantPanelSnapshot } from './profile-transition-state-contract';

export type ProfileShellStatePublisher = {
  publishProfileShellState: (
    update:
      | Partial<SearchRuntimeProfileShellState>
      | ((prev: SearchRuntimeProfileShellState) => SearchRuntimeProfileShellState)
  ) => void;
  setProfileCameraPadding: (padding: SearchRuntimeProfileShellState['mapCameraPadding']) => void;
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
      setRestaurantPanelSnapshot,
    }),
    [publishProfileShellState, setProfileCameraPadding, setRestaurantPanelSnapshot]
  );
};
