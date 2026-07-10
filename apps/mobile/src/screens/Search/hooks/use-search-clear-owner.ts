import React from 'react';
import { Keyboard, type TextInput } from 'react-native';

import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { writeSearchDesiredTuple } from '../runtime/shared/search-desired-state-writer';
import { DEFAULT_SEARCH_FILTER_VARIANT } from '../runtime/shared/search-desired-state-contract';
import { publishSearchMountedResultsDataSnapshot } from '../runtime/shared/search-mounted-results-data-store';

export type SearchClearOwner = {
  clearSearchAfterProfileDismiss: () => void;
  clearTypedQuery: () => void;
  clearSearchState: (options?: ClearSearchStateOptions) => void;
};

export type ClearSearchStateOptions = {
  shouldRefocusInput?: boolean;
  skipSheetAnimation?: boolean;
  deferSuggestionClear?: boolean;
  skipPostSearchRestore?: boolean;
  preserveForegroundEditing?: boolean;
  skipProfileDismissClear?: boolean;
};

export type UseSearchClearOwnerArgs<Suggestion> = {
  profilePresentationActiveRef: React.MutableRefObject<boolean>;
  clearRestaurantProfileForSearchDismissRef: React.MutableRefObject<() => void>;
  resetRestaurantProfileFocusSessionRef: React.MutableRefObject<() => void>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  submittedQuery: string;
  captureSearchCloseOrigin: (options?: {
    allowFallback?: boolean;
    searchRootRestoreSnap?: 'expanded' | 'middle' | 'collapsed';
  }) => import('../../../overlays/searchRouteSessionTypes').OriginSnapshot | null;
  restoreSearchCloseOrigin: (
    origin: import('../../../overlays/searchRouteSessionTypes').OriginSnapshot | null
  ) => void;
  cancelActiveSearchRequest: () => void;
  cancelAutocomplete: () => void;
  handleCancelPendingMutationWork: () => void;
  resetSubmitTransitionHold: () => void;
  cancelToggleInteraction: () => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  searchRuntimeBus: SearchRuntimeBus;
  resetShortcutCoverageState: () => void;
  resetMapMoveFlag: () => void;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>;
  resetSheetToHidden: () => void;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
  resetFocusedMapState: () => void;
  setRestaurantOnlyIntent: (restaurantId: string | null) => void;
  searchSessionQueryRef: React.MutableRefObject<string>;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<'default' | 'submitting'>>;
  inputRef: React.RefObject<TextInput | null>;
  scrollResultsToTop: () => void;
};

