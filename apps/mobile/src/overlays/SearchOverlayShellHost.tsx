import React from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

import SearchPriceSheet from '../screens/Search/components/SearchPriceSheet';
import SearchRankAndScoreSheets from '../screens/Search/components/SearchRankAndScoreSheets';
import SearchStatusBarFade from '../screens/Search/components/SearchStatusBarFade';
import type { SearchOverlayShellHostSnapshot } from '../screens/Search/runtime/shared/search-overlay-shell-host-snapshot-contract';
import type { SearchOverlayShellHostAuthority } from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';

type SearchOverlayShellStatusSnapshot = Pick<
  SearchOverlayShellHostSnapshot,
  'isFocused' | 'statusBarFadeHeight'
>;

type SearchOverlayShellBackdropSnapshot = Pick<
  SearchOverlayShellHostSnapshot,
  'isFocused' | 'backdropDimProgress'
>;

type SearchOverlayShellRankAndScoreSnapshot = Pick<
  SearchOverlayShellHostSnapshot,
  'isFocused' | 'rankAndScoreModalLayer'
>;

type SearchOverlayShellPriceSnapshot = Pick<
  SearchOverlayShellHostSnapshot,
  'isFocused' | 'priceModalLayer'
>;

const areStatusSnapshotsEqual = (
  left: SearchOverlayShellStatusSnapshot,
  right: SearchOverlayShellStatusSnapshot
): boolean =>
  left.isFocused === right.isFocused && left.statusBarFadeHeight === right.statusBarFadeHeight;

const areBackdropSnapshotsEqual = (
  left: SearchOverlayShellBackdropSnapshot,
  right: SearchOverlayShellBackdropSnapshot
): boolean =>
  left.isFocused === right.isFocused && left.backdropDimProgress === right.backdropDimProgress;

const areRankAndScoreSnapshotsEqual = (
  left: SearchOverlayShellRankAndScoreSnapshot,
  right: SearchOverlayShellRankAndScoreSnapshot
): boolean =>
  left.isFocused === right.isFocused &&
  left.rankAndScoreModalLayer === right.rankAndScoreModalLayer;

const arePriceSnapshotsEqual = (
  left: SearchOverlayShellPriceSnapshot,
  right: SearchOverlayShellPriceSnapshot
): boolean => left.isFocused === right.isFocused && left.priceModalLayer === right.priceModalLayer;

const SearchOverlayShellStatusHost = React.memo(
  ({
    overlayShellHostAuthority,
  }: {
    overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  }) => {
    const { statusBarFadeHeight } = useRouteAuthoritySelector<
      SearchOverlayShellHostSnapshot,
      SearchOverlayShellStatusSnapshot
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayShellHostAuthority.subscribe(listener),
        [overlayShellHostAuthority]
      ),
      getSnapshot: overlayShellHostAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: SearchOverlayShellHostSnapshot) => ({
          isFocused: snapshot.isFocused,
          statusBarFadeHeight: snapshot.statusBarFadeHeight,
        }),
        []
      ),
      isEqual: areStatusSnapshotsEqual,
    });

    return statusBarFadeHeight != null ? (
      <SearchStatusBarFade statusBarFadeHeight={statusBarFadeHeight} />
    ) : null;
  }
);

SearchOverlayShellStatusHost.displayName = 'SearchOverlayShellStatusHost';

const SearchOverlayShellBackdropHost = React.memo(
  ({
    overlayShellHostAuthority,
  }: {
    overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  }) => {
    const { isFocused, backdropDimProgress } = useRouteAuthoritySelector<
      SearchOverlayShellHostSnapshot,
      SearchOverlayShellBackdropSnapshot
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayShellHostAuthority.subscribe(listener),
        [overlayShellHostAuthority]
      ),
      getSnapshot: overlayShellHostAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: SearchOverlayShellHostSnapshot) => ({
          isFocused: snapshot.isFocused,
          backdropDimProgress: snapshot.backdropDimProgress,
        }),
        []
      ),
      isEqual: areBackdropSnapshotsEqual,
    });
    const rootBackdropAnimatedStyle = useAnimatedStyle(
      () => ({
        opacity: Math.max(0, Math.min(1, backdropDimProgress?.value ?? 0)) * 0.05,
      }),
      [backdropDimProgress]
    );

    return isFocused && backdropDimProgress ? (
      <Reanimated.View
        pointerEvents="none"
        style={[styles.rootBackdropScrim, rootBackdropAnimatedStyle]}
      />
    ) : null;
  }
);

