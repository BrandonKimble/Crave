import React from 'react';
import { StyleSheet, View } from 'react-native';

import SearchFilters from '../screens/Search/components/SearchFilters';
import SearchOverlayHeaderChrome from '../screens/Search/components/SearchOverlayHeaderChrome';
import SearchSuggestionSurface from '../screens/Search/components/SearchSuggestionSurface';
import styles from '../screens/Search/styles';
import { SearchChromeNativeHitTargetSurface } from '../screens/Search/runtime/native/search-chrome-native-hit-target';
import type {
  SearchOverlayChromeContainerSnapshot,
  SearchOverlayChromeFrameSnapshot,
  SearchOverlayChromeHiddenSearchFiltersWarmupProps,
  SearchOverlayChromeHostSnapshot,
  SearchOverlayChromeHeaderProps,
  SearchOverlayChromeSuggestionSurfaceProps,
} from '../screens/Search/runtime/shared/search-foreground-chrome-contract';
import type { SearchOverlayChromeHostAuthority } from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import { useFrozenWhile } from './use-frozen-while';

type SearchOverlaySuggestionSurfaceFrozenProps = Pick<
  SearchOverlayChromeSuggestionSurfaceProps,
  | 'suggestionDisplaySuggestions'
  | 'suggestionHighlightQuery'
  | 'recentSearchesDisplay'
  | 'recentlyViewedRestaurantsDisplay'
  | 'recentlyViewedFoodsDisplay'
>;

type SearchOverlayHeaderFrozenProps = Pick<
  SearchOverlayChromeHeaderProps,
  | 'searchShortcutsAnimatedStyle'
  | 'searchShortcutChipAnimatedStyle'
  | 'searchShortcutContentAnimatedStyle'
  | 'shouldShowSearchThisArea'
  | 'searchThisAreaTop'
  | 'searchThisAreaAnimatedStyle'
>;

const areSearchOverlayChromeFrameSelectionsEqual = (
  left: SearchOverlayChromeFrameSnapshot,
  right: SearchOverlayChromeFrameSnapshot
): boolean =>
  left.isFocused === right.isFocused &&
  left.shouldRenderSearchOverlay === right.shouldRenderSearchOverlay &&
  left.isRunOneFreezeActive === right.isRunOneFreezeActive &&
  left.onProfilerRender === right.onProfilerRender &&
  left.hiddenSearchFiltersWarmupProps === right.hiddenSearchFiltersWarmupProps;

const areSearchOverlayChromeContainerSelectionsEqual = (
  left: SearchOverlayChromeContainerSnapshot,
  right: SearchOverlayChromeContainerSnapshot
): boolean =>
  left.overlayContainerStyle === right.overlayContainerStyle &&
  left.isSuggestionOverlayVisible === right.isSuggestionOverlayVisible &&
  left.shouldHideBottomNavForRender === right.shouldHideBottomNavForRender;

const areSearchOverlayChromeHostSelectionsEqual = (
  left: SearchOverlayChromeHostSnapshot,
  right: SearchOverlayChromeHostSnapshot
): boolean =>
  areSearchOverlayChromeFrameSelectionsEqual(left.frameSnapshot, right.frameSnapshot) &&
  areSearchOverlayChromeContainerSelectionsEqual(left.containerSnapshot, right.containerSnapshot) &&
  left.headerProps === right.headerProps &&
  left.suggestionSurfaceProps === right.suggestionSurfaceProps;

const VISIBLE_CHROME_LAYER_STYLE = { opacity: 1 };
const HIDDEN_CHROME_LAYER_STYLE = { opacity: 0, zIndex: -1 };
// UNATTRIBUTED (F1499): no recorded derivation for either value or the 90pt gap between them —
// only that the bottom-nav-hidden case must outrank the visible case in this stacking context.
const SEARCH_OVERLAY_SUGGESTION_ZINDEX_BOTTOM_NAV_HIDDEN = 200;
const SEARCH_OVERLAY_SUGGESTION_ZINDEX_BOTTOM_NAV_VISIBLE = 110;

const resolveChromeLayerStyle = (
  containerSnapshot: SearchOverlayChromeContainerSnapshot,
  shouldRenderChromeHost: boolean
) => [
  StyleSheet.absoluteFillObject,
  styles.overlay,
  containerSnapshot.overlayContainerStyle,
  shouldRenderChromeHost ? VISIBLE_CHROME_LAYER_STYLE : HIDDEN_CHROME_LAYER_STYLE,
  shouldRenderChromeHost && containerSnapshot.isSuggestionOverlayVisible
    ? {
        zIndex: containerSnapshot.shouldHideBottomNavForRender
          ? SEARCH_OVERLAY_SUGGESTION_ZINDEX_BOTTOM_NAV_HIDDEN
          : SEARCH_OVERLAY_SUGGESTION_ZINDEX_BOTTOM_NAV_VISIBLE,
      }
    : null,
];

