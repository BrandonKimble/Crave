import React from 'react';

import { logger } from '../../../../utils';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { MapBounds } from '../../../../types';
import { shouldLogSearchNavSwitchDiagnosticLogs } from '../../runtime/shared/search-nav-switch-perf-probe';
import { withSearchNavSwitchRuntimeAttribution } from '../../runtime/shared/search-nav-switch-runtime-attribution';
import {
  areSearchMapRenderPresentationStatesEqual,
  deriveSearchMapRenderPresentationPhase,
  deriveSearchMapRenderPresentationRequestKey,
  searchMapRenderController,
  type SearchMapRenderControllerEvent,
  type SearchMapRenderInteractionMode,
  type SearchMapRenderPresentationState,
} from '../../runtime/map/search-map-render-controller';
import {
  type MapMotionPressureController,
  type MotionPressureState,
} from '../../runtime/map/map-motion-pressure';
import { EMPTY_SEARCH_MAP_SOURCE_STORE } from '../../runtime/map/search-map-source-store';
import type {
  SearchMapCommittedSourceDeltaJournal,
  SearchMapSourceStore,
  SearchMapSourceStoreDelta,
  SearchMapSourceTransportFeature,
} from '../../runtime/map/search-map-source-store';
import type {
  SearchMapSourceFramePort,
  SearchMapSourceFrameSnapshot,
} from '../../runtime/map/search-map-source-frame-port';
import type { ResultsPresentationAuthority } from '../../runtime/shared/results-presentation-authority';
import type { SearchRuntimeMapPresentationPhase } from '../../runtime/shared/search-runtime-bus';

type SearchMapNativeRenderOwnerStatusArgs = {
  mapComponentInstanceId: string;
  resolvedMapTag: number | null;
  isMapStyleReady: boolean;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  selectedRestaurantId: string | null;
  pinSourceId: string;
  pinInteractionSourceId: string;
  dotSourceId: string;
  dotInteractionSourceId: string;
  labelSourceId: string;
  labelInteractionSourceId: string;
  labelCollisionSourceId: string;
  sourceFramePort?: SearchMapSourceFramePort | null;
  labelObservationEnabled: boolean;
  labelObservationConfig: SearchMapLabelObservationConfig;
  commitVisibleLabelInteractionVisibility: boolean;
  onExecutionBatchMountedHidden?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    readyAtMs: number;
  }) => void;
  onMarkerEnterStarted?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    pinCount?: number;
    dotCount?: number;
    labelCount?: number;
    startedAtMs: number;
  }) => void;
  onMarkerEnterSettled?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    pinCount?: number;
    dotCount?: number;
    labelCount?: number;
    settledAtMs: number;
  }) => void;
  onMarkerExitStarted?: (payload: {
    requestKey: string;
    pinCount?: number;
    dotCount?: number;
    labelCount?: number;
    startedAtMs: number;
  }) => void;
  onMarkerExitSettled?: (payload: {
    requestKey: string;
    pinCount?: number;
    dotCount?: number;
    labelCount?: number;
    settledAtMs: number;
  }) => void;
  onRecoveredAfterStyleReload?: (payload: { recoveredAtMs: number }) => void;
  onViewportChanged?: (payload: {
    center: [number, number];
    zoom: number;
    bounds: {
      northEast: { lat: number; lng: number };
      southWest: { lat: number; lng: number };
    };
    isGestureActive: boolean;
    isMoving: boolean;
  }) => void;
  onLabelObservationUpdated?: (payload: {
    visibleLabelFeatureIds: string[];
    layerRenderedFeatureCount: number;
    effectiveRenderedFeatureCount: number;
    stickyChanged: boolean;
  }) => void;
};

type SearchMapLabelObservationConfig = {
  refreshMsIdle: number;
  refreshMsMoving: number;
  enableStickyLabelCandidates: boolean;
  stickyLockStableMsMoving: number;
  stickyLockStableMsIdle: number;
  stickyUnlockMissingMsMoving: number;
  stickyUnlockMissingMsIdle: number;
  stickyUnlockMissingStreakMoving: number;
  labelResetRequestKey: string | null;
};

type SearchMapNativeLabelObservationApplyStatus = 'skipped' | 'requested' | 'applied' | 'failed';

type SearchMapNativeRenderOwnerStatusResult = {
  instanceId: string;
  isAttached: boolean;
  isNativeAvailable: boolean;
  attachState: 'idle' | 'attaching' | 'attached' | 'failed';
  ownerEpoch: number | null;
  isNativeOwnerReady: boolean;
  nativeFatalErrorMessage: string | null;
  reportNativeFatalError: (message: string) => void;
};

type SearchMapNativeRenderOwnerSyncArgs = {
  mapMotionPressureController: MapMotionPressureController;
  instanceId: string;
  isAttached: boolean;
  ownerEpoch: number | null;
  isRenderFrameSyncReady: boolean;
  isNativeAvailable: boolean;
  pins: SearchMapSourceStore;
  pinInteractions: SearchMapSourceStore;
  dots: SearchMapSourceStore;
  dotInteractions: SearchMapSourceStore;
  labels: SearchMapSourceStore;
  labelInteractions: SearchMapSourceStore;
  labelCollisions: SearchMapSourceStore;
  sourceFramePort?: SearchMapSourceFramePort | null;
  viewportState: SearchMapRenderViewportState;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  selectedRestaurantId: string | null;
  highlightedMarkerKey: string | null;
  highlightedMarkerKeys: readonly string[];
  interactionMode: SearchMapRenderInteractionMode;
  onSyncError?: (message: string) => void;
};

type SearchMapNativeRenderOwnerArgs = SearchMapNativeRenderOwnerStatusArgs &
  Omit<
    SearchMapNativeRenderOwnerSyncArgs,
    'instanceId' | 'isAttached' | 'ownerEpoch' | 'isNativeAvailable'
  >;
type SearchMapNativeRenderOwnerControllerEvent = SearchMapRenderControllerEvent;

const INSTANCE_ID_PREFIX = 'search-map-render-owner';
const NATIVE_READY_TIMEOUT_MS = 4000;
const MAP_HANDLE_ATTACH_RETRY_DELAY_MS = 250;
const MAX_RECOVERABLE_MAP_HANDLE_ATTACH_RETRIES = 2;

const isRecoverableMapHandleAttachError = (message: string): boolean =>
  message.includes('Mapbox MapView not found for react tag') ||
  message.includes('Map view not found for react tag') ||
  message.includes('Mapbox MapView not resolved for react tag') ||
  message.includes('ready Mapbox handle not resolved for react tag') ||
  message.includes('missing resolved Mapbox handle for react tag');

type NativeCommitBurstState = {
  startedAtMs: number;
  pendingEventCount: number;
  ackEventCount: number;
  maxPendingSources: number;
  maxPendingEntries: number;
  maxBlockedRevealWaitMs: number | null;
  maxBlockedSettleWaitMs: number | null;
  lastMessageAtMs: number;
  pendingEventCountBySourceId: Record<string, number>;
  ackEventCountBySourceId: Record<string, number>;
  maxPendingVisualEntriesBySourceId: Record<string, number>;
};

const createNativeCommitBurstState = (): NativeCommitBurstState => ({
  startedAtMs: 0,
  pendingEventCount: 0,
  ackEventCount: 0,
  maxPendingSources: 0,
  maxPendingEntries: 0,
  maxBlockedRevealWaitMs: null,
  maxBlockedSettleWaitMs: null,
  lastMessageAtMs: 0,
  pendingEventCountBySourceId: {},
  ackEventCountBySourceId: {},
  maxPendingVisualEntriesBySourceId: {},
});

const SEARCH_MAP_RENDER_SOURCE_IDS: SearchMapRenderSourceId[] = [
  'pins',
  'pinInteractions',
  'dots',
  'dotInteractions',
  'labels',
  'labelInteractions',
  'labelCollisions',
];

const logNativePresentationReadinessEvent = (payload: Record<string, unknown>): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }
  logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, payload);
};

const resolveNativeRenderOwnerPerfNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const roundNativeRenderOwnerPerfMs = (value: number): number => Number(value.toFixed(1));

const logNativeRenderOwnerWorkSpan = ({
  owner,
  path,
  startedAtMs,
  details,
}: {
  owner: string;
  path: string;
  startedAtMs: number;
  details?: Record<string, unknown>;
}): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }
  logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
    event: 'scenario_work_span',
    owner,
    path,
    durationMs: roundNativeRenderOwnerPerfMs(
      Math.max(0, resolveNativeRenderOwnerPerfNow() - startedAtMs)
    ),
    ...(details ?? null),
  });
};

const shouldMeasureNativeRenderOwnerEventDelivery = (
  event: SearchMapNativeRenderOwnerControllerEvent
): boolean => {
  switch (event.type) {
    case 'render_frame_synced':
    case 'presentation_enter_armed':
    case 'presentation_execution_batch_mounted_hidden':
    case 'presentation_enter_started':
    case 'presentation_enter_settled':
    case 'presentation_exit_started':
    case 'presentation_visual_sources_collision_released':
    case 'presentation_exit_settled':
    case 'label_observation_updated':
      return true;
    default:
      return false;
  }
};

const withNativeRenderOwnerEventDeliverySpan = <T>(
  listenerLabel: string,
  event: SearchMapNativeRenderOwnerControllerEvent,
  callback: () => T
): T => {
  if (!shouldMeasureNativeRenderOwnerEventDelivery(event)) {
    return callback();
  }
  const startedAtMs = resolveNativeRenderOwnerPerfNow();
  try {
    return callback();
  } finally {
    logNativeRenderOwnerWorkSpan({
      owner: 'search_map_native_event_delivery',
      path: `${listenerLabel}:${event.type}`,
      startedAtMs,
      details: {
        nativeEventType: event.type,
        listenerLabel,
        instanceId: event.instanceId,
        frameGenerationId: 'frameGenerationId' in event ? event.frameGenerationId : null,
        executionBatchId: 'executionBatchId' in event ? event.executionBatchId : null,
        requestKey: 'requestKey' in event ? event.requestKey : null,
      },
    });
  }
};

const withNativePresentationEventInnerSpan = <T>(
  event: SearchMapNativeRenderOwnerControllerEvent,
  path: string,
  callback: () => T
): T => {
  const startedAtMs = resolveNativeRenderOwnerPerfNow();
  try {
    return callback();
  } finally {
    logNativeRenderOwnerWorkSpan({
      owner: 'search_map_native_presentation_event_inner',
      path: `${event.type}:${path}`,
      startedAtMs,
      details: {
        nativeEventType: event.type,
        instanceId: event.instanceId,
        frameGenerationId: 'frameGenerationId' in event ? event.frameGenerationId : null,
        executionBatchId: 'executionBatchId' in event ? event.executionBatchId : null,
        requestKey: 'requestKey' in event ? event.requestKey : null,
      },
    });
  }
};

type SearchMapNativeRenderOwnerEventHandler = (
  event: SearchMapNativeRenderOwnerControllerEvent
) => void;

type SearchMapNativeRenderOwnerDispatcherEntry = {
  statusHandler: SearchMapNativeRenderOwnerEventHandler | null;
  transportHandler: SearchMapNativeRenderOwnerEventHandler | null;
};

const shouldDispatchNativeRenderOwnerEventToTransport = (
  event: SearchMapNativeRenderOwnerControllerEvent
): boolean =>
  event.type === 'render_owner_invalidated' ||
  event.type === 'render_owner_recovered_after_style_reload' ||
  event.type === 'presentation_visual_sources_collision_released' ||
  event.type === 'presentation_exit_settled' ||
  event.type === 'render_frame_synced';

const searchMapNativeRenderOwnerEventDispatcher = (() => {
  const entriesByInstanceId = new Map<string, SearchMapNativeRenderOwnerDispatcherEntry>();
  let removeNativeListener: (() => void) | null = null;

  const detachNativeListener = () => {
    removeNativeListener?.();
    removeNativeListener = null;
  };

  const ensureNativeListener = () => {
    if (removeNativeListener != null) {
      return;
    }
    removeNativeListener =
      searchMapRenderController.addListener((event) =>
        withNativeRenderOwnerEventDeliverySpan('dispatcher', event, () => {
          if (event.type === 'error' && event.instanceId === '__native_diag__') {
            Array.from(entriesByInstanceId.values()).forEach((entry) => {
              entry.statusHandler?.(event);
            });
            return;
          }
          const entry = entriesByInstanceId.get(event.instanceId);
          if (entry == null) {
            return;
          }
          if (entry.statusHandler != null) {
            withNativePresentationEventInnerSpan(event, 'status_handler', () => {
              entry.statusHandler?.(event);
            });
          }
          if (shouldDispatchNativeRenderOwnerEventToTransport(event)) {
            if (entry.transportHandler != null) {
              withNativePresentationEventInnerSpan(event, 'transport_handler', () => {
                entry.transportHandler?.(event);
              });
            }
          }
        })
      ) ?? null;
  };

  const ensureEntry = (instanceId: string): SearchMapNativeRenderOwnerDispatcherEntry => {
    const currentEntry = entriesByInstanceId.get(instanceId);
    if (currentEntry != null) {
      return currentEntry;
    }
    const nextEntry: SearchMapNativeRenderOwnerDispatcherEntry = {
      statusHandler: null,
      transportHandler: null,
    };
    entriesByInstanceId.set(instanceId, nextEntry);
    return nextEntry;
  };

  const cleanupEntry = (instanceId: string) => {
    const entry = entriesByInstanceId.get(instanceId);
    if (entry != null && entry.statusHandler == null && entry.transportHandler == null) {
      entriesByInstanceId.delete(instanceId);
    }
    if (entriesByInstanceId.size === 0) {
      detachNativeListener();
    }
  };

  return {
    setStatusHandler(
      instanceId: string,
      handler: SearchMapNativeRenderOwnerEventHandler
    ): () => void {
      const entry = ensureEntry(instanceId);
      entry.statusHandler = handler;
      ensureNativeListener();
      return () => {
        if (entry.statusHandler === handler) {
          entry.statusHandler = null;
        }
        cleanupEntry(instanceId);
      };
    },
    setTransportHandler(
      instanceId: string,
      handler: SearchMapNativeRenderOwnerEventHandler
    ): () => void {
      const entry = ensureEntry(instanceId);
      entry.transportHandler = handler;
      ensureNativeListener();
      return () => {
        if (entry.transportHandler === handler) {
          entry.transportHandler = null;
        }
        cleanupEntry(instanceId);
      };
    },
  };
})();

type SearchMapRenderSourceId =
  | 'pins'
  | 'pinInteractions'
  | 'dots'
  | 'dotInteractions'
  | 'labels'
  | 'labelInteractions'
  | 'labelCollisions';

type SearchMapRenderSnapshot = {
  pins: SearchMapSourceStore;
  pinInteractions: SearchMapSourceStore;
  dots: SearchMapSourceStore;
  dotInteractions: SearchMapSourceStore;
  labels: SearchMapSourceStore;
  labelInteractions: SearchMapSourceStore;
  labelCollisions: SearchMapSourceStore;
};

const EMPTY_SEARCH_MAP_RENDER_SNAPSHOT: SearchMapRenderSnapshot = {
  pins: EMPTY_SEARCH_MAP_SOURCE_STORE,
  pinInteractions: EMPTY_SEARCH_MAP_SOURCE_STORE,
  dots: EMPTY_SEARCH_MAP_SOURCE_STORE,
  dotInteractions: EMPTY_SEARCH_MAP_SOURCE_STORE,
  labels: EMPTY_SEARCH_MAP_SOURCE_STORE,
  labelInteractions: EMPTY_SEARCH_MAP_SOURCE_STORE,
  labelCollisions: EMPTY_SEARCH_MAP_SOURCE_STORE,
};

const PRESENTATION_ONLY_SEARCH_MAP_RENDER_SOURCE_TRANSPORT: SearchMapRenderSourceTransportPayload =
  Object.freeze({
    effectiveChangedSourceIds: [],
  });

type SearchMapRenderVisualSourceCounts = {
  pinCount: number;
  dotCount: number;
  labelCount: number;
};

const searchMapNativeFrameVisualSourceCountsByKey = new Map<
  string,
  SearchMapRenderVisualSourceCounts
>();

const buildSearchMapNativeFrameVisualSourceCountKeys = ({
  instanceId,
  frameGenerationId,
  executionBatchId,
}: {
  instanceId: string;
  frameGenerationId: string | null | undefined;
  executionBatchId: string | null | undefined;
}): string[] => {
  const keys: string[] = [];
  if (frameGenerationId != null) {
    keys.push(`${instanceId}|frame:${frameGenerationId}`);
  }
  if (executionBatchId != null) {
    keys.push(`${instanceId}|batch:${executionBatchId}`);
  }
  return keys;
};

const rememberSearchMapNativeFrameVisualSourceCounts = ({
  instanceId,
  frameGenerationId,
  executionBatchId,
  counts,
}: {
  instanceId: string;
  frameGenerationId: string;
  executionBatchId: string | null;
  counts: SearchMapRenderVisualSourceCounts;
}): void => {
  buildSearchMapNativeFrameVisualSourceCountKeys({
    instanceId,
    frameGenerationId,
    executionBatchId,
  }).forEach((key) => {
    searchMapNativeFrameVisualSourceCountsByKey.set(key, counts);
  });
};

const forgetSearchMapNativeFrameVisualSourceCounts = (instanceId: string): void => {
  const keyPrefix = `${instanceId}|`;
  Array.from(searchMapNativeFrameVisualSourceCountsByKey.keys()).forEach((key) => {
    if (key.startsWith(keyPrefix)) {
      searchMapNativeFrameVisualSourceCountsByKey.delete(key);
    }
  });
};

