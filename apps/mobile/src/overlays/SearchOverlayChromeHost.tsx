import React from 'react';
import { View } from 'react-native';

import SearchFilters from '../screens/Search/components/SearchFilters';
import SearchOverlayHeaderChrome from '../screens/Search/components/SearchOverlayHeaderChrome';
import SearchSuggestionSurface from '../screens/Search/components/SearchSuggestionSurface';
import styles from '../screens/Search/styles';
import type {
  SearchOverlayChromeContainerSnapshot,
  SearchOverlayChromeFrameSnapshot,
  SearchOverlayChromeHiddenSearchFiltersWarmupProps,
  SearchOverlayChromeHeaderProps,
  SearchOverlayChromeSuggestionSurfaceProps,
} from '../screens/Search/runtime/shared/search-foreground-chrome-contract';
import type {
  SearchOverlayChromeContainerHostAuthority,
  SearchOverlayChromeFrameHostAuthority,
  SearchOverlayChromeHeaderHostAuthority,
  SearchOverlayChromeSuggestionSurfaceHostAuthority,
} from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';

const SearchOverlaySuggestionSurfaceHost = React.memo(
  ({
    overlayChromeSuggestionSurfaceHostAuthority,
  }: {
    overlayChromeSuggestionSurfaceHostAuthority: SearchOverlayChromeSuggestionSurfaceHostAuthority;
  }) => {
    const suggestionSurfaceProps = useRouteAuthoritySelector<
      SearchOverlayChromeSuggestionSurfaceProps,
      SearchOverlayChromeSuggestionSurfaceProps
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayChromeSuggestionSurfaceHostAuthority.subscribe(listener),
        [overlayChromeSuggestionSurfaceHostAuthority]
      ),
      getSnapshot: overlayChromeSuggestionSurfaceHostAuthority.getSnapshot,
      selector: React.useCallback((snapshot) => snapshot, []),
    });

    return <SearchSuggestionSurface {...suggestionSurfaceProps} />;
  }
);

SearchOverlaySuggestionSurfaceHost.displayName = 'SearchOverlaySuggestionSurfaceHost';

const SearchOverlayHeaderHost = React.memo(
  ({
    overlayChromeHeaderHostAuthority,
    shouldRenderChromeHost,
  }: {
    overlayChromeHeaderHostAuthority: SearchOverlayChromeHeaderHostAuthority;
    shouldRenderChromeHost: boolean;
  }) => {
    const headerProps = useRouteAuthoritySelector<
      SearchOverlayChromeHeaderProps,
      SearchOverlayChromeHeaderProps
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayChromeHeaderHostAuthority.subscribe(listener),
        [overlayChromeHeaderHostAuthority]
      ),
      getSnapshot: overlayChromeHeaderHostAuthority.getSnapshot,
      selector: React.useCallback((snapshot) => snapshot, []),
    });

    return (
      <View pointerEvents={shouldRenderChromeHost ? 'box-none' : 'none'}>
        <SearchOverlayHeaderChrome {...headerProps} />
      </View>
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
    overlayChromeContainerHostAuthority,
    overlayChromeHeaderHostAuthority,
    overlayChromeSuggestionSurfaceHostAuthority,
    shouldRenderChromeHost,
    hiddenSearchFiltersWarmupProps,
  }: {
    overlayChromeContainerHostAuthority: SearchOverlayChromeContainerHostAuthority;
    overlayChromeHeaderHostAuthority: SearchOverlayChromeHeaderHostAuthority;
    overlayChromeSuggestionSurfaceHostAuthority: SearchOverlayChromeSuggestionSurfaceHostAuthority;
    shouldRenderChromeHost: boolean;
    hiddenSearchFiltersWarmupProps: SearchOverlayChromeHiddenSearchFiltersWarmupProps | null;
  }) => {
    const containerSnapshot = useRouteAuthoritySelector<
      SearchOverlayChromeContainerSnapshot,
      SearchOverlayChromeContainerSnapshot
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayChromeContainerHostAuthority.subscribe(listener),
        [overlayChromeContainerHostAuthority]
      ),
      getSnapshot: overlayChromeContainerHostAuthority.getSnapshot,
      selector: React.useCallback((snapshot) => snapshot, []),
    });

    return (
      <View
        style={[
          styles.overlay,
          containerSnapshot.overlayContainerStyle,
          shouldRenderChromeHost ? { opacity: 1 } : { opacity: 0, zIndex: -1 },
          shouldRenderChromeHost && containerSnapshot.isSuggestionOverlayVisible
            ? {
                zIndex: containerSnapshot.shouldHideBottomNavForRender ? 200 : 110,
              }
            : null,
        ]}
        pointerEvents="box-none"
      >
        <SearchOverlaySuggestionSurfaceHost
          overlayChromeSuggestionSurfaceHostAuthority={overlayChromeSuggestionSurfaceHostAuthority}
        />
        <SearchOverlayHeaderHost
          overlayChromeHeaderHostAuthority={overlayChromeHeaderHostAuthority}
          shouldRenderChromeHost={shouldRenderChromeHost}
        />
        <SearchOverlayFiltersWarmupHost
          hiddenSearchFiltersWarmupProps={hiddenSearchFiltersWarmupProps}
        />
      </View>
    );
  }
);

