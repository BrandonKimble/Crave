import React from 'react';
import { Keyboard } from 'react-native';
import type { TextInput } from 'react-native';
import type { SearchRuntimeBus } from '../runtime/shared/search-runtime-bus';

type ClearSearchStateOptions = {
  shouldRefocusInput?: boolean;
  skipSheetAnimation?: boolean;
  deferSuggestionClear?: boolean;
  skipProfileDismissWait?: boolean;
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
  searchRuntimeBus: SearchRuntimeBus;
  inputRef: React.RefObject<TextInput | null>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  profileDismissBehaviorRef: React.MutableRefObject<'restore' | 'clear'>;
  shouldClearSearchOnProfileDismissRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  closeRestaurantProfileRef: React.MutableRefObject<(() => void) | null>;
  lodPinnedMarkersRef: React.MutableRefObject<unknown[]>;
  lastAutoOpenKeyRef: React.MutableRefObject<string | null>;
  restaurantFocusSessionRef: React.MutableRefObject<RestaurantFocusSessionRefState>;
  searchSessionQueryRef: React.MutableRefObject<string>;
  beginSearchCloseRestore: (options: { allowFallback: boolean }) => boolean;
  flushPendingSearchOriginRestore: () => void;
  requestDefaultPostSearchRestore: () => void;
  cancelActiveSearchRequest: () => void;
  cancelAutocomplete: () => void;
  cancelPendingMutationWork: () => void;
  resetSubmitTransitionHold: () => void;
  resetFilters: () => void;
  resetFocusedMapState: () => void;
  resetMapMoveFlag: () => void;
  resetSheetToHidden: () => void;
  recomputeLodPinnedMarkers: (next: null) => void;
  scrollResultsToTop: () => void;
  setRestaurantOnlyIntent: (restaurantId: string | null) => void;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<'default' | 'submitting'>>;
  shortcutContentFadeMode: { value: number };
  shortcutFadeDefault: number;
  setSearchShortcutsFadeResetKey: React.Dispatch<React.SetStateAction<number>>;
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
  onCloseResultsUiReset: () => void;
};

type UseSearchClearControllerResult = {
  clearSearchState: (options?: ClearSearchStateOptions) => void;
  handleClear: () => void;
  handleCloseResults: () => void;
};

export const useSearchClearController = <TSearchMode, TError, TSuggestion>({
  isRestaurantOverlayVisible,
  isSearchSessionActive,
  isSearchLoading,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
  searchRuntimeBus,
  inputRef,
  ignoreNextSearchBlurRef,
  profileDismissBehaviorRef,
  shouldClearSearchOnProfileDismissRef,
  isClearingSearchRef,
  closeRestaurantProfileRef,
  lodPinnedMarkersRef,
  lastAutoOpenKeyRef,
  restaurantFocusSessionRef,
  searchSessionQueryRef,
  beginSearchCloseRestore,
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
  recomputeLodPinnedMarkers,
  scrollResultsToTop,
  setRestaurantOnlyIntent,
  setSearchTransitionVariant,
  shortcutContentFadeMode,
  shortcutFadeDefault,
  setSearchShortcutsFadeResetKey,
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
  onCloseResultsUiReset,
}: UseSearchClearControllerArgs<
  TSearchMode,
  TError,
  TSuggestion
>): UseSearchClearControllerResult => {
  const clearSearchState = React.useCallback(
    ({
      shouldRefocusInput = false,
      skipSheetAnimation = false,
      deferSuggestionClear = false,
      skipProfileDismissWait = false,
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
      const hasOriginRestorePending = beginSearchCloseRestore({
        allowFallback:
          isSearchSessionActive || Boolean(busState.results) || busState.submittedQuery.length > 0,
      });
      isClearingSearchRef.current = true;
      if (
        isSearchSessionActive ||
        Boolean(busState.results) ||
        busState.submittedQuery.length > 0
      ) {
        setSearchShortcutsFadeResetKey((current) => current + 1);
      }
      cancelActiveSearchRequest();
      cancelAutocomplete();
      cancelPendingMutationWork();
      if (!deferSuggestionClear) {
        resetSubmitTransitionHold();
      }
      resetFilters();
      setIsFilterTogglePending(false);
      setIsSearchFocused(false);
      setIsSuggestionPanelActive(false);
      setIsAutocompleteSuppressed(true);
      if (!deferSuggestionClear) {
        setShowSuggestions(false);
      }
      setQuery('');
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
      lodPinnedMarkersRef.current = [];
      recomputeLodPinnedMarkers(null);
      resetMapMoveFlag();
      setError(null);
      if (!deferSuggestionClear) {
        setSuggestions([]);
      }
      setIsSearchSessionActive(false);
      setSearchMode(null);
      if (skipSheetAnimation) {
        resetSheetToHidden();
      }
      if (hasOriginRestorePending) {
        flushPendingSearchOriginRestore();
      } else {
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
      shortcutContentFadeMode.value = shortcutFadeDefault;
      profileDismissBehaviorRef.current = 'restore';
      shouldClearSearchOnProfileDismissRef.current = false;
      Keyboard.dismiss();
      inputRef.current?.blur();
      scrollResultsToTop();
      isClearingSearchRef.current = false;
      if (shouldRefocusInput) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    },
    [
      beginSearchCloseRestore,
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
      lodPinnedMarkersRef,
      profileDismissBehaviorRef,
      recomputeLodPinnedMarkers,
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
      setSearchShortcutsFadeResetKey,
      setSearchTransitionVariant,
      setShowSuggestions,
      setSuggestions,
      shortcutContentFadeMode,
      shortcutFadeDefault,
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

  const handleClear = React.useCallback(() => {
    const shouldCloseSuggestions = isSuggestionPanelActive || isSuggestionPanelVisible;
    if (isSuggestionPanelActive) {
      clearTypedQuery();
      return;
    }
    if (!isSearchSessionActive && !shouldCloseSuggestions && !isRestaurantOverlayVisible) {
      clearTypedQuery();
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
    searchRuntimeBus,
  ]);

  const handleCloseResults = React.useCallback(() => {
    ignoreNextSearchBlurRef.current = true;
    onCloseResultsUiReset();
    clearSearchState({
      skipProfileDismissWait: true,
    });
  }, [clearSearchState, ignoreNextSearchBlurRef, onCloseResultsUiReset]);

  return {
    clearSearchState,
    handleClear,
    handleCloseResults,
  };
};