const getSearchMapNativeFrameVisualSourceCounts = ({
  instanceId,
  frameGenerationId,
  executionBatchId,
}: {
  instanceId: string;
  frameGenerationId: string | null | undefined;
  executionBatchId: string | null | undefined;
}): SearchMapRenderVisualSourceCounts | null => {
  for (const key of buildSearchMapNativeFrameVisualSourceCountKeys({
    instanceId,
    frameGenerationId,
    executionBatchId,
  })) {
    const counts = searchMapNativeFrameVisualSourceCountsByKey.get(key);
    if (counts) {
      return counts;
    }
  }
  return null;
};

const isSearchMapRenderVisualSnapshotEmpty = (snapshot: SearchMapRenderSnapshot): boolean =>
  snapshot.pins.idsInOrder.length === 0 &&
  snapshot.dots.idsInOrder.length === 0 &&
  snapshot.labels.idsInOrder.length === 0;

const hasResidentSearchMapRenderVisualSnapshot = (
  snapshot: SearchMapRenderSnapshot | null | undefined
): boolean => snapshot != null && !isSearchMapRenderVisualSnapshotEmpty(snapshot);

const deriveSearchMapNativePresentationState = ({
  resultsPresentationAuthority,
  selectedRestaurantId,
  sourceFramePort,
}: {
  resultsPresentationAuthority: ResultsPresentationAuthority;
  selectedRestaurantId: string | null;
  sourceFramePort?: SearchMapSourceFramePort | null;
}): SearchMapRenderPresentationState => {
  const resultsPresentationTransport =
    resultsPresentationAuthority.getSnapshot().resultsPresentationTransport;
  const sourceFrameSnapshot = sourceFramePort?.getSnapshot() ?? null;
  return {
    transactionId: resultsPresentationTransport.transactionId,
    snapshotKind: resultsPresentationTransport.snapshotKind,
    executionBatch: resultsPresentationTransport.executionBatch,
    executionStage: resultsPresentationTransport.executionStage,
    startToken: resultsPresentationTransport.startToken,
    coverState: resultsPresentationTransport.coverState,
    selectedRestaurantId,
    allowEmptyEnter:
      (sourceFrameSnapshot?.pinSourceStore.idsInOrder.length ?? 0) === 0 &&
      (sourceFrameSnapshot?.dotSourceStore.idsInOrder.length ?? 0) === 0,
  };
};

type SearchMapRenderSourceRevisionState = Record<SearchMapRenderSourceId, string>;

type SearchMapRenderSourceDelta = {
  sourceId: SearchMapRenderSourceId;
  mode: SearchMapSourceStoreDelta['mode'];
  nextFeatureIdsInOrder: string[];
  removeIds: string[];
  dirtyGroupIds?: string[];
  orderChangedGroupIds?: string[];
  removedGroupIds?: string[];
  upsertFeatures?: SearchMapSourceTransportFeature[];
};

type SearchMapRenderSourceTransportPayload = {
  effectiveChangedSourceIds: SearchMapRenderSourceId[];
  sourceDeltas?: SearchMapRenderSourceDelta[];
};

type SearchMapNativeSourceFrameMatchState = {
  requestKey: string | null;
  visualCycleKey: string | null;
  readinessKey: string | null;
  shortcutCoverageRequestKey: string | null;
  markersRenderKey: string | null;
};

const buildSearchMapNativeSourceFrameMatchState = ({
  requestKey,
  sourceFrameSnapshot,
}: {
  requestKey: string | null;
  sourceFrameSnapshot: SearchMapSourceFrameSnapshot | null;
}): SearchMapNativeSourceFrameMatchState => ({
  requestKey:
    requestKey ??
    sourceFrameSnapshot?.visualCycleKey ??
    sourceFrameSnapshot?.mapSearchSurfaceResultsSourcesReadyKey ??
    null,
  visualCycleKey: sourceFrameSnapshot?.visualCycleKey ?? null,
  readinessKey: sourceFrameSnapshot?.mapSearchSurfaceResultsSourcesReadyKey ?? null,
  shortcutCoverageRequestKey: sourceFrameSnapshot?.shortcutCoverageRequestKey ?? null,
  markersRenderKey: sourceFrameSnapshot?.markersRenderKey ?? null,
});

const serializeSearchMapNativeSourceFrameMatchState = (
  state: SearchMapNativeSourceFrameMatchState
): string =>
  [
    state.requestKey ?? 'request:none',
    state.visualCycleKey ?? 'visual:none',
    state.readinessKey ?? 'ready:none',
    state.shortcutCoverageRequestKey ?? 'coverage:none',
    state.markersRenderKey ?? 'markers:none',
  ].join('|');

const serializeSearchMapNativeSourceDataKey = (
  state: SearchMapNativeSourceFrameMatchState
): string =>
  [
    state.shortcutCoverageRequestKey ?? 'coverage:none',
    state.markersRenderKey ?? 'markers:none',
  ].join('|');

const areSearchMapRenderSourceRevisionStatesEqual = (
  left: SearchMapRenderSourceRevisionState | null | undefined,
  right: SearchMapRenderSourceRevisionState | null | undefined
): boolean =>
  left != null &&
  right != null &&
  left.pins === right.pins &&
  left.pinInteractions === right.pinInteractions &&
  left.dots === right.dots &&
  left.dotInteractions === right.dotInteractions &&
  left.labels === right.labels &&
  left.labelInteractions === right.labelInteractions &&
  left.labelCollisions === right.labelCollisions;

type SearchMapRenderViewportState = {
  bounds: MapBounds | null;
  isGestureActive: boolean;
  isMoving: boolean;
};

type SearchMapRenderFrame = {
  sourceRevisions: SearchMapRenderSourceRevisionState;
  viewport: SearchMapRenderViewportState;
  presentation: SearchMapRenderPresentationState;
  highlightedMarkerKey: string | null;
  highlightedMarkerKeys: readonly string[];
  interactionMode: SearchMapRenderInteractionMode;
};

const EMPTY_STRING_ARRAY: readonly string[] = [];

const areStringArraysEqual = (left: readonly string[], right: readonly string[]): boolean => {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
};

const resolveSearchMapSourceStore = (
  sourceStore: SearchMapSourceStore | null | undefined
): SearchMapSourceStore => sourceStore ?? EMPTY_SEARCH_MAP_SOURCE_STORE;

const isNativeVisiblePresentationPhase = (
  presentationPhase: SearchRuntimeMapPresentationPhase
): boolean =>
  presentationPhase === 'entering' ||
  presentationPhase === 'exit_preroll' ||
  presentationPhase === 'exiting';

const resolveNativeRenderOwnerFrameAdmission = ({
  hasPreviousDesiredFrame,
  snapshotChanged,
  viewportBoundsChanged,
  gestureStateChanged,
  movingStateChanged,
  presentationChanged,
  controlStateChanged,
  presentationPhase,
  coverState,
  previousPresentationPhase,
  isSameExecutionBatchAsPreviousDesiredFrame,
  isMoving,
  isGestureActive,
  nowMs,
  pressureState,
}: {
  hasPreviousDesiredFrame: boolean;
  snapshotChanged: boolean;
  viewportBoundsChanged: boolean;
  gestureStateChanged: boolean;
  movingStateChanged: boolean;
  presentationChanged: boolean;
  controlStateChanged: boolean;
  presentationPhase: SearchRuntimeMapPresentationPhase;
  coverState: SearchMapRenderPresentationState['coverState'];
  previousPresentationPhase: SearchRuntimeMapPresentationPhase | null;
  isSameExecutionBatchAsPreviousDesiredFrame: boolean;
  isMoving: boolean;
  isGestureActive: boolean;
  nowMs: number;
  pressureState: MotionPressureState;
}): {
  decision:
    | 'emit_frame'
    | 'suppress_redundant_hidden_covered_frame'
    | 'suppress_same_execution_batch_viewport_presentation_frame'
    | 'suppress_viewport_only_frame'
    | 'suppress_transaction_presentation_only_frame';
  normalWorkEffect: 'none' | 'admit' | 'coalesce';
} => {
  const hasMaterialViewportStateChange =
    viewportBoundsChanged || gestureStateChanged || movingStateChanged;
  const hasProtectedPresentationTransaction =
    pressureState.activePresentationTransaction != null &&
    (pressureState.activePresentationTransaction.phase === 'committing' ||
      pressureState.activePresentationTransaction.phase === 'executing');
  const shouldAdmitFairnessWork =
    pressureState.coalescedNormalWorkCount >= 8 ||
    (pressureState.lastNormalWorkAdmittedAtMs > 0 &&
      nowMs - pressureState.lastNormalWorkAdmittedAtMs >= 240);

  if (
    hasMaterialViewportStateChange &&
    !snapshotChanged &&
    !presentationChanged &&
    !controlStateChanged &&
    (hasProtectedPresentationTransaction ||
      (pressureState.nativeSyncInFlight &&
        pressureState.phase !== 'settled' &&
        !shouldAdmitFairnessWork))
  ) {
    return {
      decision: 'suppress_viewport_only_frame',
      normalWorkEffect: 'coalesce',
    };
  }

  const shouldProtectVisiblePresentationFrame =
    presentationChanged && isNativeVisiblePresentationPhase(presentationPhase);

  if (
    hasPreviousDesiredFrame &&
    presentationPhase === 'covered' &&
    coverState === 'initial_loading' &&
    previousPresentationPhase === 'idle' &&
    presentationChanged &&
    !snapshotChanged &&
    !viewportBoundsChanged &&
    !gestureStateChanged &&
    !movingStateChanged &&
    !controlStateChanged
  ) {
    return {
      decision: 'suppress_redundant_hidden_covered_frame',
      normalWorkEffect: 'none',
    };
  }

  if (
    hasPreviousDesiredFrame &&
    !snapshotChanged &&
    !controlStateChanged &&
    isSameExecutionBatchAsPreviousDesiredFrame &&
    !isMoving &&
    !isGestureActive &&
    !gestureStateChanged &&
    !movingStateChanged &&
    !shouldProtectVisiblePresentationFrame &&
    (presentationChanged || viewportBoundsChanged)
  ) {
    return {
      decision: 'suppress_same_execution_batch_viewport_presentation_frame',
      normalWorkEffect: 'none',
    };
  }

  if (
    hasPreviousDesiredFrame &&
    !snapshotChanged &&
    !presentationChanged &&
    !controlStateChanged &&
    (viewportBoundsChanged || gestureStateChanged || movingStateChanged)
  ) {
    return {
      decision: 'suppress_viewport_only_frame',
      normalWorkEffect: 'none',
    };
  }

  if (
    hasPreviousDesiredFrame &&
    !snapshotChanged &&
    !viewportBoundsChanged &&
    !gestureStateChanged &&
    !movingStateChanged &&
    !controlStateChanged &&
    presentationChanged &&
    isSameExecutionBatchAsPreviousDesiredFrame &&
    !shouldProtectVisiblePresentationFrame
  ) {
    return {
      decision: 'suppress_transaction_presentation_only_frame',
      normalWorkEffect: 'none',
    };
  }

  if (hasMaterialViewportStateChange && !snapshotChanged && !presentationChanged) {
    return {
      decision: 'emit_frame',
      normalWorkEffect: 'admit',
    };
  }
  return {
    decision: 'emit_frame',
    normalWorkEffect: 'none',
  };
};

type MapRenderFrameTransportQueueFrame = {
  ownerEpoch: number;
  frameGenerationId: string;
};

type NativeRenderOwnerResidentSourceState = {
  ownerEpoch: number | null;
  hasRestorableVisualSource: boolean;
  frameGenerationId: string | null;
  executionBatchId: string | null;
  sourceFrameKey: string | null;
  sourceDataKey: string | null;
  sourceRevisions: SearchMapRenderSourceRevisionState | null;
};

type MapRenderFrameTransportQueueState<TFrame extends MapRenderFrameTransportQueueFrame> = {
  inFlightFrame: TFrame | null;
  pendingFrame: TFrame | null;
  syncInFlight: boolean;
};

type NativeRenderOwnerTransportState<TFrame extends MapRenderFrameTransportQueueFrame> = {
  lastDesiredFrame: SearchMapRenderFrame | null;
  lastDesiredFrameGenerationId: string | null;
  lastAppliedFrame: TFrame | null;
  acknowledgedSourceRevisions: SearchMapRenderSourceRevisionState | null;
  queueState: MapRenderFrameTransportQueueState<TFrame>;
  frameGenerationSeq: number;
  executionBatchSeq: number;
  lastDesiredExecutionBatchId: string | null;
  residentSource: NativeRenderOwnerResidentSourceState;
};

const createNativeRenderOwnerTransportState = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>(): NativeRenderOwnerTransportState<TFrame> => ({
  lastDesiredFrame: null,
  lastDesiredFrameGenerationId: null,
  lastAppliedFrame: null,
  acknowledgedSourceRevisions: null,
  queueState: {
    inFlightFrame: null,
    pendingFrame: null,
    syncInFlight: false,
  },
  frameGenerationSeq: 0,
  executionBatchSeq: 0,
  lastDesiredExecutionBatchId: null,
  residentSource: {
    ownerEpoch: null,
    hasRestorableVisualSource: false,
    frameGenerationId: null,
    executionBatchId: null,
    sourceFrameKey: null,
    sourceDataKey: null,
    sourceRevisions: null,
  },
});

const clearNativeRenderOwnerResidentSourceState = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>(
  state: NativeRenderOwnerTransportState<TFrame>
): void => {
  state.residentSource = {
    ownerEpoch: null,
    hasRestorableVisualSource: false,
    frameGenerationId: null,
    executionBatchId: null,
    sourceFrameKey: null,
    sourceDataKey: null,
    sourceRevisions: null,
  };
};

const markNativeRenderOwnerVisualSourcesNotResident = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>(
  state: NativeRenderOwnerTransportState<TFrame>
): void => {
  state.lastAppliedFrame = null;
  state.acknowledgedSourceRevisions = null;
  clearNativeRenderOwnerResidentSourceState(state);
};

const resetNativeRenderOwnerTransportState = <TFrame extends MapRenderFrameTransportQueueFrame>({
  state,
  resetDesiredExecutionBatchId = false,
}: {
  state: NativeRenderOwnerTransportState<TFrame>;
  resetDesiredExecutionBatchId?: boolean;
}): void => {
  state.lastDesiredFrame = null;
  state.lastDesiredFrameGenerationId = null;
  markNativeRenderOwnerVisualSourcesNotResident(state);
  state.queueState.inFlightFrame = null;
  state.queueState.pendingFrame = null;
  state.queueState.syncInFlight = false;
  if (resetDesiredExecutionBatchId) {
    state.lastDesiredExecutionBatchId = null;
  }
};

const queueLatestNativeRenderOwnerFrameForTransport = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>(
  transportState: NativeRenderOwnerTransportState<TFrame>,
  nextFrame: TFrame
): void => {
  transportState.queueState.pendingFrame = nextFrame;
};

const takeNextNativeRenderOwnerFrameForTransport = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>({
  transportState,
  ownerEpoch,
}: {
  transportState: NativeRenderOwnerTransportState<TFrame>;
  ownerEpoch: number;
}): TFrame | null => {
  const { queueState, lastAppliedFrame } = transportState;
  if (queueState.syncInFlight || queueState.pendingFrame == null) {
    return null;
  }

  const pendingFrame =
    queueState.pendingFrame.ownerEpoch === ownerEpoch
      ? queueState.pendingFrame
      : {
          ...queueState.pendingFrame,
          ownerEpoch,
        };
  queueState.pendingFrame = pendingFrame;

  if (lastAppliedFrame?.frameGenerationId === pendingFrame.frameGenerationId) {
    queueState.pendingFrame = null;
    return null;
  }

  queueState.pendingFrame = null;
  queueState.inFlightFrame = pendingFrame;
  queueState.syncInFlight = true;
  return pendingFrame;
};

const acknowledgeNativeRenderOwnerFrameTransportSync = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>(
  transportState: NativeRenderOwnerTransportState<TFrame>,
  frameGenerationId: string
): void => {
  if (transportState.queueState.inFlightFrame?.frameGenerationId !== frameGenerationId) {
    return;
  }
  transportState.queueState.inFlightFrame = null;
  transportState.queueState.syncInFlight = false;
};

const markNativeRenderOwnerFrameTransportFailed = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>(
  transportState: NativeRenderOwnerTransportState<TFrame>,
  frameGenerationId: string
): void => {
  if (transportState.queueState.inFlightFrame?.frameGenerationId === frameGenerationId) {
    transportState.queueState.inFlightFrame = null;
  }
  transportState.queueState.syncInFlight = false;
};

const requeueDroppedNativeRenderOwnerFrameForTransport = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>({
  transportState,
  droppedFrame,
  ownerEpoch,
}: {
  transportState: NativeRenderOwnerTransportState<TFrame>;
  droppedFrame: TFrame;
  ownerEpoch: number;
}): void => {
  markNativeRenderOwnerFrameTransportFailed(transportState, droppedFrame.frameGenerationId);
  transportState.queueState.pendingFrame ??= {
    ...droppedFrame,
    ownerEpoch,
  };
};

const retargetNativeRenderOwnerTransportOwnerEpoch = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>(
  transportState: NativeRenderOwnerTransportState<TFrame>,
  ownerEpoch: number
): void => {
  const { queueState } = transportState;
  if (queueState.pendingFrame == null && queueState.inFlightFrame != null) {
    queueState.pendingFrame = {
      ...queueState.inFlightFrame,
      ownerEpoch,
    };
  }
  if (queueState.pendingFrame != null) {
    queueState.pendingFrame = {
      ...queueState.pendingFrame,
      ownerEpoch,
    };
  }
  queueState.inFlightFrame = null;
  queueState.syncInFlight = false;
};

const findNativeRenderOwnerFrameTransportMatch = <TFrame extends MapRenderFrameTransportQueueFrame>(
  transportState: NativeRenderOwnerTransportState<TFrame>,
  frameGenerationId: string
): TFrame | null => {
  if (transportState.queueState.inFlightFrame?.frameGenerationId === frameGenerationId) {
    return transportState.queueState.inFlightFrame;
  }
  if (transportState.queueState.pendingFrame?.frameGenerationId === frameGenerationId) {
    return transportState.queueState.pendingFrame;
  }
  return null;
};

