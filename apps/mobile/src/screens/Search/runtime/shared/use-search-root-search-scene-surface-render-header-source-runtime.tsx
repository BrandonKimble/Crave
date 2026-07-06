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
    // The strip is CHROME, not content (2026-07-06, owner-reported "toggles stopped accepting
    // touch"): an EMPTY commit (e.g. open-now at 3AM legitimately filters every row out) used to
    // land in a surface mode where neither `shouldShowInteractionLoadingState` nor
    // `shouldShowResultsSurface` held, unmounting the strip WITH the rows — trapping the user
    // with no way to untoggle the filter that emptied the results. The strip now renders for the
    // scene's whole life; the only hide is the initial-load skeleton page (which paints its own
    // full-body skeleton where a header would double-render).
    const shouldHideListHeader =
      searchSceneSurfacePanelStateRuntime.shouldHideScrollHeaderForSurface;
    const resultsToggleStripForRenderBase = shouldHideListHeader ? null : listHeader;
    const effectiveFiltersHeaderHeightForRenderLive = shouldHideListHeader
      ? 0
      : effectiveFiltersHeaderHeightBase;

    return {
      effectiveFiltersHeaderHeightForRenderLive,
      resultsToggleStripForRenderLive: resultsToggleStripForRenderBase,
    };
  }, [
    effectiveFiltersHeaderHeightBase,
    listHeader,
    searchSceneSurfacePanelStateRuntime.shouldHideScrollHeaderForSurface,
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
