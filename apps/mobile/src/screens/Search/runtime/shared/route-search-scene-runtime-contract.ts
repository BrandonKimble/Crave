import type { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import type { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';
import type { useSearchResultsPanelCardRenderRuntime } from './use-search-results-panel-card-render-runtime';
import type { useSearchResultsPanelFiltersRuntimeState } from './use-search-results-panel-filters-runtime-state';
import type { useSearchResultsPanelHydrationKeyRuntime } from './use-search-results-panel-hydration-key-runtime';
import type { useSearchResultsPanelHydrationRuntimeState } from './use-search-results-panel-hydration-runtime-state';
import type { useSearchResultsPanelOnDemandNoticeRuntime } from './use-search-results-panel-on-demand-notice-runtime';
import type { useSearchResultsPanelPresentationRuntimeState } from './use-search-results-panel-presentation-runtime-state';
import type { useSearchResultsPanelResultsRuntimeState } from './use-search-results-panel-results-runtime-state';
import type { useSearchResultsPanelRetainedResultsRuntime } from './use-search-results-panel-retained-results-runtime';
import type { useSearchResultsReadModelSelectors } from '../read-models/read-model-selectors';
import type { SearchRootFilterModalControlLane } from './use-search-root-control-plane-runtime-contract';
import type { useSearchRootControlAuthorityRuntime } from './use-search-root-control-authority-runtime';
import type { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';
import type { useSearchRootControlResultsExperienceRuntime } from './use-search-root-control-results-experience-runtime';
import type { RouteSceneSwitchAuthority } from './search-root-route-runtime-contract';
import type { useSearchRootRuntimeVisualAssemblyRuntime } from './use-search-root-runtime-visual-assembly-runtime';
import type { useSearchRootSearchSceneListItemContentRuntime } from './use-search-root-search-scene-list-item-content-runtime';
import type { useSearchRootSearchScenePanelListTransportRuntime } from './use-search-root-search-scene-panel-list-transport-runtime';
import type { useSearchRootSearchSceneFiltersHeaderRuntime } from './use-search-root-search-scene-filters-header-runtime';
import type { useSearchRootSearchSceneHeaderLayoutRuntime } from './use-search-root-search-scene-header-layout-runtime';
import type { useSearchRootSearchSceneChromeFreezeRuntime } from './use-search-root-search-scene-chrome-freeze-runtime';
import type { useSearchRootSearchSceneInteractionLoadingPolicyRuntime } from './use-search-root-search-scene-interaction-loading-policy-runtime';
import type { useSearchRootSearchSceneListHeaderRuntime } from './use-search-root-search-scene-list-header-runtime';
import type { useSearchRootSearchSceneSurfacePanelStateRuntime } from './use-search-root-search-scene-surface-panel-state-runtime';
import type { useSearchRootSearchSceneSheetPlaneRuntime } from './use-search-root-search-scene-sheet-plane-runtime';
import type { useSearchRootRouteSearchSceneRenderRuntime } from './use-search-root-route-search-scene-render-runtime';
import type { SearchRouteResultsPolicyReadModelWriterFacets } from './search-route-results-policy-domain-contract';

export type SearchRootRouteSearchSceneDataRuntimeArgs = {
  sessionAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['sessionAssemblyRuntime'];
  stateAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['stateAssemblyRuntime'];
  overlayFoundationAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  controlAuthorityRuntime: ReturnType<typeof useSearchRootControlAuthorityRuntime>;
  filterModalControlLane: SearchRootFilterModalControlLane;
  readModelPolicyWriters: SearchRouteResultsPolicyReadModelWriterFacets;
};

export type SearchRootRouteSearchSceneReadModelRuntimeArgs = {
  overlayFoundationAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >;
  visualAssemblyRuntime: ReturnType<typeof useSearchRootRuntimeVisualAssemblyRuntime>;
  profileControlRuntime: ReturnType<typeof useSearchRootControlProfileExperienceRuntime>;
  filterModalControlLane: SearchRootFilterModalControlLane;
  readModelPolicyWriters: SearchRouteResultsPolicyReadModelWriterFacets;
};

export type SearchRootRouteSearchSceneResultsSurfaceRuntimeArgs = {
  stateAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['stateAssemblyRuntime'];
  overlayFoundationAssemblyRuntime: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >;
  controlAuthorityRuntime: ReturnType<typeof useSearchRootControlAuthorityRuntime>;
  resultsControlRuntime: ReturnType<typeof useSearchRootControlResultsExperienceRuntime>;
  visualAssemblyRuntime: ReturnType<typeof useSearchRootRuntimeVisualAssemblyRuntime>;
};

export type SearchRootRuntimeRouteSearchSceneDataStateRuntime = {
  /** Failure retry: re-asserts the current desired tuple through the reconciler. */
  routeSearchSceneSearchSheetContentLane: ReturnType<
    typeof useSearchRootControlAuthorityRuntime
  >['presentationAuthorityRuntime']['resultsPresentationControlLane']['resultsPresentationOwner']['shellModel']['searchSheetContentLane'];
  routeSearchSceneHandleCloseResults: ReturnType<
    typeof useSearchRootControlAuthorityRuntime
  >['presentationAuthorityRuntime']['resultsPresentationControlLane']['resultsPresentationOwner']['presentationActions']['handleCloseResults'];
  routeSearchSceneScheduleTabToggleCommit: ReturnType<
    typeof useSearchRootControlAuthorityRuntime
  >['presentationAuthorityRuntime']['resultsPresentationControlLane']['resultsPresentationOwner']['interactionModel']['scheduleTabToggleCommit'];
  routeSearchSceneResultsRuntimeState: ReturnType<typeof useSearchResultsPanelResultsRuntimeState>;
  routeSearchSceneHydrationRuntimeState: ReturnType<
    typeof useSearchResultsPanelHydrationRuntimeState
  >;
  routeSearchScenePresentationRuntimeState: ReturnType<
    typeof useSearchResultsPanelPresentationRuntimeState
  >;
  routeSearchSceneResolvedResultsRuntime: ReturnType<
    typeof useSearchResultsPanelRetainedResultsRuntime
  >;
  routeSearchSceneHydrationKeyRuntime: ReturnType<typeof useSearchResultsPanelHydrationKeyRuntime>;
  routeSearchSceneOnDemandNotice: ReturnType<typeof useSearchResultsPanelOnDemandNoticeRuntime>;
};

export type SearchRootRuntimeRouteSearchSceneHeaderPolicyRuntime = {
  routeSearchSceneFiltersRuntimeState: ReturnType<typeof useSearchResultsPanelFiltersRuntimeState>;
  routeSearchSceneHeaderLayoutRuntime: ReturnType<
    typeof useSearchRootSearchSceneHeaderLayoutRuntime
  >;
  routeSearchSceneFiltersHeaderRuntime: ReturnType<
    typeof useSearchRootSearchSceneFiltersHeaderRuntime
  >;
  routeSearchSceneChromeFreezeRuntime: ReturnType<
    typeof useSearchRootSearchSceneChromeFreezeRuntime
  >;
  routeSearchSceneAllowsInteractionLoadingState: ReturnType<
    typeof useSearchRootSearchSceneInteractionLoadingPolicyRuntime
  >;
};

export type SearchRootRuntimeRouteSearchSceneRuntimeSignalsRuntime = {
  routeSearchSceneShouldLogResultsViewability: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >['rootOverlayFoundationRuntime']['rootInstrumentationRuntime']['shouldLogResultsViewability'];
  routeSearchSceneOnRuntimeMechanismEvent: ReturnType<
    typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
  >['rootOverlayFoundationRuntime']['rootInstrumentationRuntime']['emitRuntimeMechanismEvent'];
  routeSearchSceneMapQueryBudget: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['sessionAssemblyRuntime']['sessionRuntime']['sessionCoreLane']['mapQueryBudget'];
  routeSearchScenePhaseBMaterializerRef: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['sessionAssemblyRuntime']['sessionRuntime']['sessionCoreLane']['phaseBMaterializerRef'];
  routeSearchSceneSearchInteractionRef: ReturnType<
    typeof useSearchRootRuntimeFoundationStageRuntime
  >['stateAssemblyRuntime']['stateFoundationLane']['sessionPrimitivesLane']['primitives']['searchInteractionRef'];
};

export type SearchRootRuntimeRouteSearchSceneDataRuntime =
  SearchRootRuntimeRouteSearchSceneDataStateRuntime &
    SearchRootRuntimeRouteSearchSceneHeaderPolicyRuntime &
    SearchRootRuntimeRouteSearchSceneRuntimeSignalsRuntime;

export type SearchRootRuntimeRouteSearchSceneSelectorResultsRuntime = {
  routeSearchSceneResultsReadModelSelectors: ReturnType<typeof useSearchResultsReadModelSelectors>;
};

export type SearchRootRuntimeRouteSearchSceneReadModelRuntime = {
  routeSearchSceneCardRenderRuntime: ReturnType<typeof useSearchResultsPanelCardRenderRuntime>;
  routeSearchSceneListHeader: ReturnType<typeof useSearchRootSearchSceneListHeaderRuntime>;
  routeSearchSceneResultsReadModelSelectors: ReturnType<typeof useSearchResultsReadModelSelectors>;
};

export type SearchRootRuntimeRouteSearchSceneSurfaceStateRuntime = {
  routeSearchSceneSurfacePanelStateRuntime: ReturnType<
    typeof useSearchRootSearchSceneSurfacePanelStateRuntime
  >;
  routeSearchSceneRenderRuntime: ReturnType<typeof useSearchRootRouteSearchSceneRenderRuntime>;
};

export type SearchRootRuntimeRouteSearchSceneSheetTransportRuntime = {
  routeSearchSceneListItemContentRuntime: ReturnType<
    typeof useSearchRootSearchSceneListItemContentRuntime
  >;
  routeSearchSceneSheetPlaneRuntime: ReturnType<typeof useSearchRootSearchSceneSheetPlaneRuntime>;
  routeSearchScenePanelListTransportRuntime: ReturnType<
    typeof useSearchRootSearchScenePanelListTransportRuntime
  >;
};
