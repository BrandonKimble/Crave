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
  // Last good filters-header height while results have been on screen. Used to
  // keep the toggle strip mounted + the loading cover BELOW it through a transient
  // collapse during an interaction (toggle) reload — so the cover can't ride up to
  // top:0 over the strip and the strip can't vanish mid-toggle. Fresh INITIAL loads
  // (never had results) are intentionally left to cover the strip and so do not
  // retain; a genuine idle/dismiss clears the cache.
  const retainedFiltersHeaderHeightRef = React.useRef<number | null>(null);
  const runtime = React.useMemo(() => {
    const shouldForceListHeaderForInteraction =
      searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState;
    const shouldShowListHeaderForResultsSurface =
      searchSceneSurfacePanelStateRuntime.shouldShowResultsSurface;
    const isLiveHeaderSource =
      shouldForceListHeaderForInteraction || shouldShowListHeaderForResultsSurface;
    // Interaction-class load (a reload with results already up) — explicitly NOT a
    // fresh initial load, which must keep covering the strip.
    const isInteractionLoad =
      searchSceneSurfacePanelStateRuntime.shouldShowLoadingState &&
      !searchSceneSurfacePanelStateRuntime.shouldShowInitialLoadingState;

    let resultsToggleStripForRenderBase = isLiveHeaderSource ? listHeader : null;
    let effectiveFiltersHeaderHeightForRenderLive = isLiveHeaderSource
      ? effectiveFiltersHeaderHeightBase
      : 0;

    if (isLiveHeaderSource) {
      retainedFiltersHeaderHeightRef.current = effectiveFiltersHeaderHeightBase;
    } else if (isInteractionLoad && retainedFiltersHeaderHeightRef.current != null) {
      // Transient collapse during a toggle reload: hold the strip + cached height.
      resultsToggleStripForRenderBase = listHeader;
      effectiveFiltersHeaderHeightForRenderLive = retainedFiltersHeaderHeightRef.current;
    } else if (!searchSceneSurfacePanelStateRuntime.shouldShowLoadingState) {
      retainedFiltersHeaderHeightRef.current = null;
    }

    return {
      effectiveFiltersHeaderHeightForRenderLive,
      resultsToggleStripForRenderLive: resultsToggleStripForRenderBase,
    };
  }, [
    effectiveFiltersHeaderHeightBase,
    listHeader,
    searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState,
    searchSceneSurfacePanelStateRuntime.shouldShowResultsSurface,
    searchSceneSurfacePanelStateRuntime.shouldShowLoadingState,
    searchSceneSurfacePanelStateRuntime.shouldShowInitialLoadingState,
  ]);
  React.useEffect(() => {
    if (!isPerfScenarioAttributionActive(activeScenarioConfig)) {
      return;
    }
    const contractPayload = {
      event: 'search_results_header_source_contract',
      effectiveFiltersHeaderHeightBase,
      effectiveFiltersHeaderHeightForRender: runtime.effectiveFiltersHeaderHeightForRenderLive,
      hasListHeaderInput: listHeader != null,
      hasListHeaderForRender: runtime.resultsToggleStripForRenderLive != null,
      hasStableHeaderChromeForRender: runtime.resultsToggleStripForRenderLive != null,
      stableHeaderChromeLane: 'mounted_results_list_header',
      stableHeaderChromeOwner:
        runtime.resultsToggleStripForRenderLive == null ? 'none' : 'search_mounted_results_list',
      stableHeaderChromeCoveredByLoadingCover:
        searchSceneSurfacePanelStateRuntime.surfaceMode === 'initial_loading' &&
        runtime.resultsToggleStripForRenderLive != null,
      renderRowCount: null,
      shouldForceListHeaderForInteraction:
        searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState,
      shouldHideScrollHeaderForSurface:
        searchSceneSurfacePanelStateRuntime.shouldHideScrollHeaderForSurface,
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
    searchSceneSurfacePanelStateRuntime.shouldHideScrollHeaderForSurface,
    searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState,
    searchSceneSurfacePanelStateRuntime.shouldShowResultsSurface,
    searchSceneSurfacePanelStateRuntime.surfaceMode,
  ]);
  return runtime;
};
