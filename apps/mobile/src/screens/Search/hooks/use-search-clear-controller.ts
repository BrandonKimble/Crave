import React from 'react';
import { Keyboard } from 'react-native';
import type { TextInput } from 'react-native';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';

type ClearSearchStateOptions = {
  shouldRefocusInput?: boolean;
  skipSheetAnimation?: boolean;
  deferSuggestionClear?: boolean;
  skipProfileDismissWait?: boolean;
  skipPostSearchRestore?: boolean;
  preserveForegroundEditing?: boolean;
};

type RestaurantFocusSessionRefState = {
  restaurantId: string | null;
  locationKey: string | null;
  hasAppliedInitialMultiLocationZoomOut: boolean;
};

type UseSearchClearControllerArgs<TSearchMode, TError, TSuggestion> = {
  isRestaurantOverlayVisible: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  shouldPreserveForegroundEditingOnClose: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  inputRef: React.RefObject<TextInput | null>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  profileDismissBehaviorRef: React.MutableRefObject<'restore' | 'clear'>;
  shouldClearSearchOnProfileDismissRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  closeRestaurantProfileRef: React.MutableRefObject<(() => void) | null>;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
  restaurantFocusSessionRef: React.MutableRefObject<RestaurantFocusSessionRefState>;
  searchSessionQueryRef: React.MutableRefObject<string>;
  armSearchCloseRestore: (options: {
    allowFallback: boolean;
    searchRootRestoreSnap?: 'expanded' | 'middle' | 'collapsed';
  }) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
  cancelActiveSearchRequest: () => void;
  cancelAutocomplete: () => void;
  cancelPendingMutationWork: () => void;
  resetSubmitTransitionHold: () => void;
  resetFilters: () => void;
  resetFocusedMapState: () => void;
  resetMapMoveFlag: () => void;
  resetSheetToHidden: () => void;
  scrollResultsToTop: () => void;
  setRestaurantOnlyIntent: (restaurantId: string | null) => void;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<'default' | 'submitting'>>;
  setIsFilterTogglePending: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<TError | null>>;
  setSuggestions: React.Dispatch<React.SetStateAction<TSuggestion[]>>;
  setIsSearchSessionActive: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchMode: React.Dispatch<React.SetStateAction<TSearchMode | null>>;
  resetShortcutCoverageState: () => void;
  startClosePresentation: (options?: { intentId?: string }) => string;
  cancelClosePresentation: (intentId?: string) => void;
  onCloseResultsUiReset: () => void;
};

type UseSearchClearControllerResult = {
  clearSearchState: (options?: ClearSearchStateOptions) => void;
  beginCloseSearch: () => void;
  finalizeCloseSearch: (intentId: string) => void;
  cancelCloseSearch: (intentId?: string) => void;
  handleClear: () => void;
  handleCloseResults: () => void;
};

