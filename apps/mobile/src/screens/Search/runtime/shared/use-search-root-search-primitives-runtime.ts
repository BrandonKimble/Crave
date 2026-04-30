import React from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import { useShallow } from 'zustand/react/shallow';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { useSearchStore } from '../../../../store/searchStore';
import {
  cloneSearchFiltersLayoutCache,
  type SearchFiltersLayoutCache,
} from '../../components/SearchFilters';
import type { ResultsListItem } from '../read-models/read-model-selectors';
import type { SearchChromeScalarSurfacePrimitiveSourceRuntime } from '../native/search-chrome-scalar-surface-primitive-source-runtime';
import type { SearchPrimitiveUiStateController } from './search-primitive-ui-state-controller';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';
import type { SearchRootSearchStateRuntime } from './search-root-primitives-runtime-contract';

export const useSearchRootSearchPrimitivesRuntime = ({
  primitiveUiStateController,
  suggestionPanelStateController,
}: {
  primitiveUiStateController: SearchPrimitiveUiStateController;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
}): SearchRootSearchStateRuntime => {
  const pendingRestaurantSelectionRef = React.useRef<{
    restaurantId: string;
  } | null>(null);
  const [restaurantOnlyId, setRestaurantOnlyId] = React.useState<string | null>(null);
  const restaurantOnlySearchRef = React.useRef<string | null>(null);
  const setRestaurantOnlyIntent = React.useCallback((restaurantId: string | null) => {
    restaurantOnlySearchRef.current = restaurantId;
    if (!restaurantId) {
      setRestaurantOnlyId(null);
    }
  }, []);
  const resetFocusedMapState = React.useCallback(() => {
    pendingRestaurantSelectionRef.current = null;
  }, []);
  const searchSessionQueryRef = React.useRef('');
  const isClearingSearchRef = React.useRef(false);
  const setBeginSuggestionCloseHold = React.useCallback(
    (handler: () => boolean) => {
      primitiveUiStateController.setBeginSuggestionCloseHold(handler);
    },
    [primitiveUiStateController]
  );
  const searchChromeScalarPrimitiveTargetRef = React.useRef<Pick<
    SearchChromeScalarSurfacePrimitiveSourceRuntime,
    'updatePrimitiveSnapshot'
  > | null>(null);
  const shouldDisableSearchShortcutsRef = React.useRef(false);
  const setShouldDisableSearchShortcuts = React.useCallback((disabled: boolean) => {
    if (shouldDisableSearchShortcutsRef.current === disabled) {
      return;
    }
    shouldDisableSearchShortcutsRef.current = disabled;
    searchChromeScalarPrimitiveTargetRef.current?.updatePrimitiveSnapshot({
      shouldDisableSearchShortcuts: disabled,
    });
  }, []);
  const setSearchChromeScalarPrimitiveTarget = React.useCallback(
    (
      target: Pick<
        SearchChromeScalarSurfacePrimitiveSourceRuntime,
        'updatePrimitiveSnapshot'
      > | null
    ) => {
      searchChromeScalarPrimitiveTargetRef.current = target;
      target?.updatePrimitiveSnapshot({
        shouldDisableSearchShortcuts: shouldDisableSearchShortcutsRef.current,
        isSuggestionPanelActive:
          suggestionPanelStateController.getSnapshot().isSuggestionPanelActive,
      });
      return () => {
        if (searchChromeScalarPrimitiveTargetRef.current === target) {
          searchChromeScalarPrimitiveTargetRef.current = null;
        }
      };
    },
    [suggestionPanelStateController]
  );
  const [, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestionsState] = React.useState<AutocompleteMatch[]>(
    () => primitiveUiStateController.getSnapshot().suggestions
  );
  const [, setShowSuggestions] = React.useState(false);
  const [isAutocompleteSuppressed, setIsAutocompleteSuppressedState] = React.useState(
    () => primitiveUiStateController.getSnapshot().isAutocompleteSuppressed
  );
  const [isSearchFocused, setIsSearchFocusedState] = React.useState(
    () => primitiveUiStateController.getSnapshot().isSearchFocused
  );
  const setSuggestions = React.useCallback<
    React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>
  >(
    (nextValue) => {
      const nextSnapshot = primitiveUiStateController.setSuggestions(nextValue);
      if (nextSnapshot == null) {
        return;
      }
      setSuggestionsState(nextSnapshot.suggestions);
    },
    [primitiveUiStateController]
  );
  const setIsAutocompleteSuppressed = React.useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (nextValue) => {
      const nextSnapshot = primitiveUiStateController.setIsAutocompleteSuppressed(nextValue);
      if (nextSnapshot == null) {
        return;
      }
      setIsAutocompleteSuppressedState(nextSnapshot.isAutocompleteSuppressed);
    },
    [primitiveUiStateController]
  );
  const setIsSearchFocused = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (nextValue) => {
      const nextSnapshot = primitiveUiStateController.setIsSearchFocused(nextValue);
      if (nextSnapshot == null) {
        return;
      }
      setIsSearchFocusedState(nextSnapshot.isSearchFocused);
    },
    [primitiveUiStateController]
  );
  const [isSuggestionPanelActive, setIsSuggestionPanelActiveState] = React.useState(false);
  const setIsSuggestionPanelActive = React.useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (nextValue) => {
      const nextSnapshot = suggestionPanelStateController.setIsSuggestionPanelActive(nextValue);
      if (nextSnapshot == null) {
        return;
      }
      searchChromeScalarPrimitiveTargetRef.current?.updatePrimitiveSnapshot({
        isSuggestionPanelActive: nextSnapshot.isSuggestionPanelActive,
      });
      setIsSuggestionPanelActiveState(nextSnapshot.isSuggestionPanelActive);
    },
    [suggestionPanelStateController]
  );
  const primitiveUiCleanupActions = React.useMemo(
    () => ({
      beginSuggestionCloseHold: primitiveUiStateController.beginSuggestionCloseHold,
      setSearchFocusedInactive: () => {
        setIsSearchFocused(false);
      },
      suppressAutocomplete: () => {
        setIsAutocompleteSuppressed(true);
      },
      clearSuggestions: () => {
        setShowSuggestions(false);
        setSuggestions([]);
      },
      blurInput: primitiveUiStateController.blurInput,
    }),
    [
      primitiveUiStateController.beginSuggestionCloseHold,
      primitiveUiStateController.blurInput,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setShowSuggestions,
      setSuggestions,
    ]
  );
  const {
    activeTab,
    preferredActiveTab,
    setActiveTab,
    hasActiveTabPreference,
    setActiveTabPreference,
  } = useSearchStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      preferredActiveTab: state.preferredActiveTab,
      setActiveTab: state.setActiveTab,
      hasActiveTabPreference: state.hasActiveTabPreference,
      setActiveTabPreference: state.setActiveTabPreference,
    }))
  );
  const inputRef = primitiveUiStateController.inputRef;
  const ignoreNextSearchBlurRef = React.useRef(false);
  const resultsScrollRef = React.useRef<FlashListRef<ResultsListItem> | null>(null);
  const searchFiltersLayoutCacheRef = React.useRef<SearchFiltersLayoutCache | null>(null);
  const [isSearchFiltersLayoutWarm, setIsSearchFiltersLayoutWarm] = React.useState(false);
  const handleSearchFiltersLayoutCache = React.useCallback((cache: SearchFiltersLayoutCache) => {
    searchFiltersLayoutCacheRef.current = cloneSearchFiltersLayoutCache(cache);
    setIsSearchFiltersLayoutWarm(true);
  }, []);
  const isSearchEditingRef = React.useRef(false);
  const allowSearchBlurExitRef = React.useRef(false);

  return React.useMemo(
    () => ({
      pendingRestaurantSelectionRef,
      restaurantOnlyId,
      setRestaurantOnlyId,
      restaurantOnlySearchRef,
      setRestaurantOnlyIntent,
      resetFocusedMapState,
      searchSessionQueryRef,
      isClearingSearchRef,
      primitiveUiStateController,
      primitiveUiCleanupActions,
      beginSuggestionCloseHoldRef: primitiveUiStateController.beginSuggestionCloseHoldRef,
      setBeginSuggestionCloseHold,
      shouldDisableSearchShortcutsRef,
      setShouldDisableSearchShortcuts,
      setSearchChromeScalarPrimitiveTarget,
      setError,
      query,
      setQuery,
      suggestions,
      setSuggestions,
      setShowSuggestions,
      isAutocompleteSuppressed,
      setIsAutocompleteSuppressed,
      isSearchFocused,
      setIsSearchFocused,
      suggestionPanelStateController,
      isSuggestionPanelActive,
      setIsSuggestionPanelActive,
      activeTab,
      preferredActiveTab,
      setActiveTab,
      hasActiveTabPreference,
      setActiveTabPreference,
      inputRef,
      ignoreNextSearchBlurRef,
      resultsScrollRef,
      searchFiltersLayoutCacheRef,
      isSearchFiltersLayoutWarm,
      handleSearchFiltersLayoutCache,
      isSearchEditingRef,
      allowSearchBlurExitRef,
    }),
    [
      activeTab,
      handleSearchFiltersLayoutCache,
      hasActiveTabPreference,
      isAutocompleteSuppressed,
      isSearchFiltersLayoutWarm,
      isSearchFocused,
      isSuggestionPanelActive,
      primitiveUiStateController,
      primitiveUiCleanupActions,
      preferredActiveTab,
      query,
      restaurantOnlyId,
      setActiveTab,
      setActiveTabPreference,
      setBeginSuggestionCloseHold,
      setError,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      suggestionPanelStateController,
      setQuery,
      setRestaurantOnlyId,
      setRestaurantOnlyIntent,
      setShouldDisableSearchShortcuts,
      setSearchChromeScalarPrimitiveTarget,
      suggestions,
    ]
  );
};
