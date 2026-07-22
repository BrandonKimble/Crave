import type React from 'react';

import type { MapBounds } from '../../../../types';
import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { ViewportBoundsService } from '../viewport/viewport-bounds-service';
import type {
  ResultsPresentationReadModel,
  ResultsPresentationTransportState,
} from './results-presentation-runtime-contract';
import type { SearchSurfaceRedrawPhase } from '../controller/search-surface-redraw-phase';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';

export type SearchSurfaceRedrawCoordinatorLike = {
  getSnapshot: () => {
    operationId: string | null;
    phase: SearchSurfaceRedrawPhase;
    seq: number | null;
    page: number | null;
  };
  advancePhase: (phase: SearchSurfaceRedrawPhase, payload?: Record<string, unknown>) => void;
  subscribe: (
    listener: (snapshot: {
      operationId: string | null;
      phase: SearchSurfaceRedrawPhase;
      seq: number | null;
      page: number | null;
    }) => void
  ) => () => void;
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
  resultsPresentation: ResultsPresentationReadModel;
  resultsPresentationTransport: ResultsPresentationTransportState;
  isMapRevealPending: boolean;
};

export type InstrumentationMapQueryBudget = {
  recordRuntimeAttributionDurationMs: (label: string, durationMs: number) => void;
};

export type SubmitShortcutScenarioCommandInput = {
  targetTab: 'dishes' | 'restaurants';
  label: string;
  preserveSheetState: boolean;
  transitionFromDockedPolls: boolean;
  forceFreshBounds?: boolean;
};

export type SubmitShortcutScenarioCommandRef = React.MutableRefObject<
  (input: SubmitShortcutScenarioCommandInput) => Promise<void>
>;

export type CloseSearchScenarioCommandRef = React.MutableRefObject<() => void>;

export type TabToggleScenarioCommandRef = React.MutableRefObject<
  (next: 'dishes' | 'restaurants') => void
>;

export type UseSearchRuntimeInstrumentationRuntimeArgs = {
  getPerfNow: () => number;
  searchMode: 'natural' | 'shortcut' | null;
  isSearchLoading: boolean;
  resultsRequestKey: string | null;
  searchInteractionRef: React.MutableRefObject<{
    isResultsSheetDragging: boolean;
    isResultsListScrolling: boolean;
    isResultsSheetSettling: boolean;
  }>;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  mapQueryBudget: InstrumentationMapQueryBudget | null;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinatorLike>;
  searchSurfaceRedrawCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  isSearchRequestLoadingRef: React.MutableRefObject<boolean>;
  readRuntimeMemoryDiagnostics: () => unknown;
  isSearchSessionActive: boolean;
  isAutocompleteSuppressed: boolean;
  rootOverlay: string;
  activeOverlayKey: string;
  cameraIntentArbiter: CameraIntentArbiter;
  viewportBoundsService: ViewportBoundsService;
  markMapMovedIfNeeded: (
    bounds: MapBounds,
    options?: { fallbackBaselineBounds?: MapBounds | null }
  ) => boolean;
  scheduleMapIdleEnter: (options?: { releaseGestureGate?: boolean }) => void;
  ensureInitialCameraReady: () => void;
  isSearchOverlay: boolean;
  resultsPage: number | null;
};

export type UseSearchRuntimeInstrumentationRuntimeResult = {
  emitRuntimeMechanismEvent: (event: string, payload?: Record<string, unknown>) => void;
  submitShortcutScenarioCommandRef: SubmitShortcutScenarioCommandRef;
  closeSearchScenarioCommandRef: CloseSearchScenarioCommandRef;
  tabToggleScenarioCommandRef: TabToggleScenarioCommandRef;
  handleProfilerRender: React.ProfilerOnRenderCallback | null;
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
