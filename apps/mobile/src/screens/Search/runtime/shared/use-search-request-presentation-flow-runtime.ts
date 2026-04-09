import React from 'react';
import type { FlashListRef } from '@shopify/flash-list';

import type { ResultsListItem } from '../read-models/read-model-selectors';
import { useSearchAutocompleteRuntime } from './use-search-autocomplete-runtime';
import { useSearchForegroundInputRuntime } from './use-search-foreground-input-runtime';
import { useSearchRecentActivityRuntime } from './use-search-recent-activity-runtime';
import { useSearchRequestPresentationRuntime } from './use-search-request-presentation-runtime';
import { useSearchSessionShadowTransitionRuntime } from './use-search-session-shadow-transition-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';

type CloseRestaurantProfileRef = React.MutableRefObject<
  (options?: { dismissBehavior?: 'restore' | 'clear'; clearSearchOnDismiss?: boolean }) => void
>;

type UseSearchRequestPresentationFlowRuntimeArgs = {
  runOneHandoffCoordinatorRef: Parameters<
    typeof useSearchSessionShadowTransitionRuntime
  >[0]['runOneHandoffCoordinatorRef'];
  emitRuntimeMechanismEvent: SearchRootScaffoldRuntime['instrumentationRuntime']['emitRuntimeMechanismEvent'];
  resultsScrollRef: React.MutableRefObject<FlashListRef<ResultsListItem> | null>;
  resultsScrollOffset: SearchRootScaffoldRuntime['resultsSheetRuntimeOwner']['resultsScrollOffset'];
  resetResultsListScrollProgressRef: React.MutableRefObject<() => void>;
  requestPresentationArgs: {
    requestRuntimeArgs: Omit<
      Parameters<typeof useSearchRequestPresentationRuntime>[0]['requestRuntimeArgs'],
      'onRuntimeMechanismEvent' | 'onSearchSessionShadowTransition'
    >;
    clearOwnerArgs: Omit<
      Parameters<typeof useSearchRequestPresentationRuntime>[0]['clearOwnerArgs'],
      | 'profilePresentationActiveRef'
      | 'closeRestaurantProfileRef'
      | 'resetRestaurantProfileFocusSessionRef'
      | 'handleCancelPendingMutationWork'
      | 'cancelToggleInteraction'
      | 'scrollResultsToTop'
    >;
    resultsPresentationArgs: Omit<
      Parameters<typeof useSearchRequestPresentationRuntime>[0]['resultsPresentationArgs'],
      'handleCancelPendingMutationWork'
    >;
  };
  autocompleteArgs: Parameters<typeof useSearchAutocompleteRuntime>[0];
  recentActivityArgs: Parameters<typeof useSearchRecentActivityRuntime>[0];
  foregroundInputArgs: Omit<
    Parameters<typeof useSearchForegroundInputRuntime>[0],
    | 'requestSearchPresentationIntent'
    | 'backdropTarget'
    | 'allowAutocompleteResults'
    | 'showCachedSuggestionsIfFresh'
  >;
};

export type SearchRequestPresentationFlowRuntime = {
  requestPresentationRuntime: ReturnType<typeof useSearchRequestPresentationRuntime>;
  autocompleteRuntime: ReturnType<typeof useSearchAutocompleteRuntime>;
  recentActivityRuntime: ReturnType<typeof useSearchRecentActivityRuntime>;
  foregroundInputRuntime: ReturnType<typeof useSearchForegroundInputRuntime>;
  profileBridgeRefs: {
    profilePresentationActiveRef: React.MutableRefObject<boolean>;
    closeRestaurantProfileRef: CloseRestaurantProfileRef;
    resetRestaurantProfileFocusSessionRef: React.MutableRefObject<() => void>;
  };
  rootUiBridge: {
    registerPendingMutationWorkCancel: (handler: () => void) => void;
    scrollResultsToTop: () => void;
  };
};

