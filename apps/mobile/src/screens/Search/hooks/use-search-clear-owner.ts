import React from 'react';
import { Keyboard, type TextInput } from 'react-native';

import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';
import { writeSearchDesiredTuple } from '../runtime/shared/search-desired-state-writer';
import { DEFAULT_SEARCH_FILTER_VARIANT } from '../runtime/shared/search-desired-state-contract';
import { publishSearchMountedResultsDataSnapshot } from '../runtime/shared/search-mounted-results-data-store';
import { resetSearchFiltersStripScrollX } from '../runtime/shared/use-search-root-search-primitives-runtime';

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
};

export type UseSearchClearOwnerArgs<Suggestion> = {
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
  searchSessionQueryRef: React.MutableRefObject<string>;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<'default' | 'submitting'>>;
  inputRef: React.RefObject<TextInput | null>;
  scrollResultsToTop: () => void;
};

export const useSearchClearOwner = <Suggestion>({
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
  searchSessionQueryRef,
  setSearchTransitionVariant,
  inputRef,
  scrollResultsToTop,
}: UseSearchClearOwnerArgs<Suggestion>): SearchClearOwner => {
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
      // Owner decision (leg 3): strip scrollX resets on re-present. The dismiss tuple
      // write above already resets the FILTER VALUES to defaults; the strip's scroll
      // POSITION resets in the same breath (cache scrollX → 0 + live retained
      // instances scroll home), so the next presentation paints the strip at x=0.
      // Tab-flip persistence within a presentation is untouched (nothing clears there).
      resetSearchFiltersStripScrollX();
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
      // S-C.5 slices B+C: the profile-dismiss clear is gone — profile teardown rides the
      // restaurant ENTRY's pop (the pop-teardown writer), not the search clear.
      lastAutoOpenKeyRef.current = null;
      resetRestaurantProfileFocusSessionRef.current();
      resetFocusedMapState();
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
      setSearchTransitionVariant,
      setShowSuggestions,
      setSuggestions,
      submittedQuery,
    ]
  );

  // S-C.5 item 8: the old 86-line fork was clearSearchState() minus one idempotent focus
  // reset — a copy that would only ever drift. The profile-dismiss clear IS the default clear.
  const clearSearchAfterProfileDismiss = React.useCallback(() => {
    clearSearchState();
  }, [clearSearchState]);

  return React.useMemo(
    () => ({
      clearSearchAfterProfileDismiss,
      clearTypedQuery,
      clearSearchState,
    }),
    [clearSearchAfterProfileDismiss, clearSearchState, clearTypedQuery]
  );
};
