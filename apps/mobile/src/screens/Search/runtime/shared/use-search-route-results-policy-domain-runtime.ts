import React from 'react';
import { announceFailureIfOnline } from '../../../../components/app-modal-store';
import { unwindFailedSearchEnter } from './search-failed-enter-unwind';
import { subscribeToReconnect } from '../../../../store/systemStatusStore';
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
    const { searchRuntimeBus, foregroundPolicyPublicationAuthority } = runtime;
    // R1c: single bus→zustand mirror subscription (the only zustand writer for filter/tab
    // state). Detached BEFORE the bus reset below so the reset-to-defaults never mirrors
    // over the persisted values.
    const detachSearchStoreRuntimeStateMirror =
      attachSearchStoreRuntimeStateMirror(searchRuntimeBus);
    // THE UNIFORM FAILURE MODAL (owner spec, 2026-07-08, revised same day): every
    // ONLINE resolution failure announces through the ONE standard modal surface —
    // identical across every page and transition. Every close path (the OK button,
    // swipe, backdrop) does the SAME thing: return the user to the last state that
    // worked. The modal never auto-retries — retrying is the user's move from the page
    // they came back to. Unwind rule, universal: a failed ENTER (nothing presented —
    // the sheet rose for a search that never landed, from home, search mode, favorites,
    // anywhere) closes the session on dismissal via the exact user back-out
    // (pop-to-captured-origin: page + snap + scroll); a failed rerun over presented
    // results unwinds NOTHING (worlds commit on success — the old results never left).
    // Offline failures never announce — the hang + banner + reconnect auto-retry own
    // that story. Edge-triggered per failure VALUE (object identity — it lives and dies
    // with the bus, unlike a generation cursor, which outlives a bus reset and swallows
    // the next announcement).
    let lastAnnouncedFailure: object | null = null;
    const detachFailureAnnouncer = searchRuntimeBus.subscribe(
      () => {
        const failure = searchRuntimeBus.getState().searchResolutionFailure;
        if (failure == null || failure.offline || failure === lastAnnouncedFailure) {
          return;
        }
        lastAnnouncedFailure = failure;
        // The copyable per-surface pattern: the unwind is self-guarding, the wiring is
        // one line. A future enterable surface adds its own unwindFailedXEnter and
        // this exact call shape.
        announceFailureIfOnline({
          onDismissed: () => unwindFailedSearchEnter(searchRuntimeBus),
        });
      },
      ['searchResolutionFailure'],
      'search_resolution_failure_modal'
    );
    // RECONNECT AUTO-RETRY (industry pattern; replaces hanging in a skeleton): when
    // connectivity returns with the failure level still set, re-assert the desired
    // tuple — the reconciler re-resolves and the failure surfaces drop on their own.
    const detachReconnectRetry = subscribeToReconnect(() => {
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
    // S4e red-team fix: the deleted setIsSearchSessionActive setter was the ONLY trigger
    // of publishCurrent('searchSessionActive'). The domain controller now derives
    // session-active from the tuple, so the republish edge rides the tuple directly:
    // publish when the derived value FLIPS (session enter/exit), never per tuple write.
    let lastPublishedSessionActive = selectIsSearchSessionActive(searchRuntimeBus.getState());
    const detachSessionActiveEdge = searchRuntimeBus.subscribe(
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
    return () => {
      detachFailureAnnouncer();
      detachReconnectRetry();
      detachSessionActiveEdge();
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
