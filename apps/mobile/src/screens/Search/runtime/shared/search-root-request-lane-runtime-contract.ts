import type React from 'react';
import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { SearchRequestRuntimeOwner } from '../../hooks/use-search-request-runtime-owner';
import type { ResultsPresentationOwner } from './use-results-presentation-runtime-owner';
import { useSearchAutocompleteRuntime } from './use-search-autocomplete-runtime';
import { useSearchRecentActivityRuntime } from './use-search-recent-activity-runtime';

export type SearchRequestPresentationRuntime = {
  searchRequestRuntimeOwner: SearchRequestRuntimeOwner;
  clearOwner: SearchClearOwner;
  resultsPresentationOwner: ResultsPresentationOwner;
};

export type SearchRequestPresentationFlowRuntime = {
  requestPresentationRuntime: SearchRequestPresentationRuntime;
  autocompleteRuntime: ReturnType<typeof useSearchAutocompleteRuntime>;
  recentActivityRuntime: ReturnType<typeof useSearchRecentActivityRuntime>;
  foregroundInputRuntime: {
    captureSearchSessionQuery: () => void;
    focusSearchInput: () => void;
    handleSearchPressIn: () => void;
    handleQueryChange: (value: string) => void;
  };
  profileBridgeRefs: {
    profilePresentationActiveRef: React.MutableRefObject<boolean>;
    closeRestaurantProfileRef: React.MutableRefObject<
      (options?: { dismissBehavior?: 'restore' | 'clear'; clearSearchOnDismiss?: boolean }) => void
    >;
    resetRestaurantProfileFocusSessionRef: React.MutableRefObject<() => void>;
  };
  rootUiBridge: {
    registerPendingMutationWorkCancel: (handler: () => void) => void;
    scrollResultsToTop: () => void;
  };
};

export type SearchRootRequestLaneRuntime = {
  requestPresentationFlowRuntime: SearchRequestPresentationFlowRuntime;
  resetResultsListScrollProgressRef: React.MutableRefObject<() => void>;
};