SearchOverlayShellBackdropHost.displayName = 'SearchOverlayShellBackdropHost';

const SearchOverlayShellRankAndScoreHost = React.memo(
  ({
    overlayShellHostAuthority,
  }: {
    overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  }) => {
    const { isFocused, rankAndScoreModalLayer } = useRouteAuthoritySelector<
      SearchOverlayShellHostSnapshot,
      SearchOverlayShellRankAndScoreSnapshot
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayShellHostAuthority.subscribe(listener),
        [overlayShellHostAuthority]
      ),
      getSnapshot: overlayShellHostAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: SearchOverlayShellHostSnapshot) => ({
          isFocused: snapshot.isFocused,
          rankAndScoreModalLayer: snapshot.rankAndScoreModalLayer,
        }),
        []
      ),
      isEqual: areRankAndScoreSnapshotsEqual,
    });
    const rankAndScoreSheetsProps = rankAndScoreModalLayer?.rankAndScoreSheetsProps ?? null;

    return isFocused && rankAndScoreSheetsProps && rankAndScoreModalLayer ? (
      <React.Profiler
        id="SearchRankAndScoreSheets"
        onRender={rankAndScoreModalLayer.onProfilerRender}
      >
        <SearchRankAndScoreSheets {...rankAndScoreSheetsProps} />
      </React.Profiler>
    ) : null;
  }
);

SearchOverlayShellRankAndScoreHost.displayName = 'SearchOverlayShellRankAndScoreHost';

const SearchOverlayShellPriceHost = React.memo(
  ({
    overlayShellHostAuthority,
  }: {
    overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  }) => {
    const { isFocused, priceModalLayer } = useRouteAuthoritySelector<
      SearchOverlayShellHostSnapshot,
      SearchOverlayShellPriceSnapshot
    >({
      subscribe: React.useCallback(
        (listener: () => void) => overlayShellHostAuthority.subscribe(listener),
        [overlayShellHostAuthority]
      ),
      getSnapshot: overlayShellHostAuthority.getSnapshot,
      selector: React.useCallback(
        (snapshot: SearchOverlayShellHostSnapshot) => ({
          isFocused: snapshot.isFocused,
          priceModalLayer: snapshot.priceModalLayer,
        }),
        []
      ),
      isEqual: arePriceSnapshotsEqual,
    });
    const priceSheetProps = priceModalLayer?.priceSheetProps ?? null;

    return isFocused && priceSheetProps && priceModalLayer ? (
      <React.Profiler id="SearchPriceSheet" onRender={priceModalLayer.onProfilerRender}>
        <SearchPriceSheet {...priceSheetProps} />
      </React.Profiler>
    ) : null;
  }
);

SearchOverlayShellPriceHost.displayName = 'SearchOverlayShellPriceHost';

export const SearchOverlayShellHost = React.memo(
  ({
    overlayShellHostAuthority,
  }: {
    overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  }) => (
    <>
      <SearchOverlayShellStatusHost overlayShellHostAuthority={overlayShellHostAuthority} />
      <SearchOverlayShellBackdropHost overlayShellHostAuthority={overlayShellHostAuthority} />
      <SearchOverlayShellRankAndScoreHost overlayShellHostAuthority={overlayShellHostAuthority} />
      <SearchOverlayShellPriceHost overlayShellHostAuthority={overlayShellHostAuthority} />
    </>
  )
);

const styles = StyleSheet.create({
  rootBackdropScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 60,
  },
});
