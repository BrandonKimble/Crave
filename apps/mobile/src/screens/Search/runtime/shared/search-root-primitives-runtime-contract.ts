import type MapboxGL from '@rnmapbox/maps';
import type { FlashListRef } from '@shopify/flash-list';
import type React from 'react';
import type { TextInput } from 'react-native';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { SearchChromeScalarSurfacePrimitiveSourceRuntime } from '../native/search-chrome-scalar-surface-primitive-source-runtime';
import type { SearchFiltersLayoutCache } from '../../components/SearchFilters';
import type { SearchMapMarkerEngineHandle } from '../../components/SearchMapWithMarkerEngine';
import type { MapboxMapRef } from '../../components/search-map';
import type { ResultsListItem } from '../read-models/read-model-selectors';
import type {
  SearchPrimitiveUiCleanupActions,
  SearchPrimitiveUiStateController,
} from './search-primitive-ui-state-controller';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';

export type SearchRootSearchStateRuntime = {
  pendingRestaurantSelectionRef: React.MutableRefObject<{ restaurantId: string } | null>;
  resetFocusedMapState: () => void;
  searchSessionQueryRef: React.MutableRefObject<string>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  primitiveUiStateController: SearchPrimitiveUiStateController;
  primitiveUiCleanupActions: SearchPrimitiveUiCleanupActions;
  beginSuggestionCloseHoldRef: React.MutableRefObject<() => boolean>;
  setBeginSuggestionCloseHold: (handler: () => boolean) => void;
  shouldDisableSearchShortcutsRef: React.MutableRefObject<boolean>;
  setShouldDisableSearchShortcuts: (disabled: boolean) => void;
  setSearchChromeScalarPrimitiveTarget: (
    target: Pick<SearchChromeScalarSurfacePrimitiveSourceRuntime, 'updatePrimitiveSnapshot'> | null
  ) => () => void;
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
  suggestionPanelStateController: SearchSuggestionPanelStateController;
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
  mapBearing: number | null;
  setMapBearing: React.Dispatch<React.SetStateAction<number | null>>;
  mapPitch: number | null;
  setMapPitch: React.Dispatch<React.SetStateAction<number | null>>;
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