export const useSearchClearController = <TSearchMode, TError, TSuggestion>({
  isRestaurantOverlayVisible,
  isSearchSessionActive,
  isSearchLoading,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  shouldPreserveForegroundEditingOnClose,
  searchRuntimeBus,
  inputRef,
  ignoreNextSearchBlurRef,
  profileDismissBehaviorRef,
  shouldClearSearchOnProfileDismissRef,
  isClearingSearchRef,
  closeRestaurantProfileRef,
  lastAutoOpenKeyRef,
  restaurantFocusSessionRef,
  searchSessionQueryRef,
  armSearchCloseRestore,
  commitSearchCloseRestore,
  cancelSearchCloseRestore,
  flushPendingSearchOriginRestore,
  requestDefaultPostSearchRestore,
  cancelActiveSearchRequest,
  cancelAutocomplete,
  cancelPendingMutationWork,
  resetSubmitTransitionHold,
  resetFilters,
  resetFocusedMapState,
  resetMapMoveFlag,
  resetSheetToHidden,
  scrollResultsToTop,
  setRestaurantOnlyIntent,
  setSearchTransitionVariant,
  setIsFilterTogglePending,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsAutocompleteSuppressed,
  setShowSuggestions,
  setQuery,
  setError,
  setSuggestions,
  setIsSearchSessionActive,
  setSearchMode,
  resetShortcutCoverageState,
  startClosePresentation,
  cancelClosePresentation,
  onCloseResultsUiReset,
}: UseSearchClearControllerArgs<
  TSearchMode,
  TError,
  TSuggestion
>): UseSearchClearControllerResult => {
  const pendingCloseIntentIdRef = React.useRef<string | null>(null);
  const pendingCloseCleanupFrameRef = React.useRef<number | null>(null);

  const clearSearchState = React.useCallback(
    ({
      shouldRefocusInput = false,
      skipSheetAnimation = false,
      deferSuggestionClear = false,
      skipProfileDismissWait = false,
      skipPostSearchRestore = false,
      preserveForegroundEditing = false,
    }: ClearSearchStateOptions = {}) => {
      if (isRestaurantOverlayVisible && !isClearingSearchRef.current) {
        profileDismissBehaviorRef.current = 'clear';
        shouldClearSearchOnProfileDismissRef.current = !skipProfileDismissWait;
        resetSheetToHidden();
        closeRestaurantProfileRef.current?.();
        if (!skipProfileDismissWait) {
          return;
        }
      }
      const busState = searchRuntimeBus.getState();
      const hasOriginRestorePending = skipPostSearchRestore
        ? false
        : armSearchCloseRestore({
            allowFallback:
              isSearchSessionActive ||
              Boolean(busState.results) ||
              busState.submittedQuery.length > 0,
            searchRootRestoreSnap: 'collapsed',
          });
      isClearingSearchRef.current = true;
      cancelActiveSearchRequest();
      cancelAutocomplete();
      cancelPendingMutationWork();
      if (!deferSuggestionClear) {
        resetSubmitTransitionHold();
      }
      resetFilters();
      setIsFilterTogglePending(false);
      if (!preserveForegroundEditing) {
        setIsSearchFocused(false);
        setIsSuggestionPanelActive(false);
        setIsAutocompleteSuppressed(true);
        if (!deferSuggestionClear) {
          setShowSuggestions(false);
        }
        setQuery('');
      }
      searchRuntimeBus.publish({
        results: null,
        resultsRequestKey: null,
        submittedQuery: '',
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
      setIsSearchSessionActive(false);
      setSearchMode(null);
      if (skipSheetAnimation) {
        resetSheetToHidden();
      }
      if (hasOriginRestorePending) {
        commitSearchCloseRestore();
        flushPendingSearchOriginRestore();
      } else if (!skipPostSearchRestore) {
        requestDefaultPostSearchRestore();
      }
      lastAutoOpenKeyRef.current = null;
      restaurantFocusSessionRef.current = {
        restaurantId: null,
        locationKey: null,
        hasAppliedInitialMultiLocationZoomOut: false,
      };
      resetFocusedMapState();
      setRestaurantOnlyIntent(null);
      searchSessionQueryRef.current = '';
      setSearchTransitionVariant('default');
      profileDismissBehaviorRef.current = 'restore';
      shouldClearSearchOnProfileDismissRef.current = false;
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
      armSearchCloseRestore,
      commitSearchCloseRestore,
      cancelActiveSearchRequest,
      cancelAutocomplete,
      cancelPendingMutationWork,
      closeRestaurantProfileRef,
      flushPendingSearchOriginRestore,
      inputRef,
      isRestaurantOverlayVisible,
      isSearchSessionActive,
      isClearingSearchRef,
      lastAutoOpenKeyRef,
      profileDismissBehaviorRef,
      requestDefaultPostSearchRestore,
      resetFilters,
      resetFocusedMapState,
      resetMapMoveFlag,
      resetSheetToHidden,
      resetShortcutCoverageState,
      resetSubmitTransitionHold,
      restaurantFocusSessionRef,
      scrollResultsToTop,
      searchRuntimeBus,
      searchSessionQueryRef,
      setError,
      setIsAutocompleteSuppressed,
      setIsFilterTogglePending,
      setIsSearchFocused,
      setIsSearchSessionActive,
      setIsSuggestionPanelActive,
      setQuery,
      setRestaurantOnlyIntent,
      setSearchMode,
      setSearchTransitionVariant,
      setShowSuggestions,
      setSuggestions,
      shouldClearSearchOnProfileDismissRef,
    ]
  );

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

  const finalizeCloseSearch = React.useCallback(
    (intentId: string) => {
      if (pendingCloseIntentIdRef.current !== intentId) {
        return;
      }
      clearSearchState({
        skipProfileDismissWait: true,
        skipPostSearchRestore: true,
        preserveForegroundEditing: shouldPreserveForegroundEditingOnClose,
      });
      pendingCloseIntentIdRef.current = null;
    },
    [clearSearchState, shouldPreserveForegroundEditingOnClose]
  );

  const cancelCloseSearch = React.useCallback(
    (intentId?: string) => {
      if (
        intentId != null &&
        pendingCloseIntentIdRef.current != null &&
        pendingCloseIntentIdRef.current !== intentId
      ) {
        return;
      }
      pendingCloseIntentIdRef.current = null;
      if (pendingCloseCleanupFrameRef.current != null) {
        cancelAnimationFrame(pendingCloseCleanupFrameRef.current);
        pendingCloseCleanupFrameRef.current = null;
      }
      isClearingSearchRef.current = false;
      cancelSearchCloseRestore();
      cancelClosePresentation(intentId);
    },
    [
      cancelClosePresentation,
      cancelSearchCloseRestore,
      isClearingSearchRef,
      pendingCloseCleanupFrameRef,
    ]
  );

  const beginCloseSearch = React.useCallback(() => {
    const busState = searchRuntimeBus.getState();
    const hasSearchToClose =
      isSearchSessionActive || Boolean(busState.results) || busState.submittedQuery.length > 0;
    if (!hasSearchToClose) {
      clearTypedQuery();
      return;
    }

    ignoreNextSearchBlurRef.current = true;
    const closeIntentId = startClosePresentation();
    pendingCloseIntentIdRef.current = closeIntentId;
    isClearingSearchRef.current = true;
    onCloseResultsUiReset();
    if (pendingCloseCleanupFrameRef.current != null) {
      cancelAnimationFrame(pendingCloseCleanupFrameRef.current);
    }
    pendingCloseCleanupFrameRef.current = requestAnimationFrame(() => {
      pendingCloseCleanupFrameRef.current = null;
      if (pendingCloseIntentIdRef.current !== closeIntentId) {
        return;
      }
      cancelActiveSearchRequest();
      cancelAutocomplete();
      cancelPendingMutationWork();
      resetSubmitTransitionHold();
      setIsFilterTogglePending(false);
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      setIsAutocompleteSuppressed(true);
      setShowSuggestions(false);
      setQuery('');
      setError(null);
      setSuggestions([]);
      Keyboard.dismiss();
      inputRef.current?.blur();
    });
  }, [
    cancelActiveSearchRequest,
    cancelAutocomplete,
    cancelPendingMutationWork,
    clearTypedQuery,
    inputRef,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    isSearchSessionActive,
    onCloseResultsUiReset,
    pendingCloseCleanupFrameRef,
    resetSubmitTransitionHold,
    searchRuntimeBus,
    setError,
    setIsAutocompleteSuppressed,
    setIsFilterTogglePending,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setQuery,
    setShowSuggestions,
    setSuggestions,
    startClosePresentation,
  ]);

  const handleClear = React.useCallback(() => {
    const shouldCloseSuggestions = isSuggestionPanelActive || isSuggestionPanelVisible;
    const busState = searchRuntimeBus.getState();
    const hasSearchToClose =
      isSearchSessionActive || Boolean(busState.results) || busState.submittedQuery.length > 0;
    if (isSuggestionPanelActive) {
      clearTypedQuery();
      return;
    }
    if (!isSearchSessionActive && !shouldCloseSuggestions && !isRestaurantOverlayVisible) {
      clearTypedQuery();
      return;
    }
    if (hasSearchToClose) {
      beginCloseSearch();
      return;
    }
    ignoreNextSearchBlurRef.current = true;
    clearSearchState({
      shouldRefocusInput:
        !isSearchSessionActive && !isSearchLoading && !searchRuntimeBus.getState().isLoadingMore,
      skipProfileDismissWait: true,
    });
  }, [
    clearSearchState,
    clearTypedQuery,
    ignoreNextSearchBlurRef,
    isRestaurantOverlayVisible,
    isSearchLoading,
    isSearchSessionActive,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
    beginCloseSearch,
    searchRuntimeBus,
  ]);

  const handleCloseResults = React.useCallback(() => {
    beginCloseSearch();
  }, [beginCloseSearch]);

  return {
    clearSearchState,
    beginCloseSearch,
    finalizeCloseSearch,
    cancelCloseSearch,
    handleClear,
    handleCloseResults,
  };
};
