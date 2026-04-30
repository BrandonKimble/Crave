import React from 'react';

import type { SearchMapProfileCommandPort } from './search-map-protocol-contract';
import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';

type UseSearchRootProfileMapCommandRuntimeArgs = {
  profileOwner: ProfileOwner;
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
};

export const useSearchRootProfileMapCommandRuntime = ({
  profileOwner,
  pendingMarkerOpenAnimationFrameRef,
}: UseSearchRootProfileMapCommandRuntimeArgs) => {
  const { profileViewState, profileActions } = profileOwner;
  const profileActionsRef = React.useRef(profileActions);
  profileActionsRef.current = profileActions;
  const mapProfileCommandPortRef =
    React.useRef<SearchMapProfileCommandPort | null>(null);

  if (!mapProfileCommandPortRef.current) {
    mapProfileCommandPortRef.current = {
      openProfileFromMarker: ({
        restaurantId,
        restaurantName,
        restaurant,
        pressedCoordinate,
      }) => {
        if (pendingMarkerOpenAnimationFrameRef.current != null) {
          if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(pendingMarkerOpenAnimationFrameRef.current);
          }
          pendingMarkerOpenAnimationFrameRef.current = null;
        }

        if (restaurant) {
          profileActionsRef.current.openRestaurantProfile(restaurant, {
            pressedCoordinate,
            forceMiddleSnap: true,
            source: 'results_sheet',
          });
          return;
        }

        if (!restaurantName) {
          return;
        }

        profileActionsRef.current.openRestaurantProfilePreview(
          restaurantId,
          restaurantName,
          {
            pressedCoordinate: pressedCoordinate ?? null,
            forceMiddleSnap: true,
          }
        );
      },
    };
  }

  const mapViewState = React.useMemo(
    () => ({
      highlightedRestaurantId: profileViewState.highlightedRestaurantId,
      mapCameraPadding: profileViewState.mapCameraPadding,
    }),
    [
      profileViewState.highlightedRestaurantId,
      profileViewState.mapCameraPadding,
    ]
  );

  return React.useMemo(
    () => ({
      mapProfileCommandPort: mapProfileCommandPortRef.current!,
      mapViewState,
    }),
    [mapViewState]
  );
};
