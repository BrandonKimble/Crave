import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import { useSearchRouteSessionController } from '../../../../overlays/useSearchRouteSessionController';
import type { OverlayRuntimeController } from '../controller/overlay-runtime-controller';
import type { MapMotionPressureController } from '../map/map-motion-pressure';
import { useSearchMapMovementState } from '../../hooks/use-search-map-movement-state';
import type { SearchRouteOverlayTransitionController } from '../../../../overlays/useSearchRouteOverlayTransitionController';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';
import type { OverlayKey } from '../../../../store/overlayStore';
import { useResultsSheetVisibilityActionsRuntime } from './use-results-sheet-visibility-actions-runtime';
import { useResultsSheetVisibilitySyncRuntime } from './use-results-sheet-visibility-sync-runtime';
import { useSearchRuntimeInstrumentationRuntime } from './use-search-runtime-instrumentation-runtime';

export type SearchDockedPollsVisibilityRuntimeArgs = {
  isSearchOverlay: boolean;
  showPollsOverlay: boolean;
  isSuggestionPanelActive: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isSearchOriginRestorePending: boolean;
  isDockedPollsDismissed: boolean;
};

export type SearchDockedPollsVisibilityRuntime = {
  shouldShowDockedPollsTarget: boolean;
  shouldShowDockedPolls: boolean;
  shouldShowPollsSheet: boolean;
};

export type SearchNavRestoreRuntimeArgs = {
  transitionController: SearchRouteOverlayTransitionController;
  isSearchOverlay: boolean;
  shouldShowDockedPollsTarget: boolean;
  pollsSheetSnap: 'hidden' | 'collapsed' | 'expanded';
};

export type SearchOverlayRenderVisibilityRuntimeArgs = {
  isSearchOverlay: boolean;
  shouldShowPollsSheet: boolean;
  showBookmarksOverlay: boolean;
  showProfileOverlay: boolean;
  showSaveListOverlay: boolean;
};

export type SearchBottomNavRuntimeArgs = {
  searchLayoutTop: number;
  searchBarFrame: LayoutRectangle | null;
  insetsBottom: number;
};

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
  registerTransientDismissor: (handler: () => void) => () => void;
  dismissTransientOverlays: () => void;
  ensureSearchOverlay: () => void;
};

export type UseSearchRootScaffoldLaneRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
  };
  startupPollBounds: Parameters<typeof useSearchMapMovementState>[0]['startupPollBounds'];
  mapRef: Parameters<typeof useSearchMapMovementState>[0]['mapRef'];
  searchLayoutTop: number;
  searchBarFrame: SearchBottomNavRuntimeArgs['searchBarFrame'];
  isSuggestionPanelActive: boolean;
  isAutocompleteSuppressed: boolean;
  rootSessionRuntime: SearchRootSessionRuntime;
};

export type SearchRootOverlaySessionArgsRuntime = {
  overlayRuntimeController: OverlayRuntimeController;
  pollsSheetSnap: Parameters<typeof useSearchRouteSessionController>[0]['pollsSheetSnap'];
  bookmarksSheetSnap: Parameters<typeof useSearchRouteSessionController>[0]['bookmarksSheetSnap'];
  profileSheetSnap: Parameters<typeof useSearchRouteSessionController>[0]['profileSheetSnap'];
  isDockedPollsDismissed: Parameters<
    typeof useSearchRouteSessionController
  >[0]['isDockedPollsDismissed'];
  hasUserSharedSnap: Parameters<typeof useSearchRouteSessionController>[0]['hasUserSharedSnap'];
  sharedSnap: Parameters<typeof useSearchRouteSessionController>[0]['sharedSnap'];
  transitionController: SearchNavRestoreRuntimeArgs['transitionController'];
  showSaveListOverlay: SearchOverlayRenderVisibilityRuntimeArgs['showSaveListOverlay'];
  isSuggestionPanelActive: SearchDockedPollsVisibilityRuntimeArgs['isSuggestionPanelActive'];
  isSearchSessionActive: SearchDockedPollsVisibilityRuntimeArgs['isSearchSessionActive'];
  isSearchLoading: SearchDockedPollsVisibilityRuntimeArgs['isSearchLoading'];
  searchLayoutTop: SearchBottomNavRuntimeArgs['searchLayoutTop'];
  searchBarFrame: SearchBottomNavRuntimeArgs['searchBarFrame'];
  insetsBottom: SearchBottomNavRuntimeArgs['insetsBottom'];
};

export type SearchRootResultsSheetRuntimeLaneArgsRuntime = Omit<
  Parameters<typeof useSearchMapMovementState>[0],
  'mapMotionPressureController' | 'shouldShowPollsSheet'
> & {
  screenHeight: number;
  insetsTop: number;
  initialDockedPollsArgs: Omit<
    Parameters<typeof useResultsSheetVisibilityActionsRuntime>[0],
    | 'isSearchOverlay'
    | 'shouldShowDockedPollsTarget'
    | 'sheetLayoutRuntime'
    | 'visibilityStateRuntime'
  >;
  lastVisibleSheetStateRef: Parameters<
    typeof useResultsSheetVisibilitySyncRuntime
  >[0]['lastVisibleSheetStateRef'];
};

export type SearchRootResultsSheetRuntimeLane = ReturnType<typeof useSearchMapMovementState> & {
  mapMotionPressureController: MapMotionPressureController;
};

export type SearchRootResultsSheetRuntimeOwner = ResultsSheetRuntimeOwner;

export type SearchRootInstrumentationArgsRuntime = Omit<
  Parameters<typeof useSearchRuntimeInstrumentationRuntime>[0],
  'isSearchOverlay' | 'rootOverlay' | 'activeOverlayKey'
>;

export type SearchRootOverlaySessionRuntime = SearchOverlayStoreRuntime &
  ReturnType<typeof useSearchRouteSessionController> &
  SearchBottomNavRuntime &
  SearchDockedPollsVisibilityRuntime & {
    shouldRenderSearchOverlay: boolean;
  };

export type SearchRootScaffoldRuntime = {
  overlaySessionRuntime: SearchRootOverlaySessionRuntime;
  resultsSheetRuntimeLane: SearchRootResultsSheetRuntimeLane;
  resultsSheetRuntimeOwner: SearchRootResultsSheetRuntimeOwner;
  instrumentationRuntime: ReturnType<typeof useSearchRuntimeInstrumentationRuntime>;
};
