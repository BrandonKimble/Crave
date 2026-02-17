import React from 'react';
import { Keyboard } from 'react-native';
import type { TextInput } from 'react-native';

import type { RestaurantResult } from '../../../types';

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

type UseSearchClearControllerArgs<
  TResult,
  TSearchMode,
  TError,
  TSuggestion,
> = {
  isRestaurantOverlayVisible: boolean;
  isSearchSessionActive: boolean;
  results: TResult | null;
  submittedQuery: string;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
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
  setResults: React.Dispatch<React.SetStateAction<TResult | null>>;
  setMarkerRestaurants: React.Dispatch<React.SetStateAction<RestaurantResult[]>>;
  setSubmittedQuery: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<TError | null>>;
  setSuggestions: React.Dispatch<React.SetStateAction<TSuggestion[]>>;
  setIsSearchSessionActive: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchMode: React.Dispatch<React.SetStateAction<TSearchMode | null>>;
  setHasMoreFood: React.Dispatch<React.SetStateAction<boolean>>;
  setHasMoreRestaurants: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setIsLoadingMore: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPaginationExhausted: React.Dispatch<React.SetStateAction<boolean>>;
  resetShortcutCoverageState: () => void;
  onCloseResultsUiReset: () => void;
  emptyRestaurants: RestaurantResult[];
};

type UseSearchClearControllerResult = {
  clearSearchState: (options?: ClearSearchStateOptions) => void;
  handleClear: () => void;
  handleCloseResults: () => void;
};

export const useSearchClearController = <
  TResults,
  TSearchMode,
  TError,
  TSuggestion,
>({
  isRestaurantOverlayVisible,
  isSearchSessionActive,
  results,
  submittedQuery,
  isSearchLoading,
  isLoadingMore,
  isSuggestionPanelActive,
  isSuggestionPanelVisible,
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
  setResults,
  setMarkerRestaurants,
  setSubmittedQuery,
  setError,
  setSuggestions,
  setIsSearchSessionActive,
  setSearchMode,
  setHasMoreFood,
  setHasMoreRestaurants,
  setCurrentPage,
  setIsLoadingMore,
  setIsPaginationExhausted,
  resetShortcutCoverageState,
  onCloseResultsUiReset,
  emptyRestaurants,
}: UseSearchClearControllerArgs<
  TResults,
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
      const hasOriginRestorePending = beginSearchCloseRestore({
        allowFallback: isSearchSessionActive || Boolean(results) || submittedQuery.length > 0,
      });
      isClearingSearchRef.current = true;
      if (isSearchSessionActive || Boolean(results) || submittedQuery.length > 0) {
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
      setResults(null);
      setMarkerRestaurants(emptyRestaurants);
      resetShortcutCoverageState();
      lodPinnedMarkersRef.current = [];
      recomputeLodPinnedMarkers(null);
      resetMapMoveFlag();
      setSubmittedQuery('');
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
      setHasMoreFood(false);
      setHasMoreRestaurants(false);
      setCurrentPage(1);
      setIsLoadingMore(false);
      setIsPaginationExhausted(false);
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
      emptyRestaurants,
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
      results,
      scrollResultsToTop,
      searchSessionQueryRef,
      setCurrentPage,
      setError,
      setHasMoreFood,
      setHasMoreRestaurants,
      setIsAutocompleteSuppressed,
      setIsFilterTogglePending,
      setIsLoadingMore,
      setIsPaginationExhausted,
      setIsSearchFocused,
      setIsSearchSessionActive,
      setIsSuggestionPanelActive,
      setMarkerRestaurants,
      setQuery,
      setRestaurantOnlyIntent,
      setResults,
      setSearchMode,
      setSearchShortcutsFadeResetKey,
      setSearchTransitionVariant,
      setShowSuggestions,
      setSubmittedQuery,
      setSuggestions,
      shortcutContentFadeMode,
      shortcutFadeDefault,
      shouldClearSearchOnProfileDismissRef,
      submittedQuery,
    ]
  );

  const clearTypedQuery = React.useCallback(() => {
    cancelAutocomplete();
    setIsAutocompleteSuppressed(false);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  }, [cancelAutocomplete, setIsAutocompleteSuppressed, setQuery, setShowSuggestions, setSuggestions]);

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
      shouldRefocusInput: !isSearchSessionActive && !isSearchLoading && !isLoadingMore,
      skipProfileDismissWait: true,
    });
  }, [
    clearSearchState,
    clearTypedQuery,
    ignoreNextSearchBlurRef,
    isLoadingMore,
    isRestaurantOverlayVisible,
    isSearchLoading,
    isSearchSessionActive,
    isSuggestionPanelActive,
    isSuggestionPanelVisible,
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
