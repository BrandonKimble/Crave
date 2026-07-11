import React from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

import SearchPriceSheet from '../screens/Search/components/SearchPriceSheet';
import SearchRankAndScoreSheets from '../screens/Search/components/SearchRankAndScoreSheets';
import SearchStatusBarFade from '../screens/Search/components/SearchStatusBarFade';
import type { SearchOverlayShellHostSnapshot } from '../screens/Search/runtime/shared/search-overlay-shell-host-snapshot-contract';
import type { SearchOverlayShellHostAuthority } from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import Svg, { Path } from 'react-native-svg';
import { OVERLAY_BACKDROP_SCRIM_ZINDEX, OVERLAY_CORNER_RADIUS } from './overlaySheetStyles';

type SearchOverlayShellStatusSnapshot = Pick<
  SearchOverlayShellHostSnapshot,
  'isFocused' | 'statusBarFadeHeight'
>;

type SearchOverlayShellBackdropSnapshot = Pick<
  SearchOverlayShellHostSnapshot,
  'isFocused' | 'backdropDimProgress' | 'backdropSheetTopY'
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
  left.isFocused === right.isFocused &&
  left.backdropDimProgress === right.backdropDimProgress &&
  left.backdropSheetTopY === right.backdropSheetTopY;

const BACKDROP_DIM_MAX_OPACITY = 0.12;

// The scrim dims "everything outside the sheet": a strip that ends flush at the sheet's top
// edge plus two inverse-corner pieces that fill the notches beside the sheet's rounded top
// corners. It never extends under the sheet body, so frost cutouts (skeletons, grab handle,
// close circle) are never contaminated by the dim.
const INVERSE_CORNER_PATH = `M 0 0 H ${OVERLAY_CORNER_RADIUS} A ${OVERLAY_CORNER_RADIUS} ${OVERLAY_CORNER_RADIUS} 0 0 0 0 ${OVERLAY_CORNER_RADIUS} Z`;

const BackdropInverseCorner = ({ mirrored }: { mirrored: boolean }) => (
  <Svg
    pointerEvents="none"
    width={OVERLAY_CORNER_RADIUS}
    height={OVERLAY_CORNER_RADIUS}
    style={mirrored ? styles.backdropCornerMirrored : null}
  >
    <Path d={INVERSE_CORNER_PATH} fill="#000000" />
  </Svg>
);

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
    const { isFocused, backdropDimProgress, backdropSheetTopY } = useRouteAuthoritySelector<
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
          backdropSheetTopY: snapshot.backdropSheetTopY,
        }),
        []
      ),
      isEqual: areBackdropSnapshotsEqual,
    });
    const rootBackdropAnimatedStyle = useAnimatedStyle(
      () => ({
        opacity:
          Math.max(0, Math.min(1, backdropDimProgress?.value ?? 0)) * BACKDROP_DIM_MAX_OPACITY,
      }),
      [backdropDimProgress]
    );
    const backdropStripAnimatedStyle = useAnimatedStyle(
      () => ({
        height: Math.max(0, backdropSheetTopY?.value ?? 0),
      }),
      [backdropSheetTopY]
    );
    const backdropCornersAnimatedStyle = useAnimatedStyle(
      () => ({
        transform: [{ translateY: Math.max(0, backdropSheetTopY?.value ?? 0) }],
      }),
      [backdropSheetTopY]
    );

    return isFocused && backdropDimProgress && backdropSheetTopY ? (
      <Reanimated.View
        pointerEvents="none"
        style={[styles.rootBackdropScrimLayer, rootBackdropAnimatedStyle]}
      >
        <Reanimated.View style={[styles.rootBackdropStrip, backdropStripAnimatedStyle]} />
        <Reanimated.View style={[styles.rootBackdropCorners, backdropCornersAnimatedStyle]}>
          <BackdropInverseCorner mirrored={false} />
          <BackdropInverseCorner mirrored />
        </Reanimated.View>
      </Reanimated.View>
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

    if (!isFocused || !rankAndScoreSheetsProps || !rankAndScoreModalLayer) {
      return null;
    }

    return rankAndScoreModalLayer.onProfilerRender ? (
      <React.Profiler
        id="SearchRankAndScoreSheets"
        onRender={rankAndScoreModalLayer.onProfilerRender}
      >
        <SearchRankAndScoreSheets {...rankAndScoreSheetsProps} />
      </React.Profiler>
    ) : (
      <SearchRankAndScoreSheets {...rankAndScoreSheetsProps} />
    );
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

    if (!isFocused || !priceSheetProps || !priceModalLayer) {
      return null;
    }

    return priceModalLayer.onProfilerRender ? (
      <React.Profiler id="SearchPriceSheet" onRender={priceModalLayer.onProfilerRender}>
        <SearchPriceSheet {...priceSheetProps} />
      </React.Profiler>
    ) : (
      <SearchPriceSheet {...priceSheetProps} />
    );
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
  rootBackdropScrimLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: OVERLAY_BACKDROP_SCRIM_ZINDEX,
    elevation: OVERLAY_BACKDROP_SCRIM_ZINDEX,
  },
  rootBackdropStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
  },
  rootBackdropCorners: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backdropCornerMirrored: {
    transform: [{ scaleX: -1 }],
  },
});
