import React from 'react';

import type { SearchRuntimeBus } from './search-runtime-bus';
import { areResultsPresentationReadModelsEqual } from './results-presentation-runtime-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import {
  areResultsPresentationTransportLifecycleStatesEqual,
  type SearchRootStateCommitSnapshot,
} from './use-search-runtime-instrumentation-runtime-contract';

export const useSearchRuntimeRootStateCommitTelemetryRuntime = ({
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
}: {
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
}): void => {
  const handoffPresentationRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      runOneHandoffOperationId: state.runOneHandoffOperationId,
      runOneHandoffPhase: state.runOneHandoffPhase,
      resultsPresentation: state.resultsPresentation,
      resultsPresentationTransport: state.resultsPresentationTransport,
    }),
    (left, right) =>
      left.runOneHandoffOperationId === right.runOneHandoffOperationId &&
      left.runOneHandoffPhase === right.runOneHandoffPhase &&
      areResultsPresentationReadModelsEqual(left.resultsPresentation, right.resultsPresentation) &&
      areResultsPresentationTransportLifecycleStatesEqual(
        left.resultsPresentationTransport,
        right.resultsPresentationTransport
      ),
    [
      'runOneHandoffOperationId',
      'runOneHandoffPhase',
      'resultsPresentation',
      'resultsPresentationTransport',
    ] as const
  );
  const rootStateCommitRuntimeState = useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      shouldHydrateResultsForRender: state.shouldHydrateResultsForRender,
    }),
    (left, right) => left.shouldHydrateResultsForRender === right.shouldHydrateResultsForRender,
    ['shouldHydrateResultsForRender'] as const
  );

  const rootStateCommitSnapshotRef = React.useRef<SearchRootStateCommitSnapshot | null>(null);

  React.useEffect(() => {
    const activeRunNumber = getActiveShortcutRunNumber();
    if (activeRunNumber == null) {
      rootStateCommitSnapshotRef.current = null;
      return;
    }
    const snapshot: SearchRootStateCommitSnapshot = {
      searchMode,
      isSearchSessionActive,
      isSearchLoading,
      isAutocompleteSuppressed,
      rootOverlay,
      activeOverlay: activeOverlayKey,
      isSearchOverlay,
      resultsRequestKey,
      resultsPage,
      shouldHydrateResultsForRender: rootStateCommitRuntimeState.shouldHydrateResultsForRender,
      resultsPresentation: handoffPresentationRuntimeState.resultsPresentation,
      resultsPresentationTransport: handoffPresentationRuntimeState.resultsPresentationTransport,
      isMapRevealPending: handoffPresentationRuntimeState.resultsPresentation.isPending,
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
      operationId: handoffPresentationRuntimeState.runOneHandoffOperationId,
      phase: handoffPresentationRuntimeState.runOneHandoffPhase,
      changedKeys,
      snapshot,
    });
  }, [
    emitRuntimeMechanismEvent,
    getActiveShortcutRunNumber,
    handoffPresentationRuntimeState.resultsPresentation,
    handoffPresentationRuntimeState.resultsPresentationTransport,
    handoffPresentationRuntimeState.runOneHandoffOperationId,
    handoffPresentationRuntimeState.runOneHandoffPhase,
    isAutocompleteSuppressed,
    activeOverlayKey,
    isSearchLoading,
    isSearchOverlay,
    isSearchSessionActive,
    resultsPage,
    resultsRequestKey,
    rootOverlay,
    rootStateCommitRuntimeState.shouldHydrateResultsForRender,
    searchMode,
  ]);
};
