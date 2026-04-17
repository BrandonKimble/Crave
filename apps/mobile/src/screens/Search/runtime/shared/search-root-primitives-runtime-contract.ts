import type MapboxGL from '@rnmapbox/maps';
import type { FlashListRef } from '@shopify/flash-list';
import type React from 'react';
import type { TextInput } from 'react-native';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { SearchFiltersLayoutCache } from '../../components/SearchFilters';
import type { SearchMapMarkerEngineHandle } from '../../components/SearchMapWithMarkerEngine';
import type { MapboxMapRef } from '../../components/search-map';
import type { ResultsListItem } from '../read-models/read-model-selectors';

export type SearchRootSearchStateRuntime = {
  pendingRestaurantSelectionRef: React.MutableRefObject<{ restaurantId: string } | null>;
  restaurantOnlyId: string | null;
  setRestaurantOnlyId: (value: string | null) => void;
  restaurantOnlySearchRef: React.MutableRefObject<string | null>;
  setRestaurantOnlyIntent: (value: string | null) => void;
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
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  hasActiveTabPreference: boolean;
  preferredActiveTab: 'dishes' | 'restaurants' | null;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  inputRef: React.RefObject<TextInput | null>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  resultsScrollRef: React.MutableRefObject<FlashListRef<ResultsListItem> | null>;
  searchFiltersLayoutCacheRef: React.MutableRefObject<SearchFiltersLayoutCache | null>;
  handleSearchFiltersLayoutCache: (cache: SearchFiltersLayoutCache) => void;
  isSearchFiltersLayoutWarm: boolean;
  isSearchEditingRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
};

export type SearchRootMapStateRuntime = {
  cameraRef: React.MutableRefObject<MapboxGL.Camera | null>;
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

export type SearchRootPrimitivesRuntime = {
  searchState: SearchRootSearchStateRuntime;
  mapState: SearchRootMapStateRuntime;
};