const getSnapshotSource = (
  snapshot: SearchMapRenderSnapshot,
  sourceId: SearchMapRenderSourceId
): SearchMapSourceStore => {
  switch (sourceId) {
    case 'pins':
      return resolveSearchMapSourceStore(snapshot.pins);
    case 'pinInteractions':
      return resolveSearchMapSourceStore(snapshot.pinInteractions);
    case 'dots':
      return resolveSearchMapSourceStore(snapshot.dots);
    case 'dotInteractions':
      return resolveSearchMapSourceStore(snapshot.dotInteractions);
    case 'labels':
      return resolveSearchMapSourceStore(snapshot.labels);
    case 'labelInteractions':
      return resolveSearchMapSourceStore(snapshot.labelInteractions);
    case 'labelCollisions':
      return resolveSearchMapSourceStore(snapshot.labelCollisions);
  }
};

const getSearchMapRenderSourceRevisions = (
  snapshot: SearchMapRenderSnapshot
): SearchMapRenderSourceRevisionState => ({
  pins: resolveSearchMapSourceStore(snapshot.pins).sourceRevision,
  pinInteractions: resolveSearchMapSourceStore(snapshot.pinInteractions).sourceRevision,
  dots: resolveSearchMapSourceStore(snapshot.dots).sourceRevision,
  dotInteractions: resolveSearchMapSourceStore(snapshot.dotInteractions).sourceRevision,
  labels: resolveSearchMapSourceStore(snapshot.labels).sourceRevision,
  labelInteractions: resolveSearchMapSourceStore(snapshot.labelInteractions).sourceRevision,
  labelCollisions: resolveSearchMapSourceStore(snapshot.labelCollisions).sourceRevision,
});

const toRenderSourceDelta = (
  sourceId: SearchMapRenderSourceId,
  delta: SearchMapSourceStoreDelta
): SearchMapRenderSourceDelta => ({
  sourceId,
  mode: delta.mode,
  nextFeatureIdsInOrder: delta.nextFeatureIdsInOrder,
  removeIds: delta.removeIds,
  ...(delta.dirtyGroupIds ? { dirtyGroupIds: delta.dirtyGroupIds } : {}),
  ...(delta.orderChangedGroupIds ? { orderChangedGroupIds: delta.orderChangedGroupIds } : {}),
  ...(delta.removedGroupIds ? { removedGroupIds: delta.removedGroupIds } : {}),
  ...(delta.upsertFeatures ? { upsertFeatures: delta.upsertFeatures } : {}),
});

const buildReplayJournalDelta = (
  baseSourceRevision: string,
  nextSourceStore: SearchMapSourceStore
): SearchMapSourceStoreDelta | null => {
  const journals = nextSourceStore.committedDeltaJournalHistory;
  const startIndex = journals.findIndex(
    (journal) => journal.baseSourceRevision === baseSourceRevision
  );
  if (startIndex === -1) {
    return null;
  }
  const replayJournals = journals.slice(startIndex);
  if (replayJournals.length === 0) {
    return null;
  }
  const removeIds = new Set<string>();
  const dirtyGroupIds = new Set<string>();
  const orderChangedGroupIds = new Set<string>();
  const removedGroupIds = new Set<string>();
  const upsertFeatureIds = new Set<string>();

  for (const journal of replayJournals) {
    for (const featureId of journal.delta.removeIds) {
      removeIds.add(featureId);
    }
    for (const groupId of journal.delta.dirtyGroupIds ?? []) {
      dirtyGroupIds.add(groupId);
    }
    for (const groupId of journal.delta.orderChangedGroupIds ?? []) {
      orderChangedGroupIds.add(groupId);
    }
    for (const groupId of journal.delta.removedGroupIds ?? []) {
      removedGroupIds.add(groupId);
    }
    for (const feature of journal.delta.upsertFeatures ?? []) {
      upsertFeatureIds.add(feature.id);
      dirtyGroupIds.add(feature.markerKey);
    }
  }

  const upsertFeatures = [...upsertFeatureIds].flatMap((featureId) => {
    const transportFeature = nextSourceStore.transportFeatureById.get(featureId);
    return transportFeature ? [transportFeature] : [];
  });

  return {
    mode: 'patch',
    nextFeatureIdsInOrder: [...nextSourceStore.idsInOrder],
    removeIds: [...removeIds],
    ...(dirtyGroupIds.size > 0 ? { dirtyGroupIds: [...dirtyGroupIds] } : {}),
    ...(orderChangedGroupIds.size > 0 ? { orderChangedGroupIds: [...orderChangedGroupIds] } : {}),
    ...(removedGroupIds.size > 0 ? { removedGroupIds: [...removedGroupIds] } : {}),
    ...(upsertFeatures.length > 0 ? { upsertFeatures } : {}),
  };
};

const buildSourceDelta = (
  sourceId: SearchMapRenderSourceId,
  acknowledgedSourceRevision: string | null,
  nextSourceStore: SearchMapSourceStore
): SearchMapRenderSourceDelta | null => {
  if (acknowledgedSourceRevision === nextSourceStore.sourceRevision) {
    return null;
  }
  const committedDeltaJournal: SearchMapCommittedSourceDeltaJournal | null =
    nextSourceStore.committedDeltaJournal;
  const delta =
    acknowledgedSourceRevision == null
      ? nextSourceStore.buildReplaceDelta()
      : committedDeltaJournal?.baseSourceRevision === acknowledgedSourceRevision
        ? committedDeltaJournal.delta
        : (buildReplayJournalDelta(acknowledgedSourceRevision, nextSourceStore) ??
          nextSourceStore.buildReplaceDelta());
  return delta ? toRenderSourceDelta(sourceId, delta) : null;
};

const buildSearchMapRenderSourceTransport = ({
  previousSourceRevisions,
  nextSnapshot,
  changedSourceIds,
}: {
  previousSourceRevisions: SearchMapRenderSourceRevisionState | null;
  nextSnapshot: SearchMapRenderSnapshot;
  changedSourceIds: SearchMapRenderSourceId[];
}): SearchMapRenderSourceTransportPayload => {
  const sourceDeltas: SearchMapRenderSourceDelta[] = [];
  const effectiveChangedSourceIds: SearchMapRenderSourceId[] = [];

  for (const sourceId of changedSourceIds) {
    const nextCollection = getSnapshotSource(nextSnapshot, sourceId);
    const delta = buildSourceDelta(
      sourceId,
      previousSourceRevisions?.[sourceId] ?? null,
      nextCollection
    );
    if (!delta) {
      continue;
    }
    sourceDeltas.push(delta);
    effectiveChangedSourceIds.push(sourceId);
  }

  return {
    effectiveChangedSourceIds,
    ...(sourceDeltas.length > 0 ? { sourceDeltas } : {}),
  };
};

const summarizeSourceCounts = (
  sourceCounts: Record<string, number>
): Array<{ sourceId: string; count: number }> =>
  Object.entries(sourceCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([sourceId, count]) => ({ sourceId, count }));

const deriveNativeDiagnosticMessageState = (message: string) => {
  const pendingVisualCommitsMatch = message.match(/pendingVisualCommits=([^ ]+)/);
  const blockedRevealWaitMsMatch = message.match(/blockedRevealWaitMs=([^ ]+)/);
  const blockedSettleWaitMsMatch = message.match(/blockedSettleWaitMs=([^ ]+)/);
  const sourceIdMatch = message.match(/sourceId=([^ ]+)/);
  const summary = pendingVisualCommitsMatch?.[1] ?? 'none';
  const entries = summary === 'none' ? [] : summary.split(',').filter(Boolean);
  const pendingVisualEntriesBySourceId = entries.reduce<Record<string, number>>((acc, entry) => {
    const [sourceId, rawCount] = entry.split('=');
    const count = Number.parseInt(rawCount ?? '0', 10);
    if (!sourceId) {
      return acc;
    }
    acc[sourceId] = Number.isFinite(count) ? count : 0;
    return acc;
  }, {});
  const eventKind = message.startsWith('source_commit_pending')
    ? 'pending'
    : message.startsWith('source_commit_ack')
      ? 'ack'
      : 'other';
  const sourceId = sourceIdMatch?.[1]?.trim();
  return {
    eventKind,
    sourceId: sourceId && sourceId.length > 0 ? sourceId : null,
    pendingSources: entries.length,
    pendingEntries: entries.reduce((sum, entry) => {
      const count = Number.parseInt(entry.split('=').pop() ?? '0', 10);
      return sum + (Number.isFinite(count) ? count : 0);
    }, 0),
    pendingVisualEntriesBySourceId,
    blockedRevealWaitMs:
      blockedRevealWaitMsMatch?.[1] != null && blockedRevealWaitMsMatch[1] !== 'nil'
        ? Number.parseInt(blockedRevealWaitMsMatch[1], 10)
        : null,
    blockedSettleWaitMs:
      blockedSettleWaitMsMatch?.[1] != null && blockedSettleWaitMsMatch[1] !== 'nil'
        ? Number.parseInt(blockedSettleWaitMsMatch[1], 10)
        : null,
    shouldLogTransitionDiagnostics:
      message.startsWith('frame_final_write_mismatch') ||
      message.startsWith('frame_begin') ||
      message.startsWith('reveal_apply_result') ||
      message.startsWith('reveal_generation_ready') ||
      message.startsWith('execution_batch_mounted_hidden') ||
      message.startsWith('enter_armed') ||
      message.startsWith('enter_mount_not_elected') ||
      message.startsWith('enter_mount_blocked_source_not_ready') ||
      message.startsWith('enter_mount_blocked_label_placement') ||
      message.startsWith('enter_mount_blocked_empty') ||
      message.startsWith('enter_armed_blocked_source_not_ready') ||
      message.startsWith('enter_armed_blocked_label_placement') ||
      message.startsWith('enter_started') ||
      message.startsWith('enter_settled') ||
      message.startsWith('presentation_transition') ||
      message.startsWith('frame_snapshot_bypass') ||
      message.startsWith('dismiss_visual_lifecycle_probe') ||
      message.startsWith('lod_transition_admission_probe') ||
      message.startsWith('live_pin_transition_started') ||
      message.startsWith('live_dot_transition_started') ||
      message.startsWith('label_observation_commit_probe') ||
      message.startsWith('label_observation_query_probe') ||
      message.startsWith('label_observation_refresh_probe') ||
      message.startsWith('press_target_probe'),
  };
};

const derivePresentationDiagnosticsState = (
  presentationState: SearchMapRenderPresentationState
) => ({
  laneKind:
    presentationState.snapshotKind == null
      ? null
      : presentationState.snapshotKind === 'results_exit'
        ? 'dismiss'
        : 'reveal',
  batchPhase: deriveSearchMapRenderPresentationStatusState(presentationState).batchPhase,
});

const deriveSearchMapRenderPresentationStatusState = (
  presentationState: SearchMapRenderPresentationState
): {
  batchPhase: SearchRuntimeMapPresentationPhase;
  isPresentationActive: boolean;
} => {
  const batchPhase = deriveSearchMapRenderPresentationPhase(presentationState);
  return {
    batchPhase,
    isPresentationActive: batchPhase !== 'idle' && batchPhase !== 'live',
  };
};

const deriveTransportDiagnosticsState = (presentationState: SearchMapRenderPresentationState) => ({
  requestKey: deriveSearchMapRenderPresentationRequestKey(presentationState),
  batchPhase: deriveSearchMapRenderPresentationStatusState(presentationState).batchPhase,
});

const deriveSourceTransportDiagnostics = ({
  isMoving,
  sourceTransport,
}: {
  isMoving: boolean;
  sourceTransport: SearchMapRenderSourceTransportPayload;
}) => {
  const sourceDeltaSummary = (sourceTransport.sourceDeltas ?? []).map((delta) => ({
    sourceId: delta.sourceId,
    mode: delta.mode,
    nextCount: delta.nextFeatureIdsInOrder.length,
    removeCount: delta.removeIds.length,
    upsertCount: delta.upsertFeatures?.length ?? 0,
  }));
  return {
    shouldLogSummary:
      isMoving &&
      sourceTransport.effectiveChangedSourceIds.length > 0 &&
      sourceDeltaSummary.some(
        (delta) =>
          delta.mode === 'replace' ||
          delta.nextCount >= 80 ||
          delta.removeCount >= 20 ||
          delta.upsertCount >= 20
      ),
    sourceDeltaSummary,
  };
};

const summarizeSourceTransportForBridgeSlice = (
  sourceTransport: SearchMapRenderSourceTransportPayload
) => {
  let replaceSourceCount = 0;
  let patchSourceCount = 0;
  let removeFeatureCount = 0;
  let upsertFeatureCount = 0;
  let nextFeatureCount = 0;
  (sourceTransport.sourceDeltas ?? []).forEach((delta) => {
    if (delta.mode === 'replace') {
      replaceSourceCount += 1;
    } else {
      patchSourceCount += 1;
    }
    removeFeatureCount += delta.removeIds.length;
    upsertFeatureCount += delta.upsertFeatures?.length ?? 0;
    nextFeatureCount += delta.nextFeatureIdsInOrder.length;
  });
  return {
    effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
    sourceDeltaCount: sourceTransport.sourceDeltas?.length ?? 0,
    replaceSourceCount,
    patchSourceCount,
    removeFeatureCount,
    upsertFeatureCount,
    nextFeatureCount,
  };
};

const deriveFrameChangeState = ({
  previousFrame,
  nextFrame,
}: {
  previousFrame: SearchMapRenderFrame | null;
  nextFrame: SearchMapRenderFrame;
}) => ({
  viewportBoundsChanged:
    previousFrame?.viewport.bounds?.northEast.lat !== nextFrame.viewport.bounds?.northEast.lat ||
    previousFrame?.viewport.bounds?.northEast.lng !== nextFrame.viewport.bounds?.northEast.lng ||
    previousFrame?.viewport.bounds?.southWest.lat !== nextFrame.viewport.bounds?.southWest.lat ||
    previousFrame?.viewport.bounds?.southWest.lng !== nextFrame.viewport.bounds?.southWest.lng,
  gestureStateChanged:
    previousFrame?.viewport.isGestureActive !== nextFrame.viewport.isGestureActive,
  movingStateChanged: previousFrame?.viewport.isMoving !== nextFrame.viewport.isMoving,
  presentationChanged: !areSearchMapRenderPresentationStatesEqual(
    previousFrame?.presentation ?? nextFrame.presentation,
    nextFrame.presentation
  ),
  controlStateChanged:
    previousFrame?.highlightedMarkerKey !== nextFrame.highlightedMarkerKey ||
    !areStringArraysEqual(
      previousFrame?.highlightedMarkerKeys ?? EMPTY_STRING_ARRAY,
      nextFrame.highlightedMarkerKeys
    ) ||
    previousFrame?.interactionMode !== nextFrame.interactionMode,
});

const deriveOwnerReadyStatePreservation = ({
  eventType,
  wasAttached,
  hadSyncedInitialFrame,
  previousOwnerEpoch,
  nextOwnerEpoch,
  isPresentationActive,
}: {
  eventType: 'attached' | 'invalidated';
  wasAttached: boolean;
  hadSyncedInitialFrame: boolean;
  previousOwnerEpoch: number | null;
  nextOwnerEpoch: number;
  isPresentationActive: boolean;
}): boolean => {
  if (!wasAttached || !hadSyncedInitialFrame) {
    return false;
  }
  if (eventType === 'invalidated') {
    return isPresentationActive;
  }
  return previousOwnerEpoch === nextOwnerEpoch || isPresentationActive;
};

const derivePresentationSyncState = ({
  presentationState,
  previousPresentationState,
}: {
  presentationState: SearchMapRenderPresentationState;
  previousPresentationState: SearchMapRenderPresentationState | null;
}) => {
  const currentRequestKey = deriveSearchMapRenderPresentationRequestKey(presentationState);
  const previousRequestKey =
    previousPresentationState == null
      ? null
      : deriveSearchMapRenderPresentationRequestKey(previousPresentationState);

  return {
    currentRequestKey,
    previousRequestKey,
    shouldForceReplaceForNewRequest:
      currentRequestKey != null && currentRequestKey !== previousRequestKey,
    isSameExecutionBatchAsPreviousState:
      currentRequestKey != null &&
      presentationState.executionBatch != null &&
      previousPresentationState != null &&
      previousRequestKey === currentRequestKey &&
      previousPresentationState.executionBatch?.batchId ===
        presentationState.executionBatch.batchId,
  };
};

const deriveExecutionBatchId = ({
  presentationState,
  presentationSyncState,
  lastDesiredExecutionBatchId,
  snapshotChanged,
  allocateExecutionBatchId,
}: {
  presentationState: SearchMapRenderPresentationState;
  presentationSyncState: ReturnType<typeof derivePresentationSyncState>;
  lastDesiredExecutionBatchId: string | null;
  snapshotChanged: boolean;
  allocateExecutionBatchId: () => string;
}): string => {
  const presentationBatchId =
    presentationSyncState.currentRequestKey != null
      ? (presentationState.executionBatch?.batchId ?? null)
      : null;
  if (presentationBatchId != null) {
    return presentationBatchId;
  }
  if (presentationSyncState.shouldForceReplaceForNewRequest) {
    return allocateExecutionBatchId();
  }
  if (presentationSyncState.currentRequestKey != null) {
    return lastDesiredExecutionBatchId ?? allocateExecutionBatchId();
  }
  if (!snapshotChanged && lastDesiredExecutionBatchId != null) {
    return lastDesiredExecutionBatchId;
  }
  return allocateExecutionBatchId();
};