export const useSearchRequestPresentationFlowRuntime = ({
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
  resultsScrollRef,
  resultsScrollOffset,
  resetResultsListScrollProgressRef,
  requestPresentationArgs,
  autocompleteArgs,
  recentActivityArgs,
  foregroundInputArgs,
}: UseSearchRequestPresentationFlowRuntimeArgs): SearchRequestPresentationFlowRuntime => {
  const scrollResultsToTop = React.useCallback(() => {
    const listRef = resultsScrollRef.current;
    if (!listRef?.scrollToOffset) {
      return;
    }
    resetResultsListScrollProgressRef.current();
    listRef.clearLayoutCacheOnUpdate?.();
    resultsScrollOffset.value = 0;
    requestAnimationFrame(() => {
      listRef.scrollToOffset?.({ offset: 0, animated: false });
    });
  }, [resetResultsListScrollProgressRef, resultsScrollOffset, resultsScrollRef]);

  const cancelPendingMutationWorkRef = React.useRef<() => void>(() => {});
  const registerPendingMutationWorkCancel = React.useCallback((handler: () => void) => {
    cancelPendingMutationWorkRef.current = handler;
  }, []);
  const handleCancelPendingMutationWork = React.useCallback(() => {
    cancelPendingMutationWorkRef.current();
  }, []);

  const profilePresentationActiveRef = React.useRef(false);
  const closeRestaurantProfileRef = React.useRef<
    (options?: { dismissBehavior?: 'restore' | 'clear'; clearSearchOnDismiss?: boolean }) => void
  >(() => {});
  const resetRestaurantProfileFocusSessionRef = React.useRef<() => void>(() => {});
  const cancelToggleInteractionRef = React.useRef<() => void>(() => {});

  const handleSearchSessionShadowTransition = useSearchSessionShadowTransitionRuntime({
    runOneHandoffCoordinatorRef,
  });
  const requestPresentationRuntime = useSearchRequestPresentationRuntime({
    requestRuntimeArgs: {
      ...requestPresentationArgs.requestRuntimeArgs,
      onRuntimeMechanismEvent: emitRuntimeMechanismEvent,
      onSearchSessionShadowTransition: handleSearchSessionShadowTransition,
    },
    clearOwnerArgs: {
      ...requestPresentationArgs.clearOwnerArgs,
      profilePresentationActiveRef,
      closeRestaurantProfileRef,
      resetRestaurantProfileFocusSessionRef,
      handleCancelPendingMutationWork,
      cancelToggleInteraction: () => {
        cancelToggleInteractionRef.current();
      },
      scrollResultsToTop,
    },
    resultsPresentationArgs: {
      ...requestPresentationArgs.resultsPresentationArgs,
      handleCancelPendingMutationWork,
    },
  });
  const { cancelToggleInteraction, shellModel, presentationActions } =
    requestPresentationRuntime.resultsPresentationOwner;
  cancelToggleInteractionRef.current = cancelToggleInteraction;

  const autocompleteRuntime = useSearchAutocompleteRuntime(autocompleteArgs);
  const recentActivityRuntime = useSearchRecentActivityRuntime(recentActivityArgs);
  const foregroundInputRuntime = useSearchForegroundInputRuntime({
    ...foregroundInputArgs,
    requestSearchPresentationIntent: presentationActions.requestSearchPresentationIntent,
    backdropTarget: shellModel.backdropTarget,
    allowAutocompleteResults: autocompleteRuntime.allowAutocompleteResults,
    showCachedSuggestionsIfFresh: autocompleteRuntime.showCachedSuggestionsIfFresh,
  });

  return {
    requestPresentationRuntime,
    autocompleteRuntime,
    recentActivityRuntime,
    foregroundInputRuntime,
    profileBridgeRefs: {
      profilePresentationActiveRef,
      closeRestaurantProfileRef,
      resetRestaurantProfileFocusSessionRef,
    },
    rootUiBridge: {
      registerPendingMutationWorkCancel,
      scrollResultsToTop,
    },
  };
};
