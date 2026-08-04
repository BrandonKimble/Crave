import React from 'react';
import {
  isPerfScenarioAttributionActive,
  isPerfScenarioQuietMeasuredLoopActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { useSearchRootSearchSceneSurfacePanelStateRuntime } from './use-search-root-search-scene-surface-panel-state-runtime';

type UseSearchRootSearchSceneSurfaceRenderHeaderSourceRuntimeArgs = {
  listHeader: React.ReactNode;
  effectiveFiltersHeaderHeightBase: number;
  searchSceneSurfacePanelStateRuntime: ReturnType<
    typeof useSearchRootSearchSceneSurfacePanelStateRuntime
  >;
};

export const useSearchRootSearchSceneSurfaceRenderHeaderSourceRuntime = ({
  listHeader,
  effectiveFiltersHeaderHeightBase,
  searchSceneSurfacePanelStateRuntime,
}: UseSearchRootSearchSceneSurfaceRenderHeaderSourceRuntimeArgs) => {
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const lastQuietContractKeyRef = React.useRef<string | null>(null);
  const runtime = React.useMemo(() => {
    // The strip is CHROME, not content (2026-07-06, owner-reported "toggles stopped
    // accepting touch"): the strip renders for the scene's WHOLE life — including
    // initial loading (owner law §3, 2026-07-18: chrome changes immediately; the old
    // initial-load hide existed only to avoid double-rendering with the dead pinned
    // cover's strip-pill holes). The chips read the live desired tuple, so their
    // state is correct before the world lands.
    return {
      effectiveFiltersHeaderHeightForRenderLive: effectiveFiltersHeaderHeightBase,
      resultsToggleStripForRenderLive: listHeader,
    };
  }, [effectiveFiltersHeaderHeightBase, listHeader]);
  React.useEffect(() => {
    if (!isPerfScenarioAttributionActive(activeScenarioConfig)) {
      return;
    }
    // F1319 — INSTRUMENT HONESTY (the F1305 catalogue class).
    //
    // This payload used to report ONE boolean under THREE names — `hasListHeaderInput`,
    // `hasListHeaderForRender` and `hasStableHeaderChromeForRender` were all
    // `resultsToggleStripForRenderLive != null` (the first via `listHeader != null`, which the
    // runtime memo copies through unchanged) — plus two fields that were LITERALS:
    // `stableHeaderChromeLane` was always the same string, and `stableHeaderChromeOwner` was a
    // second spelling of the same boolean. A trace reader diffing those five columns would
    // reasonably believe they were five independent facts about the header, and could
    // "discover" a correlation that is an identity. Three of the five could never disagree,
    // and none of the five could ever show RED on its own.
    //
    // One fact, one column: `hasListHeaderForRender`. The two genuinely distinct fields — the
    // measured height and whether the cover is hiding the chrome — stay.
    const contractPayload = {
      event: 'search_results_header_source_contract',
      effectiveFiltersHeaderHeightBase,
      effectiveFiltersHeaderHeightForRender: runtime.effectiveFiltersHeaderHeightForRenderLive,
      hasListHeaderForRender: runtime.resultsToggleStripForRenderLive != null,
      stableHeaderChromeCoveredByLoadingCover:
        searchSceneSurfacePanelStateRuntime.surfaceMode === 'initial_loading' &&
        runtime.resultsToggleStripForRenderLive != null,
      renderRowCount: null,
      shouldForceListHeaderForInteraction:
        searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState,
      shouldShowResultsSurface: searchSceneSurfacePanelStateRuntime.shouldShowResultsSurface,
      surfaceMode: searchSceneSurfacePanelStateRuntime.surfaceMode,
    };
    if (isPerfScenarioQuietMeasuredLoopActive(activeScenarioConfig)) {
      const quietContractKey = JSON.stringify({
        scenarioRunId: activeScenarioConfig.runId,
        effectiveFiltersHeaderHeightForRender:
          contractPayload.effectiveFiltersHeaderHeightForRender,
        hasListHeaderForRender: contractPayload.hasListHeaderForRender,
        shouldForceListHeaderForInteraction: contractPayload.shouldForceListHeaderForInteraction,
        shouldShowResultsSurface: contractPayload.shouldShowResultsSurface,
        surfaceMode: contractPayload.surfaceMode,
      });
      if (lastQuietContractKeyRef.current === quietContractKey) {
        return;
      }
      lastQuietContractKeyRef.current = quietContractKey;
    } else {
      lastQuietContractKeyRef.current = null;
    }
    logPerfScenarioAttributionEvent('VisualReadiness', activeScenarioConfig, {
      ...contractPayload,
    });
  }, [
    activeScenarioConfig,
    effectiveFiltersHeaderHeightBase,
    listHeader,
    runtime.effectiveFiltersHeaderHeightForRenderLive,
    runtime.resultsToggleStripForRenderLive,
    searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState,
    searchSceneSurfacePanelStateRuntime.shouldShowResultsSurface,
    searchSceneSurfacePanelStateRuntime.surfaceMode,
  ]);
  return runtime;
};