const deriveMotionPressurePresentationTransaction = (
  presentationState: SearchMapRenderPresentationState
) => {
  if (
    presentationState.transactionId == null ||
    presentationState.snapshotKind == null ||
    presentationState.executionStage === 'idle' ||
    presentationState.executionStage === 'settled'
  ) {
    return null;
  }
  const presentationPhase = deriveSearchMapRenderPresentationPhase(presentationState);
  return {
    phase:
      presentationPhase === 'covered'
        ? ('preparing' as const)
        : presentationPhase === 'enter_requested' || presentationPhase === 'exit_preroll'
          ? ('committing' as const)
          : ('executing' as const),
  };
};

const acknowledgeSnapshotSourceRevisions = (
  snapshot: SearchMapRenderSnapshot,
  sourceRevisions: SearchMapRenderSourceRevisionState
) => {
  snapshot.pins.acknowledgeTransportRevision(sourceRevisions.pins);
  snapshot.pinInteractions.acknowledgeTransportRevision(sourceRevisions.pinInteractions);
  snapshot.dots.acknowledgeTransportRevision(sourceRevisions.dots);
  snapshot.dotInteractions.acknowledgeTransportRevision(sourceRevisions.dotInteractions);
  snapshot.labels.acknowledgeTransportRevision(sourceRevisions.labels);
  snapshot.labelInteractions.acknowledgeTransportRevision(sourceRevisions.labelInteractions);
  snapshot.labelCollisions.acknowledgeTransportRevision(sourceRevisions.labelCollisions);
};

const buildLabelObservationConfigKey = ({
  activeTransactionKey,
  allowFallback,
  commitInteractionVisibility,
  config,
  instanceId,
  observationEnabled,
  ownerEpoch,
}: {
  activeTransactionKey: string | null;
  allowFallback: boolean;
  commitInteractionVisibility: boolean;
  config: SearchMapLabelObservationConfig;
  instanceId: string;
  observationEnabled: boolean;
  ownerEpoch: number | null;
}): string =>
  [
    instanceId,
    `epoch:${ownerEpoch ?? 'null'}`,
    `transaction:${activeTransactionKey ?? 'null'}`,
    `enabled:${observationEnabled ? 1 : 0}`,
    `fallback:${allowFallback ? 1 : 0}`,
    `commit:${commitInteractionVisibility ? 1 : 0}`,
    `idle:${config.refreshMsIdle}`,
    `moving:${config.refreshMsMoving}`,
  ].join('|');

