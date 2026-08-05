import type React from 'react';

import type { MapBounds } from '../../../../types';
import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { ViewportBoundsService } from '../viewport/viewport-bounds-service';
import type {
  ResultsPresentationReadModel,
  ResultsPresentationTransportState,
} from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';

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
  // F1320: `shouldHydrateResultsForRender: boolean` used to be declared here and assigned the
  // LITERAL `false` at every emit. The emitter diffs every key of this snapshot against the
  // previous one to build `changedKeys` — so this field could never appear in that list, and a
  // reader of the trace would reasonably conclude that hydration never changed during the
  // span. A constant inside a changed-keys diff is worse than a missing field: it is a field
  // that actively asserts "this never moved". The real value lives on the hydration runtime
  // (search-results-panel-hydration-runtime-contract) and is read live by the presentation
  // selectors; if this span ever needs it, it must be threaded from there, not re-declared.
  resultsPresentation: ResultsPresentationReadModel;
  resultsPresentationTransport: ResultsPresentationTransportState;
  isMapRevealPending: boolean;
};

export type SubmitShortcutScenarioCommandInput = {
  targetTab: 'dishes' | 'restaurants';
  label: string;
  preserveSheetState: boolean;
  transitionFromDockedScene: boolean;
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
