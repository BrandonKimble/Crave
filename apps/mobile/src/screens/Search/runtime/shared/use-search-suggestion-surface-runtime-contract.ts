import React from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';
import {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../../services/search';
import type { SearchStartupGeometrySeed } from './search-startup-geometry';

export type SearchInteractionRef = React.MutableRefObject<{
  isInteracting: boolean;
}>;

export type SearchSuggestionMaskedHole = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
};

export type SearchLayout = {
  top: number;
  height: number;
};

export type SuggestionTransitionVariant = 'default' | 'submitting';

export type UseSearchSuggestionSurfaceRuntimeArgs = {
  searchInteractionRef: SearchInteractionRef;
  query: string;
  suggestions: AutocompleteMatch[];
  recentSearches: RecentSearch[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  recentlyViewedFoods: RecentlyViewedFood[];
  isRecentLoading: boolean;
  isRecentlyViewedLoading: boolean;
  isRecentlyViewedFoodsLoading: boolean;
  isSuggestionPanelActive: boolean;
  isAutocompleteSuppressed: boolean;
  isAutocompleteLoading: boolean;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setBeginSuggestionCloseHold: (handler: () => boolean) => void;
};

export type SearchSuggestionVisibilityRuntime = {
  isSuggestionLayoutWarm: boolean;
  setIsSuggestionLayoutWarm: React.Dispatch<React.SetStateAction<boolean>>;
  isSuggestionPanelVisible: boolean;
  isSuggestionOverlayVisible: boolean;
  suggestionProgress: ReturnType<typeof useSharedValue<number>>;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<SuggestionTransitionVariant>>;
  resetSubmitTransitionHold: () => void;
  beginSubmitTransition: () => boolean;
  beginSuggestionCloseHold: (variant?: SuggestionTransitionVariant) => boolean;
  shouldDriveSuggestionLayout: boolean;
  shouldShowSuggestionBackground: boolean;
  shouldShowSuggestionSurface: boolean;
  shouldRenderSuggestionPanel: boolean;
  shouldRenderAutocompleteSection: boolean;
  shouldRenderRecentSection: boolean;
  shouldShowAutocompleteSpinnerInBar: boolean;
  suggestionDisplaySuggestions: AutocompleteMatch[];
  recentSearchesDisplay: RecentSearch[];
  recentlyViewedRestaurantsDisplay: RecentlyViewedRestaurant[];
  recentlyViewedFoodsDisplay: RecentlyViewedFood[];
  hasRecentSearchesDisplay: boolean;
  hasRecentlyViewedRestaurantsDisplay: boolean;
  hasRecentlyViewedFoodsDisplay: boolean;
  isRecentLoadingDisplay: boolean;
  isRecentlyViewedLoadingDisplay: boolean;
  isRecentlyViewedFoodsLoadingDisplay: boolean;
};

export type SearchSuggestionTransitionRuntimeArgs = Pick<
  UseSearchSuggestionSurfaceRuntimeArgs,
  'isSuggestionPanelActive'
>;

export type SearchSuggestionTransitionTimingRuntime = {
  getSuggestionTransitionDurationMs: (target: 0 | 1) => number;
  getSuggestionTransitionEasing: (target: 0 | 1) => (value: number) => number;
  getSuggestionTransitionDelayMs: (target: 0 | 1) => number;
};

export type SearchSuggestionTransitionPresenceRuntimeArgs = SearchSuggestionTransitionRuntimeArgs &
  SearchSuggestionTransitionTimingRuntime;

export type SearchSuggestionTransitionPresenceRuntime = {
  suggestionProgress: ReturnType<typeof useSharedValue<number>>;
  isSuggestionPanelVisible: boolean;
  isSuggestionOverlayVisible: boolean;
};

export type SearchSuggestionLayoutWarmthRuntimeArgs = Pick<
  SearchSuggestionTransitionRuntimeArgs,
  'isSuggestionPanelActive'
> &
  Pick<SearchSuggestionTransitionPresenceRuntime, 'isSuggestionPanelVisible'>;

export type SearchSuggestionLayoutWarmthRuntime = {
  isSuggestionLayoutWarm: boolean;
  setIsSuggestionLayoutWarm: React.Dispatch<React.SetStateAction<boolean>>;
  shouldDriveSuggestionLayout: boolean;
};

export type SearchSuggestionTransitionRuntime = {
  isSuggestionLayoutWarm: boolean;
  setIsSuggestionLayoutWarm: React.Dispatch<React.SetStateAction<boolean>>;
  isSuggestionPanelVisible: boolean;
  isSuggestionOverlayVisible: boolean;
  suggestionProgress: ReturnType<typeof useSharedValue<number>>;
  setSearchTransitionVariant: React.Dispatch<React.SetStateAction<SuggestionTransitionVariant>>;
  shouldDriveSuggestionLayout: boolean;
};

export type SearchSuggestionDisplayRuntimeArgs = Pick<
  UseSearchSuggestionSurfaceRuntimeArgs,
  | 'query'
  | 'suggestions'
  | 'recentSearches'
  | 'recentlyViewedRestaurants'
  | 'recentlyViewedFoods'
  | 'isRecentLoading'
  | 'isRecentlyViewedLoading'
  | 'isRecentlyViewedFoodsLoading'
  | 'isSuggestionPanelActive'
  | 'isAutocompleteSuppressed'
  | 'isAutocompleteLoading'
> &
  Pick<
    SearchSuggestionTransitionRuntime,
    'isSuggestionPanelVisible' | 'shouldDriveSuggestionLayout'
  >;

export type SearchSuggestionDisplayRuntime = {
  shouldShowSuggestionBackground: boolean;
  baseShouldRenderAutocompleteSection: boolean;
  liveShouldRenderAutocompleteSection: boolean;
  liveShouldRenderRecentSection: boolean;
  shouldShowAutocompleteSpinnerInBar: boolean;
};

export type SearchSuggestionHoldRuntimeArgs = Pick<
  UseSearchSuggestionSurfaceRuntimeArgs,
  | 'query'
  | 'suggestions'
  | 'recentSearches'
  | 'recentlyViewedRestaurants'
  | 'recentlyViewedFoods'
  | 'isRecentLoading'
  | 'isRecentlyViewedLoading'
  | 'isRecentlyViewedFoodsLoading'
  | 'isSuggestionPanelActive'
  | 'setSuggestions'
  | 'setShowSuggestions'
  | 'setBeginSuggestionCloseHold'
> &
  Pick<
    SearchSuggestionTransitionRuntime,
    'setSearchTransitionVariant' | 'isSuggestionPanelVisible' | 'shouldDriveSuggestionLayout'
  > &
  Pick<
    SearchSuggestionDisplayRuntime,
    | 'shouldShowSuggestionBackground'
    | 'liveShouldRenderAutocompleteSection'
    | 'liveShouldRenderRecentSection'
    | 'shouldShowAutocompleteSpinnerInBar'
  >;

export type SearchSuggestionTransitionHoldFlags = {
  holdSuggestionPanel: boolean;
  holdSuggestionBackground: boolean;
  holdAutocomplete: boolean;
  holdRecent: boolean;
};

export type SearchSuggestionTransitionHold = {
  active: boolean;
  query: string;
  suggestions: AutocompleteMatch[];
  recentSearches: RecentSearch[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  recentlyViewedFoods: RecentlyViewedFood[];
  isRecentLoading: boolean;
  isRecentlyViewedLoading: boolean;
  isRecentlyViewedFoodsLoading: boolean;
  holdSuggestionPanel: boolean;
  holdSuggestionBackground: boolean;
  holdAutocomplete: boolean;
  holdRecent: boolean;
};

export type SearchSuggestionTransitionHoldCapture = {
  enabled: boolean;
  flags: SearchSuggestionTransitionHoldFlags;
};

export type SearchSuggestionHoldStateRuntimeArgs = Pick<
  SearchSuggestionHoldRuntimeArgs,
  | 'query'
  | 'suggestions'
  | 'recentSearches'
  | 'recentlyViewedRestaurants'
  | 'recentlyViewedFoods'
  | 'isRecentLoading'
  | 'isRecentlyViewedLoading'
  | 'isRecentlyViewedFoodsLoading'
>;

export type SearchSuggestionHoldStateRuntime = {
  submitTransitionHoldRef: React.MutableRefObject<SearchSuggestionTransitionHold>;
  resetSubmitTransitionHold: () => void;
  resetSubmitTransitionHoldIfQueryChanged: (nextQuery: string) => boolean;
  captureSuggestionTransitionHold: (capture: SearchSuggestionTransitionHoldCapture) => boolean;
};

export type SearchSuggestionHoldEffectsRuntimeArgs = Pick<
  SearchSuggestionHoldRuntimeArgs,
  | 'query'
  | 'isSuggestionPanelActive'
  | 'setSuggestions'
  | 'setShowSuggestions'
  | 'setBeginSuggestionCloseHold'
  | 'setSearchTransitionVariant'
  | 'shouldDriveSuggestionLayout'
  | 'shouldShowSuggestionBackground'
  | 'liveShouldRenderAutocompleteSection'
  | 'liveShouldRenderRecentSection'
> &
  Pick<
    SearchSuggestionHoldStateRuntime,
    | 'resetSubmitTransitionHold'
    | 'resetSubmitTransitionHoldIfQueryChanged'
    | 'captureSuggestionTransitionHold'
  >;

export type SearchSuggestionHoldActionRuntimeArgs = Pick<
  SearchSuggestionHoldEffectsRuntimeArgs,
  | 'setSearchTransitionVariant'
  | 'shouldDriveSuggestionLayout'
  | 'shouldShowSuggestionBackground'
  | 'liveShouldRenderAutocompleteSection'
  | 'liveShouldRenderRecentSection'
  | 'captureSuggestionTransitionHold'
>;

export type SearchSuggestionHoldActionRuntime = {
  beginSubmitTransition: () => boolean;
  beginSuggestionCloseHold: (variant?: SuggestionTransitionVariant) => boolean;
};

export type SearchSuggestionHoldSyncRuntimeArgs = Pick<
  SearchSuggestionHoldEffectsRuntimeArgs,
  | 'query'
  | 'isSuggestionPanelActive'
  | 'setSuggestions'
  | 'setShowSuggestions'
  | 'setBeginSuggestionCloseHold'
  | 'setSearchTransitionVariant'
  | 'shouldDriveSuggestionLayout'
  | 'resetSubmitTransitionHold'
  | 'resetSubmitTransitionHoldIfQueryChanged'
> &
  Pick<SearchSuggestionHoldActionRuntime, 'beginSuggestionCloseHold'>;

export type SearchSuggestionHoldEffectsRuntime = {
  beginSubmitTransition: () => boolean;
  beginSuggestionCloseHold: (variant?: SuggestionTransitionVariant) => boolean;
};

export type SearchSuggestionHeldDisplayRuntimeArgs = Pick<
  SearchSuggestionHoldRuntimeArgs,
  | 'suggestions'
  | 'recentSearches'
  | 'recentlyViewedRestaurants'
  | 'recentlyViewedFoods'
  | 'isRecentLoading'
  | 'isRecentlyViewedLoading'
  | 'isRecentlyViewedFoodsLoading'
  | 'isSuggestionPanelActive'
  | 'isSuggestionPanelVisible'
  | 'shouldDriveSuggestionLayout'
  | 'shouldShowSuggestionBackground'
  | 'liveShouldRenderAutocompleteSection'
  | 'liveShouldRenderRecentSection'
  | 'shouldShowAutocompleteSpinnerInBar'
> &
  Pick<SearchSuggestionHoldStateRuntime, 'submitTransitionHoldRef'>;

export type SearchSuggestionHeldDisplayRuntime = Omit<
  SearchSuggestionHoldRuntime,
  'resetSubmitTransitionHold' | 'beginSubmitTransition' | 'beginSuggestionCloseHold'
>;

export type SearchSuggestionHoldRuntime = {
  resetSubmitTransitionHold: () => void;
  beginSubmitTransition: () => boolean;
  beginSuggestionCloseHold: (variant?: SuggestionTransitionVariant) => boolean;
  shouldShowSuggestionBackground: boolean;
  shouldShowSuggestionSurface: boolean;
  shouldRenderSuggestionPanel: boolean;
  shouldRenderAutocompleteSection: boolean;
  shouldRenderRecentSection: boolean;
  shouldShowAutocompleteSpinnerInBar: boolean;
  suggestionDisplaySuggestions: AutocompleteMatch[];
  recentSearchesDisplay: RecentSearch[];
  recentlyViewedRestaurantsDisplay: RecentlyViewedRestaurant[];
  recentlyViewedFoodsDisplay: RecentlyViewedFood[];
  hasRecentSearchesDisplay: boolean;
  hasRecentlyViewedRestaurantsDisplay: boolean;
  hasRecentlyViewedFoodsDisplay: boolean;
  isRecentLoadingDisplay: boolean;
  isRecentlyViewedLoadingDisplay: boolean;
  isRecentlyViewedFoodsLoadingDisplay: boolean;
};

export type SearchSuggestionLayoutRuntimeArgs = {
  searchInteractionRef: SearchInteractionRef;
  startupGeometrySeed: SearchStartupGeometrySeed;
  query: string;
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  shouldDriveSuggestionLayout: boolean;
  shouldShowSuggestionBackground: boolean;
  shouldRenderSuggestionPanel: boolean;
};

export type SearchSuggestionLayoutStateRuntimeArgs = Pick<
  SearchSuggestionLayoutRuntimeArgs,
  | 'startupGeometrySeed'
  | 'searchInteractionRef'
  | 'query'
  | 'isSuggestionPanelActive'
  | 'shouldDriveSuggestionLayout'
  | 'shouldRenderSuggestionPanel'
>;

export type SearchSuggestionLayoutStateRuntime = {
  shouldDriveSuggestionLayout: boolean;
  handleSuggestionContentSizeChange: (_width: number, height: number) => void;
  searchLayout: SearchLayout;
  searchBarFrame: LayoutRectangle | null;
  handleSearchHeaderLayout: ({ nativeEvent }: LayoutChangeEvent) => void;
  handleSearchContainerLayout: ({ nativeEvent }: LayoutChangeEvent) => void;
  handleSearchShortcutsRowLayout: (layout: LayoutRectangle) => void;
  handleRestaurantsShortcutLayout: (layout: LayoutRectangle) => void;
  handleDishesShortcutLayout: (layout: LayoutRectangle) => void;
  suggestionContentHeight: number;
  shouldFreezeSuggestionHeader: boolean;
  shouldIncludeShortcutHoles: boolean;
  shouldIncludeShortcutLayout: boolean;
  resolvedSearchContainerFrame: LayoutRectangle | null;
  resolvedSearchShortcutsFrame: LayoutRectangle | null;
  resolvedSearchShortcutChipFrames: Record<string, LayoutRectangle>;
};

export type SearchSuggestionLayoutVisualRuntimeArgs = Pick<
  SearchSuggestionLayoutRuntimeArgs,
  | 'isSuggestionPanelActive'
  | 'isSuggestionPanelVisible'
  | 'shouldDriveSuggestionLayout'
  | 'shouldShowSuggestionBackground'
> & {
  searchLayout: SearchLayout;
  suggestionContentHeight: number;
  shouldFreezeSuggestionHeader: boolean;
  shouldIncludeShortcutLayout: boolean;
  resolvedSearchContainerFrame: LayoutRectangle | null;
  resolvedSearchShortcutsFrame: LayoutRectangle | null;
};

export type SearchSuggestionLayoutVisualRuntime = {
  resetSearchHeaderFocusProgress: () => void;
  searchHeaderFocusProgress: ReturnType<typeof useSharedValue<number>>;
  suggestionHeaderHeightAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionScrollTopAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionScrollMaxHeightAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionHeaderDividerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionScrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  suggestionTopFillHeight: number;
  suggestionScrollMaxHeightTarget: number | undefined;
};

export type SearchSuggestionHeaderHolesRuntimeArgs = Pick<
  SearchSuggestionLayoutStateRuntime,
  | 'shouldDriveSuggestionLayout'
  | 'shouldFreezeSuggestionHeader'
  | 'shouldIncludeShortcutHoles'
  | 'resolvedSearchContainerFrame'
  | 'resolvedSearchShortcutsFrame'
  | 'resolvedSearchShortcutChipFrames'
>;

export type SearchSuggestionHeaderHolesRuntime = {
  resolvedSuggestionHeaderHoles: SearchSuggestionMaskedHole[];
};

export type SearchSuggestionLayoutRuntime = {
  handleSuggestionContentSizeChange: (_width: number, height: number) => void;
  searchLayout: SearchLayout;
  searchBarFrame: LayoutRectangle | null;
  handleSearchHeaderLayout: ({ nativeEvent }: LayoutChangeEvent) => void;
  handleSearchContainerLayout: ({ nativeEvent }: LayoutChangeEvent) => void;
  handleSearchShortcutsRowLayout: (layout: LayoutRectangle) => void;
  handleRestaurantsShortcutLayout: (layout: LayoutRectangle) => void;
  handleDishesShortcutLayout: (layout: LayoutRectangle) => void;
  resetSearchHeaderFocusProgress: () => void;
  searchHeaderFocusProgress: ReturnType<typeof useSharedValue<number>>;
  suggestionHeaderHeightAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionScrollTopAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionScrollMaxHeightAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionHeaderDividerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  suggestionScrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  resolvedSuggestionHeaderHoles: SearchSuggestionMaskedHole[];
  suggestionTopFillHeight: number;
  suggestionScrollMaxHeightTarget: number | undefined;
};

export type UseSearchSuggestionSurfaceRuntimeResult = SearchSuggestionVisibilityRuntime &
  SearchSuggestionLayoutRuntime;