const useSearchMapNativeRenderOwnerStatus = ({
  mapComponentInstanceId,
  resolvedMapTag,
  isMapStyleReady,
  resultsPresentationAuthority,
  selectedRestaurantId,
  pinSourceId,
  pinInteractionSourceId,
  dotSourceId,
  dotInteractionSourceId,
  labelSourceId,
  labelInteractionSourceId,
  labelCollisionSourceId,
  sourceFramePort = null,
  labelObservationEnabled,
  labelObservationConfig,
  commitVisibleLabelInteractionVisibility,
  onExecutionBatchMountedHidden,
  onMarkerEnterStarted,
  onMarkerEnterSettled,
  onMarkerExitStarted,
  onMarkerExitSettled,
  onRecoveredAfterStyleReload,
  onViewportChanged,
  onLabelObservationUpdated,
}: SearchMapNativeRenderOwnerStatusArgs): SearchMapNativeRenderOwnerStatusResult => {
  const instanceIdRef = React.useRef<string | null>(null);
  const [isAttached, setIsAttached] = React.useState(false);
  const [attachState, setAttachState] = React.useState<
    'idle' | 'attaching' | 'attached' | 'failed'
  >('idle');
  const [attachRetryNonce, setAttachRetryNonce] = React.useState(0);
  const [ownerEpoch, setOwnerEpoch] = React.useState<number | null>(null);
  const [hasSyncedInitialFrame, setHasSyncedInitialFrame] = React.useState(false);
  const [nativeFatalErrorMessage, setNativeFatalErrorMessage] = React.useState<string | null>(null);
  const isAttachedStateRef = React.useRef(isAttached);
  const ownerEpochStateRef = React.useRef(ownerEpoch);
  const hasSyncedInitialFrameRef = React.useRef(hasSyncedInitialFrame);
  const lastCommandedMarkerEnterKeyRef = React.useRef<string | null>(null);
  const isPresentationActiveRef = React.useRef(
    deriveSearchMapRenderPresentationStatusState(
      deriveSearchMapNativePresentationState({
        resultsPresentationAuthority,
        selectedRestaurantId,
        sourceFramePort,
      })
    ).isPresentationActive
  );
  const nativeCommitBurstRef = React.useRef<NativeCommitBurstState>(createNativeCommitBurstState());
  const lastSubmittedLabelObservationConfigKeyRef = React.useRef<string | null>(null);
  const activeLabelObservationTransactionKeyRef = React.useRef<string | null>(null);
  const sourceFramePortRef = React.useRef(sourceFramePort);
  const selectedRestaurantIdRef = React.useRef(selectedRestaurantId);
  if (instanceIdRef.current == null) {
    instanceIdRef.current = `${INSTANCE_ID_PREFIX}:${Math.random().toString(36).slice(2)}`;
  }
  const instanceId = instanceIdRef.current;
  const isNativeAvailable = searchMapRenderController.isAvailable();

  React.useEffect(() => {
    setAttachRetryNonce(0);
  }, [
    dotInteractionSourceId,
    dotSourceId,
    isMapStyleReady,
    isNativeAvailable,
    labelCollisionSourceId,
    labelInteractionSourceId,
    labelSourceId,
    mapComponentInstanceId,
    pinInteractionSourceId,
    pinSourceId,
    resolvedMapTag,
  ]);

  React.useEffect(() => {
    sourceFramePortRef.current = sourceFramePort;
  }, [sourceFramePort]);

  React.useEffect(() => {
    selectedRestaurantIdRef.current = selectedRestaurantId;
  }, [selectedRestaurantId]);

  React.useEffect(() => {
    const updatePresentationActiveRef = () => {
      const nextPresentationState = deriveSearchMapNativePresentationState({
        resultsPresentationAuthority,
        selectedRestaurantId: selectedRestaurantIdRef.current,
        sourceFramePort: sourceFramePortRef.current,
      });
      isPresentationActiveRef.current =
        deriveSearchMapRenderPresentationStatusState(nextPresentationState).isPresentationActive;
    };
    updatePresentationActiveRef();
    return resultsPresentationAuthority.subscribe(
      updatePresentationActiveRef,
      ['resultsPresentationTransport'] as const,
      'search_map_native_render_owner_status_presentation'
    );
  }, [resultsPresentationAuthority]);

  React.useEffect(() => {
    isAttachedStateRef.current = isAttached;
    ownerEpochStateRef.current = ownerEpoch;
    hasSyncedInitialFrameRef.current = hasSyncedInitialFrame;
  }, [hasSyncedInitialFrame, isAttached, ownerEpoch]);

  const flushNativeCommitBurst: (reason: string, reset: boolean) => void = React.useCallback(
    (reason: string, reset: boolean) => {
      const burst = nativeCommitBurstRef.current;
      if (burst.startedAtMs <= 0 || burst.pendingEventCount + burst.ackEventCount <= 0) {
        if (reset) {
          nativeCommitBurstRef.current = createNativeCommitBurstState();
        }
        return;
      }
      const nowMs = Date.now();
      if (shouldLogSearchNavSwitchDiagnosticLogs()) {
        logger.debug('[MAP-CHURN-DIAG] native:commitBurst', {
          instanceId,
          reason,
          ts: nowMs,
          windowMs: nowMs - burst.startedAtMs,
          idleMs: burst.lastMessageAtMs > 0 ? nowMs - burst.lastMessageAtMs : 0,
          pendingEventCount: burst.pendingEventCount,
          ackEventCount: burst.ackEventCount,
          maxPendingSources: burst.maxPendingSources,
          maxPendingEntries: burst.maxPendingEntries,
          maxBlockedRevealWaitMs: burst.maxBlockedRevealWaitMs,
          maxBlockedSettleWaitMs: burst.maxBlockedSettleWaitMs,
          topPendingEventSources: summarizeSourceCounts(burst.pendingEventCountBySourceId),
          topAckEventSources: summarizeSourceCounts(burst.ackEventCountBySourceId),
          topPendingVisualSources: summarizeSourceCounts(burst.maxPendingVisualEntriesBySourceId),
        });
      }
      if (reset) {
        nativeCommitBurstRef.current = createNativeCommitBurstState();
      }
    },
    [instanceId]
  );

  const noteNativeCommitBurst: (message: string) => void = React.useCallback((message: string) => {
    const nowMs = Date.now();
    const burst = nativeCommitBurstRef.current;
    const diagnostics = deriveNativeDiagnosticMessageState(message);
    if (burst.startedAtMs <= 0) {
      burst.startedAtMs = nowMs;
    }
    if (diagnostics.eventKind === 'pending') {
      burst.pendingEventCount += 1;
    } else if (diagnostics.eventKind === 'ack') {
      burst.ackEventCount += 1;
    }
    const sourceId = diagnostics.sourceId;
    if (sourceId) {
      if (diagnostics.eventKind === 'pending') {
        burst.pendingEventCountBySourceId[sourceId] =
          (burst.pendingEventCountBySourceId[sourceId] ?? 0) + 1;
      } else if (diagnostics.eventKind === 'ack') {
        burst.ackEventCountBySourceId[sourceId] =
          (burst.ackEventCountBySourceId[sourceId] ?? 0) + 1;
      }
    }
    burst.maxPendingSources = Math.max(burst.maxPendingSources, diagnostics.pendingSources);
    burst.maxPendingEntries = Math.max(burst.maxPendingEntries, diagnostics.pendingEntries);
    Object.entries(diagnostics.pendingVisualEntriesBySourceId).forEach(
      ([pendingSourceId, count]) => {
        burst.maxPendingVisualEntriesBySourceId[pendingSourceId] = Math.max(
          burst.maxPendingVisualEntriesBySourceId[pendingSourceId] ?? 0,
          count
        );
      }
    );
    burst.maxBlockedRevealWaitMs = Math.max(
      burst.maxBlockedRevealWaitMs ?? 0,
      diagnostics.blockedRevealWaitMs ?? 0
    );
    burst.maxBlockedSettleWaitMs = Math.max(
      burst.maxBlockedSettleWaitMs ?? 0,
      diagnostics.blockedSettleWaitMs ?? 0
    );
    burst.lastMessageAtMs = nowMs;
  }, []);

  const resolveNativeEventSourceCounts = React.useCallback(
    (event: {
      frameGenerationId?: string | null;
      executionBatchId?: string | null;
      phase?: SearchRuntimeMapPresentationPhase | null;
      coverState?: SearchMapRenderPresentationState['coverState'] | null;
      pinCount?: number;
      dotCount?: number;
      labelCount?: number;
    }) => {
      const eventPinCount = typeof event.pinCount === 'number' ? event.pinCount : null;
      const eventDotCount = typeof event.dotCount === 'number' ? event.dotCount : null;
      const eventLabelCount = typeof event.labelCount === 'number' ? event.labelCount : null;
      if (eventPinCount != null && eventDotCount != null && eventLabelCount != null) {
        return {
          pinCount: eventPinCount,
          dotCount: eventDotCount,
          labelCount: eventLabelCount,
          pinsLabelsDotsFadeTogether: eventLabelCount >= eventPinCount,
        };
      }
      const queuedCounts = getSearchMapNativeFrameVisualSourceCounts({
        instanceId,
        frameGenerationId: event.frameGenerationId,
        executionBatchId: event.executionBatchId,
      });
      const isCoveredInitialLoadingPreroll =
        event.phase === 'covered' && event.coverState === 'initial_loading';
      if (queuedCounts == null && isCoveredInitialLoadingPreroll) {
        return {
          pinCount: 0,
          dotCount: 0,
          labelCount: 0,
          pinsLabelsDotsFadeTogether: false,
        };
      }
      const snapshot =
        eventPinCount == null || eventDotCount == null || eventLabelCount == null
          ? (sourceFramePortRef.current?.getSnapshot() ?? null)
          : null;
      const pinCount =
        eventPinCount ?? queuedCounts?.pinCount ?? snapshot?.pinSourceStore.idsInOrder.length ?? 0;
      const dotCount =
        eventDotCount ?? queuedCounts?.dotCount ?? snapshot?.dotSourceStore.idsInOrder.length ?? 0;
      const labelCount =
        eventLabelCount ??
        queuedCounts?.labelCount ??
        snapshot?.labelSourceStore.idsInOrder.length ??
        0;
      return {
        pinCount,
        dotCount,
        labelCount,
        pinsLabelsDotsFadeTogether: pinCount > 0 && dotCount > 0 && labelCount >= pinCount,
      };
    },
    [instanceId]
  );

  React.useEffect(() => {
    let isActive = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attachTimer: ReturnType<typeof setTimeout> | null = null;
    const attachAttempt = attachRetryNonce;
    const scheduleRecoverableRetry = (reason: string) => {
      if (attachAttempt >= MAX_RECOVERABLE_MAP_HANDLE_ATTACH_RETRIES) {
        return false;
      }
      retryTimer = setTimeout(() => {
        if (!isActive) {
          return;
        }
        if (shouldLogSearchNavSwitchDiagnosticLogs()) {
          logger.debug('[MAP-VIS-DIAG] native:attachRetryScheduled', {
            instanceId,
            componentInstanceId: mapComponentInstanceId,
            mapTag: resolvedMapTag,
            reason,
            nextAttempt: attachAttempt + 1,
            isPresentationActive: isPresentationActiveRef.current,
          });
        }
        setAttachRetryNonce((previous) => Math.max(previous, attachAttempt + 1));
      }, MAP_HANDLE_ATTACH_RETRY_DELAY_MS);
      return true;
    };
    setIsAttached(false);
    setOwnerEpoch(null);
    setHasSyncedInitialFrame(false);
    setNativeFatalErrorMessage(null);
    if (!isNativeAvailable || !isMapStyleReady) {
      setAttachState('idle');
      return () => {
        isActive = false;
      };
    }
    setAttachState('attaching');
    const mapTag = resolvedMapTag;
    if (typeof mapTag !== 'number' || mapTag <= 0) {
      const message = 'SearchMap native render owner attach failed: missing native map tag';
      logger.debug('[MAP-VIS-DIAG] native:attachRejectedNoMapTag', {
        instanceId,
        componentInstanceId: mapComponentInstanceId,
        mapTag,
        attachAttempt,
        isPresentationActive: isPresentationActiveRef.current,
      });
      setAttachState('idle');
      const retryScheduled = scheduleRecoverableRetry('missing_map_tag');
      if (isPresentationActiveRef.current && !retryScheduled) {
        setAttachState('failed');
        setNativeFatalErrorMessage(message);
      }
      return () => {
        isActive = false;
        if (retryTimer != null) {
          clearTimeout(retryTimer);
        }
      };
    }
    if (shouldLogSearchNavSwitchDiagnosticLogs()) {
      logger.debug('[MAP-VIS-DIAG] native:attachStart', {
        instanceId,
        componentInstanceId: mapComponentInstanceId,
        mapTag,
        attachAttempt,
        isPresentationActive: isPresentationActiveRef.current,
      });
    }
    attachTimer = setTimeout(() => {
      if (!isActive) {
        return;
      }
      void searchMapRenderController
        .attach({
          instanceId,
          mapTag,
          pinSourceId,
          pinInteractionSourceId,
          dotSourceId,
          dotInteractionSourceId,
          labelSourceId,
          labelInteractionSourceId,
          labelCollisionSourceId,
        })
        .then(() => {
          if (!isActive) {
            return;
          }
          setNativeFatalErrorMessage(null);
        })
        .catch((error: unknown) => {
          if (!isActive) {
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          const isRecoverableAttachError = isRecoverableMapHandleAttachError(message);
          const retryScheduled =
            isRecoverableAttachError && scheduleRecoverableRetry('map_handle_lookup_failed');
          logger.debug('[MAP-VIS-DIAG] native:attachReject', {
            instanceId,
            componentInstanceId: mapComponentInstanceId,
            mapTag,
            attachAttempt,
            message,
            isPresentationActive: isPresentationActiveRef.current,
            isRecoverableAttachError,
            retryScheduled,
          });
          setIsAttached(false);
          setOwnerEpoch(null);
          setHasSyncedInitialFrame(false);
          if (isRecoverableAttachError && (retryScheduled || !isPresentationActiveRef.current)) {
            setAttachState('idle');
            setNativeFatalErrorMessage(null);
            return;
          }
          setAttachState('failed');
          setNativeFatalErrorMessage(`SearchMap native render owner attach failed: ${message}`);
        });
    }, 0);
    return () => {
      isActive = false;
      if (attachTimer != null) {
        clearTimeout(attachTimer);
      }
      if (retryTimer != null) {
        clearTimeout(retryTimer);
      }
      setIsAttached(false);
      setAttachState('idle');
      setOwnerEpoch(null);
      setHasSyncedInitialFrame(false);
      setNativeFatalErrorMessage(null);
      void searchMapRenderController.detach(instanceId);
    };
  }, [
    attachRetryNonce,
    dotInteractionSourceId,
    dotSourceId,
    instanceId,
    isMapStyleReady,
    isNativeAvailable,
    labelCollisionSourceId,
    labelInteractionSourceId,
    labelSourceId,
    mapComponentInstanceId,
    pinInteractionSourceId,
    pinSourceId,
    resolvedMapTag,
  ]);

  React.useEffect(() => {
    if (!isNativeAvailable) {
      return;
    }
    const removeListener = searchMapNativeRenderOwnerEventDispatcher.setStatusHandler(
      instanceId,
      (event) =>
        withSearchNavSwitchRuntimeAttribution(
          'mapNativeRenderOwner',
          `statusEvent:${event.type}`,
          () => {
            if (event.type === 'error' || event.type === 'visual_diagnostic') {
              const message = event.message ?? '';
              const isNativeDiagEvent = event.instanceId === '__native_diag__';
              const isVisualDiagnosticEvent = event.type === 'visual_diagnostic';
              if (event.instanceId !== instanceId && !isNativeDiagEvent) {
                return;
              }
              if (
                message.startsWith('source_commit_pending') ||
                message.startsWith('source_commit_ack')
              ) {
                noteNativeCommitBurst(message);
                return;
              }
              if (message.startsWith('attach_map_resolve')) {
                if (shouldLogSearchNavSwitchDiagnosticLogs()) {
                  logger.debug('[MAP-VIS-DIAG] native:attachResolveProbe', {
                    instanceId,
                    message,
                    isPresentationActive: isPresentationActiveRef.current,
                  });
                }
                return;
              }
              if (message.startsWith('map_handle_refresh_context')) {
                flushNativeCommitBurst('map_handle_refresh_context', false);
                if (shouldLogSearchNavSwitchDiagnosticLogs()) {
                  logger.debug('[MAP-RELOAD-DIAG] native:mapHandleRefreshContext', {
                    instanceId,
                    message,
                  });
                }
                return;
              }
              if (message.startsWith('map_handle_refresh')) {
                flushNativeCommitBurst('map_handle_refresh', false);
                if (shouldLogSearchNavSwitchDiagnosticLogs()) {
                  logger.debug('[MAP-RELOAD-DIAG] native:mapHandleRefresh', {
                    instanceId,
                    message,
                  });
                }
                return;
              }
              if (message.startsWith('source_recovery_begin')) {
                flushNativeCommitBurst('source_recovery_begin', false);
                if (shouldLogSearchNavSwitchDiagnosticLogs()) {
                  logger.debug('[MAP-RELOAD-DIAG] native:sourceRecovery', {
                    instanceId,
                    message,
                  });
                }
                return;
              }
              if (deriveNativeDiagnosticMessageState(message).shouldLogTransitionDiagnostics) {
                if (shouldLogSearchNavSwitchDiagnosticLogs()) {
                  logger.debug('[MAP-VIS-DIAG] native:transition', {
                    instanceId,
                    message,
                  });
                }
                return;
              }
              if (isVisualDiagnosticEvent) {
                return;
              }
            }
            if (event.instanceId !== instanceId) {
              return;
            }
            if (event.type === 'camera_changed') {
              onViewportChanged?.({
                center: [event.centerLng, event.centerLat],
                zoom: event.zoom,
                bounds: {
                  northEast: {
                    lat: event.northEastLat,
                    lng: event.northEastLng,
                  },
                  southWest: {
                    lat: event.southWestLat,
                    lng: event.southWestLng,
                  },
                },
                isGestureActive: event.isGestureActive,
                isMoving: event.isMoving,
              });
              return;
            }
            if (event.type === 'label_observation_updated') {
              withNativePresentationEventInnerSpan(event, 'label_observation_callback', () => {
                onLabelObservationUpdated?.({
                  visibleLabelFeatureIds: event.visibleLabelFeatureIds,
                  layerRenderedFeatureCount: event.layerRenderedFeatureCount,
                  effectiveRenderedFeatureCount: event.effectiveRenderedFeatureCount,
                  stickyChanged: event.stickyChanged,
                });
              });
              return;
            }
            if (event.type === 'attached') {
              if (shouldLogSearchNavSwitchDiagnosticLogs()) {
                logger.debug('[MAP-VIS-DIAG] native:statusAttached', {
                  instanceId,
                  ownerEpoch: event.ownerEpoch,
                  mapTag: event.mapTag,
                  isPresentationActive: isPresentationActiveRef.current,
                });
              }
              const shouldPreserveReadyState = deriveOwnerReadyStatePreservation({
                eventType: 'attached',
                wasAttached: isAttachedStateRef.current,
                hadSyncedInitialFrame: hasSyncedInitialFrameRef.current,
                previousOwnerEpoch: ownerEpochStateRef.current,
                nextOwnerEpoch: event.ownerEpoch,
                isPresentationActive: isPresentationActiveRef.current,
              });
              setIsAttached(true);
              setAttachState('attached');
              setOwnerEpoch(event.ownerEpoch);
              lastSubmittedLabelObservationConfigKeyRef.current = null;
              activeLabelObservationTransactionKeyRef.current = null;
              if (!shouldPreserveReadyState) {
                setHasSyncedInitialFrame(true);
              }
              setNativeFatalErrorMessage(null);
              return;
            }
            if (event.type === 'detached') {
              setIsAttached(false);
              setAttachState('idle');
              setOwnerEpoch(null);
              setHasSyncedInitialFrame(false);
              lastSubmittedLabelObservationConfigKeyRef.current = null;
              activeLabelObservationTransactionKeyRef.current = null;
              return;
            }
            if (event.type === 'render_owner_invalidated') {
              setOwnerEpoch(event.ownerEpoch);
              lastSubmittedLabelObservationConfigKeyRef.current = null;
              activeLabelObservationTransactionKeyRef.current = null;
              const shouldPreserveReadyState = deriveOwnerReadyStatePreservation({
                eventType: 'invalidated',
                wasAttached: isAttachedStateRef.current,
                hadSyncedInitialFrame: hasSyncedInitialFrameRef.current,
                previousOwnerEpoch: ownerEpochStateRef.current,
                nextOwnerEpoch: event.ownerEpoch,
                isPresentationActive: isPresentationActiveRef.current,
              });
              if (!shouldPreserveReadyState) {
                setHasSyncedInitialFrame(false);
              }
              return;
            }
            if (event.type === 'render_frame_synced') {
              if (ownerEpochStateRef.current !== event.ownerEpoch) {
                ownerEpochStateRef.current = event.ownerEpoch;
                setOwnerEpoch(event.ownerEpoch);
              }
              if (!hasSyncedInitialFrameRef.current) {
                hasSyncedInitialFrameRef.current = true;
                setHasSyncedInitialFrame(true);
              }
              return;
            }
            if (event.type === 'presentation_enter_armed') {
              logNativePresentationReadinessEvent({
                event: 'native_enter_visual_frame_armed',
                requestKey: event.requestKey,
                frameGenerationId: event.frameGenerationId,
                executionBatchId: event.executionBatchId,
                armedAtMs: event.armedAtMs,
              });
              if (shouldLogSearchNavSwitchDiagnosticLogs()) {
                logger.debug('[PRESENTATION-LANE-DIAG] nativeEnterArmed', {
                  instanceId,
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  executionBatchId: event.executionBatchId,
                  armedAtMs: event.armedAtMs,
                });
              }
              return;
            }
            if (event.type === 'presentation_execution_batch_mounted_hidden') {
              withNativePresentationEventInnerSpan(event, 'visual_readiness_log', () => {
                logNativePresentationReadinessEvent({
                  event: 'native_execution_batch_mounted_hidden_ready',
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  executionBatchId: event.executionBatchId,
                  readyAtMs: event.readyAtMs,
                });
              });
              withNativePresentationEventInnerSpan(event, 'lifecycle_callback', () => {
                onExecutionBatchMountedHidden?.({
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  executionBatchId: event.executionBatchId,
                  readyAtMs: event.readyAtMs,
                });
              });
              return;
            }
            if (event.type === 'presentation_enter_started') {
              const sourceCounts = withNativePresentationEventInnerSpan(
                event,
                'source_counts',
                () => resolveNativeEventSourceCounts(event)
              );
              withNativePresentationEventInnerSpan(event, 'lifecycle_callback', () => {
                onMarkerEnterStarted?.({
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  executionBatchId: event.executionBatchId,
                  pinCount: sourceCounts.pinCount,
                  dotCount: sourceCounts.dotCount,
                  labelCount: sourceCounts.labelCount,
                  startedAtMs: event.startedAtMs,
                });
              });
              withNativePresentationEventInnerSpan(event, 'visual_readiness_log', () => {
                logNativePresentationReadinessEvent({
                  event: 'native_marker_enter_started',
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  executionBatchId: event.executionBatchId,
                  ...sourceCounts,
                  startedAtMs: event.startedAtMs,
                });
              });
              return;
            }
            if (event.type === 'presentation_enter_settled') {
              const sourceCounts = withNativePresentationEventInnerSpan(
                event,
                'source_counts',
                () => resolveNativeEventSourceCounts(event)
              );
              withNativePresentationEventInnerSpan(event, 'visual_readiness_log', () => {
                logNativePresentationReadinessEvent({
                  event: 'native_marker_enter_settled',
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  executionBatchId: event.executionBatchId,
                  ...sourceCounts,
                  settledAtMs: event.settledAtMs,
                });
              });
              withNativePresentationEventInnerSpan(event, 'lifecycle_callback', () => {
                onMarkerEnterSettled?.({
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  executionBatchId: event.executionBatchId,
                  pinCount: sourceCounts.pinCount,
                  dotCount: sourceCounts.dotCount,
                  labelCount: sourceCounts.labelCount,
                  settledAtMs: event.settledAtMs,
                });
              });
              return;
            }
            if (event.type === 'presentation_exit_started') {
              const sourceCounts = withNativePresentationEventInnerSpan(
                event,
                'source_counts',
                () => resolveNativeEventSourceCounts(event)
              );
              withNativePresentationEventInnerSpan(event, 'visual_readiness_log', () => {
                logNativePresentationReadinessEvent({
                  event: 'native_marker_exit_started',
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  ...sourceCounts,
                  startedAtMs: event.startedAtMs,
                });
              });
              withNativePresentationEventInnerSpan(event, 'lifecycle_callback', () => {
                onMarkerExitStarted?.({
                  requestKey: event.requestKey,
                  pinCount: sourceCounts.pinCount,
                  dotCount: sourceCounts.dotCount,
                  labelCount: sourceCounts.labelCount,
                  startedAtMs: event.startedAtMs,
                });
              });
              return;
            }
            if (event.type === 'presentation_visual_sources_collision_released') {
              const sourceCounts = withNativePresentationEventInnerSpan(
                event,
                'source_counts',
                () => resolveNativeEventSourceCounts(event)
              );
              withNativePresentationEventInnerSpan(event, 'visual_readiness_log', () => {
                logNativePresentationReadinessEvent({
                  event: 'native_marker_exit_collision_released',
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  ...sourceCounts,
                  releasedAtMs: event.releasedAtMs,
                  deferredUntilAfterBoundaryFrame: false,
                });
              });
              const releasedRequestKey = event.requestKey;
              void releasedRequestKey;
              return;
            }
            if (event.type === 'presentation_exit_settled') {
              const sourceCounts = withNativePresentationEventInnerSpan(
                event,
                'source_counts',
                () => resolveNativeEventSourceCounts(event)
              );
              withNativePresentationEventInnerSpan(event, 'visual_readiness_log', () => {
                logNativePresentationReadinessEvent({
                  event: 'native_marker_exit_settled',
                  requestKey: event.requestKey,
                  frameGenerationId: event.frameGenerationId,
                  ...sourceCounts,
                  settledAtMs: event.settledAtMs,
                });
              });
              withNativePresentationEventInnerSpan(event, 'lifecycle_callback', () => {
                onMarkerExitSettled?.({
                  requestKey: event.requestKey,
                  pinCount: sourceCounts.pinCount,
                  dotCount: sourceCounts.dotCount,
                  labelCount: sourceCounts.labelCount,
                  settledAtMs: event.settledAtMs,
                });
              });
              withNativePresentationEventInnerSpan(event, 'forget_source_counts', () => {
                forgetSearchMapNativeFrameVisualSourceCounts(instanceId);
              });
              return;
            }
            if (event.type === 'presentation_preroll_started') {
              const sourceCounts = withNativePresentationEventInnerSpan(
                event,
                'source_counts',
                () => resolveNativeEventSourceCounts(event)
              );
              withNativePresentationEventInnerSpan(event, 'visual_readiness_log', () => {
                logNativePresentationReadinessEvent({
                  event: 'native_marker_preroll_started',
                  phase: event.phase,
                  coverState: event.coverState,
                  frameGenerationId: event.frameGenerationId,
                  ...sourceCounts,
                  startedAtMs: event.startedAtMs,
                });
              });
              return;
            }
            if (event.type === 'render_owner_recovered_after_style_reload') {
              setOwnerEpoch(event.ownerEpoch);
              setHasSyncedInitialFrame(true);
              onRecoveredAfterStyleReload?.({
                recoveredAtMs: event.recoveredAtMs,
              });
            }
          }
        )
    );
    return () => {
      removeListener?.();
    };
  }, [
    dotSourceId,
    flushNativeCommitBurst,
    instanceId,
    isNativeAvailable,
    labelSourceId,
    noteNativeCommitBurst,
    onExecutionBatchMountedHidden,
    onMarkerExitSettled,
    onMarkerExitStarted,
    onMarkerEnterStarted,
    onMarkerEnterSettled,
    onViewportChanged,
    onLabelObservationUpdated,
    onRecoveredAfterStyleReload,
    pinSourceId,
  ]);

  const applyLabelObservationConfig = React.useCallback(() => {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    const authoritySnapshot = resultsPresentationAuthority.getSnapshot();
    const isResultsExitActive =
      authoritySnapshot.resultsPresentationTransport.snapshotKind === 'results_exit';
    const sourceFrameSnapshot = sourceFramePortRef.current?.getSnapshot() ?? null;
    const isPresentationLive =
      authoritySnapshot.resultsPresentation.contentVisibility === 'visible' && !isResultsExitActive;
    const presentationExecutionStage =
      authoritySnapshot.resultsPresentationTransport.executionStage;
    const labelSourceCount = sourceFrameSnapshot?.labelSourceStore.idsInOrder.length ?? 0;
    const sourceFrameVisualCycleKey = sourceFrameSnapshot?.visualCycleKey ?? null;
    const isPreparingEnterPlacement =
      !isResultsExitActive &&
      (presentationExecutionStage === 'enter_pending_mount' ||
        presentationExecutionStage === 'enter_mounted_hidden') &&
      authoritySnapshot.resultsPresentationTransport.transactionId != null;
    const shouldObserveLiveLabels =
      labelObservationEnabled && isPresentationLive && labelSourceCount > 0;
    const shouldObservePreparingEnterLabels =
      labelObservationEnabled && isPreparingEnterPlacement && labelSourceCount > 0;
    const effectiveObservationEnabled =
      shouldObserveLiveLabels || shouldObservePreparingEnterLabels;
    const effectiveCommitInteractionVisibility =
      commitVisibleLabelInteractionVisibility && isPresentationLive;
    const presentationTransactionId =
      authoritySnapshot.resultsPresentationTransport.transactionId ?? null;
    const presentationExecutionBatch =
      authoritySnapshot.resultsPresentationTransport.executionBatch;
    if (effectiveObservationEnabled) {
      activeLabelObservationTransactionKeyRef.current =
        presentationTransactionId ?? activeLabelObservationTransactionKeyRef.current;
    } else {
      activeLabelObservationTransactionKeyRef.current = null;
    }
    const activeObservationTransactionKey = effectiveObservationEnabled
      ? activeLabelObservationTransactionKeyRef.current
      : null;
    const observationRequestKey = effectiveObservationEnabled
      ? (presentationTransactionId ??
        activeObservationTransactionKey ??
        sourceFrameSnapshot?.mapSearchSurfaceResultsSourcesReadyKey ??
        labelObservationConfig.labelResetRequestKey)
      : null;
    const effectiveLabelObservationConfig = {
      ...labelObservationConfig,
      labelResetRequestKey: observationRequestKey,
    };
    const logLabelObservationConfig = (
      status: SearchMapNativeLabelObservationApplyStatus,
      errorMessage: string | null = null
    ) => {
      if (!isPerfScenarioAttributionActive(scenarioConfig)) {
        return;
      }
      logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
        event: 'native_label_observation_config_apply_contract',
        commitInteractionVisibility: effectiveCommitInteractionVisibility,
        errorMessage,
        instanceId,
        isAttached,
        isNativeAvailable,
        isResultsExitActive,
        isPreparingEnterPlacement,
        labelSourceCount,
        observationEnabled: effectiveObservationEnabled,
        observationRequestKey,
        presentationExecutionStage,
        sourceFrameVisualCycleKey,
        status,
      });
    };
    if (!isNativeAvailable || !isAttached) {
      lastSubmittedLabelObservationConfigKeyRef.current = null;
      activeLabelObservationTransactionKeyRef.current = null;
      logLabelObservationConfig('skipped');
      return;
    }
    const nextConfigKey = buildLabelObservationConfigKey({
      activeTransactionKey: activeObservationTransactionKey,
      allowFallback: true,
      commitInteractionVisibility: effectiveCommitInteractionVisibility,
      config: effectiveLabelObservationConfig,
      instanceId,
      observationEnabled: effectiveObservationEnabled,
      ownerEpoch,
    });
    if (lastSubmittedLabelObservationConfigKeyRef.current === nextConfigKey) {
      return;
    }
    lastSubmittedLabelObservationConfigKeyRef.current = nextConfigKey;
    logLabelObservationConfig('requested');
    if (
      effectiveCommitInteractionVisibility &&
      scenarioConfig != null &&
      isPerfScenarioAttributionActive(scenarioConfig) &&
      presentationTransactionId != null &&
      presentationExecutionBatch != null &&
      authoritySnapshot.resultsPresentationTransport.executionStage === 'enter_executing'
    ) {
      const markerEnterKey = [
        presentationTransactionId,
        presentationExecutionBatch.generationId,
        presentationExecutionBatch.batchId,
        authoritySnapshot.resultsPresentationTransport.startToken ?? 'start:null',
      ].join('|');
      if (lastCommandedMarkerEnterKeyRef.current !== markerEnterKey) {
        lastCommandedMarkerEnterKeyRef.current = markerEnterKey;
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'native_marker_enter_started',
          requestKey: presentationTransactionId,
          frameGenerationId: presentationExecutionBatch.generationId,
          executionBatchId: presentationExecutionBatch.batchId,
          pinCount: sourceFrameSnapshot?.pinSourceStore.idsInOrder.length ?? 0,
          dotCount: sourceFrameSnapshot?.dotSourceStore.idsInOrder.length ?? 0,
          labelCount: sourceFrameSnapshot?.labelSourceStore.idsInOrder.length ?? 0,
          pinsLabelsDotsFadeTogether:
            (sourceFrameSnapshot?.pinSourceStore.idsInOrder.length ?? 0) > 0 &&
            (sourceFrameSnapshot?.dotSourceStore.idsInOrder.length ?? 0) > 0 &&
            (sourceFrameSnapshot?.labelSourceStore.idsInOrder.length ?? 0) >=
              (sourceFrameSnapshot?.pinSourceStore.idsInOrder.length ?? 0),
          startedAtMs:
            authoritySnapshot.resultsPresentationTransport.startToken ??
            globalThis.performance?.now?.() ??
            Date.now(),
        });
      }
    }
    if (shouldLogSearchNavSwitchDiagnosticLogs()) {
      logger.debug('[LABEL-PLACEMENT-DIAG] native_label_observation_config', {
        activeObservationTransactionKey,
        commitInteractionVisibility: effectiveCommitInteractionVisibility,
        effectiveObservationEnabled,
        isResultsExitActive,
        isPreparingEnterPlacement,
        labelSourceCount,
        observationRequestKey,
        presentationExecutionStage,
        presentationTransactionId,
        sourceFrameVisualCycleKey,
      });
    }
    void searchMapRenderController
      .configureLabelObservation({
        instanceId,
        observationEnabled: effectiveObservationEnabled,
        allowFallback: true,
        commitInteractionVisibility: effectiveCommitInteractionVisibility,
        ...effectiveLabelObservationConfig,
      })
      .then(() => {
        logLabelObservationConfig('applied');
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (lastSubmittedLabelObservationConfigKeyRef.current === nextConfigKey) {
          lastSubmittedLabelObservationConfigKeyRef.current = null;
        }
        logLabelObservationConfig('failed', errorMessage);
      });
  }, [
    commitVisibleLabelInteractionVisibility,
    instanceId,
    isAttached,
    isNativeAvailable,
    labelObservationConfig,
    labelObservationEnabled,
    ownerEpoch,
    resultsPresentationAuthority,
  ]);

  React.useEffect(() => {
    applyLabelObservationConfig();
  }, [applyLabelObservationConfig]);

  React.useEffect(() => {
    const unsubscribePresentation = resultsPresentationAuthority.subscribe(
      applyLabelObservationConfig,
      ['resultsPresentation', 'resultsPresentationTransport'] as const,
      'search_map_native_render_owner_label_observation_presentation'
    );
    const unsubscribeSourceFrame =
      sourceFramePort?.subscribe(
        applyLabelObservationConfig,
        ['labelSourceStore'] as const,
        'search_map_native_render_owner_label_observation_sources'
      ) ?? (() => undefined);
    return () => {
      unsubscribePresentation();
      unsubscribeSourceFrame();
    };
  }, [applyLabelObservationConfig, resultsPresentationAuthority, sourceFramePort]);

  const isNativeOwnerReady = isAttached && ownerEpoch != null && hasSyncedInitialFrame;

  React.useEffect(() => {
    if (
      !isMapStyleReady ||
      !isNativeAvailable ||
      !isAttached ||
      isNativeOwnerReady ||
      !isPresentationActiveRef.current
    ) {
      return;
    }
    const timeoutId = setTimeout(() => {
      setNativeFatalErrorMessage(
        'SearchMap native render owner failed to reach ready state after attach'
      );
    }, NATIVE_READY_TIMEOUT_MS);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [isAttached, isMapStyleReady, isNativeAvailable, isNativeOwnerReady]);

  const reportNativeFatalError = React.useCallback((message: string) => {
    setHasSyncedInitialFrame(false);
    setNativeFatalErrorMessage(message);
  }, []);

  return {
    instanceId,
    isAttached,
    isNativeAvailable,
    attachState,
    ownerEpoch,
    isNativeOwnerReady,
    nativeFatalErrorMessage,
    reportNativeFatalError,
  };
};