const SearchOverlaySuggestionSurfaceHost = React.memo(
  ({
    suggestionSurfaceProps,
    isRunOneFreezeActive,
  }: {
    suggestionSurfaceProps: SearchOverlayChromeSuggestionSurfaceProps;
    isRunOneFreezeActive: boolean;
  }) => {
    const nextSuggestionSurfaceFrozenProps =
      React.useMemo<SearchOverlaySuggestionSurfaceFrozenProps>(
        () => ({
          suggestionDisplaySuggestions: suggestionSurfaceProps.suggestionDisplaySuggestions,
          suggestionHighlightQuery: suggestionSurfaceProps.suggestionHighlightQuery,
          recentSearchesDisplay: suggestionSurfaceProps.recentSearchesDisplay,
          recentlyViewedRestaurantsDisplay: suggestionSurfaceProps.recentlyViewedRestaurantsDisplay,
          recentlyViewedFoodsDisplay: suggestionSurfaceProps.recentlyViewedFoodsDisplay,
        }),
        [
          suggestionSurfaceProps.recentSearchesDisplay,
          suggestionSurfaceProps.recentlyViewedFoodsDisplay,
          suggestionSurfaceProps.recentlyViewedRestaurantsDisplay,
          suggestionSurfaceProps.suggestionDisplaySuggestions,
          suggestionSurfaceProps.suggestionHighlightQuery,
        ]
      );
    const suggestionSurfacePropsForRender = useFrozenWhile(
      nextSuggestionSurfaceFrozenProps,
      isRunOneFreezeActive
    );

    return (
      <SearchSuggestionSurface
        {...suggestionSurfaceProps}
        suggestionDisplaySuggestions={suggestionSurfacePropsForRender.suggestionDisplaySuggestions}
        suggestionHighlightQuery={suggestionSurfacePropsForRender.suggestionHighlightQuery}
        recentSearchesDisplay={suggestionSurfacePropsForRender.recentSearchesDisplay}
        recentlyViewedRestaurantsDisplay={
          suggestionSurfacePropsForRender.recentlyViewedRestaurantsDisplay
        }
        recentlyViewedFoodsDisplay={suggestionSurfacePropsForRender.recentlyViewedFoodsDisplay}
      />
    );
  }
);

SearchOverlaySuggestionSurfaceHost.displayName = 'SearchOverlaySuggestionSurfaceHost';

const SearchOverlayHeaderHost = React.memo(
  ({
    headerProps,
    isRunOneFreezeActive,
  }: {
    headerProps: SearchOverlayChromeHeaderProps;
    isRunOneFreezeActive: boolean;
  }) => {
    const nextHeaderChromeFrozenProps = React.useMemo<SearchOverlayHeaderFrozenProps>(
      () => ({
        searchShortcutsAnimatedStyle: headerProps.searchShortcutsAnimatedStyle,
        searchShortcutChipAnimatedStyle: headerProps.searchShortcutChipAnimatedStyle,
        searchShortcutContentAnimatedStyle: headerProps.searchShortcutContentAnimatedStyle,
        shouldShowSearchThisArea: headerProps.shouldShowSearchThisArea,
        searchThisAreaTop: headerProps.searchThisAreaTop,
        searchThisAreaAnimatedStyle: headerProps.searchThisAreaAnimatedStyle,
      }),
      [
        headerProps.searchShortcutChipAnimatedStyle,
        headerProps.searchShortcutContentAnimatedStyle,
        headerProps.searchShortcutsAnimatedStyle,
        headerProps.searchThisAreaAnimatedStyle,
        headerProps.searchThisAreaTop,
        headerProps.shouldShowSearchThisArea,
      ]
    );
    const headerChromePropsForRender = useFrozenWhile(
      nextHeaderChromeFrozenProps,
      isRunOneFreezeActive
    );

    return (
      <SearchOverlayHeaderChrome
        {...headerProps}
        searchShortcutsAnimatedStyle={headerChromePropsForRender.searchShortcutsAnimatedStyle}
        searchShortcutChipAnimatedStyle={headerChromePropsForRender.searchShortcutChipAnimatedStyle}
        searchShortcutContentAnimatedStyle={
          headerChromePropsForRender.searchShortcutContentAnimatedStyle
        }
        shouldShowSearchThisArea={headerChromePropsForRender.shouldShowSearchThisArea}
        searchThisAreaTop={headerChromePropsForRender.searchThisAreaTop}
        searchThisAreaAnimatedStyle={headerChromePropsForRender.searchThisAreaAnimatedStyle}
      />
    );
  }
);

