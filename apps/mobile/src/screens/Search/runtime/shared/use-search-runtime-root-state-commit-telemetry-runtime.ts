import React from 'react';

import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchRootStateCommitSnapshot } from './use-search-runtime-instrumentation-runtime-contract';

export const useSearchRuntimeRootStateCommitTelemetryRuntime = ({
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
}: {
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
}): void => {
  void resultsPresentationSurfaceAuthority;
  const rootStateCommitSnapshotRef = React.useRef<SearchRootStateCommitSnapshot | null>(null);
  const latestRootFieldsRef = React.useRef({
    activeOverlayKey,
    isAutocompleteSuppressed,
    isSearchLoading,
    isSearchOverlay,
    isSearchSessionActive,
    resultsPage,
    resultsRequestKey,
    rootOverlay,
    searchMode,
  });
  latestRootFieldsRef.current = {
    activeOverlayKey,
    isAutocompleteSuppressed,
    isSearchLoading,
    isSearchOverlay,
    isSearchSessionActive,
    resultsPage,
    resultsRequestKey,
    rootOverlay,
    searchMode,
  };

  const emitRootStateCommitSnapshot = React.useCallback(() => {
    const activeRunNumber = getActiveScenarioRunNumber();
    if (activeRunNumber == null) {
      rootStateCommitSnapshotRef.current = null;
      return;
    }
    const runtimeState = searchRuntimeBus.getState();
    const presentationSnapshot = resultsPresentationAuthority.getSnapshot();
    const latestRootFields = latestRootFieldsRef.current;
    const snapshot: SearchRootStateCommitSnapshot = {
      searchMode: latestRootFields.searchMode,
      isSearchSessionActive: latestRootFields.isSearchSessionActive,
      isSearchLoading: latestRootFields.isSearchLoading,
      isAutocompleteSuppressed: latestRootFields.isAutocompleteSuppressed,
      rootOverlay: latestRootFields.rootOverlay,
      activeOverlay: latestRootFields.activeOverlayKey,
      isSearchOverlay: latestRootFields.isSearchOverlay,
      resultsRequestKey: latestRootFields.resultsRequestKey,
      resultsPage: latestRootFields.resultsPage,
      shouldHydrateResultsForRender: false,
      resultsPresentation: presentationSnapshot.resultsPresentation,
      resultsPresentationTransport: presentationSnapshot.resultsPresentationTransport,
      isMapRevealPending: presentationSnapshot.resultsPresentation.isPending,
    };
    const previous = rootStateCommitSnapshotRef.current;
    rootStateCommitSnapshotRef.current = snapshot;
    if (previous == null) {
      return;
    }
    const changedKeys: string[] = [];
    (Object.keys(snapshot) as Array<keyof SearchRootStateCommitSnapshot>).forEach((key) => {
      if (snapshot[key] !== previous[key]) {
        changedKeys.push(key as string);
      }
    });
    if (changedKeys.length === 0) {
      return;
    }
    emitRuntimeMechanismEvent('runtime_write_span', {
      domain: 'root_state_commit',
      label: 'search_root_state_commit',
      operationId: runtimeState.searchSurfaceRedrawOperationId,
      phase: runtimeState.searchSurfaceRedrawPhase,
      changedKeys,
      snapshot,
    });
  }, [
    emitRuntimeMechanismEvent,
    getActiveScenarioRunNumber,
    resultsPresentationAuthority,
    searchRuntimeBus,
  ]);

  React.useEffect(() => {
    emitRootStateCommitSnapshot();
  }, [
    activeOverlayKey,
    emitRootStateCommitSnapshot,
    isAutocompleteSuppressed,
    isSearchLoading,
    isSearchOverlay,
    isSearchSessionActive,
    resultsPage,
    resultsRequestKey,
    rootOverlay,
    searchMode,
  ]);

  React.useEffect(() => {
    const unsubscribePresentation = resultsPresentationAuthority.subscribe(
      emitRootStateCommitSnapshot,
      ['resultsPresentation', 'resultsPresentationTransport'],
      'root_state_commit_presentation_telemetry'
    );
    emitRootStateCommitSnapshot();
    return () => {
      unsubscribePresentation();
    };
  }, [emitRootStateCommitSnapshot, resultsPresentationAuthority]);
};
