import type MapboxGL from '@rnmapbox/maps';
import type { FlashListRef } from '@shopify/flash-list';
import type React from 'react';
import type { TextInput } from 'react-native';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type { SearchChromeScalarSurfacePrimitiveSourceRuntime } from '../native/search-chrome-scalar-surface-primitive-source-runtime';
import type { ToggleStripCacheSeat } from '../../../../toggles/toggle-strip-layout-cache';
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
  /** The native-first ref. Correct for the chrome-scalar push; NOT a reactive read — JS
   *  consumers must go through `shouldDisableSearchShortcutsAuthority` (F1323). */
  shouldDisableSearchShortcutsRef: React.MutableRefObject<boolean>;
  /** F1323: the notifying view of the same fact, for JS readers that render from it. */
  shouldDisableSearchShortcutsAuthority: {
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => boolean;
  };
  setShouldDisableSearchShortcuts: (disabled: boolean) => void;
  setSearchChromeScalarPrimitiveTarget: (
    target: Pick<SearchChromeScalarSurfacePrimitiveSourceRuntime, 'updatePrimitiveSnapshot'> | null
  ) => () => void;
  // F1308 — TWO WRITE-ONLY `useState` PAIRS ARE GONE FROM HERE.
  //
  // `showSuggestions` and `error` were both declared as `const [, setX] = useState(...)` — the
  // VALUE discarded at the declaration — and only their SETTERS were published on this
  // contract. A repo-wide grep for either name minus its setter returned EMPTY: nothing
  // anywhere could read them. Yet `setShowSuggestions` was referenced in 35 FILES and threaded
  // through six arg contracts, and every one of those calls scheduled a real React re-render
  // of the search-root primitives runtime — the highest-fanout object in the search tree — to
  // publish a value no consumer could observe.
  //
  // What they COMPENSATED FOR: `showSuggestions` was genuinely read once, before the
  // suggestion display runtime replaced it with the `shouldRenderAutocompleteSection` /
  // `shouldRenderSuggestionPanel` derivations. The setter was left wired so that no call site
  // had to change — which is precisely how 35 files came to depend on a value that no longer
  // existed.
  //
  // BANKED BEFORE DELETION: the five cleanup paths that called `setShowSuggestions(false)`
  // beside `setSuggestions([])` were each checked to confirm they still clear the ARRAY — they
  // do; `setSuggestions` is live and is the write that the suggestion surface actually derives
  // from. `setError(null)` had three callers, none of them paired with anything.
  //
  // THE LAW: state exists only if something reads it, and a setter is not state.
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  suggestions: AutocompleteMatch[];
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
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
  /** The strip engine's per-surface warm-restore seat (layout + settled scrollX). */
  searchFiltersCacheSeat: ToggleStripCacheSeat;
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
