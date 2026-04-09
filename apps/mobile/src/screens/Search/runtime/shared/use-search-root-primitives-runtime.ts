import React from 'react';
import { type TextInput } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import type { FlashListRef } from '@shopify/flash-list';
import { useShallow } from 'zustand/react/shallow';

import type { SearchMapMarkerEngineHandle } from '../../components/SearchMapWithMarkerEngine';
import type { MapboxMapRef } from '../../components/search-map';
import {
  cloneSearchFiltersLayoutCache,
  type SearchFiltersLayoutCache,
} from '../../components/SearchFilters';
import { useSearchStore } from '../../../../store/searchStore';
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { ResultsListItem } from '../read-models/read-model-selectors';
import type { UseSearchRootSessionRuntimeArgs } from './use-search-root-session-runtime-contract';

type UseSearchRootPrimitivesRuntimeArgs = {
  startupCamera: UseSearchRootSessionRuntimeArgs['startupCamera'];
};

export type SearchRootPrimitivesRuntime = {
  mapState: {
    cameraRef: React.RefObject<MapboxGL.Camera | null>;
    mapRef: React.MutableRefObject<MapboxMapRef | null>;
    markerEngineRef: React.MutableRefObject<SearchMapMarkerEngineHandle | null>;
    mapCenter: [number, number] | null;
    setMapCenter: React.Dispatch<React.SetStateAction<[number, number] | null>>;
    mapZoom: number | null;
    setMapZoom: React.Dispatch<React.SetStateAction<number | null>>;
    mapCameraAnimation: {
      mode: 'none' | 'easeTo';
      durationMs: number;
      completionId: string | null;
    };
    setMapCameraAnimation: React.Dispatch<
      React.SetStateAction<{
        mode: 'none' | 'easeTo';
        durationMs: number;
        completionId: string | null;
      }>
    >;
    isFollowingUser: boolean;
    setIsFollowingUser: React.Dispatch<React.SetStateAction<boolean>>;
    suppressMapMovedRef: React.MutableRefObject<boolean>;
    suppressMapMoved: () => void;
  };
  searchState: {
    pendingRestaurantSelectionRef: React.MutableRefObject<{
      restaurantId: string;
    } | null>;
    restaurantOnlyId: string | null;
    setRestaurantOnlyId: React.Dispatch<React.SetStateAction<string | null>>;
    restaurantOnlySearchRef: React.MutableRefObject<string | null>;
    setRestaurantOnlyIntent: (restaurantId: string | null) => void;
    resetFocusedMapState: () => void;
    searchSessionQueryRef: React.MutableRefObject<string>;
    isClearingSearchRef: React.MutableRefObject<boolean>;
    beginSuggestionCloseHoldRef: React.MutableRefObject<() => boolean>;
    setBeginSuggestionCloseHold: (handler: () => boolean) => void;
    shouldDisableSearchShortcutsRef: React.MutableRefObject<boolean>;
    setShouldDisableSearchShortcuts: (disabled: boolean) => void;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    query: string;
    setQuery: React.Dispatch<React.SetStateAction<string>>;
    suggestions: AutocompleteMatch[];
    setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
    setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
    isAutocompleteSuppressed: boolean;
    setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
    isSearchFocused: boolean;
    setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
    isSuggestionPanelActive: boolean;
    setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
    activeTab: ReturnType<typeof useSearchStore.getState>['activeTab'];
    preferredActiveTab: ReturnType<typeof useSearchStore.getState>['preferredActiveTab'];
    setActiveTab: ReturnType<typeof useSearchStore.getState>['setActiveTab'];
    hasActiveTabPreference: ReturnType<typeof useSearchStore.getState>['hasActiveTabPreference'];
    setActiveTabPreference: ReturnType<typeof useSearchStore.getState>['setActiveTabPreference'];
    inputRef: React.MutableRefObject<TextInput | null>;
    ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
    resultsScrollRef: React.MutableRefObject<FlashListRef<ResultsListItem> | null>;
    searchFiltersLayoutCacheRef: React.MutableRefObject<SearchFiltersLayoutCache | null>;
    isSearchFiltersLayoutWarm: boolean;
    handleSearchFiltersLayoutCache: (cache: SearchFiltersLayoutCache) => void;
    isSearchEditingRef: React.MutableRefObject<boolean>;
    allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  };
};

export const useSearchRootPrimitivesRuntime = ({
  startupCamera,
}: UseSearchRootPrimitivesRuntimeArgs): SearchRootPrimitivesRuntime => {
  const cameraRef = React.useRef<MapboxGL.Camera>(null);
  const mapRef = React.useRef<MapboxMapRef | null>(null);
  const markerEngineRef = React.useRef<SearchMapMarkerEngineHandle>(null);
  const [mapCenter, setMapCenter] = React.useState<[number, number] | null>(
    () => startupCamera?.center ?? null
  );
  const [mapZoom, setMapZoom] = React.useState<number | null>(() => startupCamera?.zoom ?? null);
  const [mapCameraAnimation, setMapCameraAnimation] = React.useState<{
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  }>(() => ({
    mode: 'none',
    durationMs: 0,
    completionId: null,
  }));
  const [isFollowingUser, setIsFollowingUser] = React.useState(false);
  const suppressMapMovedRef = React.useRef(false);
  const suppressMapMoved = React.useCallback(() => {
    suppressMapMovedRef.current = true;
  }, []);

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
  const beginSuggestionCloseHoldRef = React.useRef<() => boolean>(() => false);
  const setBeginSuggestionCloseHold = React.useCallback((handler: () => boolean) => {
    beginSuggestionCloseHoldRef.current = handler;
  }, []);
  const shouldDisableSearchShortcutsRef = React.useRef(false);
  const setShouldDisableSearchShortcuts = React.useCallback((disabled: boolean) => {
    shouldDisableSearchShortcutsRef.current = disabled;
  }, []);
  const [, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [, setShowSuggestions] = React.useState(false);
  const [isAutocompleteSuppressed, setIsAutocompleteSuppressed] = React.useState(false);
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [isSuggestionPanelActive, setIsSuggestionPanelActive] = React.useState(false);
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
  const inputRef = React.useRef<TextInput | null>(null);
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

  return {
    mapState: {
      cameraRef,
      mapRef,
      markerEngineRef,
      mapCenter,
      setMapCenter,
      mapZoom,
      setMapZoom,
      mapCameraAnimation,
      setMapCameraAnimation,
      isFollowingUser,
      setIsFollowingUser,
      suppressMapMovedRef,
      suppressMapMoved,
    },
    searchState: {
      pendingRestaurantSelectionRef,
      restaurantOnlyId,
      setRestaurantOnlyId,
      restaurantOnlySearchRef,
      setRestaurantOnlyIntent,
      resetFocusedMapState,
      searchSessionQueryRef,
      isClearingSearchRef,
      beginSuggestionCloseHoldRef,
      setBeginSuggestionCloseHold,
      shouldDisableSearchShortcutsRef,
      setShouldDisableSearchShortcuts,
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
    },
  };
};