SearchOverlayHeaderHost.displayName = 'SearchOverlayHeaderHost';

const SearchOverlayFiltersWarmupHost = React.memo(
  ({
    hiddenSearchFiltersWarmupProps,
  }: {
    hiddenSearchFiltersWarmupProps: SearchOverlayChromeHiddenSearchFiltersWarmupProps | null;
  }) => {
    if (!hiddenSearchFiltersWarmupProps) {
      return null;
    }

    return (
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: -1000,
          opacity: 0,
        }}
      >
        <SearchFilters {...hiddenSearchFiltersWarmupProps} />
      </View>
    );
  }
);

SearchOverlayFiltersWarmupHost.displayName = 'SearchOverlayFiltersWarmupHost';

const SearchOverlayChromeContainerHost = React.memo(
  ({
    containerSnapshot,
    suggestionSurfaceProps,
    headerProps,
    shouldRenderChromeHost,
    hiddenSearchFiltersWarmupProps,
    isRunOneFreezeActive,
  }: {
    containerSnapshot: SearchOverlayChromeContainerSnapshot;
    suggestionSurfaceProps: SearchOverlayChromeSuggestionSurfaceProps;
    headerProps: SearchOverlayChromeHeaderProps;
    shouldRenderChromeHost: boolean;
    hiddenSearchFiltersWarmupProps: SearchOverlayChromeHiddenSearchFiltersWarmupProps | null;
    isRunOneFreezeActive: boolean;
  }) => {
    return (
      <View
        style={resolveChromeLayerStyle(containerSnapshot, shouldRenderChromeHost)}
        pointerEvents={shouldRenderChromeHost ? 'box-none' : 'none'}
      >
        <SearchOverlaySuggestionSurfaceHost
          suggestionSurfaceProps={suggestionSurfaceProps}
          isRunOneFreezeActive={isRunOneFreezeActive}
        />
        <SearchOverlayFiltersWarmupHost
          hiddenSearchFiltersWarmupProps={hiddenSearchFiltersWarmupProps}
        />
        <SearchOverlayHeaderHost
          headerProps={headerProps}
          isRunOneFreezeActive={isRunOneFreezeActive}
        />
        <SearchChromeNativeHitTargetSurface />
      </View>
    );
  }
);

SearchOverlayChromeContainerHost.displayName = 'SearchOverlayChromeContainerHost';

export const SearchOverlayChromeHost = React.memo(
  ({
    overlayChromeHostAuthority,
  }: {
    overlayChromeHostAuthority: SearchOverlayChromeHostAuthority;
  }) => {
    const chromeSnapshot = useRouteAuthoritySelector<
      SearchOverlayChromeHostSnapshot,
      SearchOverlayChromeHostSnapshot
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayChromeHostAuthority.subscribe(listener),
        [overlayChromeHostAuthority]
      ),
      subscribeSelector: overlayChromeHostAuthority.subscribeSelector,
      getSnapshot: overlayChromeHostAuthority.getSnapshot,
      selector: React.useCallback((snapshot: SearchOverlayChromeHostSnapshot) => snapshot, []),
      isEqual: areSearchOverlayChromeHostSelectionsEqual,
    });
    const { frameSnapshot, containerSnapshot, headerProps, suggestionSurfaceProps } =
      chromeSnapshot;
    const {
      isFocused,
      shouldRenderSearchOverlay,
      onProfilerRender,
      hiddenSearchFiltersWarmupProps,
      isRunOneFreezeActive,
    } = frameSnapshot;
    const shouldRenderChromeHost = isFocused && shouldRenderSearchOverlay;
    const chromeHost = (
      <SearchOverlayChromeContainerHost
        containerSnapshot={containerSnapshot}
        suggestionSurfaceProps={suggestionSurfaceProps}
        headerProps={headerProps}
        shouldRenderChromeHost={shouldRenderChromeHost}
        hiddenSearchFiltersWarmupProps={hiddenSearchFiltersWarmupProps}
        isRunOneFreezeActive={isRunOneFreezeActive}
      />
    );

    if (!onProfilerRender) {
      return chromeHost;
    }

    return (
      <React.Profiler id="SearchOverlayChrome" onRender={onProfilerRender}>
        {chromeHost}
      </React.Profiler>
    );
  }
);
