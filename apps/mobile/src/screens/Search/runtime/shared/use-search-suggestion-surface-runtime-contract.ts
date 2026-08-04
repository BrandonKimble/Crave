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
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
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

// F1311 — A THIRD WRITE-ONLY `useState`, AND ITS ENTIRE VOCABULARY, DELETED.
//
// `SuggestionTransitionVariant = 'default' | 'submitting'` lived here, backing a
// `const [, setSearchTransitionVariant] = useState<SuggestionTransitionVariant>('default')`
// whose value was discarded at the declaration. `searchTransitionVariant` had ZERO readers
// repo-wide, yet the setter was published on both SearchSuggestionTransitionRuntime and
// SearchSuggestionVisibilityRuntime, re-exported through the foreground overlay action args,
// and called from four sites — beginSubmitTransition wrote 'submitting', beginSuggestionCloseHold
// wrote the caller's variant, hold-sync reset to 'default' — each call re-rendering the
// suggestion presentation plane to publish something unobservable.
//
// So the union, the `'submitting'` literal, and `beginSuggestionCloseHold`'s optional
// `variant` parameter were all ceremony around a value that did not exist. The parameter is
// gone with them: `beginSuggestionCloseHold()` now takes no arguments, and the
// `setBeginSuggestionCloseHold` handler-registration path type-checks against the new arity.
//
// Same law as F1308: state exists only if something reads it, and a setter is not state.

export type UseSearchSuggestionSurfaceRuntimeArgs = {
  searchInteractionRef: SearchInteractionRef;
  query: string;
  suggestions: AutocompleteMatch[];
  recentSearches: RecentSearch[];
  recentlyViewedRestaurants: RecentlyViewedRestaurant[];
  recentlyViewedFoods: RecentlyViewedFood[];
  isSuggestionPanelActive: boolean;
  isAutocompleteSuppressed: boolean;
  isAutocompleteLoading: boolean;
  setSuggestions: React.Dispatch<React.SetStateAction<AutocompleteMatch[]>>;
  setBeginSuggestionCloseHold: (handler: () => boolean) => void;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
};

export type SearchSuggestionVisibilityRuntime = {
  isSuggestionLayoutWarm: boolean;
  setIsSuggestionLayoutWarm: React.Dispatch<React.SetStateAction<boolean>>;
  isSuggestionPanelVisible: boolean;
  isSuggestionOverlayVisible: boolean;
  suggestionProgress: ReturnType<typeof useSharedValue<number>>;
  resetSubmitTransitionHold: () => void;
  beginSubmitTransition: () => boolean;
  beginSuggestionCloseHold: () => boolean;
  shouldDriveSuggestionLayout: boolean;
  shouldShowSuggestionBackground: boolean;
  shouldShowSuggestionSurface: boolean;
  shouldRenderSuggestionPanel: boolean;
  shouldRenderAutocompleteSection: boolean;
  shouldRenderRecentSection: boolean;
  shouldShowAutocompleteSpinnerInBar: boolean;
  suggestionDisplaySuggestions: AutocompleteMatch[];
  /** Refit layer 2 (match highlighting): the query the DISPLAYED suggestions were
   *  produced for — rides the submit-transition hold with them so held rows keep
   *  a consistent bold split during the close animation. */
  suggestionHighlightQueryDisplay: string;
  recentSearchesDisplay: RecentSearch[];
  recentlyViewedRestaurantsDisplay: RecentlyViewedRestaurant[];
  recentlyViewedFoodsDisplay: RecentlyViewedFood[];
};

export type SearchSuggestionTransitionRuntimeArgs = Pick<
  UseSearchSuggestionSurfaceRuntimeArgs,
  'isSuggestionPanelActive' | 'searchChromeScalarSurfacePresentationRuntime'
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
  shouldDriveSuggestionLayout: boolean;
};

export type SearchSuggestionDisplayRuntimeArgs = Pick<
  UseSearchSuggestionSurfaceRuntimeArgs,
  | 'query'
  | 'suggestions'
  | 'recentSearches'
  | 'recentlyViewedRestaurants'
  | 'recentlyViewedFoods'
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
  | 'isSuggestionPanelActive'
  | 'setSuggestions'
  | 'setBeginSuggestionCloseHold'
