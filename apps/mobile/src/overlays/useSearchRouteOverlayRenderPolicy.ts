import React from 'react';

import type { SearchRouteOverlayRenderPolicy } from './searchOverlayRouteHostContract';

type UseSearchRouteOverlayRenderPolicyArgs = {
  shouldShowSearchPanel: boolean;
  shouldShowDockedPollsPanel: boolean;
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  shouldFreezeOverlayHeaderActionForRunOne: boolean;
  isForegroundEditing: boolean;
  isSuggestionPanelActive: boolean;
};

export const useSearchRouteOverlayRenderPolicy = ({
  shouldShowSearchPanel,
  shouldShowDockedPollsPanel,
  shouldFreezeOverlaySheetForCloseHandoff,
  shouldFreezeOverlayHeaderActionForRunOne,
  isForegroundEditing,
  isSuggestionPanelActive,
}: UseSearchRouteOverlayRenderPolicyArgs): SearchRouteOverlayRenderPolicy =>
  React.useMemo(
    () => ({
      shouldShowSearchPanel,
      shouldShowDockedPollsPanel,
      shouldFreezeOverlaySheetForCloseHandoff,
      shouldFreezeOverlayHeaderActionForRunOne,
      shouldSuppressSearchAndTabSheetsForForegroundEditing: isForegroundEditing,
      shouldSuppressTabSheetsForSuggestions:
        isSuggestionPanelActive && (shouldShowSearchPanel || shouldShowDockedPollsPanel),
    }),
    [
      isForegroundEditing,
      isSuggestionPanelActive,
      shouldShowDockedPollsPanel,
      shouldShowSearchPanel,
      shouldFreezeOverlayHeaderActionForRunOne,
      shouldFreezeOverlaySheetForCloseHandoff,
    ]
  );
