import React from 'react';

import type { useSearchRootControlAuthorityRuntime } from './use-search-root-control-authority-runtime';
import type { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';
import type { useSearchRootControlResultsExperienceRuntime } from './use-search-root-control-results-experience-runtime';
import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
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
import {
  EMPTY_SEARCH_MOUNTED_SCENE_CHROME_SNAPSHOT,
  publishSearchMountedSceneChromeSnapshot,
  type SearchMountedSceneChromeSnapshot,
} from '../../../../overlays/SearchMountedSceneChromeAuthority';
import { useSearchRootRouteSearchSceneDataRuntime } from './use-search-root-route-search-scene-data-runtime';
import { useSearchRootRouteSearchSceneReadModelRuntime } from './use-search-root-route-search-scene-read-model-runtime';
import { useSearchRootRouteSearchSceneRenderRuntime } from './use-search-root-route-search-scene-render-runtime';
import { useSearchRootRouteSearchSceneSurfaceInteractionRuntime } from './use-search-root-route-search-scene-surface-interaction-runtime';
import { useSearchRootRouteSearchSceneSurfacePanelPartsRuntime } from './use-search-root-route-search-scene-surface-panel-parts-runtime';
import { useSearchRootRouteSearchSceneSurfaceTransportRuntime } from './use-search-root-route-search-scene-surface-transport-runtime';
import { useSearchRootSearchScenePanelSurfaceRenderRuntime } from './use-search-root-search-scene-panel-surface-render-runtime';
import { useSearchRootSearchSceneShellSpecPublicationRuntime } from './use-search-root-search-scene-shell-spec-publication-runtime';
import { useSearchRootSearchSceneSurfacePanelStateRuntime } from './use-search-root-search-scene-surface-panel-state-runtime';
import type { SearchRouteResultsPolicyReadModelWriterFacets } from './search-route-results-policy-domain-contract';
import type { ResultsSurfacePolicyController } from './results-surface-policy-controller';

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
  surfacePolicyController: ResultsSurfacePolicyController;
  readModelPolicyWriters: SearchRouteResultsPolicyReadModelWriterFacets;
};

