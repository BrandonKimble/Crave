import type { MapMotionPressureController } from '../map/map-motion-pressure';
import { useSearchMapMovementState } from '../../hooks/use-search-map-movement-state';
import type { LayoutChangeEvent } from 'react-native';
import type { OverlayKey } from '../../../../navigation/runtime/app-overlay-route-types';
import { useSearchRuntimeInstrumentationRuntime } from './use-search-runtime-instrumentation-runtime';

export type SearchBottomNavRuntime = {
  searchBarTop: number;
  bottomInset: number;
  handleBottomNavLayout: (event: LayoutChangeEvent) => void;
  bottomNavHiddenTranslateY: number;
  navBarTopForSnaps: number;
  navBarCutoutHeight: number;
};

export type SearchOverlayStoreRuntime = {
  activeOverlayKey: OverlayKey;
  rootOverlay: OverlayKey;
  isSearchOverlay: boolean;
  showBookmarksOverlay: boolean;
  showPollsOverlay: boolean;
  showProfileOverlay: boolean;
  getIdentitySnapshot: () => Pick<
    SearchOverlayStoreRuntime,
    | 'activeOverlayKey'
    | 'rootOverlay'
    | 'isSearchOverlay'
    | 'showBookmarksOverlay'
    | 'showPollsOverlay'
    | 'showProfileOverlay'
  >;
  registerTransientDismissor: (handler: () => void) => () => void;
  dismissTransientOverlays: () => void;
};

export type SearchRootResultsSheetRuntimeLane = ReturnType<typeof useSearchMapMovementState> & {
  mapMotionPressureController: MapMotionPressureController;
};

export type SearchRootInstrumentationArgsRuntime = Omit<
  Parameters<typeof useSearchRuntimeInstrumentationRuntime>[0],
  'isSearchOverlay' | 'rootOverlay' | 'activeOverlayKey'
>;

export type SearchRootInstrumentationRuntime = ReturnType<
  typeof useSearchRuntimeInstrumentationRuntime
>;

export type SearchRootOverlaySessionRuntime = SearchOverlayStoreRuntime &
  SearchRootOverlaySessionSurfaceRuntime;

export type SearchRootOverlaySessionSurfaceRuntime = SearchRootOverlaySessionGeometryRuntime & {
  shouldRenderSearchOverlay: boolean;
};

export type SearchRootOverlaySessionGeometryRuntime = SearchBottomNavRuntime;
