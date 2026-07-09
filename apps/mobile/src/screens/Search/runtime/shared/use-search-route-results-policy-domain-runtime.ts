import React from 'react';
import { useSystemStatusStore } from '../../../../store/systemStatusStore';
import { retrySearchDesiredResolution } from './search-desired-state-writer';
import { selectIsSearchSessionActive } from './search-desired-tuple-selectors';

import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import { createResultsSurfacePolicyController } from './results-surface-policy-controller';
import { createResultsSurfaceReadModelPolicyController } from './results-surface-read-model-policy-controller';
import { createSearchRuntimeBus, type SearchRuntimeBus } from './search-runtime-bus';
import {
  attachSearchStoreRuntimeStateMirror,
  seedSearchRuntimeBusFromSearchStore,
} from './search-runtime-filter-state-store-bridge';
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
    // R1c: the bus is the single runtime writer for filter/tab state; seed it synchronously
    // from the persisted zustand mirror so first-render reads see the persisted values.
    seedSearchRuntimeBusFromSearchStore(searchRuntimeBus);
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
    // S4e red-team fix: the deleted setIsSearchSessionActive setter was the ONLY trigger
    // of publishCurrent('searchSessionActive'). The domain controller now derives
    // session-active from the tuple, so the republish edge rides the tuple directly:
    // publish when the derived value FLIPS (session enter/exit), never per tuple write.
    // The bus and the authority share the runtime's lifetime — no teardown needed.
    // RECONNECT AUTO-RETRY (industry pattern; replaces hanging in a skeleton): when
    // connectivity returns with the failure level still set, re-assert the desired
    // tuple — the reconciler re-resolves and the failure surfaces drop on their own.
    useSystemStatusStore.subscribe((state, prevState) => {
      if (!prevState.isOffline || state.isOffline) {
        return;
      }
      const busState = searchRuntimeBus.getState();
      if (busState.searchResolutionFailure == null) {
        return;
      }
      if (busState.desiredTuple.queryIdentity.kind === 'idle') {
        // The session was dismissed during the offline pause — nothing to resume.
        return;
      }
      retrySearchDesiredResolution(searchRuntimeBus);
    });
    let lastPublishedSessionActive = selectIsSearchSessionActive(searchRuntimeBus.getState());
    searchRuntimeBus.subscribe(
      () => {
        const nextSessionActive = selectIsSearchSessionActive(searchRuntimeBus.getState());
        if (nextSessionActive === lastPublishedSessionActive) {
          return;
        }
        lastPublishedSessionActive = nextSessionActive;
        foregroundPolicyPublicationAuthority.publishCurrent('searchSessionActive');
      },
      ['desiredTuple'] as const,
      'foreground_policy_session_active_edge'
    );
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

  React.useEffect(() => {
    // R1c: single bus→zustand mirror subscription (the only zustand writer for filter/tab
    // state). Detached BEFORE the bus reset below so the reset-to-defaults never mirrors
    // over the persisted values.
    const detachSearchStoreRuntimeStateMirror = attachSearchStoreRuntimeStateMirror(
      runtime.searchRuntimeBus
    );
    return () => {
      detachSearchStoreRuntimeStateMirror();
      runtime.searchRuntimeBus.reset();
      runtime.resultsPresentationAuthority.reset();
      runtime.resultsPresentationSurfaceAuthority.reset();
      runtime.searchMapSourceFramePort.reset();
      runtime.primitiveUiStateController.reset();
      runtime.surfacePolicyController.reset();
      runtime.readModelPolicyController.reset(null);
    };
  }, [runtime]);

  return runtime;
};
