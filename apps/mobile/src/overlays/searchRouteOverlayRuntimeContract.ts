import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type { OverlayKey } from './types';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';
import { APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE } from '../navigation/runtime/app-route-nav-silhouette-authority';
import { getSearchStartupGeometrySeed } from '../screens/Search/runtime/shared/search-startup-geometry';

const searchStartupGeometrySeed = getSearchStartupGeometrySeed();

export const EMPTY_SEARCH_ROUTE_VISUAL_STATE = {
  sheetTranslateY: { value: 0 },
  resultsScrollOffset: { value: 0 },
  resultsMomentum: { value: false },
  overlayHeaderActionProgress: { value: 0 },
  navBarHeight: searchStartupGeometrySeed.bottomNavHeight,
  navBarTopForSnaps: searchStartupGeometrySeed.navBarTopForSnaps,
  searchBarTop: searchStartupGeometrySeed.searchBarTop,
  snapPoints: searchStartupGeometrySeed.routeOverlaySnapPoints,
  searchSurfacePageBundleProgress: { value: 0 },
  navBarCutoutHeight: searchStartupGeometrySeed.navBarCutoutHeight,
  navBarCutoutProgress: { value: 1 },
  navBarCutoutHidingProgress: { value: 0 },
  bottomNavHiddenTranslateY: searchStartupGeometrySeed.bottomNavHiddenTranslateY,
  navBarCutoutIsHiding: false,
  navTranslateY: { value: 0 },
  navSilhouetteSheetExclusionModeValue: {
    value: APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedPersistentPoll,
  },
} as unknown as SearchRouteHostVisualState;

export type SearchRouteOverlaySheetPolicy = {
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  overlayHeaderActionMode: OverlayHeaderActionMode;
};

export type SearchRouteOverlayRouteScope = {
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
};
