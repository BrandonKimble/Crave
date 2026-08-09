import React from 'react';

import type { useSearchRootControlAuthorityRuntime } from './use-search-root-control-authority-runtime';
import type { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';
import type { useSearchRootControlResultsExperienceRuntime } from './use-search-root-control-results-experience-runtime';
import type { SearchRootFilterModalControlLane } from './search-root-control-plane-runtime-contract';
import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import type { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';
import type { useSearchRootRuntimeVisualAssemblyRuntime } from './use-search-root-runtime-visual-assembly-runtime';
import type { RouteSceneSwitchAuthority } from './search-root-route-runtime-contract';
import { RESULTS_BOTTOM_PADDING } from '../../constants/search';
import type { AppRouteSceneSheetPolicyInputs } from '../../../../navigation/runtime/app-route-scene-policy-contract';
import type {
  SearchRouteSceneBodyContentSpec,
  SearchRouteSceneBodyTransportSpec,
  SearchRouteSceneChromePublication,
} from '../../../../overlays/searchOverlayRouteHostContract';
import { syncSearchResultsPreMeasureOverlay } from '../../../../overlays/SearchResultsPreMeasureHost';
import { useSearchRootRouteSearchSceneDataRuntime } from './use-search-root-route-search-scene-data-runtime';
import { useSearchRootRouteSearchSceneReadModelRuntime } from './use-search-root-route-search-scene-read-model-runtime';
import { useSearchRootRouteSearchSceneRenderRuntime } from './use-search-root-route-search-scene-render-runtime';
import { computeSceneChromeHeight } from '../../../../navigation/runtime/scene-chrome-geometry';
import { useSearchRootSearchScenePanelSurfaceCompositeRuntime } from './use-search-root-search-scene-panel-surface-composite-runtime';
import { useSearchRootRouteSearchSceneSurfaceTransportRuntime } from './use-search-root-route-search-scene-surface-transport-runtime';
import { useSearchRootSearchScenePanelSurfaceRenderRuntime } from './use-search-root-search-scene-panel-surface-render-runtime';
import { SearchResultsItemSeparator } from './search-results-separator';
import { useSearchRootSearchSceneShellSpecPublicationRuntime } from './use-search-root-search-scene-shell-spec-publication-runtime';
import { useSearchRootSearchSceneSurfacePanelStateRuntime } from './use-search-root-search-scene-surface-panel-state-runtime';
import type { SearchRouteResultsPolicyReadModelWriterFacets } from './search-route-results-policy-domain-contract';
import { RESULTS_LOADING_EMPTY_COMPONENT } from './search-results-loading-empty-component';

type SearchRouteSearchSceneModelOwnerParams = {
  sessionAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['sessionAssemblyRuntime'];
  stateAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['stateAssemblyRuntime'];
  overlayFoundationAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >;
  visualAssemblyRuntime: ReturnType<typeof useSearchRootRuntimeVisualAssemblyRuntime>;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  controlAuthorityRuntime: ReturnType<typeof useSearchRootControlAuthorityRuntime>;
  profileControlRuntime: ReturnType<typeof useSearchRootControlProfileExperienceRuntime>;
  resultsControlRuntime: ReturnType<typeof useSearchRootControlResultsExperienceRuntime>;
  filterModalControlLane: SearchRootFilterModalControlLane;
  readModelPolicyWriters: SearchRouteResultsPolicyReadModelWriterFacets;
};

const SEARCH_RESULTS_PAGE_BUNDLE_CHROME_PUBLICATION: SearchRouteSceneChromePublication = {
  surfaceKind: 'inline',
  underlayComponent: null,
  backgroundComponent: null,
  headerComponent: null,
  overlayComponent: null,
};

const EMPTY_MOUNTED_SEARCH_ROWS: readonly unknown[] = [];

export const useSearchRouteSearchSceneModelOwner = ({
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  visualAssemblyRuntime,
  routeSceneSwitchAuthority,
  controlAuthorityRuntime,
  profileControlRuntime,
  resultsControlRuntime,
  filterModalControlLane,
  readModelPolicyWriters,
}: SearchRouteSearchSceneModelOwnerParams) => {
  const routeSearchSceneDataRuntime = useSearchRootRouteSearchSceneDataRuntime({
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    overlayFoundationAssemblyRuntime,
    routeSceneSwitchAuthority,
    controlAuthorityRuntime,
    filterModalControlLane,
    readModelPolicyWriters,
  });
  const routeSearchSceneReadModelRuntime = useSearchRootRouteSearchSceneReadModelRuntime({
    overlayFoundationAssemblyRuntime,
    profileControlRuntime,
    filterModalControlLane,
    routeSearchSceneDataRuntime,
    readModelPolicyWriters,
  });
  const routeSearchSceneSurfacePanelStateRuntime = useSearchRootSearchSceneSurfacePanelStateRuntime(
    {
      searchPresentationRuntimeState:
        routeSearchSceneDataRuntime.routeSearchScenePresentationRuntimeState,
      searchHydrationRuntimeState:
        routeSearchSceneDataRuntime.routeSearchSceneHydrationRuntimeState,
      searchResultsRuntimeState: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState,
      resolvedResultsRuntime: routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime,
      searchSheetContentLaneKind:
        routeSearchSceneDataRuntime.routeSearchSceneSearchSheetContentLane.kind,
      allowsInteractionLoadingState:
        routeSearchSceneDataRuntime.routeSearchSceneAllowsInteractionLoadingState,
    }
  );
  const routeSearchSceneSheetTransportRuntime =
    useSearchRootRouteSearchSceneSurfaceTransportRuntime({
      stateAssemblyRuntime,
      overlayFoundationAssemblyRuntime,
      resultsControlRuntime,
      visualAssemblyRuntime,
      routeSearchSceneDataRuntime,
      routeSearchSceneReadModelRuntime,
    });
  const routeSearchSceneRenderRuntime = useSearchRootRouteSearchSceneRenderRuntime({
    routeSearchSceneDataRuntime,
    routeSearchSceneReadModelRuntime,
    routeSearchSceneSurfacePanelStateRuntime,
  });
  const routeSearchScenePanelSurfaceCompositeRuntime =
    useSearchRootSearchScenePanelSurfaceCompositeRuntime({
      // The COMPUTED chrome fact (strip-band seam law §4) — the measured lane and its
      // magic 64 fallback are deleted.
      resolvedResultsHeaderHeightForRender: computeSceneChromeHeight('search'),
      shouldShowResultsSurface: routeSearchSceneSurfacePanelStateRuntime.shouldShowResultsSurface,
      surfaceMode: routeSearchSceneSurfacePanelStateRuntime.surfaceMode,
      resolvedResults:
        routeSearchSceneDataRuntime.routeSearchSceneResolvedResultsRuntime.resolvedResults,
      activeTab: routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.activeTab,
      onDemandNotice: routeSearchSceneDataRuntime.routeSearchSceneOnDemandNotice,
      resolutionFailure:
        routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState.resolutionFailure,
    });
  const routeSearchScenePanelSurfaceRenderRuntime =
    useSearchRootSearchScenePanelSurfaceRenderRuntime({
      backgroundComponent: routeSearchScenePanelSurfaceCompositeRuntime.backgroundComponent,
      overlayComponent: routeSearchScenePanelSurfaceCompositeRuntime.overlayComponent,
      searchSceneSheetPlaneRuntime:
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime,
    });
  const routeSearchSceneShellSpec = useSearchRootSearchSceneShellSpecPublicationRuntime({
    searchSceneSheetPlaneRuntime:
      routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime,
    shouldShowResultsSurface: routeSearchSceneSurfacePanelStateRuntime.shouldShowResultsSurface,
    shouldShowInteractionLoadingState:
      routeSearchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState,
    searchScenePanelSurfaceRenderRuntime: routeSearchScenePanelSurfaceRenderRuntime,
  });
  // R8 (2026-08-08): the results page-bundle publication is DELETED with its
  // only reader — SearchResultsPageBundleHost lived inside the old
  // BottomSheetSceneStackHost subtree, dark behind the flip since rung 5. On
  // the track, the search leg's surfaces ride the scene-input lane and the
  // persistent-header registry; publishing the bundle had become a write to a
  // store with zero subscribers.
  const shouldRunExternalPreMeasure =
    routeSearchSceneReadModelRuntime.routeSearchSceneResultsReadModelSelectors
      .isResultsHydrationSettled &&
    routeSearchSceneDataRuntime.routeSearchSceneHydrationRuntimeState.searchSurfaceRedrawPhase ===
      'idle';
  const externalPreMeasureOverlay = shouldRunExternalPreMeasure
    ? routeSearchSceneReadModelRuntime.routeSearchSceneResultsReadModelSelectors.preMeasureOverlay
    : null;
  React.useLayoutEffect(() => {
    syncSearchResultsPreMeasureOverlay(externalPreMeasureOverlay);
    return () => {
      syncSearchResultsPreMeasureOverlay(null);
    };
  }, [externalPreMeasureOverlay]);
  const routeSearchSceneChromePublication = SEARCH_RESULTS_PAGE_BUNDLE_CHROME_PUBLICATION;
  const routeSearchSceneSecondaryListContent = React.useMemo(
    () => ({
      data: EMPTY_MOUNTED_SEARCH_ROWS,
      listKey: 'results-dishes',
    }),
    []
  );
  const routeSearchSceneListBodyContentSnapshot = React.useMemo<
    Extract<SearchRouteSceneBodyContentSpec, { surfaceKind: 'list' }>
  >(
    () => ({
      surfaceKind: 'list',
      data: EMPTY_MOUNTED_SEARCH_ROWS,
      // F5421 — the scene-body spec is item-untyped (unknown rows); the runtime keeps the
      // typed ResultsListItem shape and these seams erase the item type only.
      renderItem: routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
        .resultsRenderItem as unknown as Extract<
        SearchRouteSceneBodyContentSpec,
        { surfaceKind: 'list' }
      >['renderItem'],
      keyExtractor: routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
        .resultsKeyExtractor as unknown as Extract<
        SearchRouteSceneBodyContentSpec,
        { surfaceKind: 'list' }
      >['keyExtractor'],
      estimatedItemSize:
        routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
          .estimatedItemSize,
      ListChromeComponent: null,
      ListHeaderComponent:
        routeSearchSceneRenderRuntime.resultsToggleStripForRender as React.ReactElement | null,
      ListFooterComponent: routeSearchSceneReadModelRuntime
        .routeSearchSceneResultsReadModelSelectors.listFooterComponent as React.ReactElement | null,
      ListEmptyComponent: RESULTS_LOADING_EMPTY_COMPONENT,
      ItemSeparatorComponent: SearchResultsItemSeparator,
      secondaryList: routeSearchSceneSecondaryListContent,
      listKey: 'results-restaurants',
      onEndReached:
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsEndReached,
      // Pagination fix (ledger #6b): threshold 0 = fire only at the EXACT end — after the
      // spurious reveal-time firing consumed it, real bottom approaches never re-triggered.
      // 0.5 viewports re-arms and fires like every standard infinite list.
      onEndReachedThreshold: 0.5,
    }),
    [
      routeSearchSceneReadModelRuntime.routeSearchSceneResultsReadModelSelectors
        .listFooterComponent,
      routeSearchSceneRenderRuntime.resultsToggleStripForRender,
      routeSearchSceneSecondaryListContent,
      routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
        .estimatedItemSize,
      routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
        .resultsKeyExtractor,
      routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
        .resultsRenderItem,
      routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
        .handleResultsEndReached,
    ]
  );
  const routeSearchSceneScrollIndicatorInsets = React.useMemo(
    () => ({
      // F1328/F6411: the measured results-header lane that fed this inset was deleted under
      // the strip-band seam law; the top inset is structurally 0.
      top: 0,
      bottom: RESULTS_BOTTOM_PADDING,
    }),
    []
  );
  const routeSearchSceneSecondaryListTransport = React.useMemo(
    () => ({
      listRef: undefined,
      scrollIndicatorInsets: undefined,
      contentContainerStyle: undefined,
      flashListProps: undefined,
      testID: 'search-results-flatlist-secondary',
    }),
    []
  );
  const routeSearchSceneListBodyTransportSnapshot =
    React.useMemo<SearchRouteSceneBodyTransportSpec>(
      () => ({
        contentContainerStyle: routeSearchSceneRenderRuntime.resultsContentContainerStyle,
        keyboardShouldPersistTaps: 'handled',
        scrollIndicatorInsets: routeSearchSceneScrollIndicatorInsets,
        onScrollBeginDrag:
          routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
            .handleResultsListScrollBegin,
        onUserListScrollActivity:
          routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
            .handleResultsListUserScrollActivity,
        onScrollEndDrag:
          routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
            .handleResultsListScrollEnd,
        onMomentumBeginJS:
          routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
            .handleResultsListMomentumBegin,
        onMomentumEndJS:
          routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
            .handleResultsListMomentumEnd,
        showsVerticalScrollIndicator: true,
        keyboardDismissMode: 'on-drag',
        // Over-scroll is owned by the track's single FlashList (TrackSheetPage.tsx,
        // post-R8) — the τ-space model handles the scroll↔sheet handoff; no per-scene config.
        testID: 'search-results-flatlist',
        activeList: routeSearchSceneRenderRuntime.activeList,
        // Dead cargo deleted (residue-kill-plan §2): the panel-list transport's
        // resolvedFlashListProps never reached a renderer post-R8.
        flashListProps: undefined,
        contentSurfaceStyle: undefined,
        listRef: routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .listRef as SearchRouteSceneBodyTransportSpec['listRef'],
        secondaryList: routeSearchSceneSecondaryListTransport,
      }),
      [
        routeSearchSceneRenderRuntime.activeList,
        routeSearchSceneRenderRuntime.resultsContentContainerStyle,
        routeSearchSceneScrollIndicatorInsets,
        routeSearchSceneSecondaryListTransport,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsListMomentumBegin,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsListMomentumEnd,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsListScrollBegin,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsListUserScrollActivity,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsListScrollEnd,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime.listRef,
      ]
    );
  const routeSearchSceneSheetPolicyInputs: AppRouteSceneSheetPolicyInputs = React.useMemo(
    () => ({
      sheetContentLaneKind: routeSearchSceneDataRuntime.routeSearchSceneSearchSheetContentLane.kind,
      shouldRenderRouteSheetSurface:
        routeSearchSceneSurfacePanelStateRuntime.shouldShowResultsSurface,
    }),
    [
      routeSearchSceneDataRuntime.routeSearchSceneSearchSheetContentLane.kind,
      routeSearchSceneSurfacePanelStateRuntime.shouldShowResultsSurface,
    ]
  );

  return {
    routeSearchSceneDataRuntime,
    routeSearchSceneReadModelRuntime,
    routeSearchSceneShellSpec,
    routeSearchSceneChromePublication,
    routeSearchSceneListBodyContentSnapshot,
    routeSearchSceneListBodyTransportSnapshot,
    routeSearchSceneRenderRuntime,
    routeSearchSceneSheetTransportRuntime,
    routeSearchSceneSheetPolicyInputs,
  };
};
