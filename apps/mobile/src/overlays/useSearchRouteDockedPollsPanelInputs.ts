import React from 'react';

import type {
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
} from './searchOverlayRouteHostContract';

type UseSearchRouteDockedPollsPanelInputsArgs = {
  pollBounds: SearchRoutePollsPanelInputs['pollBounds'];
  startupPollsSnapshot: SearchRoutePollsPanelInputs['startupPollsSnapshot'];
  userLocation: SearchRoutePollsPanelInputs['userLocation'];
  searchInteractionRef: SearchRoutePanelInteractionRef | null;
};

export const useSearchRouteDockedPollsPanelInputs = ({
  pollBounds,
  startupPollsSnapshot,
  userLocation,
  searchInteractionRef,
}: UseSearchRouteDockedPollsPanelInputsArgs): SearchRoutePollsPanelInputs =>
  React.useMemo(
    () => ({
      pollBounds,
      startupPollsSnapshot,
      userLocation,
      interactionRef: searchInteractionRef,
    }),
    [pollBounds, searchInteractionRef, startupPollsSnapshot, userLocation]
  );
