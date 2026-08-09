import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type { OverlayKey } from './types';
import {
  APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE,
  type AppRouteNavSilhouetteSheetExclusionModeValue,
} from '../navigation/runtime/app-route-nav-silhouette-authority';
import { getSearchStartupGeometrySeed } from '../screens/Search/runtime/shared/search-startup-geometry';

const searchStartupGeometrySeed = getSearchStartupGeometrySeed();

// The startup seed runs at module load, BEFORE any `useSharedValue` hook exists,
// so the animated fields cannot be real `SharedValue`s yet — they are seeded with
// plain `{ value }` objects that consumers only read `.value` off of until the real
// host state mounts. `EmptySearchRouteVisualStateSeed` states that honestly: every
// non-animated field keeps its exact `SearchRouteHostVisualState` type, while the
// seven pre-hook animated fields relax to their `{ value }` seed shape. The literal
// below is checked against it with `satisfies`, so a renamed/added/dropped field or a
// wrong-typed seed value now reds tsc (the old `as unknown as` accepted all of them).
// The single bridging cast that follows is the one deliberate spot where the seed
// masquerades as the fully-mounted runtime type.
type AnimatedNumberSeed = { value: number };
type AnimatedBooleanSeed = { value: boolean };
type AnimatedExclusionModeSeed = { value: AppRouteNavSilhouetteSheetExclusionModeValue };

type EmptySearchRouteVisualStateSeed = Omit<
  SearchRouteHostVisualState,
  | 'sheetMomentum'
  | 'navBarCutoutProgress'
  | 'navBarCutoutHidingProgress'
  | 'navTranslateY'
  | 'navSilhouetteSheetExclusionModeValue'
> & {
  sheetMomentum: AnimatedBooleanSeed;
  navBarCutoutProgress: AnimatedNumberSeed;
  navBarCutoutHidingProgress: AnimatedNumberSeed;
  navTranslateY: AnimatedNumberSeed;
  navSilhouetteSheetExclusionModeValue: AnimatedExclusionModeSeed;
};

const EMPTY_SEARCH_ROUTE_VISUAL_STATE_SEED = {
  sheetMomentum: { value: false },
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
    value: APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedScene,
  },
} satisfies EmptySearchRouteVisualStateSeed;

export const EMPTY_SEARCH_ROUTE_VISUAL_STATE =
  EMPTY_SEARCH_ROUTE_VISUAL_STATE_SEED as unknown as SearchRouteHostVisualState;

export type SearchRouteOverlaySheetPolicy = {
  overlaySheetVisible: boolean;
  overlaySheetApplyNavBarCutout: boolean;
};

export type SearchRouteOverlayRouteScope = {
  activeOverlayRouteKey: OverlayKey;
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
};
