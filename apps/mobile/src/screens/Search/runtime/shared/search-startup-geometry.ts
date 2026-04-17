import { Dimensions, PixelRatio, type LayoutRectangle } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import { LINE_HEIGHTS } from '../../../../constants/typography';
import { OVERLAY_TAB_HEADER_HEIGHT } from '../../../../overlays/overlaySheetStyles';
import { calculateSnapPoints } from '../../../../overlays/sheetUtils';
import type { SnapPoints } from '../../../../overlays/bottomSheetMotionTypes';
import {
  NAV_BOTTOM_PADDING,
  NAV_TOP_PADDING,
  SEARCH_HEADER_HEIGHT,
  SEARCH_CONTAINER_PADDING_TOP,
  SEARCH_HORIZONTAL_PADDING,
} from '../../constants/search';

// This module is the single geometry contract for the search shell.
// If the search header or bottom-nav measurements change, update the exported
// constants/helpers here and let the runtime assertions catch any drift.
export const SEARCH_CONTAINER_HEIGHT = SEARCH_CONTAINER_PADDING_TOP + SEARCH_HEADER_HEIGHT;
export const SEARCH_BOTTOM_INSET_MIN = 12;
export const SEARCH_BOTTOM_NAV_ICON_HEIGHT = 24;
export const SEARCH_BOTTOM_NAV_LABEL_GAP = 2;
export const SEARCH_BOTTOM_NAV_HIDE_EXTRA = 12;
export const SEARCH_BOTTOM_NAV_HIDE_MIN = 24;
const SEARCH_GEOMETRY_EPSILON = 1;

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
  navBarTopForSnaps: number;
  navBarCutoutHeight: number;
  bottomNavHiddenTranslateY: number;
  routeOverlaySnapPoints: SnapPoints;
};

const roundPx = (value: number): number => PixelRatio.roundToNearestPixel(value);

type SearchStartupViewportMetrics = {
  width: number;
  height: number;
  insetsTop: number;
  insetsBottom: number;
};

export const resolveSearchBottomInset = (insetsBottom: number): number =>
  Math.max(insetsBottom, SEARCH_BOTTOM_INSET_MIN);

export const resolveSearchBottomNavHeight = (bottomInset: number): number =>
  roundPx(
    NAV_TOP_PADDING +
      SEARCH_BOTTOM_NAV_ICON_HEIGHT +
      SEARCH_BOTTOM_NAV_LABEL_GAP +
      LINE_HEIGHTS.body +
      bottomInset +
      NAV_BOTTOM_PADDING
  );

export const resolveSearchBottomNavHiddenTranslateY = (
  bottomNavHeight: number,
  bottomInset: number
): number =>
  roundPx(
    Math.max(
      SEARCH_BOTTOM_NAV_HIDE_MIN,
      bottomNavHeight + bottomInset + SEARCH_BOTTOM_NAV_HIDE_EXTRA
    )
  );

export const buildSearchStartupGeometrySeed = ({
  windowWidth,
  windowHeight,
  insetsTop,
  insetsBottom,
}: SearchStartupGeometryArgs): SearchStartupGeometrySeed => {
  const bottomInset = resolveSearchBottomInset(insetsBottom);
  const bottomNavHeight = resolveSearchBottomNavHeight(bottomInset);
  const navBarTopForSnaps = roundPx(windowHeight - bottomNavHeight);
  const searchContainerFrame = {
    x: 0,
    y: roundPx(insetsTop),
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
    navBarTopForSnaps,
    navBarCutoutHeight: bottomNavHeight,
    bottomNavHiddenTranslateY: resolveSearchBottomNavHiddenTranslateY(bottomNavHeight, bottomInset),
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

const createGeometryMismatchError = (label: string, expected: number, actual: number): Error =>
  new Error(
    `[SEARCH-STARTUP-GEOMETRY] ${label} drifted from the startup geometry contract (expected ${expected}, got ${actual}).`
  );

export const assertSearchStartupGeometryValue = (
  label: string,
  expected: number,
  actual: number
): void => {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    throw createGeometryMismatchError(label, expected, actual);
  }
  if (Math.abs(expected - actual) <= SEARCH_GEOMETRY_EPSILON) {
    return;
  }
  throw createGeometryMismatchError(label, expected, actual);
};

export const assertSearchStartupGeometryRect = (
  label: string,
  expected: LayoutRectangle,
  actual: LayoutRectangle
): void => {
  assertSearchStartupGeometryValue(`${label}.x`, expected.x, actual.x);
  assertSearchStartupGeometryValue(`${label}.y`, expected.y, actual.y);
  assertSearchStartupGeometryValue(`${label}.width`, expected.width, actual.width);
  assertSearchStartupGeometryValue(`${label}.height`, expected.height, actual.height);
};
