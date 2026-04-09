import React from 'react';
import { View } from 'react-native';

import SearchBottomNav, { type SearchBottomNavProps } from './SearchBottomNav';
import SearchMapWithMarkerEngine, {
  type SearchMapMarkerEngineHandle,
  type SearchMapWithMarkerEngineProps,
} from './SearchMapWithMarkerEngine';
import SearchOverlayHeaderChrome from './SearchOverlayHeaderChrome';
import SearchPriceSheet, { type SearchPriceSheetProps } from './SearchPriceSheet';
import SearchRankAndScoreSheets, {
  type SearchRankAndScoreSheetsProps,
} from './SearchRankAndScoreSheets';
import SearchSuggestionSurface from './SearchSuggestionSurface';
import SearchStatusBarFade from './SearchStatusBarFade';
import SearchFilters from './SearchFilters';
import type { SearchOverlayChromeModel } from '../runtime/shared/search-foreground-chrome-contract';
import styles from '../styles';

type SearchRootRenderSurfaceProps = {
  isInitialCameraReady: boolean;
  markerEngineRef: React.RefObject<SearchMapMarkerEngineHandle | null>;
  searchMapProps: SearchMapWithMarkerEngineProps;
  statusBarFadeHeight: number;
  shouldRenderSearchOverlay: boolean;
  searchOverlayChromeModel: SearchOverlayChromeModel;
  bottomNavProps: SearchBottomNavProps;
  rankAndScoreSheetsProps: SearchRankAndScoreSheetsProps;
  priceSheetProps: SearchPriceSheetProps;
  onProfilerRender: React.ProfilerOnRenderCallback;
};

export const SearchRootRenderSurface = ({
  isInitialCameraReady,
  markerEngineRef,
  searchMapProps,
  statusBarFadeHeight,
  shouldRenderSearchOverlay,
  searchOverlayChromeModel,
  bottomNavProps,
  rankAndScoreSheetsProps,
  priceSheetProps,
  onProfilerRender,
}: SearchRootRenderSurfaceProps) => {
  return (
    <React.Profiler id="SearchScreen" onRender={onProfilerRender}>
      <View style={styles.container}>
        {!isInitialCameraReady ? (
          <React.Profiler id="SearchMapPlaceholder" onRender={onProfilerRender}>
            <View pointerEvents="none" style={styles.mapPlaceholder} />
          </React.Profiler>
        ) : (
          <React.Profiler id="SearchMapTree" onRender={onProfilerRender}>
            <SearchMapWithMarkerEngine ref={markerEngineRef} {...searchMapProps} />
          </React.Profiler>
        )}
        <SearchStatusBarFade statusBarFadeHeight={statusBarFadeHeight} />
        <>
          {shouldRenderSearchOverlay ? (
            <React.Profiler id="SearchOverlayChrome" onRender={onProfilerRender}>
              <View
                style={[
                  styles.overlay,
                  searchOverlayChromeModel.overlayContainerStyle,
                  searchOverlayChromeModel.isSuggestionOverlayVisible
                    ? {
                        zIndex: searchOverlayChromeModel.shouldHideBottomNavForRender ? 200 : 110,
                      }
                    : null,
                ]}
                pointerEvents="box-none"
              >
                <SearchSuggestionSurface {...searchOverlayChromeModel.suggestionSurfaceProps} />
                <SearchOverlayHeaderChrome {...searchOverlayChromeModel.headerChromeProps} />
                {searchOverlayChromeModel.hiddenSearchFiltersWarmupProps ? (
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
                    <SearchFilters {...searchOverlayChromeModel.hiddenSearchFiltersWarmupProps} />
                  </View>
                ) : null}
              </View>
            </React.Profiler>
          ) : null}
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
        </>
      </View>
    </React.Profiler>
  );
};
