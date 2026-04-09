import React from 'react';

import type {
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
} from './searchOverlayRouteHostContract';

type UseSearchRouteDockedPollsPanelInputsArgs = {
  pollBounds: SearchRoutePollsPanelInputs['pollBounds'];
  startupPollsSnapshot: SearchRoutePollsPanelInputs['startupPollsSnapshot'];
  searchInteractionRef: SearchRoutePanelInteractionRef | null;
};

export const useSearchRouteDockedPollsPanelInputs = ({
  pollBounds,
  startupPollsSnapshot,
  searchInteractionRef,
}: UseSearchRouteDockedPollsPanelInputsArgs): SearchRoutePollsPanelInputs =>
  React.useMemo(
    () => ({
      pollBounds,
      startupPollsSnapshot,
      interactionRef: searchInteractionRef,
    }),
    [pollBounds, searchInteractionRef, startupPollsSnapshot]
  );
