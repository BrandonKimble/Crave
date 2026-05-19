import React from 'react';

import type { SearchMapProfileCommandPort } from './search-map-protocol-contract';
import type { ProfileOwner } from '../profile/profile-owner-runtime-contract';
import type { SheetPosition } from '../../../../overlays/sheetUtils';

type UseSearchRootProfileMapCommandRuntimeArgs = {
  profileOwner: ProfileOwner;
  pendingMarkerOpenAnimationFrameRef: React.MutableRefObject<number | null>;
  getCurrentResultsSheetSnap: () => SheetPosition;
};

const shouldPromoteProfileOpenToMiddle = (snap: SheetPosition): boolean =>
  snap === 'hidden' || snap === 'collapsed';

export const useSearchRootProfileMapCommandRuntime = ({
  profileOwner,
  pendingMarkerOpenAnimationFrameRef,
  getCurrentResultsSheetSnap,
}: UseSearchRootProfileMapCommandRuntimeArgs) => {
  const { profileViewState, profileActions } = profileOwner;
  const profileActionsRef = React.useRef(profileActions);
  profileActionsRef.current = profileActions;
  const getCurrentResultsSheetSnapRef = React.useRef(getCurrentResultsSheetSnap);
  getCurrentResultsSheetSnapRef.current = getCurrentResultsSheetSnap;
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
          const shouldPromoteSheetToMiddle =
            shouldPromoteProfileOpenToMiddle(getCurrentResultsSheetSnapRef.current());
          profileActionsRef.current.openRestaurantProfile(restaurant, {
            pressedCoordinate,
            forceMiddleSnap: shouldPromoteSheetToMiddle,
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
            forceMiddleSnap: shouldPromoteProfileOpenToMiddle(
              getCurrentResultsSheetSnapRef.current()
            ),
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
