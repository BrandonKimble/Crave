import type React from 'react';
import type { TextInput } from 'react-native';
import type { StackNavigationProp } from '@react-navigation/stack';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../../services/search';
import type { SearchResponse } from '../../../../types';
import type { RootStackParamList, MainSearchIntent } from '../../../../types/navigation';
import type { LaunchIntent } from '../../../../navigation/runtime/app-route-types';
import type { OverlayKey, OverlaySheetSnap } from '../../../../overlays/types';
import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type useSearchHistory from '../../hooks/use-search-history';
import type useSearchSubmitOwner from '../../hooks/use-search-submit-owner';
import type { OverlayRuntimeController } from '../controller/overlay-runtime-controller';

export type SearchForegroundSubmitRuntime = Pick<
  ReturnType<typeof useSearchSubmitOwner>,
  'submitSearch' | 'runRestaurantEntitySearch' | 'submitViewportShortcut' | 'rerunActiveSearch'
>;

export type SearchForegroundHistoryRuntime = Pick<
  ReturnType<typeof useSearchHistory>,
  'updateLocalRecentSearches'
>;

export type UseSearchForegroundInteractionRuntimeArgs = {
  navigation: StackNavigationProp<RootStackParamList>;
  routeSearchIntent: MainSearchIntent | null;
  activeMainIntent: LaunchIntent;
  consumeActiveMainIntent: () => void;
  userLocation: RootStackParamList['RecentSearches'] extends { userLocation?: infer T } | undefined
    ? T
    : never;
  submitRuntime: SearchForegroundSubmitRuntime;
  clearOwner: Pick<SearchClearOwner, 'clearTypedQuery' | 'clearSearchState'>;
  query: string;
  submittedQuery: string;
  searchMode: 'natural' | 'shortcut' | null;
  activeTab: 'dishes' | 'restaurants';
  hasResults: boolean;
  isOffline: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  isSearchSessionActive: boolean;
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  shouldTreatSearchAsResults: boolean;
  shouldShowDockedPolls: boolean;
  showPollsOverlay: boolean;
  rootOverlay: OverlayKey;
  profilePresentationActive: boolean;
  overlayRuntimeController: OverlayRuntimeController;
  openRestaurantProfilePreview: (restaurantId: string, restaurantName: string) => void;
  closeRestaurantProfile: (options?: {
    dismissBehavior?: 'restore' | 'clear';
    clearSearchOnDismiss?: boolean;
  }) => void;
  captureSearchSessionOrigin: () => void;
  captureSearchSessionQuery: () => void;
  ensureSearchOverlay: () => void;
  restoreDockedPolls: (args?: {
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
    clearTabSnapRequest?: boolean;
  }) => void;
  dismissTransientOverlays: () => void;
  suppressAutocompleteResults: () => void;
  allowAutocompleteResults: () => void;
  cancelAutocomplete: () => void;
  dismissSearchKeyboard: () => void;
  beginSubmitTransition: () => boolean;
  beginSuggestionCloseHold: (mode?: 'default' | 'submitting') => boolean;
  beginSuggestionCloseHoldRef: React.MutableRefObject<() => boolean>;
  requestSearchPresentationIntent: (intent: { kind: 'focus_editing' | 'exit_editing' }) => void;
  resetFocusedMapState: () => void;
  resetMapMoveFlag: () => void;
  resetSearchHeaderFocusProgress: () => void;
  resetSubmitTransitionHold: () => void;
  beginCloseSearch: () => void;
  setOverlaySwitchInFlight: (next: React.SetStateAction<boolean>) => void;
  setTabOverlaySnapRequest: (
    next: React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  ) => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setRestaurantOnlyIntent: (restaurantId: string | null) => void;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionLayoutWarm: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<'default' | 'submitting'>>;
  registerPendingMutationWorkCancel: (handler: () => void) => void;
  cancelToggleInteraction: () => void;
  toggleOpenNowHarnessRef: React.MutableRefObject<() => void>;
  toggleOpenNow: () => void;
  isSearchOverlay: boolean;
  isSearchFocused: boolean;
  isSuggestionScreenActive: boolean;
  pendingRestaurantSelectionRef: React.MutableRefObject<{
    restaurantId: string;
  } | null>;
  restaurantOnlySearchRef: React.MutableRefObject<string | null>;
  restaurantResults: SearchResponse['restaurants'] | null;
  searchSessionQueryRef: React.MutableRefObject<string>;
  isSearchEditingRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  inputRef: React.RefObject<TextInput | null>;
  deferRecentSearchUpsert: SearchForegroundHistoryRuntime['updateLocalRecentSearches'];
  setRestaurantOnlyId: (value: string | null) => void;
  saveSheetVisible: boolean;
  handleCloseSaveSheet: () => void;
};

export type SearchForegroundInteractionRuntime = {
  shouldRetrySearchOnReconnect: boolean;
  handleSubmit: () => void;
  handleBestDishesHere: () => void;
  handleBestRestaurantsHere: () => void;
  handleSearchThisArea: () => void;
  handleSuggestionPress: (match: AutocompleteMatch) => void;
  handleClear: () => void;
  handleSearchFocus: () => void;
  handleSearchBlur: () => void;
  handleSearchBack: () => void;
  handleRecentSearchPress: (entry: RecentSearch) => void;
  handleRecentlyViewedRestaurantPress: (item: RecentlyViewedRestaurant) => void;
  handleRecentlyViewedFoodPress: (item: RecentlyViewedFood) => void;
  handleRecentViewMorePress: () => void;
  handleRecentlyViewedMorePress: () => void;
  handleOverlaySelect: (target: OverlayKey) => void;
  handleProfilePress: () => void;
};

export type SearchForegroundInteractionSubmitHandlers = Pick<
  SearchForegroundInteractionRuntime,
  | 'handleSubmit'
  | 'handleBestDishesHere'
  | 'handleBestRestaurantsHere'
  | 'handleSearchThisArea'
  | 'handleSuggestionPress'
  | 'handleRecentSearchPress'
  | 'handleRecentlyViewedRestaurantPress'
  | 'handleRecentlyViewedFoodPress'
>;

export type SearchForegroundInteractionRetryRuntime = Pick<
  SearchForegroundInteractionRuntime,
  'shouldRetrySearchOnReconnect'
>;

export type SearchForegroundInteractionEditingHandlers = Pick<
  SearchForegroundInteractionRuntime,
  'handleClear' | 'handleSearchFocus' | 'handleSearchBlur' | 'handleSearchBack'
>;

export type SearchForegroundInteractionOverlayHandlers = Pick<
  SearchForegroundInteractionRuntime,
  | 'handleRecentViewMorePress'
  | 'handleRecentlyViewedMorePress'
  | 'handleOverlaySelect'
  | 'handleProfilePress'
>;
