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

type SearchOverlaySuggestionSurfaceFrozenProps = Pick<
  SearchOverlayChromeSuggestionSurfaceProps,
  | 'suggestionDisplaySuggestions'
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
  left.shouldFreezeSuggestionSurfaceForRunOne ===
    right.shouldFreezeSuggestionSurfaceForRunOne &&
  left.shouldFreezeOverlayHeaderChromeForRunOne ===
    right.shouldFreezeOverlayHeaderChromeForRunOne &&
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
  areSearchOverlayChromeContainerSelectionsEqual(
    left.containerSnapshot,
    right.containerSnapshot
  ) &&
  left.headerProps === right.headerProps &&
  left.suggestionSurfaceProps === right.suggestionSurfaceProps;

const VISIBLE_CHROME_LAYER_STYLE = { opacity: 1 };
const HIDDEN_CHROME_LAYER_STYLE = { opacity: 0, zIndex: -1 };

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
        zIndex: containerSnapshot.shouldHideBottomNavForRender ? 200 : 110,
      }
    : null,
];

const SearchOverlaySuggestionSurfaceHost = React.memo(
  ({
    suggestionSurfaceProps,
    shouldFreezeSuggestionSurfaceForRunOne,
  }: {
    suggestionSurfaceProps: SearchOverlayChromeSuggestionSurfaceProps;
    shouldFreezeSuggestionSurfaceForRunOne: boolean;
  }) => {
    const frozenSuggestionSurfacePropsRef =
      React.useRef<SearchOverlaySuggestionSurfaceFrozenProps | null>(null);
    const nextSuggestionSurfaceFrozenProps =
      React.useMemo<SearchOverlaySuggestionSurfaceFrozenProps>(
        () => ({
          suggestionDisplaySuggestions: suggestionSurfaceProps.suggestionDisplaySuggestions,
          recentSearchesDisplay: suggestionSurfaceProps.recentSearchesDisplay,
          recentlyViewedRestaurantsDisplay:
            suggestionSurfaceProps.recentlyViewedRestaurantsDisplay,
          recentlyViewedFoodsDisplay: suggestionSurfaceProps.recentlyViewedFoodsDisplay,
        }),
        [
          suggestionSurfaceProps.recentSearchesDisplay,
          suggestionSurfaceProps.recentlyViewedFoodsDisplay,
          suggestionSurfaceProps.recentlyViewedRestaurantsDisplay,
          suggestionSurfaceProps.suggestionDisplaySuggestions,
        ]
      );
    if (!shouldFreezeSuggestionSurfaceForRunOne) {
      frozenSuggestionSurfacePropsRef.current = nextSuggestionSurfaceFrozenProps;
    }
    const suggestionSurfacePropsForRender = shouldFreezeSuggestionSurfaceForRunOne
      ? frozenSuggestionSurfacePropsRef.current ?? nextSuggestionSurfaceFrozenProps
      : nextSuggestionSurfaceFrozenProps;

    return (
      <SearchSuggestionSurface
        {...suggestionSurfaceProps}
        suggestionDisplaySuggestions={
          suggestionSurfacePropsForRender.suggestionDisplaySuggestions
        }
        recentSearchesDisplay={suggestionSurfacePropsForRender.recentSearchesDisplay}
        recentlyViewedRestaurantsDisplay={
          suggestionSurfacePropsForRender.recentlyViewedRestaurantsDisplay
        }
        recentlyViewedFoodsDisplay={
          suggestionSurfacePropsForRender.recentlyViewedFoodsDisplay
        }
      />
    );
  }
);

SearchOverlaySuggestionSurfaceHost.displayName = 'SearchOverlaySuggestionSurfaceHost';

