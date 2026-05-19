import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimeRootStateCommitTelemetryRuntime } from './use-search-runtime-root-state-commit-telemetry-runtime';

type UseSearchRuntimeStateTelemetryRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  getActiveScenarioRunNumber: () => number | null;
  emitRuntimeMechanismEvent: (event: string, payload?: Record<string, unknown>) => void;
  searchMode: 'natural' | 'shortcut' | null;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isAutocompleteSuppressed: boolean;
  rootOverlay: string;
  activeOverlayKey: string;
  isSearchOverlay: boolean;
  resultsRequestKey: string | null;
  resultsPage: number | null;
};

export const useSearchRuntimeStateTelemetryRuntime = ({
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  getActiveScenarioRunNumber,
  emitRuntimeMechanismEvent,
  searchMode,
  isSearchSessionActive,
  isSearchLoading,
  isAutocompleteSuppressed,
  rootOverlay,
  activeOverlayKey,
  isSearchOverlay,
  resultsRequestKey,
  resultsPage,
}: UseSearchRuntimeStateTelemetryRuntimeArgs): void => {
  useSearchRuntimeRootStateCommitTelemetryRuntime({
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    getActiveScenarioRunNumber,
    emitRuntimeMechanismEvent,
    searchMode,
    isSearchSessionActive,
    isSearchLoading,
    isAutocompleteSuppressed,
    rootOverlay,
    activeOverlayKey,
    isSearchOverlay,
    resultsRequestKey,
    resultsPage,
  });

  void searchRuntimeBus;
  void getActiveScenarioRunNumber;
  void emitRuntimeMechanismEvent;
};
