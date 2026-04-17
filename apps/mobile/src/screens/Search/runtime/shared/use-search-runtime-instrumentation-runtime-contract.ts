import type React from 'react';

import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { useShortcutHarnessObserver } from '../telemetry/shortcut-harness-observer';
import type { PerfNavSwitchOverlay } from '../../../../perf/harness-config';

export type ShortcutHarnessObserverArgs = Parameters<typeof useShortcutHarnessObserver>[0];
export type ShortcutHarnessObserverResult = ReturnType<typeof useShortcutHarnessObserver>;

export type RunOneHandoffCoordinatorLike = {
  getSnapshot: () => {
    operationId: string | null;
    phase: string;
    seq: number;
    page: number | null;
  };
  advancePhase: (phase: string, payload?: Record<string, unknown>) => void;
};

export type SearchRootStateCommitSnapshot = {
  searchMode: 'natural' | 'shortcut' | null;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isAutocompleteSuppressed: boolean;
  rootOverlay: string;
  activeOverlay: string;
  isSearchOverlay: boolean;
  resultsRequestKey: string | null;
  resultsPage: number | null;
  shouldHydrateResultsForRender: boolean;
  resultsPresentation: ReturnType<SearchRuntimeBus['getState']>['resultsPresentation'];
  resultsPresentationTransport: ResultsPresentationTransportState;
  isMapRevealPending: boolean;
};

export type InstrumentationMapQueryBudget = NonNullable<
  ShortcutHarnessObserverArgs['mapQueryBudget']
> & {
  recordRuntimeAttributionDurationMs: (label: string, durationMs: number) => void;
};

export type UseSearchRuntimeInstrumentationRuntimeArgs = Pick<
  ShortcutHarnessObserverArgs,
  | 'getPerfNow'
  | 'roundPerfValue'
  | 'searchSessionController'
  | 'searchMode'
  | 'isSearchLoading'
  | 'isLoadingMore'
  | 'isRunOneHandoffActive'
  | 'resultsRequestKey'
  | 'searchInteractionRef'
  | 'isSearchOverlay'
  | 'isInitialCameraReady'
  | 'runTimeoutMs'
  | 'settleQuietPeriodMs'
  | 'runtimeWorkSchedulerRef'
> & {
  searchRuntimeBus: SearchRuntimeBus;
  mapQueryBudget: InstrumentationMapQueryBudget | null;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinatorLike>;
  runOneCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  isSearchRequestLoadingRef: React.MutableRefObject<boolean>;
  readRuntimeMemoryDiagnostics: () => unknown;
  isSearchSessionActive: boolean;
  isAutocompleteSuppressed: boolean;
  rootOverlay: string;
  activeOverlayKey: string;
  resultsPage: number | null;
};

export type UseSearchRuntimeInstrumentationRuntimeResult = Pick<
  ShortcutHarnessObserverResult,
  'emitRuntimeMechanismEvent'
> & {
  submitShortcutSearchRef: ShortcutHarnessObserverArgs['submitShortcutSearchRef'];
  toggleOpenNowHarnessRef: ShortcutHarnessObserverArgs['toggleOpenNowRef'];
  selectOverlayHarnessRef: React.MutableRefObject<(target: PerfNavSwitchOverlay) => void>;
  handleProfilerRender: React.ProfilerOnRenderCallback;
  shouldLogSearchComputes: boolean;
  logSearchCompute: (label: string, duration: number) => void;
  shouldLogSearchStateChanges: boolean;
  shouldLogResultsViewability: boolean;
  shouldLogMapEventRates: boolean;
  mapEventLogIntervalMs: number;
};

export const areResultsPresentationTransportLifecycleStatesEqual = (
  left: ResultsPresentationTransportState,
  right: ResultsPresentationTransportState
): boolean =>
  left.transactionId === right.transactionId &&
  left.snapshotKind === right.snapshotKind &&
  left.coverState === right.coverState &&
  left.executionStage === right.executionStage;