const SEARCH_MOUNTED_SCENE_CHROME_PUBLICATION: SearchRouteSceneChromePublication = {
  surfaceKind: 'mounted',
  mountedChromeKey: 'search',
  excludedSurfaces: ['header'],
};

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
  surfacePolicyController,
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
    visualAssemblyRuntime,
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
      allowsInteractionLoadingState:
        routeSearchSceneDataRuntime.routeSearchSceneAllowsInteractionLoadingState,
      resultsReadModelSelectors:
        routeSearchSceneReadModelRuntime.routeSearchSceneResultsReadModelSelectors,
    }
  );
  const routeSearchSceneRenderRuntime = useSearchRootRouteSearchSceneRenderRuntime({
    routeSearchSceneDataRuntime,
    routeSearchSceneReadModelRuntime,
    routeSearchSceneSurfacePanelStateRuntime,
  });
  const routeSearchSceneSheetTransportRuntime =
    useSearchRootRouteSearchSceneSurfaceTransportRuntime({
      stateAssemblyRuntime,
      overlayFoundationAssemblyRuntime,
      resultsControlRuntime,
      visualAssemblyRuntime,
      routeSearchSceneDataRuntime,
      routeSearchSceneReadModelRuntime,
    });
  const routeSearchSceneSurfaceStateRuntime = React.useMemo(
    () => ({
      routeSearchSceneSurfacePanelStateRuntime,
      routeSearchSceneRenderRuntime,
    }),
    [routeSearchSceneRenderRuntime, routeSearchSceneSurfacePanelStateRuntime]
  );
  const routeSearchSceneInteractionFrostRuntime =
    useSearchRootRouteSearchSceneSurfaceInteractionRuntime({
      controlAuthorityRuntime,
      routeSearchSceneDataRuntime,
      routeSearchSceneSurfaceStateRuntime,
    });
  const routeSearchSceneSurfacePanelPartsRuntime =
    useSearchRootRouteSearchSceneSurfacePanelPartsRuntime({
      visualAssemblyRuntime,
      routeSearchSceneDataRuntime,
      routeSearchSceneReadModelRuntime,
      routeSearchSceneSurfaceStateRuntime,
      routeSearchSceneInteractionFrostRuntime,
    });
  const routeSearchScenePanelSurfaceRenderRuntime =
    useSearchRootSearchScenePanelSurfaceRenderRuntime({
      backgroundComponent:
        routeSearchSceneSurfacePanelPartsRuntime.routeSearchScenePanelBackgroundComponent,
      overlayComponent:
        routeSearchSceneSurfacePanelPartsRuntime.routeSearchScenePanelOverlayComponent,
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
  const routeSearchSceneMountedChromeSnapshot = React.useMemo<SearchMountedSceneChromeSnapshot>(
    () => ({
      underlayComponent: routeSearchScenePanelSurfaceRenderRuntime.underlayComponent,
      backgroundComponent: routeSearchScenePanelSurfaceRenderRuntime.backgroundComponent ?? null,
      overlayComponent: routeSearchScenePanelSurfaceRenderRuntime.overlayComponent ?? null,
    }),
    [
      routeSearchScenePanelSurfaceRenderRuntime.backgroundComponent,
      routeSearchScenePanelSurfaceRenderRuntime.overlayComponent,
      routeSearchScenePanelSurfaceRenderRuntime.underlayComponent,
    ]
  );
  React.useLayoutEffect(() => {
    publishSearchMountedSceneChromeSnapshot(routeSearchSceneMountedChromeSnapshot);
    return () => {
      publishSearchMountedSceneChromeSnapshot(EMPTY_SEARCH_MOUNTED_SCENE_CHROME_SNAPSHOT);
    };
  }, [routeSearchSceneMountedChromeSnapshot]);
  const routeSearchSceneChromePublication = SEARCH_MOUNTED_SCENE_CHROME_PUBLICATION;
  const routeSearchSceneSecondaryListContent = React.useMemo(
    () => ({
      data: routeSearchSceneRenderRuntime.secondaryRowsForRender,
      listKey: 'results-dishes',
    }),
    [routeSearchSceneRenderRuntime.secondaryRowsForRender]
  );
  const routeSearchSceneListBodyContentSnapshot = React.useMemo<
    Extract<SearchRouteSceneBodyContentSpec, { surfaceKind: 'list' }>
  >(
    () => ({
      surfaceKind: 'list',
      data: routeSearchSceneRenderRuntime.primaryRowsForRender,
      renderItem:
        routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
          .resultsRenderItem,
      keyExtractor:
        routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
          .resultsKeyExtractor,
      estimatedItemSize:
        routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
          .estimatedItemSize,
      ListHeaderComponent:
        routeSearchSceneRenderRuntime.scrollHeaderForRender as React.ReactElement | null,
      ListFooterComponent: routeSearchSceneReadModelRuntime
        .routeSearchSceneResultsReadModelSelectors.listFooterComponent as React.ReactElement | null,
      ListEmptyComponent: null,
      ItemSeparatorComponent:
        routeSearchSceneSheetTransportRuntime.routeSearchScenePanelListTransportRuntime
          .itemSeparatorComponent,
      extraData: undefined,
      secondaryList: routeSearchSceneSecondaryListContent,
      listKey: 'results-restaurants',
      onEndReached:
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsEndReached,
      onEndReachedThreshold: 0,
    }),
    [
      routeSearchSceneReadModelRuntime.routeSearchSceneResultsReadModelSelectors
        .listFooterComponent,
      routeSearchSceneRenderRuntime.primaryRowsForRender,
      routeSearchSceneRenderRuntime.scrollHeaderForRender,
      routeSearchSceneSecondaryListContent,
      routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
        .estimatedItemSize,
      routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
        .resultsKeyExtractor,
      routeSearchSceneSheetTransportRuntime.routeSearchSceneListItemContentRuntime
        .resultsRenderItem,
      routeSearchSceneSheetTransportRuntime.routeSearchScenePanelListTransportRuntime
        .itemSeparatorComponent,
      routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
        .handleResultsEndReached,
    ]
  );
  const routeSearchSceneScrollIndicatorInsets = React.useMemo(
    () => ({
      top: routeSearchSceneRenderRuntime.effectiveFiltersHeaderHeightForRender,
      bottom: RESULTS_BOTTOM_PADDING,
    }),
    [routeSearchSceneRenderRuntime.effectiveFiltersHeaderHeightForRender]
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
        bounces: false,
        alwaysBounceVertical: false,
        overScrollMode: 'never',
        testID: 'search-results-flatlist',
        activeList: routeSearchSceneRenderRuntime.activeList,
        flashListProps:
          routeSearchSceneSheetTransportRuntime.routeSearchScenePanelListTransportRuntime
            .resolvedFlashListProps,
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
        routeSearchSceneSheetTransportRuntime.routeSearchScenePanelListTransportRuntime
          .resolvedFlashListProps,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsListMomentumBegin,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsListMomentumEnd,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsListScrollBegin,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime
          .handleResultsListScrollEnd,
        routeSearchSceneSheetTransportRuntime.routeSearchSceneSheetPlaneRuntime.listRef,
      ]
    );
  const routeSearchSceneSheetPolicyInputs: AppRouteSceneSheetPolicyInputs =
    surfacePolicyController.getSheetPolicyInputs();

  return {
    routeSearchSceneDataRuntime,
    routeSearchSceneReadModelRuntime,
    routeSearchSceneShellSpec,
    routeSearchSceneChromePublication,
    routeSearchSceneListBodyContentSnapshot,
    routeSearchSceneListBodyTransportSnapshot,
    routeSearchSceneSheetPolicyInputs,
  };
};
