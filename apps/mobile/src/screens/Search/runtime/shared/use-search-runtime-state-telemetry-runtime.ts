import type { SearchRuntimeBus } from './search-runtime-bus';
import { useSearchRuntimePresentationTelemetryRuntime } from './use-search-runtime-presentation-telemetry-runtime';
import { useSearchRuntimeRootStateCommitTelemetryRuntime } from './use-search-runtime-root-state-commit-telemetry-runtime';

type UseSearchRuntimeStateTelemetryRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  getActiveShortcutRunNumber: () => number | null;
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
  getActiveShortcutRunNumber,
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
    getActiveShortcutRunNumber,
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

  useSearchRuntimePresentationTelemetryRuntime({
    searchRuntimeBus,
    getActiveShortcutRunNumber,
    emitRuntimeMechanismEvent,
  });
};
