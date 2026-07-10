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
import type { AppSearchRouteCommandActions } from '../../../../navigation/runtime/app-search-route-command-runtime';
import type { AppRouteOverlaySessionSnapshot } from '../../../../navigation/runtime/app-route-overlay-session-contract';
import type { RouteSceneSwitchTransitionActions } from '../../../../navigation/runtime/app-route-scene-switch-controller';

export type SearchForegroundSubmitRuntime = Pick<
  ReturnType<typeof useSearchSubmitOwner>,
  'submitSearch' | 'runRestaurantEntitySearch' | 'submitViewportShortcut' | 'rerunActiveSearch'
>;

// The favorites launch is driven from the launch-intent runtime (not the
// command/submit runtimes), so it is typed separately rather than added to the
// shared submit-runtime Pick above.
export type SearchForegroundLaunchFavoritesListResults = ReturnType<
  typeof useSearchSubmitOwner
>['launchFavoritesListResults'];

// The skip-LLM entity reveal launched from a poll-discussion comment span is also
// driven from the launch-intent runtime, so it is typed separately alongside the
// favorites launch rather than added to the shared submit-runtime Pick above.
export type SearchForegroundLaunchEntitySearchResults = ReturnType<
  typeof useSearchSubmitOwner
>['launchEntitySearchResults'];

export type SearchForegroundHistoryRuntime = Pick<
  ReturnType<typeof useSearchHistory>,
  'updateLocalRecentSearches'
>;

export type SearchForegroundOpenRestaurantProfilePreview = (
  restaurantId: string,
  restaurantName: string
) => void;

// Open a community poll's detail (the §8.1 autocomplete poll lane). Routes via
// the polls home with a pollId param, the same cross-surface entry the profile
// screen uses.
export type SearchForegroundOpenPollDetail = (pollId: string) => void;

export type SearchForegroundCloseRestaurantProfile = (options?: {
  dismissBehavior?: 'restore' | 'clear';
  clearSearchOnDismiss?: boolean;
}) => void;

export type SearchForegroundTransientCleanupSnapshot = {
  isSuggestionPanelActive: boolean;
  profilePresentationActive: boolean;
};

export type SearchForegroundTransientCleanupActions = {
  getSnapshot: () => SearchForegroundTransientCleanupSnapshot;
  dismissTransientOverlays: () => void;
  beginSuggestionCloseHold: () => boolean;
  resetSuggestionPanelActive: () => void;
  setSearchFlagsForSearchRoot: () => void;
  clearSuggestions: () => void;
  closeRestaurantProfile: SearchForegroundCloseRestaurantProfile;
  blurInput: () => void;
};

// Phase 4 — the committed restaurant-scoped search the restaurant-from-comment / deep-link
// reveal routes through (replacing the cold profile-preview lane). Same lane the
// recently-viewed-restaurant tap uses: a committed `mode:'entity'` search that returns the
// single restaurant, with the pending-selection ref priming the warm-profile auto-open.
export type SearchForegroundRunRestaurantEntitySearch = ReturnType<
  typeof useSearchSubmitOwner
>['runRestaurantEntitySearch'];

export type SearchForegroundLaunchIntentRuntimeArgs = {
  routeSearchCommandActions: AppSearchRouteCommandActions;
  navigation: StackNavigationProp<RootStackParamList>;
  activeMainIntent: LaunchIntent;
  consumeActiveMainIntent: () => void;
  openRestaurantProfilePreview: SearchForegroundOpenRestaurantProfilePreview;
  launchFavoritesListResults: SearchForegroundLaunchFavoritesListResults;
  launchEntitySearchResults: SearchForegroundLaunchEntitySearchResults;
  runRestaurantEntitySearch: SearchForegroundRunRestaurantEntitySearch;
  setRestaurantOnlyIntent: (restaurantId: string | null) => void;
  pendingRestaurantSelectionRef: React.MutableRefObject<{ restaurantId: string } | null>;
  currentMarketKey?: string | null;
};

export type SearchForegroundSubmitRuntimeArgs = {
  submitRuntime: SearchForegroundSubmitRuntime;
  query: string;
  // Live autocomplete suggestion list under the input — consumed by the typed-
  // Return promoter to jump to a uniquely + exactly matched restaurant profile.
  suggestions: AutocompleteMatch[];
  submittedQuery: string;
  searchMode: 'natural' | 'shortcut' | null;
  activeTab: 'dishes' | 'restaurants';
  hasResults: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  isSearchSessionActive: boolean;
  isSuggestionPanelActive: boolean;
  shouldShowDockedPollsRef: React.MutableRefObject<AppRouteOverlaySessionSnapshot>;
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
  openPollDetail: SearchForegroundOpenPollDetail;
};

export type SearchForegroundCommandRuntimeArgs = SearchForegroundSubmitRuntimeArgs & {
  isOffline: boolean;
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
  restoreDockedPolls: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
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
  transientCleanupActions: SearchForegroundTransientCleanupActions;
  isSuggestionPanelActive: boolean;
  profilePresentationActive: boolean;
  closeRestaurantProfile: SearchForegroundCloseRestaurantProfile;
  dismissTransientOverlays: () => void;
  beginSuggestionCloseHoldRef: React.MutableRefObject<() => boolean>;
  transitionActions: RouteSceneSwitchTransitionActions;
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
  isSearchOverlay: boolean;
  saveSheetVisibleRef: React.MutableRefObject<{
    saveSheetState: { visible: boolean };
  }>;
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
  commandRuntimeArgs: SearchForegroundCommandRuntimeArgs;
  editingRuntimeArgs: SearchForegroundEditingRuntimeArgs;
  overlayRuntimeArgs: SearchForegroundOverlayRuntimeArgs;
  effectsRuntimeArgs: SearchForegroundEffectsRuntimeArgs;
  restaurantOnlyResolutionArgs: SearchForegroundRestaurantOnlyResolutionArgs;
};

export type UseSearchForegroundTransientHandlersRuntimeArgs = Pick<
  UseSearchForegroundInteractionRuntimeArgs,
  'editingRuntimeArgs' | 'overlayRuntimeArgs'
>;

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

export type SearchForegroundInteractionCommandRuntime = SearchForegroundInteractionSubmitHandlers &
  SearchForegroundInteractionRetryRuntime;

export type SearchForegroundInteractionTransientHandlersRuntime =
  SearchForegroundInteractionEditingHandlers & SearchForegroundInteractionOverlayHandlers;