const useSearchMapNativeRenderOwnerSync = ({
  mapMotionPressureController,
  instanceId,
  isAttached,
  ownerEpoch,
  isRenderFrameSyncReady,
  isNativeAvailable,
  pins,
  pinInteractions,
  dots,
  dotInteractions,
  labels,
  labelInteractions,
  labelCollisions,
  sourceFramePort = null,
  viewportState,
  resultsPresentationAuthority,
  selectedRestaurantId,
  highlightedMarkerKey,
  highlightedMarkerKeys,
  interactionMode,
  onSyncError,
}: SearchMapNativeRenderOwnerSyncArgs): void => {
  const resolvedPins = resolveSearchMapSourceStore(pins);
  const resolvedPinInteractions = resolveSearchMapSourceStore(pinInteractions);
  const resolvedDots = resolveSearchMapSourceStore(dots);
  const resolvedDotInteractions = resolveSearchMapSourceStore(dotInteractions);
  const resolvedLabels = resolveSearchMapSourceStore(labels);
  const resolvedLabelInteractions = resolveSearchMapSourceStore(labelInteractions);
  const resolvedLabelCollisions = resolveSearchMapSourceStore(labelCollisions);
  const sourceFramePortRef = React.useRef(sourceFramePort);
  const resultsPresentationAuthorityRef = React.useRef(resultsPresentationAuthority);
  const selectedRestaurantIdRef = React.useRef(selectedRestaurantId);

  React.useEffect(() => {
    sourceFramePortRef.current = sourceFramePort;
  }, [sourceFramePort]);

  React.useEffect(() => {
    resultsPresentationAuthorityRef.current = resultsPresentationAuthority;
  }, [resultsPresentationAuthority]);

  React.useEffect(() => {
    selectedRestaurantIdRef.current = selectedRestaurantId;
  }, [selectedRestaurantId]);

  const getCurrentPresentationState = React.useCallback(
    (): SearchMapRenderPresentationState =>
      deriveSearchMapNativePresentationState({
        resultsPresentationAuthority: resultsPresentationAuthorityRef.current,
        selectedRestaurantId: selectedRestaurantIdRef.current,
        sourceFramePort: sourceFramePortRef.current,
      }),
    []
  );

  type NativeRenderOwnerFrameEnvelope = {
    ownerEpoch: number;
    frameGenerationId: string;
    executionBatchId: string;
    frame: SearchMapRenderFrame;
    snapshot: SearchMapRenderSnapshot;
    sourceTransport: SearchMapRenderSourceTransportPayload;
    sourceSnapshotSyncMode: 'apply' | 'presentation_only';
    sourceFrameKey: string;
    sourceDataKey: string;
    sourceFrameMatchState: SearchMapNativeSourceFrameMatchState;
    didConsumeDeferredCoveredSourceFrame: boolean;
    residentSourceReuse: boolean;
    sourceTransportBuildDurationMs: number;
  };
  const buildSourceSnapshot = React.useCallback((): SearchMapRenderSnapshot => {
    const directSnapshot = sourceFramePortRef.current?.getSnapshot() ?? null;
    if (directSnapshot) {
      return {
        pins: resolveSearchMapSourceStore(directSnapshot.pinSourceStore),
        pinInteractions: resolveSearchMapSourceStore(directSnapshot.pinInteractionSourceStore),
        dots: resolveSearchMapSourceStore(directSnapshot.dotSourceStore),
        dotInteractions: resolveSearchMapSourceStore(directSnapshot.dotInteractionSourceStore),
        labels: resolveSearchMapSourceStore(directSnapshot.labelSourceStore),
        labelInteractions:
          resolvedLabelInteractions.idsInOrder.length > 0
            ? resolvedLabelInteractions
            : EMPTY_SEARCH_MAP_SOURCE_STORE,
        labelCollisions: resolveSearchMapSourceStore(directSnapshot.labelCollisionSourceStore),
      };
    }
    return {
      pins: resolvedPins,
      pinInteractions: resolvedPinInteractions,
      dots: resolvedDots,
      dotInteractions: resolvedDotInteractions,
      labels: resolvedLabels,
      labelInteractions: resolvedLabelInteractions,
      labelCollisions: resolvedLabelCollisions,
    };
  }, [
    resolvedDotInteractions,
    resolvedDots,
    resolvedLabelCollisions,
    resolvedLabelInteractions,
    resolvedLabels,
    resolvedPinInteractions,
    resolvedPins,
  ]);
  const transportStateRef = React.useRef(
    createNativeRenderOwnerTransportState<NativeRenderOwnerFrameEnvelope>()
  );
  const isAttachedRef = React.useRef(isAttached);
  const ownerEpochRef = React.useRef<number | null>(ownerEpoch);
  const shouldIgnoreNativeSyncErrorsRef = React.useRef(!isAttached);
  const onSyncErrorRef = React.useRef(onSyncError);
  const getSourceSyncBaselineRevisions =
    React.useCallback((): SearchMapRenderSourceRevisionState | null => {
      const transportState = transportStateRef.current;
      return (
        (transportState.queueState.inFlightFrame?.sourceSnapshotSyncMode === 'apply'
          ? transportState.queueState.inFlightFrame.frame.sourceRevisions
          : null) ??
        transportState.lastAppliedFrame?.frame.sourceRevisions ??
        transportState.acknowledgedSourceRevisions
      );
    }, []);

  React.useEffect(() => {
    onSyncErrorRef.current = onSyncError;
  }, [onSyncError]);

  React.useEffect(() => {
    isAttachedRef.current = isAttached;
    ownerEpochRef.current = ownerEpoch;
    shouldIgnoreNativeSyncErrorsRef.current = !isAttached;
  }, [isAttached, ownerEpoch]);

  React.useEffect(() => {
    return () => {
      shouldIgnoreNativeSyncErrorsRef.current = true;
      isAttachedRef.current = false;
      forgetSearchMapNativeFrameVisualSourceCounts(instanceId);
      resetNativeRenderOwnerTransportState({
        state: transportStateRef.current,
        resetDesiredExecutionBatchId: true,
      });
      ownerEpochRef.current = null;
      mapMotionPressureController.reset();
    };
  }, [mapMotionPressureController]);

  const flushLatestDesiredFrame = React.useCallback(() => {
    const transportState = transportStateRef.current;
    if (!isAttachedRef.current || ownerEpochRef.current == null) {
      resetNativeRenderOwnerTransportState({
        state: transportState,
        resetDesiredExecutionBatchId: true,
      });
      return;
    }
    const effectiveDesiredFrame = takeNextNativeRenderOwnerFrameForTransport({
      transportState,
      ownerEpoch: ownerEpochRef.current,
    });
    if (!effectiveDesiredFrame) {
      return;
    }
    mapMotionPressureController.applySourcePublishLifecycleEvent({ kind: 'started' });
    const bridgeStartedAtMs = resolveNativeRenderOwnerPerfNow();
    const bridgePresentationDiagnostics = derivePresentationDiagnosticsState(
      effectiveDesiredFrame.frame.presentation
    );
    const bridgeSourceSummary = summarizeSourceTransportForBridgeSlice(
      effectiveDesiredFrame.sourceTransport
    );
    const logNativeRenderFrameBridgeSlice = (
      status: 'applied' | 'dropped' | 'failed',
      message?: string
    ): void => {
      const bridgeSettledAtMs = resolveNativeRenderOwnerPerfNow();
      logNativePresentationReadinessEvent({
        event: 'native_set_render_frame_bridge_slice',
        status,
        instanceId,
        ownerEpoch: effectiveDesiredFrame.ownerEpoch,
        frameGenerationId: effectiveDesiredFrame.frameGenerationId,
        executionBatchId: effectiveDesiredFrame.executionBatchId,
        transactionId: effectiveDesiredFrame.frame.presentation.transactionId,
        requestKey: deriveSearchMapRenderPresentationRequestKey(
          effectiveDesiredFrame.frame.presentation
        ),
        laneKind: bridgePresentationDiagnostics.laneKind,
        batchPhase: bridgePresentationDiagnostics.batchPhase,
        isNativeAvailable,
        startTimeMs: roundNativeRenderOwnerPerfMs(bridgeStartedAtMs),
        endTimeMs: roundNativeRenderOwnerPerfMs(bridgeSettledAtMs),
        nowMs: roundNativeRenderOwnerPerfMs(bridgeSettledAtMs),
        durationMs: roundNativeRenderOwnerPerfMs(bridgeSettledAtMs - bridgeStartedAtMs),
        pinCount: effectiveDesiredFrame.snapshot.pins.idsInOrder.length,
        dotCount: effectiveDesiredFrame.snapshot.dots.idsInOrder.length,
        labelCount: effectiveDesiredFrame.snapshot.labels.idsInOrder.length,
        residentSourceReuse: effectiveDesiredFrame.residentSourceReuse,
        sourceSnapshotSyncMode: effectiveDesiredFrame.sourceSnapshotSyncMode,
        didConsumeDeferredCoveredSourceFrame:
          effectiveDesiredFrame.didConsumeDeferredCoveredSourceFrame,
        sourceFrameKey: effectiveDesiredFrame.sourceFrameKey,
        sourceDataKey: effectiveDesiredFrame.sourceDataKey,
        sourceFrameRequestKey: effectiveDesiredFrame.sourceFrameMatchState.requestKey,
        sourceFrameVisualCycleKey: effectiveDesiredFrame.sourceFrameMatchState.visualCycleKey,
        sourceFrameReadinessKey: effectiveDesiredFrame.sourceFrameMatchState.readinessKey,
        sourceFrameShortcutCoverageRequestKey:
          effectiveDesiredFrame.sourceFrameMatchState.shortcutCoverageRequestKey,
        sourceTransportBuildDurationMs: roundNativeRenderOwnerPerfMs(
          effectiveDesiredFrame.sourceTransportBuildDurationMs
        ),
        ...bridgeSourceSummary,
        ...(message ? { message } : {}),
      });
    };
    searchMapRenderController.submitRenderFrameFireAndObserve(
      {
        instanceId,
        ownerEpoch: effectiveDesiredFrame.ownerEpoch,
        frameGenerationId: effectiveDesiredFrame.frameGenerationId,
        executionBatchId: effectiveDesiredFrame.executionBatchId,
        frame: effectiveDesiredFrame.frame,
        sourceTransport: effectiveDesiredFrame.sourceTransport,
      },
      (error: Error) => {
        const promiseCallbackStartedAtMs = resolveNativeRenderOwnerPerfNow();
        let callbackStatus: 'dropped' | 'failed' = 'failed';
        try {
          const message = error.message;
          const shouldDropFrame =
            message.includes('stale owner epoch') ||
            (shouldIgnoreNativeSyncErrorsRef.current &&
              message.includes('invalid render frame payload'));
          if (shouldDropFrame) {
            callbackStatus = 'dropped';
            logNativeRenderFrameBridgeSlice('dropped', message);
            logger.debug('[MAP-VIS-DIAG] native:setRenderFrame:dropped', {
              instanceId,
              frameGenerationId: effectiveDesiredFrame.frameGenerationId,
              executionBatchId: effectiveDesiredFrame.executionBatchId,
              laneKind: bridgePresentationDiagnostics.laneKind,
              batchPhase: bridgePresentationDiagnostics.batchPhase,
              message,
            });
            requeueDroppedNativeRenderOwnerFrameForTransport({
              transportState,
              droppedFrame: effectiveDesiredFrame,
              ownerEpoch: ownerEpochRef.current ?? effectiveDesiredFrame.ownerEpoch,
            });
            mapMotionPressureController.applySourcePublishLifecycleEvent({ kind: 'settled' });
            if (
              message.includes('stale owner epoch') &&
              isAttachedRef.current &&
              ownerEpochRef.current != null &&
              ownerEpochRef.current !== effectiveDesiredFrame.ownerEpoch
            ) {
              queueMicrotask(() => {
                if (isAttachedRef.current) {
                  flushLatestDesiredFrame();
                }
              });
            }
            return;
          }
          logNativeRenderFrameBridgeSlice('failed', message);
          logger.debug('[MAP-VIS-DIAG] native:setRenderFrame:reject', {
            instanceId,
            frameGenerationId: effectiveDesiredFrame.frameGenerationId,
            executionBatchId: effectiveDesiredFrame.executionBatchId,
            message,
          });
          onSyncErrorRef.current?.(`SearchMap native render owner frame sync failed: ${message}`);
          markNativeRenderOwnerFrameTransportFailed(
            transportState,
            effectiveDesiredFrame.frameGenerationId
          );
          mapMotionPressureController.applySourcePublishLifecycleEvent({ kind: 'settled' });
          if (transportState.queueState.pendingFrame && isAttachedRef.current) {
            flushLatestDesiredFrame();
          }
        } finally {
          logNativeRenderOwnerWorkSpan({
            owner: 'search_map_native_promise_callback',
            path: `${callbackStatus}:${bridgePresentationDiagnostics.batchPhase}:${bridgePresentationDiagnostics.laneKind}`,
            startedAtMs: promiseCallbackStartedAtMs,
            details: {
              status: callbackStatus,
              frameGenerationId: effectiveDesiredFrame.frameGenerationId,
              executionBatchId: effectiveDesiredFrame.executionBatchId,
              batchPhase: bridgePresentationDiagnostics.batchPhase,
              laneKind: bridgePresentationDiagnostics.laneKind,
            },
          });
        }
      }
    );
  }, [instanceId, isNativeAvailable, mapMotionPressureController]);

  React.useEffect(() => {
    if (!isAttached) {
      resetNativeRenderOwnerTransportState({
        state: transportStateRef.current,
        resetDesiredExecutionBatchId: true,
      });
    }
  }, [isAttached]);

  React.useEffect(() => {
    if (!isAttached || ownerEpoch == null) {
      return;
    }
    resetNativeRenderOwnerTransportState({
      state: transportStateRef.current,
    });
  }, [isAttached, ownerEpoch]);

  React.useEffect(() => {
    if (!isNativeAvailable) {
      return;
    }
    const removeListener = searchMapNativeRenderOwnerEventDispatcher.setTransportHandler(
      instanceId,
      (event) =>
        withSearchNavSwitchRuntimeAttribution(
          'mapNativeRenderOwner',
          `syncEvent:${event.type}`,
          () => {
            if (event.instanceId !== instanceId) {
              return;
            }
            const transportState = transportStateRef.current;
            if (event.type === 'render_owner_invalidated') {
              if (shouldLogSearchNavSwitchDiagnosticLogs()) {
                logger.debug('[MAP-VIS-DIAG] native:ownerInvalidated', {
                  instanceId,
                  ownerEpoch: event.ownerEpoch,
                  reason: event.reason,
                  invalidatedAtMs: event.invalidatedAtMs,
                });
              }
              transportState.lastAppliedFrame = null;
              transportState.acknowledgedSourceRevisions = null;
              clearNativeRenderOwnerResidentSourceState(transportState);
              ownerEpochRef.current = event.ownerEpoch;
              retargetNativeRenderOwnerTransportOwnerEpoch(transportState, event.ownerEpoch);
              return;
            }
            if (event.type === 'render_owner_recovered_after_style_reload') {
              if (shouldLogSearchNavSwitchDiagnosticLogs()) {
                logger.debug(
                  '[MAP-VIS-DIAG] native:recoveredAfterStyleReload:flushLatestDesiredFrame',
                  {
                    instanceId,
                    frameGenerationId: event.frameGenerationId,
                    ownerEpoch: event.ownerEpoch,
                    recoveredAtMs: event.recoveredAtMs,
                  }
                );
              }
              transportState.lastAppliedFrame = null;
              transportState.acknowledgedSourceRevisions = null;
              clearNativeRenderOwnerResidentSourceState(transportState);
              ownerEpochRef.current = event.ownerEpoch;
              retargetNativeRenderOwnerTransportOwnerEpoch(transportState, event.ownerEpoch);
              if (transportState.queueState.pendingFrame && isAttachedRef.current) {
                flushLatestDesiredFrame();
              }
              return;
            }
            if (
              event.type === 'presentation_visual_sources_collision_released' ||
              event.type === 'presentation_exit_settled'
            ) {
              markNativeRenderOwnerVisualSourcesNotResident(transportState);
              return;
            }
            if (event.type !== 'render_frame_synced' || event.frameGenerationId == null) {
              return;
            }
            if (event.ownerEpoch !== ownerEpochRef.current) {
              return;
            }
            transportState.acknowledgedSourceRevisions = event.sourceRevisions;
            const matchedFrame =
              findNativeRenderOwnerFrameTransportMatch(transportState, event.frameGenerationId) ??
              (transportState.lastAppliedFrame?.frameGenerationId === event.frameGenerationId
                ? transportState.lastAppliedFrame
                : null);
            if (matchedFrame?.sourceSnapshotSyncMode === 'apply') {
              acknowledgeSnapshotSourceRevisions(matchedFrame.snapshot, event.sourceRevisions);
              transportState.lastAppliedFrame = matchedFrame;
              transportState.residentSource = {
                ownerEpoch: matchedFrame.ownerEpoch,
                hasRestorableVisualSource: hasResidentSearchMapRenderVisualSnapshot(
                  matchedFrame.snapshot
                ),
                frameGenerationId: matchedFrame.frameGenerationId,
                executionBatchId: matchedFrame.executionBatchId,
                sourceFrameKey: matchedFrame.sourceFrameKey,
                sourceDataKey: matchedFrame.sourceDataKey,
                sourceRevisions: matchedFrame.frame.sourceRevisions,
              };
            } else if (
              matchedFrame?.sourceSnapshotSyncMode === 'presentation_only' &&
              matchedFrame.residentSourceReuse &&
              areSearchMapRenderSourceRevisionStatesEqual(
                event.sourceRevisions,
                matchedFrame.frame.sourceRevisions
              )
            ) {
              transportState.lastAppliedFrame = matchedFrame;
              transportState.acknowledgedSourceRevisions = matchedFrame.frame.sourceRevisions;
              transportState.residentSource = {
                ownerEpoch: matchedFrame.ownerEpoch,
                hasRestorableVisualSource: hasResidentSearchMapRenderVisualSnapshot(
                  matchedFrame.snapshot
                ),
                frameGenerationId: matchedFrame.frameGenerationId,
                executionBatchId: matchedFrame.executionBatchId,
                sourceFrameKey: matchedFrame.sourceFrameKey,
                sourceDataKey: matchedFrame.sourceDataKey,
                sourceRevisions: matchedFrame.frame.sourceRevisions,
              };
            }
            if (
              transportState.queueState.inFlightFrame?.frameGenerationId === event.frameGenerationId
            ) {
              acknowledgeNativeRenderOwnerFrameTransportSync(
                transportState,
                event.frameGenerationId
              );
              mapMotionPressureController.applySourcePublishLifecycleEvent({
                kind: 'synced',
                nowMs: Date.now(),
              });
              if (transportState.queueState.pendingFrame && isAttachedRef.current) {
                flushLatestDesiredFrame();
              }
            }
          }
        )
    );
    return () => {
      removeListener?.();
    };
  }, [flushLatestDesiredFrame, instanceId, isNativeAvailable, mapMotionPressureController]);

  const queueNativeRenderOwnerFrame = React.useCallback(() => {
    return withSearchNavSwitchRuntimeAttribution(
      'mapNativeRenderOwner',
      'renderFrameEffect',
      () => {
        const nextPresentationState = getCurrentPresentationState();
        mapMotionPressureController.updatePresentationTransaction(
          deriveMotionPressurePresentationTransaction(nextPresentationState)
        );
        if (!isNativeAvailable || !isRenderFrameSyncReady || !isAttached || ownerEpoch == null) {
          if (shouldLogSearchNavSwitchDiagnosticLogs()) {
            logger.debug('[MAP-VIS-DIAG] native:renderFrameSkipped', {
              instanceId,
              isNativeAvailable,
              isRenderFrameSyncReady,
              isAttached,
              ownerEpoch,
            });
          }
          return;
        }
        const sourceFrameSnapshot = sourceFramePortRef.current?.getSnapshot() ?? null;
        const preparedSourceSnapshot = buildSourceSnapshot();
        const preparedFrame: SearchMapRenderFrame = {
          sourceRevisions: getSearchMapRenderSourceRevisions(preparedSourceSnapshot),
          viewport: viewportState,
          presentation: nextPresentationState,
          highlightedMarkerKey,
          highlightedMarkerKeys,
          interactionMode,
        };
        const transportState = transportStateRef.current;
        const lastDesiredFrame = transportState.lastDesiredFrame;
        const presentationPhase = deriveSearchMapRenderPresentationPhase(nextPresentationState);
        const presentationRequestKey =
          deriveSearchMapRenderPresentationRequestKey(nextPresentationState);
        const sourceFrameMatchState = buildSearchMapNativeSourceFrameMatchState({
          requestKey: presentationRequestKey,
          sourceFrameSnapshot,
        });
        const sourceFrameKey = serializeSearchMapNativeSourceFrameMatchState(sourceFrameMatchState);
        const sourceDataKey = serializeSearchMapNativeSourceDataKey(sourceFrameMatchState);
        const hasSameOwnerResidentOrRestorableNativeVisualSource =
          transportState.residentSource.ownerEpoch === ownerEpoch &&
          transportState.residentSource.hasRestorableVisualSource;
        const isInitialNativeFrame =
          transportState.lastAppliedFrame == null &&
          transportState.queueState.inFlightFrame == null &&
          transportState.queueState.pendingFrame == null;
        const isInitialEmptyFrame =
          isInitialNativeFrame &&
          (presentationPhase === 'idle' ||
            (presentationPhase === 'covered' &&
              isSearchMapRenderVisualSnapshotEmpty(preparedSourceSnapshot)));
        if (isInitialEmptyFrame) {
          if (shouldLogSearchNavSwitchDiagnosticLogs()) {
            logger.debug('[MAP-VIS-DIAG] native:renderFrameSkipped', {
              instanceId,
              reason:
                presentationPhase === 'covered'
                  ? 'initial_empty_covered_frame'
                  : 'initial_idle_frame',
              presentationPhase,
              pinCount: preparedSourceSnapshot.pins.idsInOrder.length,
              dotCount: preparedSourceSnapshot.dots.idsInOrder.length,
              labelCount: preparedSourceSnapshot.labels.idsInOrder.length,
            });
          }
          return;
        }
        const lastDesiredPresentation = lastDesiredFrame?.presentation ?? null;
        const presentationTransportDiagnostics =
          deriveTransportDiagnosticsState(nextPresentationState);
        const {
          viewportBoundsChanged,
          gestureStateChanged,
          movingStateChanged,
          presentationChanged,
          controlStateChanged,
        } = deriveFrameChangeState({
          previousFrame: lastDesiredFrame,
          nextFrame: preparedFrame,
        });
        const presentationSyncState = derivePresentationSyncState({
          presentationState: nextPresentationState,
          previousPresentationState: lastDesiredPresentation,
        });
        const residentSourceReuse = false;
        const sourceSyncBaselineRevisions = presentationSyncState.shouldForceReplaceForNewRequest
          ? null
          : getSourceSyncBaselineRevisions();
        const nominalChangedSources = [
          sourceSyncBaselineRevisions?.pins !== preparedSourceSnapshot.pins.sourceRevision
            ? 'pins'
            : null,
          sourceSyncBaselineRevisions?.pinInteractions !==
          preparedSourceSnapshot.pinInteractions.sourceRevision
            ? 'pinInteractions'
            : null,
          sourceSyncBaselineRevisions?.dots !== preparedSourceSnapshot.dots.sourceRevision
            ? 'dots'
            : null,
          sourceSyncBaselineRevisions?.dotInteractions !==
          preparedSourceSnapshot.dotInteractions.sourceRevision
            ? 'dotInteractions'
            : null,
          sourceSyncBaselineRevisions?.labels !== preparedSourceSnapshot.labels.sourceRevision
            ? 'labels'
            : null,
          sourceSyncBaselineRevisions?.labelInteractions !==
          preparedSourceSnapshot.labelInteractions.sourceRevision
            ? 'labelInteractions'
            : null,
          sourceSyncBaselineRevisions?.labelCollisions !==
          preparedSourceSnapshot.labelCollisions.sourceRevision
            ? 'labelCollisions'
            : null,
        ].filter((value): value is SearchMapRenderSourceId => value != null);
        const preparedSourceFrameReadyForHiddenPreapply =
          sourceFrameSnapshot?.mapSearchSurfaceResultsSourcesReady === true &&
          !isSearchMapRenderVisualSnapshotEmpty(preparedSourceSnapshot);
        const residentSourceDataMatchesPreparedFrame =
          hasSameOwnerResidentOrRestorableNativeVisualSource &&
          transportState.residentSource.sourceDataKey === sourceDataKey &&
          areSearchMapRenderSourceRevisionStatesEqual(
            transportState.residentSource.sourceRevisions,
            preparedFrame.sourceRevisions
          );
        const readySourceFrameRequiresResidentReplace =
          preparedSourceFrameReadyForHiddenPreapply &&
          transportState.residentSource.ownerEpoch === ownerEpoch &&
          transportState.residentSource.hasRestorableVisualSource &&
          !residentSourceDataMatchesPreparedFrame;
        const sourceTransportBuildStartedAtMs = resolveNativeRenderOwnerPerfNow();
        const transportSourceSyncBaselineRevisions = readySourceFrameRequiresResidentReplace
          ? null
          : sourceSyncBaselineRevisions;
        const candidateSourceTransport = buildSearchMapRenderSourceTransport({
          previousSourceRevisions: transportSourceSyncBaselineRevisions,
          nextSnapshot: preparedSourceSnapshot,
          changedSourceIds:
            transportSourceSyncBaselineRevisions == null
              ? SEARCH_MAP_RENDER_SOURCE_IDS
              : nominalChangedSources,
        });
        const shouldSuppressIncompleteCoveredSourceApply =
          presentationPhase === 'covered' &&
          candidateSourceTransport.effectiveChangedSourceIds.length > 0 &&
          !preparedSourceFrameReadyForHiddenPreapply;
        const sourceTransport = shouldSuppressIncompleteCoveredSourceApply
          ? PRESENTATION_ONLY_SEARCH_MAP_RENDER_SOURCE_TRANSPORT
          : candidateSourceTransport;
        const effectiveSourceSnapshot = preparedSourceSnapshot;
        const effectiveFrame = preparedFrame;
        if (shouldSuppressIncompleteCoveredSourceApply) {
          logNativePresentationReadinessEvent({
            event: 'native_hidden_source_preapply_contract',
            action: 'covered_wait_for_ready_hidden_sources',
            instanceId,
            ownerEpoch,
            sourceFrameKey,
            requestKey: sourceFrameMatchState.requestKey,
            visualCycleKey: sourceFrameMatchState.visualCycleKey,
            readinessKey: sourceFrameMatchState.readinessKey,
            shortcutCoverageRequestKey: sourceFrameMatchState.shortcutCoverageRequestKey,
            candidateChangedSourceIds: candidateSourceTransport.effectiveChangedSourceIds,
            pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
            dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
            labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
          });
        }
        if (
          presentationPhase === 'covered' &&
          sourceTransport.effectiveChangedSourceIds.length > 0
        ) {
          logNativePresentationReadinessEvent({
            event: 'native_hidden_source_preapply_contract',
            action: 'covered_apply_hidden_sources',
            instanceId,
            ownerEpoch,
            sourceFrameKey,
            requestKey: sourceFrameMatchState.requestKey,
            visualCycleKey: sourceFrameMatchState.visualCycleKey,
            readinessKey: sourceFrameMatchState.readinessKey,
            shortcutCoverageRequestKey: sourceFrameMatchState.shortcutCoverageRequestKey,
            residentFrameGenerationId: transportState.residentSource.frameGenerationId,
            residentExecutionBatchId: transportState.residentSource.executionBatchId,
            effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
            retainedResidentSourcePromoted: residentSourceDataMatchesPreparedFrame,
            pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
            dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
            labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
          });
        }
        if (
          presentationPhase === 'covered' &&
          sourceTransport.effectiveChangedSourceIds.length === 0 &&
          preparedSourceFrameReadyForHiddenPreapply &&
          residentSourceDataMatchesPreparedFrame
        ) {
          logNativePresentationReadinessEvent({
            event: 'native_hidden_source_preapply_contract',
            action: 'covered_confirm_preapplied_hidden_sources',
            instanceId,
            ownerEpoch,
            sourceFrameKey,
            sourceDataKey,
            requestKey: sourceFrameMatchState.requestKey,
            visualCycleKey: sourceFrameMatchState.visualCycleKey,
            readinessKey: sourceFrameMatchState.readinessKey,
            shortcutCoverageRequestKey: sourceFrameMatchState.shortcutCoverageRequestKey,
            residentFrameGenerationId: transportState.residentSource.frameGenerationId,
            residentExecutionBatchId: transportState.residentSource.executionBatchId,
            effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
            retainedResidentSourcePromoted: true,
            pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
            dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
            labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
          });
        }
        if (
          presentationPhase === 'enter_requested' &&
          sourceTransport.effectiveChangedSourceIds.length === 0 &&
          hasSameOwnerResidentOrRestorableNativeVisualSource
        ) {
          logNativePresentationReadinessEvent({
            event: 'native_hidden_source_preapply_contract',
            action: 'enter_uses_preapplied_hidden_sources',
            instanceId,
            ownerEpoch,
            sourceFrameKey,
            requestKey: sourceFrameMatchState.requestKey,
            visualCycleKey: sourceFrameMatchState.visualCycleKey,
            readinessKey: sourceFrameMatchState.readinessKey,
            shortcutCoverageRequestKey: sourceFrameMatchState.shortcutCoverageRequestKey,
            residentFrameGenerationId: transportState.residentSource.frameGenerationId,
            residentExecutionBatchId: transportState.residentSource.executionBatchId,
            retainedResidentSourcePromoted: residentSourceDataMatchesPreparedFrame,
            pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
            dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
            labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
          });
        }
        const sourceSnapshotSyncMode =
          sourceTransport.effectiveChangedSourceIds.length > 0
            ? ('apply' as const)
            : ('presentation_only' as const);
        const sourceTransportBuildDurationMs =
          resolveNativeRenderOwnerPerfNow() - sourceTransportBuildStartedAtMs;
        const sourceTransportDiagnostics = deriveSourceTransportDiagnostics({
          isMoving: viewportState.isMoving,
          sourceTransport,
        });
        const snapshotChanged = sourceTransport.effectiveChangedSourceIds.length > 0;
        const shouldSplitEnterSourcePreapply =
          presentationPhase === 'enter_requested' &&
          preparedSourceFrameReadyForHiddenPreapply &&
          sourceTransport.effectiveChangedSourceIds.length > 0;
        const shouldQueueNativeEnterMountAckFrame =
          nextPresentationState.executionStage === 'enter_pending_mount' &&
          preparedSourceFrameReadyForHiddenPreapply &&
          sourceTransport.effectiveChangedSourceIds.length === 0 &&
          presentationRequestKey != null;
        if (
          nextPresentationState.executionStage === 'enter_pending_mount' &&
          shouldLogSearchNavSwitchDiagnosticLogs()
        ) {
          logger.debug('[REVEAL-LIFECYCLE] native_enter_mount_ack_decision', {
            instanceId,
            ownerEpoch,
            requestKey: presentationRequestKey,
            sourceFrameKey,
            sourceFrameRequestKey: sourceFrameMatchState.requestKey,
            sourceFrameVisualCycleKey: sourceFrameMatchState.visualCycleKey,
            sourceFrameReadinessKey: sourceFrameMatchState.readinessKey,
            preparedSourceFrameReadyForHiddenPreapply,
            shouldQueueNativeEnterMountAckFrame,
            effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
            residentSourceDataMatchesPreparedFrame,
            readySourceFrameRequiresResidentReplace,
            hasSameOwnerResidentOrRestorableNativeVisualSource,
            residentSourceDataKey: transportState.residentSource.sourceDataKey,
            sourceDataKey,
            pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
            dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
            labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
            nextExpectedEvent: shouldQueueNativeEnterMountAckFrame
              ? 'native_frame_flush'
              : preparedSourceFrameReadyForHiddenPreapply
                ? 'source_apply_then_mounted_hidden_ack'
                : 'full_source_snapshot_publish',
          });
        }
        if (
          sourceTransportDiagnostics.shouldLogSummary &&
          shouldLogSearchNavSwitchDiagnosticLogs()
        ) {
          logger.debug('[MAP-CHURN-DIAG] js:renderFrameTransport', {
            instanceId,
            isMoving: viewportState.isMoving,
            isGestureActive: viewportState.isGestureActive,
            batchPhase: presentationTransportDiagnostics.batchPhase,
            effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
            sourceDeltaSummary: sourceTransportDiagnostics.sourceDeltaSummary,
          });
        }
        if (
          lastDesiredFrame &&
          !shouldQueueNativeEnterMountAckFrame &&
          !snapshotChanged &&
          !viewportBoundsChanged &&
          !gestureStateChanged &&
          !movingStateChanged &&
          !presentationChanged &&
          !controlStateChanged
        ) {
          if (
            nextPresentationState.executionStage === 'enter_pending_mount' &&
            shouldLogSearchNavSwitchDiagnosticLogs()
          ) {
            logger.warn('[REVEAL-LIFECYCLE] native_frame_not_queued_no_delta', {
              instanceId,
              requestKey: presentationRequestKey,
              sourceFrameKey,
              sourceFrameRequestKey: sourceFrameMatchState.requestKey,
              sourceFrameVisualCycleKey: sourceFrameMatchState.visualCycleKey,
              sourceFrameReadinessKey: sourceFrameMatchState.readinessKey,
              preparedSourceFrameReadyForHiddenPreapply,
              effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
              snapshotChanged,
              viewportBoundsChanged,
              gestureStateChanged,
              movingStateChanged,
              presentationChanged,
              controlStateChanged,
              nextExpectedEvent: 'native_frame_queue_or_source_delta',
            });
          }
          return;
        }
        const isSameExecutionBatchAsPreviousDesiredFrame =
          presentationSyncState.isSameExecutionBatchAsPreviousState;
        const executionBatchId = deriveExecutionBatchId({
          presentationState: nextPresentationState,
          presentationSyncState,
          lastDesiredExecutionBatchId: transportState.lastDesiredExecutionBatchId,
          snapshotChanged,
          allocateExecutionBatchId: () => `batch:${++transportState.executionBatchSeq}`,
        });
        const nowMs = Date.now();
        const frameAdmission = resolveNativeRenderOwnerFrameAdmission({
          hasPreviousDesiredFrame: lastDesiredFrame != null,
          snapshotChanged,
          viewportBoundsChanged,
          gestureStateChanged,
          movingStateChanged,
          presentationChanged,
          controlStateChanged,
          presentationPhase,
          coverState: nextPresentationState.coverState,
          previousPresentationPhase:
            lastDesiredPresentation == null
              ? null
              : deriveSearchMapRenderPresentationPhase(lastDesiredPresentation),
          isSameExecutionBatchAsPreviousDesiredFrame,
          isMoving: viewportState.isMoving,
          isGestureActive: viewportState.isGestureActive,
          nowMs,
          pressureState: mapMotionPressureController.getState(),
        });
        mapMotionPressureController.applyNormalWorkEffect(frameAdmission.normalWorkEffect, nowMs);
        const frameAdmissionDecision = frameAdmission.decision;
        if (
          !shouldQueueNativeEnterMountAckFrame &&
          (frameAdmissionDecision === 'suppress_redundant_hidden_covered_frame' ||
            frameAdmissionDecision ===
              'suppress_same_execution_batch_viewport_presentation_frame' ||
            frameAdmissionDecision === 'suppress_transaction_presentation_only_frame')
        ) {
          if (
            nextPresentationState.executionStage === 'enter_pending_mount' &&
            shouldLogSearchNavSwitchDiagnosticLogs()
          ) {
            logger.warn('[REVEAL-LIFECYCLE] native_frame_suppressed', {
              instanceId,
              requestKey: presentationRequestKey,
              frameAdmissionDecision,
              sourceFrameKey,
              sourceFrameRequestKey: sourceFrameMatchState.requestKey,
              sourceFrameVisualCycleKey: sourceFrameMatchState.visualCycleKey,
              sourceFrameReadinessKey: sourceFrameMatchState.readinessKey,
              preparedSourceFrameReadyForHiddenPreapply,
              effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
              nextExpectedEvent: 'native_frame_queue',
            });
          }
          transportState.lastDesiredExecutionBatchId = executionBatchId;
          transportState.lastDesiredFrame = effectiveFrame;
          return;
        }
        if (
          !shouldQueueNativeEnterMountAckFrame &&
          frameAdmissionDecision === 'suppress_viewport_only_frame'
        ) {
          if (
            nextPresentationState.executionStage === 'enter_pending_mount' &&
            shouldLogSearchNavSwitchDiagnosticLogs()
          ) {
            logger.warn('[REVEAL-LIFECYCLE] native_frame_suppressed', {
              instanceId,
              requestKey: presentationRequestKey,
              frameAdmissionDecision,
              sourceFrameKey,
              sourceFrameRequestKey: sourceFrameMatchState.requestKey,
              sourceFrameVisualCycleKey: sourceFrameMatchState.visualCycleKey,
              sourceFrameReadinessKey: sourceFrameMatchState.readinessKey,
              preparedSourceFrameReadyForHiddenPreapply,
              effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
              nextExpectedEvent: 'native_frame_queue',
            });
          }
          transportState.lastDesiredExecutionBatchId = executionBatchId;
          transportState.lastDesiredFrame = effectiveFrame;
          return;
        }
        if (shouldSplitEnterSourcePreapply) {
          const hiddenPreapplyPresentationState: SearchMapRenderPresentationState = {
            ...nextPresentationState,
            executionBatch: null,
            executionStage: 'enter_pending_mount',
            startToken: null,
          };
          const hiddenPreapplyFrame: SearchMapRenderFrame = {
            ...effectiveFrame,
            presentation: hiddenPreapplyPresentationState,
          };
          transportState.frameGenerationSeq += 1;
          const hiddenFrameGenerationId = `frame:${transportState.frameGenerationSeq}`;
          rememberSearchMapNativeFrameVisualSourceCounts({
            instanceId,
            frameGenerationId: hiddenFrameGenerationId,
            executionBatchId,
            counts: {
              pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
              dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
              labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
            },
          });
          logNativePresentationReadinessEvent({
            event: 'native_hidden_source_preapply_contract',
            action: 'enter_preapply_hidden_sources_before_reveal',
            instanceId,
            ownerEpoch,
            sourceFrameKey,
            requestKey: sourceFrameMatchState.requestKey,
            visualCycleKey: sourceFrameMatchState.visualCycleKey,
            readinessKey: sourceFrameMatchState.readinessKey,
            shortcutCoverageRequestKey: sourceFrameMatchState.shortcutCoverageRequestKey,
            effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
            pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
            dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
            labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
          });
          queueLatestNativeRenderOwnerFrameForTransport(transportState, {
            ownerEpoch,
            frameGenerationId: hiddenFrameGenerationId,
            executionBatchId,
            frame: hiddenPreapplyFrame,
            snapshot: effectiveSourceSnapshot,
            sourceTransport,
            sourceSnapshotSyncMode: 'apply',
            sourceFrameKey,
            sourceDataKey,
            sourceFrameMatchState,
            didConsumeDeferredCoveredSourceFrame: false,
            residentSourceReuse,
            sourceTransportBuildDurationMs,
          });
          flushLatestDesiredFrame();

          transportState.frameGenerationSeq += 1;
          const enterFrameGenerationId = `frame:${transportState.frameGenerationSeq}`;
          rememberSearchMapNativeFrameVisualSourceCounts({
            instanceId,
            frameGenerationId: enterFrameGenerationId,
            executionBatchId,
            counts: {
              pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
              dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
              labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
            },
          });
          logNativePresentationReadinessEvent({
            event: 'native_hidden_source_preapply_contract',
            action: 'enter_queued_after_hidden_source_preapply',
            instanceId,
            ownerEpoch,
            sourceFrameKey,
            requestKey: sourceFrameMatchState.requestKey,
            visualCycleKey: sourceFrameMatchState.visualCycleKey,
            readinessKey: sourceFrameMatchState.readinessKey,
            shortcutCoverageRequestKey: sourceFrameMatchState.shortcutCoverageRequestKey,
            residentFrameGenerationId: hiddenFrameGenerationId,
            residentExecutionBatchId: executionBatchId,
            pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
            dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
            labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
          });
          transportState.lastDesiredExecutionBatchId = executionBatchId;
          transportState.lastDesiredFrame = effectiveFrame;
          transportState.lastDesiredFrameGenerationId = enterFrameGenerationId;
          queueLatestNativeRenderOwnerFrameForTransport(transportState, {
            ownerEpoch,
            frameGenerationId: enterFrameGenerationId,
            executionBatchId,
            frame: effectiveFrame,
            snapshot: effectiveSourceSnapshot,
            sourceTransport: PRESENTATION_ONLY_SEARCH_MAP_RENDER_SOURCE_TRANSPORT,
            sourceSnapshotSyncMode: 'presentation_only',
            sourceFrameKey,
            sourceDataKey,
            sourceFrameMatchState,
            didConsumeDeferredCoveredSourceFrame: false,
            residentSourceReuse: true,
            sourceTransportBuildDurationMs: 0,
          });
          flushLatestDesiredFrame();
          return;
        }
        transportState.frameGenerationSeq += 1;
        const frameGenerationId = `frame:${transportState.frameGenerationSeq}`;
        rememberSearchMapNativeFrameVisualSourceCounts({
          instanceId,
          frameGenerationId,
          executionBatchId,
          counts: {
            pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
            dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
            labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
          },
        });
        const previousDesiredFrameGenerationId = transportState.lastDesiredFrameGenerationId;
        if (
          isSameExecutionBatchAsPreviousDesiredFrame &&
          previousDesiredFrameGenerationId != null &&
          previousDesiredFrameGenerationId !== frameGenerationId &&
          (snapshotChanged ||
            viewportBoundsChanged ||
            gestureStateChanged ||
            movingStateChanged ||
            presentationChanged ||
            controlStateChanged)
        ) {
          if (shouldLogSearchNavSwitchDiagnosticLogs()) {
            logger.debug('[PRESENTATION-LANE-DIAG] revealFrameGenerationChurn', {
              instanceId,
              requestKey: presentationTransportDiagnostics.requestKey,
              executionBatchId,
              batchPhase: presentationTransportDiagnostics.batchPhase,
              previousFrameGenerationId: previousDesiredFrameGenerationId,
              nextFrameGenerationId: frameGenerationId,
              snapshotChanged,
              presentationChanged,
              controlStateChanged,
              viewportBoundsChanged,
              gestureStateChanged,
              movingStateChanged,
              effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
            });
          }
        }
        if (shouldLogSearchNavSwitchDiagnosticLogs()) {
          logger.debug('[MAP-VIS-DIAG] native:renderFrameQueued', {
            instanceId,
            frameGenerationId,
            executionBatchId,
            presentationPhase,
            residentSourceReuse,
            hasLastAppliedFrame: transportState.lastAppliedFrame != null,
            hasLastDesiredFrame: lastDesiredFrame != null,
            sourceSnapshotSyncMode,
            sourceFrameKey,
            sourceFrameRequestKey: sourceFrameMatchState.requestKey,
            sourceFrameVisualCycleKey: sourceFrameMatchState.visualCycleKey,
            sourceFrameReadinessKey: sourceFrameMatchState.readinessKey,
            sourceDataKey,
            hasSameOwnerResidentOrRestorableNativeVisualSource,
            retainedResidentSourcePromoted: residentSourceDataMatchesPreparedFrame,
            nativeEnterMountAckFrame: shouldQueueNativeEnterMountAckFrame,
            residentSourceOwnerEpoch: transportState.residentSource.ownerEpoch,
            residentSourceFrameGenerationId: transportState.residentSource.frameGenerationId,
            didPreapplyHiddenSourcesDuringCovered:
              presentationPhase === 'covered' &&
              sourceTransport.effectiveChangedSourceIds.length > 0,
            effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
          });
          if (
            nextPresentationState.executionStage === 'enter_pending_mount' ||
            shouldQueueNativeEnterMountAckFrame
          ) {
            logger.debug('[REVEAL-LIFECYCLE] native_frame_queued', {
              instanceId,
              frameGenerationId,
              executionBatchId,
              requestKey: presentationRequestKey,
              presentationPhase,
              sourceSnapshotSyncMode,
              sourceFrameKey,
              sourceFrameRequestKey: sourceFrameMatchState.requestKey,
              sourceFrameVisualCycleKey: sourceFrameMatchState.visualCycleKey,
              sourceFrameReadinessKey: sourceFrameMatchState.readinessKey,
              nativeEnterMountAckFrame: shouldQueueNativeEnterMountAckFrame,
              residentSourceReuse,
              effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
              pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
              dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
              labelCount: effectiveSourceSnapshot.labels.idsInOrder.length,
              nextExpectedEvent: 'presentation_execution_batch_mounted_hidden',
            });
          }
        }
        transportState.lastDesiredExecutionBatchId = executionBatchId;
        transportState.lastDesiredFrame = effectiveFrame;
        transportState.lastDesiredFrameGenerationId = frameGenerationId;
        queueLatestNativeRenderOwnerFrameForTransport(transportState, {
          ownerEpoch,
          frameGenerationId,
          executionBatchId,
          frame: effectiveFrame,
          snapshot: effectiveSourceSnapshot,
          sourceTransport,
          sourceSnapshotSyncMode,
          sourceFrameKey,
          sourceDataKey,
          sourceFrameMatchState,
          didConsumeDeferredCoveredSourceFrame: false,
          residentSourceReuse,
          sourceTransportBuildDurationMs,
        });
        flushLatestDesiredFrame();
      }
    );
  }, [
    buildSourceSnapshot,
    flushLatestDesiredFrame,
    getCurrentPresentationState,
    highlightedMarkerKey,
    highlightedMarkerKeys,
    isAttached,
    isRenderFrameSyncReady,
    isNativeAvailable,
    ownerEpoch,
    dots,
    dotInteractions,
    interactionMode,
    labelCollisions,
    labelInteractions,
    labels,
    pinInteractions,
    pins,
    mapMotionPressureController,
    viewportState,
  ]);
  const queueNativeRenderOwnerFrameRef = React.useRef(queueNativeRenderOwnerFrame);

  React.useEffect(() => {
    queueNativeRenderOwnerFrameRef.current = queueNativeRenderOwnerFrame;
  }, [queueNativeRenderOwnerFrame]);

  React.useEffect(() => {
    queueNativeRenderOwnerFrame();
  }, [queueNativeRenderOwnerFrame, selectedRestaurantId]);

  React.useEffect(
    () =>
      resultsPresentationAuthority.subscribe(
        () => {
          queueNativeRenderOwnerFrameRef.current();
        },
        ['resultsPresentationTransport'] as const,
        'search_map_native_render_owner_presentation'
      ),
    [resultsPresentationAuthority]
  );

  React.useEffect(() => {
    if (sourceFramePort == null) {
      return undefined;
    }
    return sourceFramePort.subscribe(
      () => {
        queueNativeRenderOwnerFrameRef.current();
      },
      [
        'visualCycleKey',
        'selectedRestaurantId',
        'pinSourceStore',
        'dotSourceStore',
        'pinInteractionSourceStore',
        'dotInteractionSourceStore',
        'labelSourceStore',
        'labelCollisionSourceStore',
        'labelDerivedSourceIdentityKey',
        'markersRenderKey',
      ] as const,
      'search_map_native_render_owner_source_frame'
    );
  }, [sourceFramePort]);
};

