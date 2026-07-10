import type React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { useSearchAutocompleteRuntime } from './use-search-autocomplete-runtime';
import type { useSearchRecentActivityRuntime } from './use-search-recent-activity-runtime';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';

export type SearchRootAutocompletePort = Pick<
  ReturnType<typeof useSearchAutocompleteRuntime>,
  'allowAutocompleteResults' | 'suppressAutocompleteResults'
>;

export type SearchRootForegroundInputRuntime = {
  captureSearchSessionQuery: () => void;
  focusSearchInput: () => void;
  handleQueryChange: (value: string) => void;
};

export type SearchRootMutationCancelPort = {
  registerPendingMutationWorkCancel: (handler: () => void) => void;
  cancelPendingMutationWork: () => void;
};

export type SearchRootResultsScrollPort = {
  scrollResultsToTop: () => void;
};

export type SearchRootProfileBridgeRuntime = {
  profileBridge: {
    profilePresentationActiveRef: React.MutableRefObject<boolean>;
    closeRestaurantProfileRef: React.MutableRefObject<
      (options?: { dismissBehavior?: 'restore' | 'clear'; clearSearchOnDismiss?: boolean }) => void
    >;
    resetRestaurantProfileFocusSessionRef: React.MutableRefObject<() => void>;
    cancelToggleInteractionRef: React.MutableRefObject<() => void>;
  };
};

export type SearchRootResultsInteractionPorts = {
  resetResultsListScrollProgressRef: React.MutableRefObject<() => void>;
};

export type SearchRootRequestExecutionAuthorityRuntime = {
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
  searchRequestRuntimeOwner: {
    /** Dismiss-time cancel: drops any in-flight request + publishes idle operation keys. */
    cancelActiveSearchRequest: () => void;
  };
};

export type SearchRootAutocompleteAuthorityRuntime = {
  autocompleteRuntime: ReturnType<typeof useSearchAutocompleteRuntime>;
  autocompleteControlPort: SearchRootAutocompletePort;
};

export type SearchRootMutationCancelAuthorityRuntime = {
  mutationCancelPort: SearchRootMutationCancelPort;
};

export type SearchRootResultsScrollAuthorityRuntime = {
  resultsScrollPort: SearchRootResultsScrollPort;
};

export type SearchRootProfileBridgeAuthorityRuntime = SearchRootProfileBridgeRuntime;

export type SearchRootRecentActivityAuthorityRuntime = {
  recentActivityRuntime: ReturnType<typeof useSearchRecentActivityRuntime>;
};

export type SearchRootResultsPresentationAuthorityRuntime = {
  resultsPresentationOwner: ResultsPresentationOwner;
};

export type SearchRootResultsInteractionAuthorityRuntime = {
  resultsInteractionPorts: SearchRootResultsInteractionPorts;
};

export type SearchRootClearRestoreAuthorityRuntime = {
  clearOwner: SearchClearOwner;
};

export type SearchRootForegroundInputAuthorityRuntime = {
  foregroundInputRuntime: SearchRootForegroundInputRuntime;
};
