import { Dimensions, PixelRatio, type LayoutRectangle } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import { OVERLAY_TAB_HEADER_HEIGHT } from '../../../../overlays/overlaySheetStyles';
import { calculateSnapPoints } from '../../../../overlays/sheetUtils';
import type { SnapPoints } from '../../../../overlays/bottomSheetMotionTypes';
import {
  SEARCH_HEADER_HEIGHT,
  SEARCH_CONTAINER_PADDING_TOP,
  SEARCH_HORIZONTAL_PADDING,
} from '../../constants/search';
import {
  resolveAppRouteBottomNavHeight,
  resolveAppRouteBottomNavHiddenTranslateY,
  resolveAppRouteBottomNavTop,
  resolveAppRouteNavBottomInset,
  resolveAppRouteNavSilhouetteBottomNavGeometry,
  resolveAppRouteNavSilhouetteSnapTop,
} from '../../../../navigation/runtime/app-route-nav-silhouette-authority';

export const SEARCH_CONTAINER_HEIGHT = SEARCH_CONTAINER_PADDING_TOP + SEARCH_HEADER_HEIGHT;

type SearchStartupGeometryArgs = {
  windowWidth: number;
  windowHeight: number;
  insetsTop: number;
  insetsBottom: number;
};

export type SearchStartupGeometrySeed = {
  windowWidth: number;
  windowHeight: number;
  insetsTop: number;
  insetsBottom: number;
  searchContainerFrame: LayoutRectangle;
  searchHeaderFrame: LayoutRectangle;
  searchBarTop: number;
  bottomNavHeight: number;
  bottomNavTop: number;
  navBarTopForSnaps: number;
  navBarCutoutHeight: number;
  bottomNavHiddenTranslateY: number;
  routeOverlaySnapPoints: SnapPoints;
};

type SearchStartupViewportMetrics = {
  width: number;
  height: number;
  insetsTop: number;
  insetsBottom: number;
};

const roundPx = (value: number): number => PixelRatio.roundToNearestPixel(value);

export const resolveSearchBottomInset = (insetsBottom: number): number =>
  resolveAppRouteNavBottomInset(insetsBottom);

export const resolveSearchBottomNavHeight = (bottomInset: number): number =>
  resolveAppRouteBottomNavHeight(bottomInset);

export const resolveSearchBottomNavHiddenTranslateY = (
  bottomNavHeight: number,
  bottomInset: number
): number =>
  resolveAppRouteBottomNavHiddenTranslateY(bottomNavHeight, bottomInset);

export const buildSearchStartupGeometrySeed = ({
  windowWidth,
  windowHeight,
  insetsTop,
  insetsBottom,
}: SearchStartupGeometryArgs): SearchStartupGeometrySeed => {
  const {
    bottomInset,
    bottomNavHeight,
    navBarCutoutHeight,
    bottomNavHiddenTranslateY,
    sheetBottomExclusionHeight,
  } = resolveAppRouteNavSilhouetteBottomNavGeometry(insetsBottom);
  const bottomNavTop = resolveAppRouteBottomNavTop({
    windowHeight,
    bottomNavHeight,
  });
  const navBarTopForSnaps = resolveAppRouteNavSilhouetteSnapTop({
    windowHeight,
    sheetBottomExclusionHeight,
  });
  const searchContainerTop = roundPx(insetsTop);
  const searchContainerFrame = {
    x: 0,
    y: searchContainerTop,
    width: roundPx(windowWidth),
    height: roundPx(SEARCH_CONTAINER_HEIGHT),
  };
  const searchHeaderFrame = {
    x: roundPx(SEARCH_HORIZONTAL_PADDING),
    y: roundPx(SEARCH_CONTAINER_PADDING_TOP),
    width: roundPx(Math.max(0, windowWidth - SEARCH_HORIZONTAL_PADDING * 2)),
    height: roundPx(SEARCH_HEADER_HEIGHT),
  };
  const searchBarTop = roundPx(searchContainerFrame.y + searchHeaderFrame.y);

  return {
    windowWidth: roundPx(windowWidth),
    windowHeight: roundPx(windowHeight),
    insetsTop: roundPx(insetsTop),
    insetsBottom: roundPx(insetsBottom),
    searchContainerFrame,
    searchHeaderFrame,
    searchBarTop,
    bottomNavHeight,
    bottomNavTop,
    navBarTopForSnaps,
    navBarCutoutHeight,
    bottomNavHiddenTranslateY,
    routeOverlaySnapPoints: calculateSnapPoints(
      windowHeight,
      searchBarTop,
      insetsTop,
      navBarTopForSnaps,
      OVERLAY_TAB_HEADER_HEIGHT
    ),
  };
};

const getInitialInsets = () =>
  initialWindowMetrics?.insets ?? { top: 0, bottom: 0, left: 0, right: 0 };

export const getSearchStartupViewportMetrics = (): SearchStartupViewportMetrics => {
  const dimensions = Dimensions.get('window');
  const frame = initialWindowMetrics?.frame;
  const insets = getInitialInsets();

  return {
    width: frame?.width ?? dimensions.width,
    height: frame?.height ?? dimensions.height,
    insetsTop: insets.top,
    insetsBottom: insets.bottom,
  };
};

export const getSearchStartupGeometrySeed = (): SearchStartupGeometrySeed => {
  const viewport = getSearchStartupViewportMetrics();

  return buildSearchStartupGeometrySeed({
    windowWidth: viewport.width,
    windowHeight: viewport.height,
    insetsTop: viewport.insetsTop,
    insetsBottom: viewport.insetsBottom,
  });
};