const SearchOverlayHeaderHost = React.memo(
  ({
    headerProps,
    shouldFreezeOverlayHeaderChromeForRunOne,
  }: {
    headerProps: SearchOverlayChromeHeaderProps;
    shouldFreezeOverlayHeaderChromeForRunOne: boolean;
  }) => {
    const frozenHeaderChromePropsRef = React.useRef<SearchOverlayHeaderFrozenProps | null>(null);
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
    if (!shouldFreezeOverlayHeaderChromeForRunOne) {
      frozenHeaderChromePropsRef.current = nextHeaderChromeFrozenProps;
    }
    const headerChromePropsForRender = shouldFreezeOverlayHeaderChromeForRunOne
      ? frozenHeaderChromePropsRef.current ?? nextHeaderChromeFrozenProps
      : nextHeaderChromeFrozenProps;

    return (
      <SearchOverlayHeaderChrome
        {...headerProps}
        searchShortcutsAnimatedStyle={headerChromePropsForRender.searchShortcutsAnimatedStyle}
        searchShortcutChipAnimatedStyle={
          headerChromePropsForRender.searchShortcutChipAnimatedStyle
        }
        searchShortcutContentAnimatedStyle={
          headerChromePropsForRender.searchShortcutContentAnimatedStyle
        }
        shortcutsInteractionEnabledRef={headerProps.shortcutsInteractionEnabledRef}
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
    shouldFreezeSuggestionSurfaceForRunOne,
    shouldFreezeOverlayHeaderChromeForRunOne,
  }: {
    containerSnapshot: SearchOverlayChromeContainerSnapshot;
    suggestionSurfaceProps: SearchOverlayChromeSuggestionSurfaceProps;
    headerProps: SearchOverlayChromeHeaderProps;
    shouldRenderChromeHost: boolean;
    hiddenSearchFiltersWarmupProps: SearchOverlayChromeHiddenSearchFiltersWarmupProps | null;
    shouldFreezeSuggestionSurfaceForRunOne: boolean;
    shouldFreezeOverlayHeaderChromeForRunOne: boolean;
  }) => {
    return (
      <View
        style={resolveChromeLayerStyle(containerSnapshot, shouldRenderChromeHost)}
        pointerEvents={shouldRenderChromeHost ? 'box-none' : 'none'}
      >
        <SearchOverlaySuggestionSurfaceHost
          suggestionSurfaceProps={suggestionSurfaceProps}
          shouldFreezeSuggestionSurfaceForRunOne={shouldFreezeSuggestionSurfaceForRunOne}
        />
        <SearchOverlayFiltersWarmupHost
          hiddenSearchFiltersWarmupProps={hiddenSearchFiltersWarmupProps}
        />
        <SearchOverlayHeaderHost
          headerProps={headerProps}
          shouldFreezeOverlayHeaderChromeForRunOne={shouldFreezeOverlayHeaderChromeForRunOne}
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
      selector: React.useCallback(
        (snapshot: SearchOverlayChromeHostSnapshot) => snapshot,
        []
      ),
      isEqual: areSearchOverlayChromeHostSelectionsEqual,
    });
    const { frameSnapshot, containerSnapshot, headerProps, suggestionSurfaceProps } =
      chromeSnapshot;
    const {
      isFocused,
      shouldRenderSearchOverlay,
      onProfilerRender,
      hiddenSearchFiltersWarmupProps,
      shouldFreezeSuggestionSurfaceForRunOne,
      shouldFreezeOverlayHeaderChromeForRunOne,
    } = frameSnapshot;
    const shouldRenderChromeHost = isFocused && shouldRenderSearchOverlay;
    if (!onProfilerRender) {
      return null;
    }

    return (
      <>
        <React.Profiler id="SearchOverlayChrome" onRender={onProfilerRender}>
          <SearchOverlayChromeContainerHost
            containerSnapshot={containerSnapshot}
            suggestionSurfaceProps={suggestionSurfaceProps}
            headerProps={headerProps}
            shouldRenderChromeHost={shouldRenderChromeHost}
            hiddenSearchFiltersWarmupProps={hiddenSearchFiltersWarmupProps}
            shouldFreezeSuggestionSurfaceForRunOne={shouldFreezeSuggestionSurfaceForRunOne}
            shouldFreezeOverlayHeaderChromeForRunOne={
              shouldFreezeOverlayHeaderChromeForRunOne
            }
          />
        </React.Profiler>
      </>
    );
  }
);
