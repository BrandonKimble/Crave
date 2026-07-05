import React from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import type { SetStateAction } from 'react';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { normalizeActiveTab, type SearchActiveTab } from '../../../../store/searchStore';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
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
  searchRuntimeBus,
  primitiveUiStateController,
  suggestionPanelStateController,
}: {
  searchRuntimeBus: SearchRuntimeBus;
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
  // R1c single-writer: tab state lives on the SearchRuntimeBus (the runtime authority); the
  // zustand searchStore only mirrors it via search-runtime-filter-state-store-bridge.ts.
  const { activeTab, preferredActiveTab, hasActiveTabPreference } = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      activeTab: state.activeTab,
      preferredActiveTab: state.preferredActiveTab,
      hasActiveTabPreference: state.hasActiveTabPreference,
    }),
    (left, right) =>
      left.activeTab === right.activeTab &&
      left.preferredActiveTab === right.preferredActiveTab &&
      left.hasActiveTabPreference === right.hasActiveTabPreference,
    ['activeTab', 'preferredActiveTab', 'hasActiveTabPreference'] as const,
    'search_root_tab_state_runtime'
  );
  const setActiveTab = React.useCallback(
    (tab: SetStateAction<SearchActiveTab>) => {
      const resolved = typeof tab === 'function' ? tab(searchRuntimeBus.getState().activeTab) : tab;
      searchRuntimeBus.publish({
        activeTab: normalizeActiveTab(resolved),
      });
    },
    [searchRuntimeBus]
  );
  const setActiveTabPreference = React.useCallback(
    (tab: SearchActiveTab) => {
      searchRuntimeBus.publish({
        preferredActiveTab: normalizeActiveTab(tab),
        hasActiveTabPreference: true,
      });
    },
    [searchRuntimeBus]
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
