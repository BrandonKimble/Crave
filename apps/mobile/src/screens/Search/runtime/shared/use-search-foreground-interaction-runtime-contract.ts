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
import type { PerfNavSwitchOverlay } from '../../../../perf/harness-config';
import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type useSearchHistory from '../../hooks/use-search-history';
import type useSearchSubmitOwner from '../../hooks/use-search-submit-owner';
import type { OverlayRuntimeController } from '../controller/overlay-runtime-controller';
import type { SearchRouteOverlayTransitionController } from '../../../../overlays/useSearchRouteOverlayTransitionController';

export type SearchForegroundSubmitRuntime = Pick<
  ReturnType<typeof useSearchSubmitOwner>,
  'submitSearch' | 'runRestaurantEntitySearch' | 'submitViewportShortcut' | 'rerunActiveSearch'
>;

export type SearchForegroundHistoryRuntime = Pick<
  ReturnType<typeof useSearchHistory>,
  'updateLocalRecentSearches'
>;

export type SearchForegroundOpenRestaurantProfilePreview = (
  restaurantId: string,
  restaurantName: string
) => void;

export type SearchForegroundCloseRestaurantProfile = (options?: {
  dismissBehavior?: 'restore' | 'clear';
  clearSearchOnDismiss?: boolean;
}) => void;

export type SearchForegroundLaunchIntentRuntimeArgs = {
  navigation: StackNavigationProp<RootStackParamList>;
  activeMainIntent: LaunchIntent;
  consumeActiveMainIntent: () => void;
  openRestaurantProfilePreview: SearchForegroundOpenRestaurantProfilePreview;
  currentMarketKey?: string | null;
};

export type SearchForegroundSubmitRuntimeArgs = {
  submitRuntime: SearchForegroundSubmitRuntime;
  query: string;
  submittedQuery: string;
  searchMode: 'natural' | 'shortcut' | null;
  activeTab: 'dishes' | 'restaurants';
  hasResults: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  isSearchSessionActive: boolean;
  isSuggestionPanelActive: boolean;
  shouldShowDockedPolls: boolean;
  captureSearchSessionOrigin: () => void;
  ensureSearchOverlay: () => void;
  suppressAutocompleteResults: () => void;
  cancelAutocomplete: () => void;
  dismissSearchKeyboard: () => void;
  beginSubmitTransition: () => boolean;
  resetFocusedMapState: () => void;
  resetMapMoveFlag: () => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setRestaurantOnlyIntent: (restaurantId: string | null) => void;
  pendingRestaurantSelectionRef: React.MutableRefObject<{
    restaurantId: string;
  } | null>;
  isSearchEditingRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  deferRecentSearchUpsert: SearchForegroundHistoryRuntime['updateLocalRecentSearches'];
  openRestaurantProfilePreview: SearchForegroundOpenRestaurantProfilePreview;
};

export type SearchForegroundRetryRuntimeArgs = {
  submitRuntime: SearchForegroundSubmitRuntime;
  query: string;
  submittedQuery: string;
  hasResults: boolean;
  isOffline: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  isSearchSessionActive: boolean;
};

export type SearchForegroundEditingRuntimeArgs = {
  clearOwner: Pick<SearchClearOwner, 'clearTypedQuery' | 'clearSearchState'>;
  query: string;
  submittedQuery: string;
  hasResults: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  isSearchSessionActive: boolean;
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  shouldTreatSearchAsResults: boolean;
  showPollsOverlay: boolean;
  profilePresentationActive: boolean;
  captureSearchSessionQuery: () => void;
  dismissTransientOverlays: () => void;
  allowAutocompleteResults: () => void;
  suppressAutocompleteResults: () => void;
  cancelAutocomplete: () => void;
  beginSuggestionCloseHold: (mode?: 'default' | 'submitting') => boolean;
  requestSearchPresentationIntent: (intent: { kind: 'focus_editing' | 'exit_editing' }) => void;
  beginCloseSearch: () => void;
  restoreDockedPolls: (args?: {
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
    clearTabSnapRequest?: boolean;
  }) => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  searchSessionQueryRef: React.MutableRefObject<string>;
  isSearchEditingRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  inputRef: React.RefObject<TextInput | null>;
};

export type SearchForegroundOverlayRuntimeArgs = {
  navigation: StackNavigationProp<RootStackParamList>;
  routeSearchIntent: MainSearchIntent | null;
  userLocation: RootStackParamList['RecentSearches'] extends { userLocation?: infer T } | undefined
    ? T
    : never;
  rootOverlay: OverlayKey;
  profilePresentationActive: boolean;
  overlayRuntimeController: OverlayRuntimeController;
  closeRestaurantProfile: SearchForegroundCloseRestaurantProfile;
  dismissTransientOverlays: () => void;
  beginSuggestionCloseHoldRef: React.MutableRefObject<() => boolean>;
  transitionController: SearchRouteOverlayTransitionController;
  setTabOverlaySnapRequest: (
    next: React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  ) => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionLayoutWarm: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<'default' | 'submitting'>>;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  allowSearchBlurExitRef: React.MutableRefObject<boolean>;
  inputRef: React.RefObject<TextInput | null>;
  cancelAutocomplete: () => void;
  resetSearchHeaderFocusProgress: () => void;
  resetSubmitTransitionHold: () => void;
};

export type SearchForegroundEffectsRuntimeArgs = {
  registerPendingMutationWorkCancel: (handler: () => void) => void;
  cancelToggleInteraction: () => void;
  toggleOpenNowHarnessRef: React.MutableRefObject<() => void>;
  toggleOpenNow: () => void;
  selectOverlayHarnessRef: React.MutableRefObject<(target: PerfNavSwitchOverlay) => void>;
  isSearchOverlay: boolean;
  saveSheetVisible: boolean;
  handleCloseSaveSheet: () => void;
  isSearchFocused: boolean;
  isSuggestionPanelActive: boolean;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  isSuggestionScreenActive: boolean;
  dismissTransientOverlays: () => void;
  hasResults: boolean;
  resetMapMoveFlag: () => void;
};

export type SearchForegroundRestaurantOnlyResolutionArgs = {
  hasResults: boolean;
  restaurantOnlySearchRef: React.MutableRefObject<string | null>;
  restaurantResults: SearchResponse['restaurants'] | null;
  setRestaurantOnlyId: (value: string | null) => void;
};

export type UseSearchForegroundInteractionRuntimeArgs = {
  launchIntentArgs: SearchForegroundLaunchIntentRuntimeArgs;
  submitRuntimeArgs: SearchForegroundSubmitRuntimeArgs;
  retryRuntimeArgs: SearchForegroundRetryRuntimeArgs;
  editingRuntimeArgs: SearchForegroundEditingRuntimeArgs;
  overlayRuntimeArgs: SearchForegroundOverlayRuntimeArgs;
  effectsRuntimeArgs: SearchForegroundEffectsRuntimeArgs;
  restaurantOnlyResolutionArgs: SearchForegroundRestaurantOnlyResolutionArgs;
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
