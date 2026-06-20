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
    const shouldForceListHeaderForInteraction =
      searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState;
    const shouldShowListHeaderForResultsSurface =
      searchSceneSurfacePanelStateRuntime.shouldShowResultsSurface;
    const resultsToggleStripForRenderBase =
      shouldForceListHeaderForInteraction || shouldShowListHeaderForResultsSurface
        ? listHeader
        : null;
    const effectiveFiltersHeaderHeightForRenderLive =
      shouldForceListHeaderForInteraction || shouldShowListHeaderForResultsSurface
        ? effectiveFiltersHeaderHeightBase
        : 0;

    return {
      effectiveFiltersHeaderHeightForRenderLive,
      resultsToggleStripForRenderLive: resultsToggleStripForRenderBase,
    };
  }, [
    effectiveFiltersHeaderHeightBase,
    listHeader,
    searchSceneSurfacePanelStateRuntime.shouldShowInteractionLoadingState,
    searchSceneSurfacePanelStateRuntime.shouldShowResultsSurface,
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