SearchOverlayChromeContainerHost.displayName = 'SearchOverlayChromeContainerHost';

export const SearchOverlayChromeHost = React.memo(
  ({
    overlayChromeFrameHostAuthority,
    overlayChromeContainerHostAuthority,
    overlayChromeHeaderHostAuthority,
    overlayChromeSuggestionSurfaceHostAuthority,
  }: {
    overlayChromeFrameHostAuthority: SearchOverlayChromeFrameHostAuthority;
    overlayChromeContainerHostAuthority: SearchOverlayChromeContainerHostAuthority;
    overlayChromeHeaderHostAuthority: SearchOverlayChromeHeaderHostAuthority;
    overlayChromeSuggestionSurfaceHostAuthority: SearchOverlayChromeSuggestionSurfaceHostAuthority;
  }) => {
    const chromeFrameSnapshot = useRouteAuthoritySelector<
      SearchOverlayChromeFrameSnapshot,
      SearchOverlayChromeFrameSnapshot
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayChromeFrameHostAuthority.subscribe(listener),
        [overlayChromeFrameHostAuthority]
      ),
      getSnapshot: overlayChromeFrameHostAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: SearchOverlayChromeFrameSnapshot) => ({
          isFocused: snapshot.isFocused,
          shouldRenderSearchOverlay: snapshot.shouldRenderSearchOverlay,
          onProfilerRender: snapshot.onProfilerRender,
          hiddenSearchFiltersWarmupProps: snapshot.hiddenSearchFiltersWarmupProps,
        }),
        []
      ),
    });
    const {
      isFocused,
      shouldRenderSearchOverlay,
      onProfilerRender,
      hiddenSearchFiltersWarmupProps,
    } = chromeFrameSnapshot;
    const shouldRenderChromeHost = isFocused && shouldRenderSearchOverlay;
    if (!onProfilerRender) {
      return null;
    }

    return (
      <React.Profiler id="SearchOverlayChrome" onRender={onProfilerRender}>
        <SearchOverlayChromeContainerHost
          overlayChromeContainerHostAuthority={overlayChromeContainerHostAuthority}
          overlayChromeHeaderHostAuthority={overlayChromeHeaderHostAuthority}
          overlayChromeSuggestionSurfaceHostAuthority={overlayChromeSuggestionSurfaceHostAuthority}
          shouldRenderChromeHost={shouldRenderChromeHost}
          hiddenSearchFiltersWarmupProps={hiddenSearchFiltersWarmupProps}
        />
      </React.Profiler>
    );
  }
);
