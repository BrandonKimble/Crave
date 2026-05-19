import React from 'react';

import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import { createResultsSurfacePolicyController } from './results-surface-policy-controller';
import { createResultsSurfaceReadModelPolicyController } from './results-surface-read-model-policy-controller';
import { createSearchRuntimeBus, type SearchRuntimeBus } from './search-runtime-bus';
import {
  createResultsPresentationAuthority,
  type ResultsPresentationAuthority,
} from './results-presentation-authority';
import {
  createResultsPresentationSurfaceAuthority,
  type ResultsPresentationSurfaceAuthority,
} from './results-presentation-surface-authority';
import {
  createSearchMapSourceFramePort,
  type SearchMapSourceFramePort,
} from '../map/search-map-source-frame-port';
import { createSearchForegroundPolicyDomainController } from './search-foreground-policy-domain-controller';
import { createSearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import { createSearchPrimitiveUiStateController } from './search-primitive-ui-state-controller';
import { createSearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';
import type { SearchRouteResultsPolicyRuntime } from './search-route-results-policy-domain-contract';

export const useSearchRouteResultsPolicyDomainRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): SearchRouteResultsPolicyRuntime => {
  const runtimeRef = React.useRef<SearchRouteResultsPolicyRuntime | null>(null);

  if (runtimeRef.current == null) {
    const searchRuntimeBus: SearchRuntimeBus = createSearchRuntimeBus();
    const resultsPresentationAuthority: ResultsPresentationAuthority =
      createResultsPresentationAuthority();
    const resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority =
      createResultsPresentationSurfaceAuthority();
    const searchMapSourceFramePort: SearchMapSourceFramePort = createSearchMapSourceFramePort();
    const primitiveUiStateController = createSearchPrimitiveUiStateController();
    const suggestionPanelStateController = createSearchSuggestionPanelStateController();
    const foregroundPolicyDomain = createSearchForegroundPolicyDomainController({
      searchRuntimeBus,
      routeSceneVisibilityPolicyRuntime: routeSceneRuntime.routeSceneVisibilityPolicyRuntime,
      suggestionPanelStateController,
    });
    const foregroundPolicyPublicationAuthority = createSearchForegroundPolicyPublicationAuthority({
      foregroundPolicyDomain,
      routeSceneInputLane: routeSceneRuntime.sceneInputLane,
      routeSceneVisibilityPolicyRuntime: routeSceneRuntime.routeSceneVisibilityPolicyRuntime,
      suggestionPanelStateController,
    });
    const surfacePolicyController = createResultsSurfacePolicyController();
    const readModelPolicyController = createResultsSurfaceReadModelPolicyController();
    runtimeRef.current = {
      searchRuntimeBus,
      resultsPresentationAuthority,
      resultsPresentationSurfaceAuthority,
      searchMapSourceFramePort,
      sheetSink: {
        publishRouteSceneSheetPolicyInputs:
          routeSceneRuntime.sceneInputLane.publishRouteSceneSheetPolicyInputs,
      },
      primitiveUiStateController,
      suggestionPanelStateController:
        foregroundPolicyPublicationAuthority.suggestionPanelStateController,
      foregroundPolicyDomain,
      foregroundPolicyPublicationAuthority,
      surfacePolicyController,
      readModelPolicyController,
      readModelPolicyWriters: {
        exactMatch: readModelPolicyController.getExactMatchController(),
        projection: readModelPolicyController,
        retainedResults: readModelPolicyController.getRetainedResultsController(),
      },
    };
  }

  const runtime = runtimeRef.current;

  React.useEffect(
    () => () => {
      runtime.searchRuntimeBus.reset();
      runtime.resultsPresentationAuthority.reset();
      runtime.resultsPresentationSurfaceAuthority.reset();
      runtime.searchMapSourceFramePort.reset();
      runtime.primitiveUiStateController.reset();
      runtime.surfacePolicyController.reset();
      runtime.readModelPolicyController.reset(null);
    },
    [runtime]
  );

  return runtime;
};