> &
  Pick<
    SearchSuggestionTransitionRuntime,
    'isSuggestionPanelVisible' | 'shouldDriveSuggestionLayout'
  > &
  Pick<
    SearchSuggestionDisplayRuntime,
    | 'shouldShowSuggestionBackground'
    | 'liveShouldRenderAutocompleteSection'
    | 'liveShouldRenderRecentSection'
    | 'shouldShowAutocompleteSpinnerInBar'
  > & {
    shouldFreezeSuggestionDisplayForSearchSurfaceRedraw: boolean;
  };

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
  'query' | 'suggestions' | 'recentSearches' | 'recentlyViewedRestaurants' | 'recentlyViewedFoods'
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
  | 'setBeginSuggestionCloseHold'
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
  | 'shouldDriveSuggestionLayout'
  | 'shouldShowSuggestionBackground'
  | 'liveShouldRenderAutocompleteSection'
  | 'liveShouldRenderRecentSection'
  | 'captureSuggestionTransitionHold'
>;

export type SearchSuggestionHoldActionRuntime = {
  beginSubmitTransition: () => boolean;
  beginSuggestionCloseHold: () => boolean;
};

export type SearchSuggestionHoldSyncRuntimeArgs = Pick<
  SearchSuggestionHoldEffectsRuntimeArgs,
  | 'query'
  | 'isSuggestionPanelActive'
  | 'setSuggestions'
  | 'setBeginSuggestionCloseHold'
  | 'shouldDriveSuggestionLayout'
  | 'resetSubmitTransitionHold'
  | 'resetSubmitTransitionHoldIfQueryChanged'
> &
  Pick<SearchSuggestionHoldActionRuntime, 'beginSuggestionCloseHold'>;

export type SearchSuggestionHoldEffectsRuntime = {
  beginSubmitTransition: () => boolean;
  beginSuggestionCloseHold: () => boolean;
};

export type SearchSuggestionHeldDisplayRuntimeArgs = Pick<
  SearchSuggestionHoldRuntimeArgs,
  | 'query'
  | 'suggestions'
  | 'recentSearches'
  | 'recentlyViewedRestaurants'
  | 'recentlyViewedFoods'
  | 'isSuggestionPanelActive'
  | 'isSuggestionPanelVisible'
  | 'shouldDriveSuggestionLayout'
  | 'shouldShowSuggestionBackground'
  | 'liveShouldRenderAutocompleteSection'
  | 'liveShouldRenderRecentSection'
  | 'shouldShowAutocompleteSpinnerInBar'
> &
  Pick<SearchSuggestionHoldStateRuntime, 'submitTransitionHoldRef'> & {
    shouldFreezeSuggestionDisplayForSearchSurfaceRedraw: boolean;
  };

export type SearchSuggestionHeldDisplayRuntime = Omit<
  SearchSuggestionHoldRuntime,
  'resetSubmitTransitionHold' | 'beginSubmitTransition' | 'beginSuggestionCloseHold'
>;

export type SearchSuggestionHoldRuntime = {
  resetSubmitTransitionHold: () => void;
  beginSubmitTransition: () => boolean;
  beginSuggestionCloseHold: () => boolean;
  shouldShowSuggestionBackground: boolean;
  shouldShowSuggestionSurface: boolean;
  shouldRenderSuggestionPanel: boolean;
  shouldRenderAutocompleteSection: boolean;
  shouldRenderRecentSection: boolean;
  shouldShowAutocompleteSpinnerInBar: boolean;
  suggestionDisplaySuggestions: AutocompleteMatch[];
  suggestionHighlightQueryDisplay: string;
  recentSearchesDisplay: RecentSearch[];
  recentlyViewedRestaurantsDisplay: RecentlyViewedRestaurant[];
  recentlyViewedFoodsDisplay: RecentlyViewedFood[];
};

export type SearchSuggestionLayoutStateRuntimeArgs = {
  searchInteractionRef: SearchInteractionRef;
  startupGeometrySeed: SearchStartupGeometrySeed;
  query: string;
  isSuggestionPanelActive: boolean;
  shouldDisableSearchShortcuts: boolean;
  shouldDriveSuggestionLayout: boolean;
  shouldRenderSuggestionPanel: boolean;
};

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

export type SearchSuggestionLayoutVisualRuntimeArgs = {
  isSuggestionPanelActive: boolean;
  isSuggestionPanelVisible: boolean;
  shouldDriveSuggestionLayout: boolean;
  shouldShowSuggestionBackground: boolean;
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
  resolvedSearchShortcutsFrame: LayoutRectangle | null;
  resolvedSearchShortcutChipFrames: Record<string, LayoutRectangle>;
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