export const useSearchMapNativeRenderOwner = (
  args: SearchMapNativeRenderOwnerArgs
): SearchMapNativeRenderOwnerStatusResult => {
  const {
    mapMotionPressureController,
    pins,
    pinInteractions,
    dots,
    dotInteractions,
    labels,
    labelInteractions,
    labelCollisions,
    sourceFramePort,
    viewportState,
    interactionMode,
    onSyncError,
    isRenderFrameSyncReady,
    ...statusArgs
  } = args;

  const status = useSearchMapNativeRenderOwnerStatus({
    ...statusArgs,
    sourceFramePort,
  });

  useSearchMapNativeRenderOwnerSync({
    mapMotionPressureController,
    instanceId: status.instanceId,
    isAttached: status.isAttached,
    ownerEpoch: status.ownerEpoch,
    isRenderFrameSyncReady,
    isNativeAvailable: status.isNativeAvailable,
    pins,
    pinInteractions,
    dots,
    dotInteractions,
    labels,
    labelInteractions,
    labelCollisions,
    sourceFramePort,
    viewportState,
    resultsPresentationAuthority: statusArgs.resultsPresentationAuthority,
    selectedRestaurantId: statusArgs.selectedRestaurantId,
    highlightedMarkerKey: args.highlightedMarkerKey,
    highlightedMarkerKeys: args.highlightedMarkerKeys,
    interactionMode,
    onSyncError: onSyncError ?? status.reportNativeFatalError,
  });

  return status;
};
