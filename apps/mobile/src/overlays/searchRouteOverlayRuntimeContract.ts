import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type { OverlayKey } from './types';
import type { OverlayHeaderActionMode } from './useOverlayHeaderActionController';
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
  closeVisualHandoffProgress: { value: 0 },
  navBarCutoutHeight: searchStartupGeometrySeed.navBarCutoutHeight,
  navBarCutoutProgress: { value: 0 },
  bottomNavHiddenTranslateY: searchStartupGeometrySeed.bottomNavHiddenTranslateY,
  navBarCutoutIsHiding: false,
} as unknown as SearchRouteHostVisualState;

export type SearchRouteOverlayKey = 'search' | 'polls' | null;

export type SearchRouteOverlaySheetKeys = {
  searchRouteOverlayKey: SearchRouteOverlayKey;
  overlaySheetKey: OverlayKey | null;
  resolvedOverlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
  isPersistentPollLane: boolean;
  isSearchOverlay: boolean;
  showPollsOverlay: boolean;
  showBookmarksOverlay: boolean;
  showProfileOverlay: boolean;
  showSaveListOverlay: boolean;
};

export type SearchRouteSceneStackState = {
  activeSceneKey: OverlayKey;
  sceneKeys: OverlayKey[];
};

export type SearchRouteOverlaySheetPolicyInput = {
  activeSceneKey: OverlayKey;
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
};

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
