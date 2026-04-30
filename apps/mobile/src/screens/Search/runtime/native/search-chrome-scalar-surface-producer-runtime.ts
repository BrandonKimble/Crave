import type {
  SearchChromeScalarSurfaceControlScalar,
  SearchChromeScalarSurfaceScalarSnapshot,
  SearchChromeScalarSurfaceTargetRuntime,
} from './search-chrome-scalar-surface-target-runtime';

export type SearchChromeScalarSurfacePrimitiveSnapshot = {
  shouldDisableSearchShortcuts: boolean;
  shouldRenderSearchOverlay: boolean;
  headerShortcutsVisibleTarget: boolean;
  headerShortcutsInteractive: boolean;
  isSearchOverlay: boolean;
  isSuggestionPanelActive: boolean;
  isSuggestionOverlayVisible: boolean;
  backdropTarget: 'suggestions' | 'results' | 'none';
  isSearchSessionActive: boolean;
  mapMovedSinceSearch: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  hasResults: boolean;
};

export type SearchChromeScalarSurfaceProducerRuntime = {
  applyPrimitiveSnapshot: (
    primitiveSnapshot: SearchChromeScalarSurfacePrimitiveSnapshot
  ) => SearchChromeScalarSurfaceScalarSnapshot;
};

export const resolveSearchChromeScalarSurfaceControlScalars = (
  primitiveSnapshot: SearchChromeScalarSurfacePrimitiveSnapshot
): readonly SearchChromeScalarSurfaceControlScalar[] => {
  const shouldShowSearchShortcutsTarget =
    !primitiveSnapshot.shouldDisableSearchShortcuts &&
    primitiveSnapshot.shouldRenderSearchOverlay &&
    (primitiveSnapshot.isSearchOverlay
      ? primitiveSnapshot.isSuggestionPanelActive || primitiveSnapshot.headerShortcutsVisibleTarget
      : true);
  const shouldEnableSearchShortcutsInteractionTarget =
    shouldShowSearchShortcutsTarget && primitiveSnapshot.headerShortcutsInteractive;
  const shouldKeepSearchShortcutsMountedForResultsExit =
    primitiveSnapshot.isSearchOverlay &&
    !primitiveSnapshot.isSuggestionPanelActive &&
    primitiveSnapshot.isSuggestionOverlayVisible &&
    primitiveSnapshot.backdropTarget === 'results';
  const shouldMountSearchShortcuts =
    shouldShowSearchShortcutsTarget || shouldKeepSearchShortcutsMountedForResultsExit;
  const shouldEnableSearchShortcutsInteraction =
    shouldMountSearchShortcuts && shouldEnableSearchShortcutsInteractionTarget;
  const shouldShowSearchThisArea =
    primitiveSnapshot.isSearchOverlay &&
    !primitiveSnapshot.isSuggestionPanelActive &&
    primitiveSnapshot.backdropTarget === 'results' &&
    primitiveSnapshot.isSearchSessionActive &&
    primitiveSnapshot.mapMovedSinceSearch &&
    !primitiveSnapshot.isSearchLoading &&
    !primitiveSnapshot.isLoadingMore &&
    primitiveSnapshot.hasResults;

  return [
    {
      controlId: 'shortcut_restaurants',
      visible: shouldMountSearchShortcuts,
      enabled: shouldEnableSearchShortcutsInteraction,
      passThroughWhenDisabled: true,
    },
    {
      controlId: 'shortcut_dishes',
      visible: shouldMountSearchShortcuts,
      enabled: shouldEnableSearchShortcutsInteraction,
      passThroughWhenDisabled: true,
    },
    {
      controlId: 'search_this_area',
      visible: shouldShowSearchThisArea,
      enabled: shouldShowSearchThisArea,
      passThroughWhenDisabled: true,
    },
  ];
};

export const createSearchChromeScalarSurfaceProducerRuntime = (
  targetRuntime: SearchChromeScalarSurfaceTargetRuntime
): SearchChromeScalarSurfaceProducerRuntime => ({
  applyPrimitiveSnapshot: (primitiveSnapshot) => {
    let scalarSnapshot = targetRuntime.getScalarSnapshot();
    for (const controlScalar of resolveSearchChromeScalarSurfaceControlScalars(primitiveSnapshot)) {
      scalarSnapshot = targetRuntime.updateControlScalar(controlScalar);
    }
    return scalarSnapshot;
  },
});
