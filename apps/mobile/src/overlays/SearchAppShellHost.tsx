import React from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

import SearchBottomNav from '../screens/Search/components/SearchBottomNav';
import SearchOverlayChromeLayer from '../screens/Search/components/SearchOverlayChromeLayer';
import SearchPriceSheet from '../screens/Search/components/SearchPriceSheet';
import SearchRankAndScoreSheets from '../screens/Search/components/SearchRankAndScoreSheets';
import SearchStatusBarFade from '../screens/Search/components/SearchStatusBarFade';
import SearchRouteLayerHost from './SearchRouteLayerHost';
import { useSearchAppShellPublishedState } from './useSearchAppShellPublishedState';

const NOOP_PROFILER_RENDER: React.ProfilerOnRenderCallback = () => undefined;

const SearchAppShellHost = () => {
  const {
    isVisible,
    overlayRenderSurfaceModel,
    modalSheetRenderSurfaceModel,
    profilerRenderCallback,
  } = useSearchAppShellPublishedState();

  const routeOverlayBackdropDimProgress =
    overlayRenderSurfaceModel?.routeOverlayBackdropDimProgress ?? null;
  const routeOverlayChromeTransitionProgress =
    overlayRenderSurfaceModel?.routeOverlayChromeTransitionProgress ?? null;

  const rootBackdropAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: Math.max(0, Math.min(1, routeOverlayBackdropDimProgress?.value ?? 0)) * 0.05,
    }),
    [routeOverlayBackdropDimProgress]
  );

  if (!isVisible || !overlayRenderSurfaceModel || !modalSheetRenderSurfaceModel) {
    return null;
  }

  const onProfilerRender = profilerRenderCallback ?? NOOP_PROFILER_RENDER;
  const {
    statusBarFadeHeight,
    shouldRenderSearchOverlay,
    searchOverlayChromeModel,
    bottomNavProps,
  } = overlayRenderSurfaceModel;
  const { rankAndScoreSheetsProps, priceSheetProps } = modalSheetRenderSurfaceModel;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <SearchStatusBarFade statusBarFadeHeight={statusBarFadeHeight} />
      {shouldRenderSearchOverlay ? (
        <React.Profiler id="SearchOverlayChrome" onRender={onProfilerRender}>
          <SearchOverlayChromeLayer searchOverlayChromeModel={searchOverlayChromeModel} />
        </React.Profiler>
      ) : null}
      <Reanimated.View
        pointerEvents="none"
        style={[styles.rootBackdropScrim, rootBackdropAnimatedStyle]}
      />
      <React.Profiler id="SearchRouteOverlayHost" onRender={onProfilerRender}>
        <View pointerEvents="box-none" style={styles.routeOverlayHostLayer}>
          <SearchRouteLayerHost
            chromeTransitionProgress={routeOverlayChromeTransitionProgress ?? undefined}
            backdropDimProgress={routeOverlayBackdropDimProgress ?? undefined}
          />
        </View>
      </React.Profiler>
      <React.Profiler id="BottomNav" onRender={onProfilerRender}>
        <SearchBottomNav {...bottomNavProps} />
      </React.Profiler>
      <React.Profiler id="Overlays" onRender={onProfilerRender}>
        <>
          <SearchRankAndScoreSheets {...rankAndScoreSheetsProps} />
          <React.Profiler id="PriceSheet" onRender={onProfilerRender}>
            <SearchPriceSheet {...priceSheetProps} />
          </React.Profiler>
        </>
      </React.Profiler>
    </View>
  );
};

const styles = StyleSheet.create({
  rootBackdropScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 60,
  },
  routeOverlayHostLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
  },
});

export default React.memo(SearchAppShellHost);
