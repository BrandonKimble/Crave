import type { RouteShellSceneInputLane } from '../../../../navigation/runtime/app-route-scene-runtime';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsSurfacePolicyController } from './results-surface-policy-controller';
import type { ResultsSurfaceReadModelPolicyController } from './results-surface-read-model-policy-controller';
import type { SearchResultsExactMatchOwnerController } from '../read-models/results-read-model-exact-match-state';
import type { SearchResultsRetainedResultsController } from './results-retained-read-model-controller';
import type { ResultsSurfacePolicyResults } from './results-surface-policy-controller';
import type { SearchForegroundPolicyDomainController } from './search-foreground-policy-domain-controller';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import type { SearchPrimitiveUiStateController } from './search-primitive-ui-state-controller';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';

export type SearchRouteResultsPolicySheetSink = Pick<
  RouteShellSceneInputLane,
  'publishRouteSceneSheetPolicyInputs'
>;

export type SearchRouteResultsPolicyExactMatchWriterFacet = Pick<
  SearchResultsExactMatchOwnerController,
  | 'getSnapshot'
  | 'getProjection'
  | 'updateResults'
  | 'showMoreExactDishes'
  | 'showMoreExactRestaurants'
  | 'reset'
>;

export type SearchRouteResultsPolicyRetainedResultsWriterFacet = Pick<
  SearchResultsRetainedResultsController<ResultsSurfacePolicyResults>,
  'getRetainedResults' | 'commitRetainedResults' | 'readRetainedReadModel' | 'reset'
>;

export type SearchRouteResultsPolicyReadModelProjectionFacet = Pick<
  ResultsSurfaceReadModelPolicyController,
  'readSnapshot'
>;

export type SearchRouteResultsPolicyReadModelWriterFacets = {
  exactMatch: SearchRouteResultsPolicyExactMatchWriterFacet;
  projection: SearchRouteResultsPolicyReadModelProjectionFacet;
  retainedResults: SearchRouteResultsPolicyRetainedResultsWriterFacet;
};

export type SearchRouteResultsPolicyRuntime = {
  searchRuntimeBus: SearchRuntimeBus;
  sheetSink: SearchRouteResultsPolicySheetSink;
  primitiveUiStateController: SearchPrimitiveUiStateController;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
  foregroundPolicyDomain: SearchForegroundPolicyDomainController;
  foregroundPolicyPublicationAuthority: SearchForegroundPolicyPublicationAuthority;
  surfacePolicyController: ResultsSurfacePolicyController;
  readModelPolicyController: ResultsSurfaceReadModelPolicyController;
  readModelPolicyWriters: SearchRouteResultsPolicyReadModelWriterFacets;
};