export const useSearchClearOwner = <Suggestion>({
  profilePresentationActiveRef,
  clearRestaurantProfileForSearchDismissRef,
  resetRestaurantProfileFocusSessionRef,
  isClearingSearchRef,
  isSearchSessionActive,
  hasResults,
  submittedQuery,
  captureSearchCloseOrigin,
  restoreSearchCloseOrigin,
  cancelActiveSearchRequest,
  cancelAutocomplete,
  handleCancelPendingMutationWork,
  resetSubmitTransitionHold,
  cancelToggleInteraction,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsAutocompleteSuppressed,
  setShowSuggestions,
  setQuery,
  searchRuntimeBus,
  resetShortcutCoverageState,
  resetMapMoveFlag,
  setError,
  setSuggestions,
  resetSheetToHidden,
  lastAutoOpenKeyRef,
  resetFocusedMapState,
  setRestaurantOnlyIntent,
  searchSessionQueryRef,
  setSearchTransitionVariant,
  inputRef,
  scrollResultsToTop,
}: UseSearchClearOwnerArgs<Suggestion>): SearchClearOwner => {
  const clearSearchAfterProfileDismiss = React.useCallback(() => {
    const closeRestoreOrigin = captureSearchCloseOrigin({
      allowFallback: isSearchSessionActive || hasResults || submittedQuery.length > 0,
      searchRootRestoreSnap: 'collapsed',
    });
    isClearingSearchRef.current = true;
    cancelActiveSearchRequest();
    cancelAutocomplete();
    handleCancelPendingMutationWork();
    resetSubmitTransitionHold();
    // Same atomic dismiss write as clearSearchState — this lane previously reset
    // filters but never returned the tuple to idle (an S2 gap the reconciler
    // classification made visible: the tuple claimed a live session after close).
    writeSearchDesiredTuple(
      searchRuntimeBus,
      {
        queryIdentity: { kind: 'idle' },
        committedBounds: null,
        filterVariant: { ...DEFAULT_SEARCH_FILTER_VARIANT },
      },
      'dismiss'
    );
    cancelToggleInteraction();
    setIsSearchFocused(false);
    setIsSuggestionPanelActive(false);
    setIsAutocompleteSuppressed(true);
    setShowSuggestions(false);
    setQuery('');
    publishSearchMountedResultsDataSnapshot(null);
    searchRuntimeBus.publish({
      resultsRequestKey: null,
      resultsIdentityCandidateKey: null,
      resultsPage: null,
      resultsDishCount: 0,
      resultsRestaurantCount: 0,
      currentPage: 1,
      hasMoreFood: false,
      hasMoreRestaurants: false,
      isPaginationExhausted: false,
      isLoadingMore: false,
      canLoadMore: false,
    });
    resetShortcutCoverageState();
    resetMapMoveFlag();
    setError(null);
    setSuggestions([]);
    restoreSearchCloseOrigin(closeRestoreOrigin);
    lastAutoOpenKeyRef.current = null;
    resetFocusedMapState();
    setRestaurantOnlyIntent(null);
    searchSessionQueryRef.current = '';
    setSearchTransitionVariant('default');
    Keyboard.dismiss();
    inputRef.current?.blur();
    scrollResultsToTop();
    isClearingSearchRef.current = false;
  }, [
    captureSearchCloseOrigin,
    cancelActiveSearchRequest,
    cancelAutocomplete,
    cancelToggleInteraction,
    handleCancelPendingMutationWork,
    hasResults,
    inputRef,
    isClearingSearchRef,
    isSearchSessionActive,
    lastAutoOpenKeyRef,
    restoreSearchCloseOrigin,
    resetFocusedMapState,
    resetMapMoveFlag,
    resetShortcutCoverageState,
    resetSubmitTransitionHold,
    scrollResultsToTop,
    searchRuntimeBus,
    searchSessionQueryRef,
    setError,
    setIsAutocompleteSuppressed,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setQuery,
    setRestaurantOnlyIntent,
    setSearchTransitionVariant,
    setShowSuggestions,
    setSuggestions,
    submittedQuery,
  ]);

  const clearTypedQuery = React.useCallback(() => {
    cancelAutocomplete();
    setIsAutocompleteSuppressed(false);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  }, [
    cancelAutocomplete,
    setIsAutocompleteSuppressed,
    setQuery,
    setShowSuggestions,
    setSuggestions,
  ]);

  const clearSearchState = React.useCallback(
    ({
      shouldRefocusInput = false,
      skipSheetAnimation = false,
      deferSuggestionClear = false,
      skipPostSearchRestore = false,
      preserveForegroundEditing = false,
      skipProfileDismissClear = false,
    }: ClearSearchStateOptions = {}) => {
      // S-C.4 item 3 step 2: the origin is a local VALUE — captured here (pre-teardown state),
      // restored at the same point in the sequence the old flush ran. No store ledger.
      const closeRestoreOrigin = skipPostSearchRestore
        ? null
        : captureSearchCloseOrigin({
            allowFallback: isSearchSessionActive || hasResults || submittedQuery.length > 0,
            searchRootRestoreSnap: 'collapsed',
          });
      isClearingSearchRef.current = true;
      cancelActiveSearchRequest();
      cancelAutocomplete();
      handleCancelPendingMutationWork();
      if (!deferSuggestionClear) {
        resetSubmitTransitionHold();
      }
      // Dismiss is ONE commit moment = ONE atomic tuple write (identity idle + filters
      // reset + bounds cleared). Two writes made the intermediate filters-only delta
      // classify as a phantom variant_rerun — caught by the S4a reconciler parity trace.
      writeSearchDesiredTuple(
        searchRuntimeBus,
        {
          queryIdentity: { kind: 'idle' },
          committedBounds: null,
          filterVariant: { ...DEFAULT_SEARCH_FILTER_VARIANT },
        },
        'dismiss'
      );
      cancelToggleInteraction();
      if (!preserveForegroundEditing) {
        setIsSearchFocused(false);
        setIsSuggestionPanelActive(false);
        setIsAutocompleteSuppressed(true);
        if (!deferSuggestionClear) {
          setShowSuggestions(false);
        }
        setQuery('');
      }
      publishSearchMountedResultsDataSnapshot(null);
      searchRuntimeBus.publish({
        resultsRequestKey: null,
        resultsIdentityCandidateKey: null,
        resultsPage: null,
        resultsDishCount: 0,
        resultsRestaurantCount: 0,
        currentPage: 1,
        hasMoreFood: false,
        hasMoreRestaurants: false,
        isPaginationExhausted: false,
        isLoadingMore: false,
        canLoadMore: false,
      });
      resetShortcutCoverageState();
      resetMapMoveFlag();
      setError(null);
      if (!deferSuggestionClear && !preserveForegroundEditing) {
        setSuggestions([]);
      }
      if (skipSheetAnimation) {
        resetSheetToHidden();
      }
      if (closeRestoreOrigin != null) {
        restoreSearchCloseOrigin(closeRestoreOrigin);
      } else if (!skipPostSearchRestore) {
        restoreSearchCloseOrigin(null);
      }
      if (profilePresentationActiveRef.current && !skipProfileDismissClear) {
        clearRestaurantProfileForSearchDismissRef.current();
      }
      lastAutoOpenKeyRef.current = null;
      resetRestaurantProfileFocusSessionRef.current();
      resetFocusedMapState();
      setRestaurantOnlyIntent(null);
      searchSessionQueryRef.current = '';
      setSearchTransitionVariant('default');
      if (!preserveForegroundEditing) {
        Keyboard.dismiss();
        inputRef.current?.blur();
      }
      scrollResultsToTop();
      isClearingSearchRef.current = false;
      if (shouldRefocusInput) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    },
    [
      captureSearchCloseOrigin,
      cancelActiveSearchRequest,
      cancelAutocomplete,
      cancelToggleInteraction,
      handleCancelPendingMutationWork,
      hasResults,
      inputRef,
      isClearingSearchRef,
      isSearchSessionActive,
      lastAutoOpenKeyRef,
      profilePresentationActiveRef,
      clearRestaurantProfileForSearchDismissRef,
      restoreSearchCloseOrigin,
      resetFocusedMapState,
      resetMapMoveFlag,
      resetRestaurantProfileFocusSessionRef,
      resetSheetToHidden,
      resetShortcutCoverageState,
      resetSubmitTransitionHold,
      scrollResultsToTop,
      searchRuntimeBus,
      searchSessionQueryRef,
      setError,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setQuery,
      setRestaurantOnlyIntent,
      setSearchTransitionVariant,
      setShowSuggestions,
      setSuggestions,
      submittedQuery,
    ]
  );

  return React.useMemo(
    () => ({
      clearSearchAfterProfileDismiss,
      clearTypedQuery,
      clearSearchState,
    }),
    [clearSearchAfterProfileDismiss, clearSearchState, clearTypedQuery]
  );
};
