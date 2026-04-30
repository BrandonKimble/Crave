import type React from 'react';

import type { SearchForegroundTransientCleanupActions } from './use-search-foreground-interaction-runtime-contract';
import type { SearchPrimitiveUiCleanupActions } from './search-primitive-ui-state-controller';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';
import type { SearchRootProfileBridgeRuntime } from './search-root-control-ports-runtime-contract';

type CreateSearchForegroundTransientCleanupActionsArgs = {
  primitiveUiCleanupActions: SearchPrimitiveUiCleanupActions;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  dismissTransientOverlays: () => void;
  profileBridge: SearchRootProfileBridgeRuntime['profileBridge'];
};

export const createSearchForegroundTransientCleanupActions = ({
  primitiveUiCleanupActions,
  suggestionPanelStateController,
  setIsSuggestionPanelActive,
  dismissTransientOverlays,
  profileBridge,
}: CreateSearchForegroundTransientCleanupActionsArgs): SearchForegroundTransientCleanupActions => ({
  getSnapshot: () => ({
    isSuggestionPanelActive: suggestionPanelStateController.getSnapshot().isSuggestionPanelActive,
    profilePresentationActive: profileBridge.profilePresentationActiveRef.current,
  }),
  dismissTransientOverlays,
  beginSuggestionCloseHold: primitiveUiCleanupActions.beginSuggestionCloseHold,
  resetSuggestionPanelActive: () => {
    setIsSuggestionPanelActive(false);
  },
  setSearchFlagsForSearchRoot: () => {
    primitiveUiCleanupActions.setSearchFocusedInactive();
    primitiveUiCleanupActions.suppressAutocomplete();
  },
  clearSuggestions: primitiveUiCleanupActions.clearSuggestions,
  closeRestaurantProfile: (options) => {
    profileBridge.closeRestaurantProfileRef.current(options);
  },
  blurInput: primitiveUiCleanupActions.blurInput,
});
