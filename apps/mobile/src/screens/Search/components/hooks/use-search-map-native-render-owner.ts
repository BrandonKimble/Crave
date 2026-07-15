import React from 'react';
import { offerTransitionJoinInput } from '../../../../navigation/runtime/transition-engine/transition-transaction';
import { readCurrentResidentWorldEntry } from '../../../../navigation/runtime/resident-world-read-registry';
import {
  isSearchPresentationAtFloor,
  subscribeSearchPresentationFloor,
} from '../../runtime/map/search-presentation-floor-signal';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type { MapBounds } from '../../../../types';
import { withSearchNavSwitchRuntimeAttribution } from '../../runtime/shared/search-nav-switch-runtime-attribution';
import { resolvePresentationLanePolicy } from '../../runtime/shared/presentation-lane-policy';
import { reportSearchFlowContractViolation } from '../../runtime/shared/search-flow-contracts';
import {
  notifySearchPresentationFloorLeft,
  notifySearchPresentationFloorReached,
} from '../../runtime/map/search-presentation-floor-signal';
import { logger } from '../../../../utils';
import {
  areSearchMapRenderPresentationStatesEqual,
  deriveSearchMapRenderPresentationPhase,
  deriveSearchMapRenderPresentationRequestKey,
  searchMapRenderController,
  type SearchMapRenderControllerEvent,
  type SearchMapRenderControllerSetRenderFrameResult,
  type SearchMapRenderInteractionMode,
  type SearchMapRenderPresentationState,
  type SearchMapVisualFrameSourceAdmissionOutcome,
  type SearchMapVisualFrameSourceSnapshotKind,
  type SearchMapVisualFrameTransaction,
  type SearchMapVisualFrameTransactionKind,
} from '../../runtime/map/search-map-render-controller';
import {
  hasActiveProtectedPresentationTransaction,
  shouldAdmitMapPlannerFairnessWork,
  type MapMotionPressureController,
  type MotionPressureState,
} from '../../runtime/map/map-motion-pressure';
import { EMPTY_SEARCH_MAP_SOURCE_STORE } from '../../runtime/map/search-map-source-store';
import { getSearchSurfaceRuntime } from '../../runtime/surface/search-surface-runtime';
import {
  buildLabelSourceFeatureDiffKey,
  buildStableCollisionFeature,
} from '../../hooks/use-direct-search-map-source-controller';
import type { RestaurantFeatureProperties } from '../search-map';
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
  labelCollisionSourceId: string;
  sourceFramePort?: SearchMapSourceFramePort | null;
  onExecutionBatchMountedHidden?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    readyAtMs: number;
    // S-0 (lens-transport plan §7.12): the DATA identity the mounted frame carried vs
    // the data identity currently desired — lets the reveal gate reject a stale
    // (preview) mount so the cover lifts only on the world it will actually show.
    mountedSourceDataKey: string | null;
    desiredSourceDataKey: string | null;
  }) => void;
  onMarkerEnterStarted?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    pinCount?: number;
    dotCount?: number;
    startedAtMs: number;
  }) => void;
  onMarkerEnterSettled?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    pinCount?: number;
    dotCount?: number;
    settledAtMs: number;
  }) => void;
  // UNIFIED-FADE TOGGLE (map-LOD-v6): deterministic toggle cover-lift signal (latest-wins).
  onToggleSettled?: (payload: {
    requestKey: string | null;
    overlayTileCount: number;
    promotedCount: number;
    degraded: boolean;
    settledAtMs: number;
  }) => void;
  onMarkerExitStarted?: (payload: {
    requestKey: string;
    pinCount?: number;
    dotCount?: number;
    startedAtMs: number;
  }) => void;
  onMarkerExitSettled?: (payload: {
    requestKey: string;
    pinCount?: number;
    dotCount?: number;
    settledAtMs: number;
  }) => void;
  onRecoveredAfterStyleReload?: (payload: { recoveredAtMs: number }) => void;
  onViewportChanged?: (payload: {
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number;
    bounds: {
      northEast: { lat: number; lng: number };
      southWest: { lat: number; lng: number };
    };
    isGestureActive: boolean;
    isMoving: boolean;
  }) => void;
};

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

const SEARCH_MAP_RENDER_SOURCE_IDS: SearchMapRenderSourceId[] = [
  'pins',
  'pinInteractions',
  'dots',
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

type SearchMapRenderSourceId = 'pins' | 'pinInteractions' | 'dots' | 'labelCollisions';

type SearchMapRenderSnapshot = {
  pins: SearchMapSourceStore;
  pinInteractions: SearchMapSourceStore;
  dots: SearchMapSourceStore;
  labelCollisions: SearchMapSourceStore;
};

const PRESENTATION_ONLY_SEARCH_MAP_RENDER_SOURCE_TRANSPORT: SearchMapRenderSourceTransportPayload =
  Object.freeze({
    effectiveChangedSourceIds: [],
  });

type SearchMapRenderVisualSourceCounts = {
  pinCount: number;
  dotCount: number;
};

const searchMapNativeFrameVisualSourceCountsByKey = new Map<
  string,
  SearchMapRenderVisualSourceCounts
>();

// Upper bound on retained frame:/batch: count entries (two keys per admitted frame).
// Oldest entries are evicted past this cap so the cache stays bounded across long
// live sessions that never dismiss/unmount.
const SEARCH_MAP_NATIVE_FRAME_VISUAL_SOURCE_COUNTS_CAP = 256;

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
  // Bound the cache so a long live session without a dismiss/unmount (which is the
  // only other thing that purges via forget*) cannot grow it unbounded. Map preserves
  // insertion order, so evicting from the front drops the oldest frame:/batch: keys;
  // the consumer only ever looks up the most-recent keys, which stay within the cap.
  while (
    searchMapNativeFrameVisualSourceCountsByKey.size >
    SEARCH_MAP_NATIVE_FRAME_VISUAL_SOURCE_COUNTS_CAP
  ) {
    const oldestKey = searchMapNativeFrameVisualSourceCountsByKey.keys().next().value;
    if (oldestKey == null) {
      break;
    }
    searchMapNativeFrameVisualSourceCountsByKey.delete(oldestKey);
  }
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
  snapshot.pins.idsInOrder.length === 0 && snapshot.dots.idsInOrder.length === 0;

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
  // Patch-baseline proof (lens-transport contract 3): the journal revision this delta
  // was computed AGAINST and the revision it produces. Native verifies base against its
  // last-applied revision and loudly rejects a mismatched patch — a diverged baseline
  // must fail at the divergence, never corrupt silently.
  baseSourceRevision?: string;
  nextSourceRevision?: string;
};

type SearchMapMarkerRoleKind = 'pin' | 'dot';

type SearchMapMarkerRoleRow = {
  markerKey: string;
  role: SearchMapMarkerRoleKind;
  slotIndex: number | null;
  pinFeature?: SearchMapSourceTransportFeature;
  pinInteractionFeature?: SearchMapSourceTransportFeature;
  dotFeature?: SearchMapSourceTransportFeature;
  labelCollisionFeature?: SearchMapSourceTransportFeature;
};

type SearchMapMarkerRoleFrame = {
  mode: 'patch' | 'replace';
  nextPinnedMarkerKeysInOrder: string[];
  nextDotMarkerKeysInOrder: string[];
  residentDotMarkerKeysInOrder: string[];
  dirtyMarkerKeys: string[];
  removedMarkerKeys: string[];
  upsertRoles: SearchMapMarkerRoleRow[];
};

type SearchMapRenderDerivedFamilyRevisions = {
  baseSourceRevision: string | null;
  nextSourceRevision: string;
};

type SearchMapRenderDerivedFamilyTransport = {
  pinInteractions: {
    diffKeyByFeatureId: Record<string, string>;
  } & SearchMapRenderDerivedFamilyRevisions;
  dots: {
    diffKeyByFeatureId: Record<string, string>;
    dotImageIdByFeatureId: Record<string, string>;
    nativeDotOpacityByFeatureId: Record<string, number>;
  } & SearchMapRenderDerivedFamilyRevisions;
  labelCollisions: {
    diffKeyByFeatureId: Record<string, string>;
  } & SearchMapRenderDerivedFamilyRevisions;
};

type SearchMapRenderSourceTransportPayload = {
  effectiveChangedSourceIds: SearchMapRenderSourceId[];
  sourceDeltas?: SearchMapRenderSourceDelta[];
  derivedFamilyTransport?: SearchMapRenderDerivedFamilyTransport;
  markerRoleFrame?: SearchMapMarkerRoleFrame;
};

type NativeRenderOwnerFrameAttribution = {
  frameAdmissionDecision: string;
  normalWorkEffect: string;
  sourceBaselineKind: 'replace_all' | 'ack_delta';
  snapshotChanged: boolean;
  viewportBoundsChanged: boolean;
  gestureStateChanged: boolean;
  movingStateChanged: boolean;
  presentationChanged: boolean;
  controlStateChanged: boolean;
  isMoving: boolean;
  isGestureActive: boolean;
  shouldQueueNativeEnterMountAckFrame: boolean;
  nominalChangedSourceIds: SearchMapRenderSourceId[];
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

// S-0 (lens-transport plan §7.12): per-frame data-identity ledger. Records which
// sourceDataKey each submitted frameGenerationId carried (bounded), plus the latest
// DESIRED data key per instance, so the mounted_hidden handler can distinguish a stale
// preview mount from the world the reveal intends to show. Module-level: the frame
// submit path and the native event dispatcher live in different hooks.
const frameSourceDataKeyByGeneration = new Map<string, string>();
const latestDesiredSourceDataKeyByInstance = new Map<string, string>();
// frameGenerationIds are PER-INSTANCE sequences (frame:N) — key the ledger by
// instance too, or two live map instances cross-contaminate the reveal gate
// (red team 2026-07-12).
const frameSourceDataKeyLedgerKey = (instanceId: string, frameGenerationId: string): string =>
  `${instanceId}|${frameGenerationId}`;
const recordFrameSourceDataKey = (
  instanceId: string,
  frameGenerationId: string,
  sourceDataKey: string
): void => {
  frameSourceDataKeyByGeneration.set(
    frameSourceDataKeyLedgerKey(instanceId, frameGenerationId),
    sourceDataKey
  );
  if (frameSourceDataKeyByGeneration.size > 32) {
    const oldestKey = frameSourceDataKeyByGeneration.keys().next().value;
    if (oldestKey != null) {
      frameSourceDataKeyByGeneration.delete(oldestKey);
    }
  }
};

const serializeSearchMapNativeSourceDataKey = (
  state: SearchMapNativeSourceFrameMatchState
): string =>
  [
    state.shortcutCoverageRequestKey ?? 'coverage:none',
    state.markersRenderKey ?? 'markers:none',
  ].join('|');

const deriveSearchMapVisualFrameSourceSnapshotKind = ({
  sourceFrameSnapshot,
  preparedSourceSnapshot,
}: {
  sourceFrameSnapshot: SearchMapSourceFrameSnapshot | null;
  preparedSourceSnapshot: SearchMapRenderSnapshot;
}): SearchMapVisualFrameSourceSnapshotKind => {
  if (isSearchMapRenderVisualSnapshotEmpty(preparedSourceSnapshot)) {
    return 'empty';
  }
  return sourceFrameSnapshot?.mapSearchSurfaceResultsSourcesReady === true ? 'ready' : 'pending';
};

const deriveSearchMapVisualFrameTransactionKind = ({
  presentationPhase,
  presentationState,
  isInitialNativeFrame,
}: {
  presentationPhase: SearchRuntimeMapPresentationPhase;
  presentationState: SearchMapRenderPresentationState;
  isInitialNativeFrame: boolean;
}): SearchMapVisualFrameTransactionKind => {
  if (presentationState.snapshotKind === 'results_exit') {
    return 'dismiss';
  }
  if (presentationPhase === 'covered') {
    return 'hidden_preload';
  }
  if (presentationPhase === 'enter_requested' || presentationPhase === 'entering') {
    return 'enter';
  }
  if (presentationPhase === 'live') {
    return 'live_update';
  }
  if (presentationState.coverState === 'hidden') {
    return 'clear_hidden';
  }
  return isInitialNativeFrame ? 'bootstrap' : 'live_update';
};

const buildSearchMapVisualFrameTransaction = ({
  kind,
  presentationPhase,
  sourceFrameKey,
  sourceDataKey,
  sourceSnapshotKind,
}: {
  kind: SearchMapVisualFrameTransactionKind;
  presentationPhase: SearchRuntimeMapPresentationPhase;
  sourceFrameKey: string;
  sourceDataKey: string;
  sourceSnapshotKind: SearchMapVisualFrameSourceSnapshotKind;
}): SearchMapVisualFrameTransaction => ({
  kind,
  presentationPhase,
  sourceFrameKey,
  sourceDataKey,
  sourceSnapshotKind,
});

const areSearchMapRenderSourceRevisionStatesEqual = (
  left: SearchMapRenderSourceRevisionState | null | undefined,
  right: SearchMapRenderSourceRevisionState | null | undefined
): boolean =>
  left != null &&
  right != null &&
  left.pins === right.pins &&
  left.pinInteractions === right.pinInteractions &&
  left.dots === right.dots &&
  left.labelCollisions === right.labelCollisions;

const doesNativeSourceAdmissionOutcomePublishResidentSnapshot = (
  outcome: SearchMapVisualFrameSourceAdmissionOutcome
): boolean =>
  outcome === 'sources_applied_hidden' ||
  outcome === 'sources_applied_visible' ||
  outcome === 'sources_reused_resident';

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
  presentationPhase === 'exiting' ||
  // T3 (toggle-strip primitive): 'interaction' natively DRIVES opacity — it starts the
  // press-up fade-out ramp. Suppressing a presentation-only interaction frame silently
  // killed the entire toggle fade choreography (the level never reached native; the
  // floor ack never came). Type-list disease: the phase vocabulary grew, this list
  // didn't.
  presentationPhase === 'interaction';

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
  // Single source of truth for protected-transaction + fairness (8 coalesced / 240ms wait)
  // lives in map-motion-pressure.ts — reuse it here instead of re-implementing the literals.
  const hasProtectedPresentationTransaction =
    hasActiveProtectedPresentationTransaction(pressureState);
  const shouldAdmitFairnessWork = shouldAdmitMapPlannerFairnessWork({
    state: pressureState,
    nowMs,
  });

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
    presentationChanged &&
    (isNativeVisiblePresentationPhase(presentationPhase) ||
      // The EXIT edge of an opacity-driving level matters as much as the entry: the
      // interaction level returning to 'live' (failed/cancelled commit) is what makes
      // native restore the map ramp — suppressing it strands the map dark.
      previousPresentationPhase === 'interaction');

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
  // D6e collision surgery: monotonic per-queue revision. The transport dedup keys on THIS, not
  // on frameGenerationId — generation REUSE (a presentation/control-only frame riding an
  // already-acked generation) is now the norm for toggles, and a generation-keyed dedup dropped
  // exactly those frames (the `entering` presentation state never reached native → the toggle
  // reveal stalled at pending_mount). Every queued frame passed the something-changed admission
  // guard, so a higher revision is by construction new content for native.
  frameTransportRevision: number;
};

type NativeRenderOwnerSourceAck = {
  frameGenerationId: string;
  executionBatchId: string | null;
  sourceAdmissionOutcome: SearchMapVisualFrameSourceAdmissionOutcome;
  sourceFrameKey: string | null;
  sourceDataKey: string | null;
  sourceRevisions: SearchMapRenderSourceRevisionState;
};

// Cluster 2 (reveal/dismiss plan) — single-slot queue + presentation-only frames.
//
// Every native frame (structural AND presentation/control-only) rides this one queue
// through a single in-flight slot: `takeNextNativeRenderOwnerFrameForTransport` returns
// null while `syncInFlight` is true, so a presentation-only frame queued behind a
// structural frame becomes `pendingFrame` and waits for the structural frame's ack.
//
// This does NOT cause head-of-line contention in practice, because the slot is held for a
// single SYNCHRONOUS native main-thread turn — there is no async paint handshake.
// SearchMapRenderController.swift `setRenderFrame` does all its apply work inside one
// `DispatchQueue.main.async` block and emits `render_frame_synced` synchronously inside
// that same block (before the promise resolves). The ack handler then flushes the pending
// presentation-only frame immediately. So a presentation frame waits at most one bridge
// round-trip, and the queue coalesces to a single `pendingFrame` (no multi-frame stall).
//
// Combined with the two structural-cost removals — fix #2 (presentation-opacity sweep
// restricted to the on-screen set) and af0c415e (native enter skips applySnapshot on a
// resident+unchanged re-reveal) — the structural frame that briefly holds the slot is also
// cheap. And a presentation-only frame (sourceDeltaCount === 0) skips applySnapshot
// entirely natively. Cluster 2's intent (no structural COST on presentation-only frames) is
// therefore satisfied even though these frames nominally route through setRenderFrame; a
// dedicated fire-and-forget presentation lane would add sequencing risk for no measurable
// gain. See also the `isStructuralApplyLaneLeak` note in flushLatestDesiredFrame.
type MapRenderFrameTransportQueueState<TFrame extends MapRenderFrameTransportQueueFrame> = {
  inFlightFrame: TFrame | null;
  pendingFrame: TFrame | null;
  syncInFlight: boolean;
};

type NativeRenderOwnerTransportState<TFrame extends MapRenderFrameTransportQueueFrame> = {
  lastDesiredFrame: SearchMapRenderFrame | null;
  lastDesiredSnapshot: SearchMapRenderSnapshot | null;
  lastDesiredFrameGenerationId: string | null;
  lastNativeAckSnapshot: SearchMapRenderSnapshot | null;
  lastNativeAck: NativeRenderOwnerSourceAck | null;
  queueState: MapRenderFrameTransportQueueState<TFrame>;
  frameGenerationSeq: number;
  executionBatchSeq: number;
  frameTransportRevisionSeq: number;
  lastAckedFrameTransportRevision: number;
  lastDesiredExecutionBatchId: string | null;
};

const createNativeRenderOwnerTransportState = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>(): NativeRenderOwnerTransportState<TFrame> => ({
  lastDesiredFrame: null,
  lastDesiredSnapshot: null,
  lastDesiredFrameGenerationId: null,
  lastNativeAckSnapshot: null,
  lastNativeAck: null,
  queueState: {
    inFlightFrame: null,
    pendingFrame: null,
    syncInFlight: false,
  },
  frameGenerationSeq: 0,
  executionBatchSeq: 0,
  frameTransportRevisionSeq: 0,
  lastAckedFrameTransportRevision: 0,
  lastDesiredExecutionBatchId: null,
});

const markNativeRenderOwnerVisualSourcesNotResident = <
  TFrame extends MapRenderFrameTransportQueueFrame,
>(
  state: NativeRenderOwnerTransportState<TFrame>
): void => {
  state.lastNativeAck = null;
  state.lastNativeAckSnapshot = null;
  // Revision dedup mirrors the lastNativeAck lifecycle: once native's resident state is no
  // longer trusted, any staged frame must be re-sendable.
  state.lastAckedFrameTransportRevision = 0;
};

const resetNativeRenderOwnerTransportState = <TFrame extends MapRenderFrameTransportQueueFrame>({
  state,
  resetDesiredExecutionBatchId = false,
}: {
  state: NativeRenderOwnerTransportState<TFrame>;
  resetDesiredExecutionBatchId?: boolean;
}): void => {
  state.lastDesiredFrame = null;
  state.lastDesiredSnapshot = null;
  state.lastDesiredFrameGenerationId = null;
  state.lastNativeAckSnapshot = null;
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
  const { queueState } = transportState;
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

  // D6e collision surgery: dedup on the per-queue revision, NOT the frame generation — see
  // MapRenderFrameTransportQueueFrame.frameTransportRevision.
  if (pendingFrame.frameTransportRevision <= transportState.lastAckedFrameTransportRevision) {
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
  const inFlightFrame = transportState.queueState.inFlightFrame;
  if (inFlightFrame?.frameGenerationId !== frameGenerationId) {
    return;
  }
  transportState.lastAckedFrameTransportRevision = Math.max(
    transportState.lastAckedFrameTransportRevision,
    inFlightFrame.frameTransportRevision
  );
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
  labelCollisions: resolveSearchMapSourceStore(snapshot.labelCollisions).sourceRevision,
});

const toRenderSourceDelta = (
  sourceId: SearchMapRenderSourceId,
  delta: SearchMapSourceStoreDelta,
  revisions?: { baseSourceRevision: string | null; nextSourceRevision: string }
): SearchMapRenderSourceDelta => ({
  sourceId,
  mode: delta.mode,
  ...(revisions?.baseSourceRevision != null && delta.mode === 'patch'
    ? { baseSourceRevision: revisions.baseSourceRevision }
    : {}),
  ...(revisions ? { nextSourceRevision: revisions.nextSourceRevision } : {}),
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
  // CHAIN PROOF (2026-07-12, the "Source delta missing feature" native rejection): a
  // replay is only valid if the journal chain is CONTIGUOUS from the acknowledged base
  // AND terminates at the store's CURRENT revision. A gap (e.g. an un-journaled
  // replace-mode commit mid-history) means the union of upserts misses features
  // introduced inside the gap while `nextFeatureIdsInOrder` still lists them — native
  // then rejects the whole frame. When the chain can't PROVE continuity, return null so
  // the caller falls back to the always-correct full replace.
  let expectedBaseRevision = baseSourceRevision;
  for (const journal of replayJournals) {
    if (journal.baseSourceRevision !== expectedBaseRevision) {
      return null;
    }
    expectedBaseRevision = journal.sourceRevision;
  }
  if (expectedBaseRevision !== nextSourceStore.sourceRevision) {
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

  const upsertFeatures: SearchMapSourceTransportFeature[] = [];
  for (const featureId of upsertFeatureIds) {
    const transportFeature = nextSourceStore.transportFeatureById.get(featureId);
    if (transportFeature != null) {
      upsertFeatures.push(transportFeature);
      continue;
    }
    // A journaled upsert whose transport feature no longer resolves is only legal when
    // the feature is GONE from the current order (removed later in the chain). If it is
    // still listed, the patch would under-ship it and native would reject the whole
    // frame ("Source delta missing feature") — the replay cannot prove completeness, so
    // fall back to the always-correct full replace.
    if (nextSourceStore.idsInOrder.includes(featureId)) {
      return null;
    }
  }

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
  nextSourceStore: SearchMapSourceStore,
  acknowledgedResidentIds: ReadonlySet<string> | null
): SearchMapRenderSourceDelta | null => {
  if (acknowledgedSourceRevision === nextSourceStore.sourceRevision) {
    return null;
  }
  const committedDeltaJournal: SearchMapCommittedSourceDeltaJournal | null =
    nextSourceStore.committedDeltaJournal;
  let delta =
    acknowledgedSourceRevision == null
      ? nextSourceStore.buildReplaceDelta()
      : committedDeltaJournal?.baseSourceRevision === acknowledgedSourceRevision
        ? committedDeltaJournal.delta
        : (buildReplayJournalDelta(acknowledgedSourceRevision, nextSourceStore) ??
          nextSourceStore.buildReplaceDelta());
  // UPSERT-COMPLETENESS PROOF (lens-transport contract 3, root-caused 2026-07-12): a
  // patch asserts every next id it does not upsert is ALREADY resident natively. Prove
  // it against the acked snapshot's membership — a journal/replay composition that
  // dropped an add otherwise applies silently-wrong (removes of absent ids no-op) and
  // explodes frames later as "missing feature". Unprovable → replace, loudly.
  if (delta != null && delta.mode === 'patch') {
    const upsertIds = new Set((delta.upsertFeatures ?? []).map((feature) => feature.id));
    const unprovableAssumedResidentId = delta.nextFeatureIdsInOrder.find(
      (featureId) =>
        !upsertIds.has(featureId) &&
        (acknowledgedResidentIds == null || !acknowledgedResidentIds.has(featureId))
    );
    if (unprovableAssumedResidentId != null) {
      reportSearchFlowContractViolation('map_patch_unprovable_assumed_resident', {
        sourceId,
        featureId: unprovableAssumedResidentId,
        acknowledgedSourceRevision,
        nextSourceRevision: nextSourceStore.sourceRevision,
        ackedResidentCount: acknowledgedResidentIds?.size ?? null,
      });
      delta = nextSourceStore.buildReplaceDelta();
    }
  }
  return delta
    ? toRenderSourceDelta(sourceId, delta, {
        baseSourceRevision: delta.mode === 'patch' ? acknowledgedSourceRevision : null,
        nextSourceRevision: nextSourceStore.sourceRevision,
      })
    : null;
};

// Lens transport S-1b (plans/map-world-lens-transport.md §7.2): the three derived
// families never cross the bridge as features — native synthesizes them from the pins
// delta. JS ships only per-feature diffKeys (opaque equality tokens that must match
// what the JS stores hold — replicating their derivation in Swift is a float-format
// trap) plus the dot extras (sprite id + role opacity) that are JS-computed.
const buildDerivedFamilyTransportForPinsDelta = (
  pinsDelta: SearchMapRenderSourceDelta,
  derivedDeltasBySourceId: Partial<
    Record<SearchMapRenderSourceId, SearchMapRenderSourceDelta | null>
  >,
  nextSnapshot: SearchMapRenderSnapshot
): SearchMapRenderDerivedFamilyTransport => {
  const pinInteractionDiffKeys: Record<string, string> = {};
  const dotDiffKeys: Record<string, string> = {};
  const dotImageIdByFeatureId: Record<string, string> = {};
  const nativeDotOpacityByFeatureId: Record<string, number> = {};
  const collisionDiffKeys: Record<string, string> = {};
  const diffKeysFromDelta = (
    delta: SearchMapRenderSourceDelta | null | undefined
  ): Map<string, string> => {
    const byId = new Map<string, string>();
    (delta?.upsertFeatures ?? []).forEach((feature) => byId.set(feature.id, feature.diffKey));
    return byId;
  };
  const interactionDeltaKeys = diffKeysFromDelta(derivedDeltasBySourceId.pinInteractions);
  const dotDeltaKeys = diffKeysFromDelta(derivedDeltasBySourceId.dots);
  const collisionDeltaKeys = diffKeysFromDelta(derivedDeltasBySourceId.labelCollisions);
  for (const pinFeature of pinsDelta.upsertFeatures ?? []) {
    const featureId = pinFeature.id;
    const interactionDiffKey =
      interactionDeltaKeys.get(featureId) ??
      nextSnapshot.pinInteractions.transportFeatureById.get(featureId)?.diffKey;
    if (interactionDiffKey != null) {
      pinInteractionDiffKeys[featureId] = interactionDiffKey;
    }
    const dotTransport = nextSnapshot.dots.transportFeatureById.get(featureId);
    const dotDiffKey = dotDeltaKeys.get(featureId) ?? dotTransport?.diffKey;
    if (dotDiffKey != null) {
      dotDiffKeys[featureId] = dotDiffKey;
    }
    const dotImageId = dotTransport?.properties?.dotImageId;
    if (typeof dotImageId === 'string' && dotImageId.length > 0) {
      dotImageIdByFeatureId[featureId] = dotImageId;
    }
    const dotOpacity =
      dotTransport?.featureState?.nativeDotOpacity ?? dotTransport?.properties?.nativeDotOpacity;
    if (typeof dotOpacity === 'number' && Number.isFinite(dotOpacity)) {
      nativeDotOpacityByFeatureId[featureId] = dotOpacity;
    }
    // Collisions: the JS store is on-screen-gated, so a pin-upserted id may have no
    // store entry — compute the diffKey through the SAME pure builders the store uses
    // (buildStableCollisionFeature → transport diffKey), byte-identical by construction.
    const collisionDiffKey =
      collisionDeltaKeys.get(featureId) ??
      nextSnapshot.labelCollisions.transportFeatureById.get(featureId)?.diffKey ??
      buildLabelSourceFeatureDiffKey(
        buildStableCollisionFeature(
          {
            type: 'Feature',
            id: featureId,
            geometry: { type: 'Point', coordinates: [pinFeature.lng, pinFeature.lat] },
            properties: (pinFeature.properties ?? {}) as RestaurantFeatureProperties,
          },
          pinFeature.markerKey
        )
      );
    collisionDiffKeys[featureId] = collisionDiffKey;
  }
  const familyRevisions = (
    delta: SearchMapRenderSourceDelta | null | undefined,
    sourceId: SearchMapRenderSourceId
  ) => ({
    // Ledger advancement (final red team): synthesized deltas must carry the SAME
    // base/next revision proof as legacy deltas, or native's applied-revision ledger
    // stalls for derived families and every later legacy patch mismatches.
    baseSourceRevision: delta?.baseSourceRevision ?? null,
    nextSourceRevision:
      delta?.nextSourceRevision ?? getSnapshotSource(nextSnapshot, sourceId).sourceRevision,
  });
  return {
    pinInteractions: {
      diffKeyByFeatureId: pinInteractionDiffKeys,
      ...familyRevisions(derivedDeltasBySourceId.pinInteractions, 'pinInteractions'),
    },
    dots: {
      diffKeyByFeatureId: dotDiffKeys,
      dotImageIdByFeatureId,
      nativeDotOpacityByFeatureId,
      ...familyRevisions(derivedDeltasBySourceId.dots, 'dots'),
    },
    labelCollisions: {
      diffKeyByFeatureId: collisionDiffKeys,
      ...familyRevisions(derivedDeltasBySourceId.labelCollisions, 'labelCollisions'),
    },
  };
};

const buildSearchMapRenderSourceTransport = ({
  previousSourceRevisions,
  nextSnapshot,
  changedSourceIds,
  acknowledgedSnapshot,
}: {
  previousSourceRevisions: SearchMapRenderSourceRevisionState | null;
  nextSnapshot: SearchMapRenderSnapshot;
  changedSourceIds: SearchMapRenderSourceId[];
  acknowledgedSnapshot: SearchMapRenderSnapshot | null;
}): SearchMapRenderSourceTransportPayload => {
  const deltasBySourceId: Partial<
    Record<SearchMapRenderSourceId, SearchMapRenderSourceDelta | null>
  > = {};
  const effectiveChangedSourceIds: SearchMapRenderSourceId[] = [];

  for (const sourceId of changedSourceIds) {
    const nextCollection = getSnapshotSource(nextSnapshot, sourceId);
    const acknowledgedCollection =
      acknowledgedSnapshot == null ? null : getSnapshotSource(acknowledgedSnapshot, sourceId);
    const delta = buildSourceDelta(
      sourceId,
      previousSourceRevisions?.[sourceId] ?? null,
      nextCollection,
      acknowledgedCollection == null ? null : new Set(acknowledgedCollection.idsInOrder)
    );
    if (!delta) {
      continue;
    }
    deltasBySourceId[sourceId] = delta;
    effectiveChangedSourceIds.push(sourceId);
  }

  const pinsDelta = deltasBySourceId.pins ?? null;
  // Fan-out engages only when the pins family itself ships — derived-family-only
  // deltas (no pins change) keep the legacy full-feature path so their standalone
  // membership/content updates stay exact.
  const shouldFanOutDerivedFamilies =
    pinsDelta != null &&
    (deltasBySourceId.pinInteractions != null ||
      deltasBySourceId.dots != null ||
      deltasBySourceId.labelCollisions != null);
  const sourceDeltas: SearchMapRenderSourceDelta[] = shouldFanOutDerivedFamilies
    ? [pinsDelta]
    : (['pins', 'pinInteractions', 'dots', 'labelCollisions'] as const).flatMap((sourceId) => {
        const delta = deltasBySourceId[sourceId];
        return delta ? [delta] : [];
      });
  const derivedFamilyTransport = shouldFanOutDerivedFamilies
    ? buildDerivedFamilyTransportForPinsDelta(pinsDelta, deltasBySourceId, nextSnapshot)
    : null;

  if (__DEV__ && (sourceDeltas.length > 0 || derivedFamilyTransport != null)) {
    // eslint-disable-next-line no-console
    console.log(
      `[BASELEDGER] build fanOut=${shouldFanOutDerivedFamilies} ` +
        (['pins', 'pinInteractions', 'dots', 'labelCollisions'] as const)
          .map((sourceId) => {
            const delta = deltasBySourceId[sourceId];
            return delta == null
              ? `${sourceId}:none(base=${JSON.stringify(previousSourceRevisions?.[sourceId] ?? null)})`
              : `${sourceId}:${delta.mode}(base=${JSON.stringify(delta.baseSourceRevision ?? null)}->` +
                  `${JSON.stringify(delta.nextSourceRevision ?? null)},n=${delta.nextFeatureIdsInOrder.length})`;
          })
          .join(' ')
    );
  }

  return {
    effectiveChangedSourceIds,
    ...(sourceDeltas.length > 0 ? { sourceDeltas } : {}),
    ...(derivedFamilyTransport ? { derivedFamilyTransport } : {}),
  };
};

const collectPayloadMarkerKeysFromSourceDelta = (delta: SearchMapRenderSourceDelta): string[] => {
  const markerKeys = new Set<string>();
  (delta.removedGroupIds ?? []).forEach((key) => markerKeys.add(key));
  delta.removeIds.forEach((featureId) => {
    const labelSeparatorIndex = featureId.indexOf('::label::');
    markerKeys.add(labelSeparatorIndex >= 0 ? featureId.slice(0, labelSeparatorIndex) : featureId);
  });
  (delta.upsertFeatures ?? []).forEach((feature) => markerKeys.add(feature.markerKey));
  return [...markerKeys].filter((key) => key.length > 0);
};

const finiteSlotIndexFromFeature = (
  feature: SearchMapSourceTransportFeature | null | undefined
): number | null => {
  const properties = feature?.properties;
  const rawSlot = properties?.nativeLodZ ?? properties?.lodZ;
  return typeof rawSlot === 'number' && Number.isFinite(rawSlot) ? rawSlot : null;
};

const buildMarkerRoleRow = (
  markerKey: string,
  nextSnapshot: SearchMapRenderSnapshot
): SearchMapMarkerRoleRow | null => {
  const pinFeature = nextSnapshot.pins.transportFeatureById.get(markerKey);
  const dotFeature = nextSnapshot.dots.transportFeatureById.get(markerKey);
  // RESIDENT LOD: role is OPACITY-driven, not pin-presence. A pin resident at opacity 0
  // (demoted) is a "dot" row; only a promoted pin (nativeLodOpacity > 0) is a "pin" row.
  const pinOpacity = pinFeature?.properties?.nativeLodOpacity;
  const isPromotedPin =
    pinFeature != null && (typeof pinOpacity === 'number' ? pinOpacity : 1) > 0.001;
  if (isPromotedPin) {
    return {
      markerKey,
      role: 'pin',
      slotIndex: finiteSlotIndexFromFeature(pinFeature),
      pinFeature,
      pinInteractionFeature: nextSnapshot.pinInteractions.transportFeatureById.get(markerKey),
      dotFeature,
      labelCollisionFeature: nextSnapshot.labelCollisions.transportFeatureById.get(markerKey),
    };
  }
  if (dotFeature) {
    // RESIDENT LOD: a demoted (dot) marker carries its FULL pin bundle whenever the pin is
    // resident in the snapshot, so native can promote it on zoom/pan WITHOUT a JS republish — the
    // LOD decision is native, but the pin DATA must travel with every candidate or native has
    // nothing to render when it promotes (the load-time-pins-only bug). role stays 'dot'
    // (opacity-driven); native promotes via pinnedMarkerKeysInOrder + raises opacity feature-state.
    if (pinFeature != null) {
      return {
        markerKey,
        role: 'dot',
        slotIndex: finiteSlotIndexFromFeature(pinFeature),
        pinFeature,
        pinInteractionFeature: nextSnapshot.pinInteractions.transportFeatureById.get(markerKey),
        dotFeature,
        labelCollisionFeature: nextSnapshot.labelCollisions.transportFeatureById.get(markerKey),
      };
    }
    return {
      markerKey,
      role: 'dot',
      slotIndex: null,
      dotFeature,
    };
  }
  return null;
};

const buildMarkerRoleRowMap = (
  snapshot: SearchMapRenderSnapshot
): Map<string, SearchMapMarkerRoleRow> => {
  const rowsByMarkerKey = new Map<string, SearchMapMarkerRoleRow>();
  snapshot.pins.idsInOrder.forEach((markerKey) => {
    const row = buildMarkerRoleRow(markerKey, snapshot);
    if (row) {
      rowsByMarkerKey.set(markerKey, row);
    }
  });
  snapshot.dots.idsInOrder.forEach((markerKey) => {
    if (rowsByMarkerKey.has(markerKey)) {
      return;
    }
    const row = buildMarkerRoleRow(markerKey, snapshot);
    if (row) {
      rowsByMarkerKey.set(markerKey, row);
    }
  });
  return rowsByMarkerKey;
};

const markerRoleRowSignature = (row: SearchMapMarkerRoleRow | null | undefined): string => {
  if (!row) {
    return 'missing';
  }
  if (row.role === 'pin') {
    return [
      'pin',
      row.slotIndex ?? '',
      row.pinFeature?.diffKey ?? '',
      row.pinInteractionFeature?.diffKey ?? '',
      row.dotFeature?.diffKey ?? '',
      row.labelCollisionFeature?.diffKey ?? '',
    ].join('|');
  }
  return ['dot', row.dotFeature?.diffKey ?? ''].join('|');
};

const buildSearchMapMarkerRoleFrame = ({
  mode,
  nextSnapshot,
  previousSnapshot,
  sourceTransport,
}: {
  mode: 'patch' | 'replace';
  nextSnapshot: SearchMapRenderSnapshot;
  previousSnapshot?: SearchMapRenderSnapshot | null;
  sourceTransport: SearchMapRenderSourceTransportPayload;
}): SearchMapMarkerRoleFrame | null => {
  const dirtyMarkerKeys = new Set<string>();
  const removedMarkerKeys = new Set<string>();
  const sourceDeltas = sourceTransport.sourceDeltas ?? [];
  const nextRoleRowsByMarkerKey = buildMarkerRoleRowMap(nextSnapshot);
  const previousRoleRowsByMarkerKey =
    previousSnapshot == null ? null : buildMarkerRoleRowMap(previousSnapshot);
  // RESIDENT LOD: pins+dots are resident for every candidate, so PINNED and VISIBLE-DOT
  // roles are derived from the JS TARGET opacity (0/1, mutually exclusive), NOT raw source
  // membership. A pin with nativeLodOpacity>0 is promoted; a dot with nativeDotOpacity>0 is
  // a visible (demoted) dot. (Targets are always 0 or 1 here — native animates between them
  // — so pinned ∩ visible-dot stays disjoint, satisfying the native role-frame contract.)
  const markerTargetOpacity = (
    store: SearchMapRenderSnapshot['pins'],
    markerKey: string,
    prop: 'nativeLodOpacity' | 'nativeDotOpacity'
  ): number => {
    const value = store.transportFeatureById.get(markerKey)?.properties?.[prop];
    return typeof value === 'number' ? value : 1;
  };
  const nextPinnedMarkerKeysInOrder = nextSnapshot.pins.idsInOrder.filter(
    (markerKey) => markerTargetOpacity(nextSnapshot.pins, markerKey, 'nativeLodOpacity') > 0.001
  );
  const nextVisibleDotMarkerKeysInOrder = nextSnapshot.dots.idsInOrder.filter(
    (markerKey) => markerTargetOpacity(nextSnapshot.dots, markerKey, 'nativeDotOpacity') > 0.001
  );
  const previousVisibleDotMarkerKeysInOrder =
    previousSnapshot?.dots.idsInOrder.filter(
      (markerKey) =>
        markerTargetOpacity(previousSnapshot.dots, markerKey, 'nativeDotOpacity') > 0.001
    ) ?? [];
  const roleOrderChanged =
    previousSnapshot != null &&
    (!areStringArraysEqual(previousSnapshot.pins.idsInOrder, nextSnapshot.pins.idsInOrder) ||
      !areStringArraysEqual(previousVisibleDotMarkerKeysInOrder, nextVisibleDotMarkerKeysInOrder) ||
      !areStringArraysEqual(previousSnapshot.dots.idsInOrder, nextSnapshot.dots.idsInOrder));

  if (mode === 'replace') {
    nextSnapshot.pins.idsInOrder.forEach((markerKey) => dirtyMarkerKeys.add(markerKey));
    nextSnapshot.dots.idsInOrder.forEach((markerKey) => dirtyMarkerKeys.add(markerKey));
  } else if (previousRoleRowsByMarkerKey) {
    const markerKeys = new Set<string>([
      ...previousRoleRowsByMarkerKey.keys(),
      ...nextRoleRowsByMarkerKey.keys(),
    ]);
    markerKeys.forEach((markerKey) => {
      const previousSignature = markerRoleRowSignature(previousRoleRowsByMarkerKey.get(markerKey));
      const nextSignature = markerRoleRowSignature(nextRoleRowsByMarkerKey.get(markerKey));
      if (previousSignature === nextSignature) {
        return;
      }
      dirtyMarkerKeys.add(markerKey);
      if (!nextRoleRowsByMarkerKey.has(markerKey)) {
        removedMarkerKeys.add(markerKey);
      }
    });
  } else {
    sourceDeltas.forEach((delta) => {
      collectPayloadMarkerKeysFromSourceDelta(delta).forEach((markerKey) =>
        dirtyMarkerKeys.add(markerKey)
      );
      (delta.removedGroupIds ?? []).forEach((markerKey) => removedMarkerKeys.add(markerKey));
    });
  }

  const upsertRoles: SearchMapMarkerRoleRow[] = [];
  dirtyMarkerKeys.forEach((markerKey) => {
    const role = nextRoleRowsByMarkerKey.get(markerKey) ?? null;
    if (role) {
      upsertRoles.push(role);
      removedMarkerKeys.delete(markerKey);
    } else {
      removedMarkerKeys.add(markerKey);
    }
  });

  if (
    mode === 'patch' &&
    upsertRoles.length === 0 &&
    removedMarkerKeys.size === 0 &&
    !roleOrderChanged
  ) {
    return null;
  }

  return {
    mode,
    nextPinnedMarkerKeysInOrder,
    nextDotMarkerKeysInOrder: nextVisibleDotMarkerKeysInOrder,
    // Asymmetry is intentional: dots carry BOTH a visible list (opacity-filtered above)
    // and a full resident list, because native keeps hidden/zero-opacity dots (e.g.
    // promoted pins' shadow dots) resident in the dot layer while showing only the
    // visible subset — see makeDesiredDotCollection's residentDotMarkerKeysInOrder use
    // in SearchMapRenderController.swift. Pins have no "hidden-but-resident" concept: a
    // pin filtered out by the nativeLodOpacity check has been demoted to a dot and its
    // residency lives on the dot side, so there is no residentPinMarkerKeysInOrder field
    // (the native MarkerRoleTable does not define or read one).
    residentDotMarkerKeysInOrder: [...nextSnapshot.dots.idsInOrder],
    dirtyMarkerKeys: [...dirtyMarkerKeys],
    removedMarkerKeys: [...removedMarkerKeys],
    upsertRoles,
  };
};

const derivePresentationLaneState = (presentationState: SearchMapRenderPresentationState) => ({
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

const summarizeSourceTransportForBridgeSlice = (
  sourceTransport: SearchMapRenderSourceTransportPayload
) => {
  let replaceSourceCount = 0;
  let patchSourceCount = 0;
  let removeFeatureCount = 0;
  let upsertFeatureCount = 0;
  let nextFeatureCount = 0;
  let dirtyGroupCount = 0;
  let orderChangedGroupCount = 0;
  let removedGroupCount = 0;
  (sourceTransport.sourceDeltas ?? []).forEach((delta) => {
    if (delta.mode === 'replace') {
      replaceSourceCount += 1;
    } else {
      patchSourceCount += 1;
    }
    removeFeatureCount += delta.removeIds.length;
    upsertFeatureCount += delta.upsertFeatures?.length ?? 0;
    nextFeatureCount += delta.nextFeatureIdsInOrder.length;
    dirtyGroupCount += delta.dirtyGroupIds?.length ?? 0;
    orderChangedGroupCount += delta.orderChangedGroupIds?.length ?? 0;
    removedGroupCount += delta.removedGroupIds?.length ?? 0;
  });
  const sourceModeSignature =
    [
      replaceSourceCount > 0 ? `replace:${replaceSourceCount}` : null,
      patchSourceCount > 0 ? `patch:${patchSourceCount}` : null,
    ]
      .filter((value): value is string => value != null)
      .join(',') || 'none';
  const sourceOperationSignature = [
    `remove:${removeFeatureCount}`,
    `upsert:${upsertFeatureCount}`,
    `next:${nextFeatureCount}`,
    `dirty:${dirtyGroupCount}`,
    `order:${orderChangedGroupCount}`,
    `removed:${removedGroupCount}`,
  ].join('|');
  const markerRoleFrame = sourceTransport.markerRoleFrame ?? null;
  return {
    effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
    sourceDeltaCount: sourceTransport.sourceDeltas?.length ?? 0,
    markerRoleFrameMode: markerRoleFrame?.mode ?? null,
    markerRoleDirtyCount: markerRoleFrame?.dirtyMarkerKeys.length ?? 0,
    markerRoleRemovedCount: markerRoleFrame?.removedMarkerKeys.length ?? 0,
    markerRoleUpsertCount: markerRoleFrame?.upsertRoles.length ?? 0,
    markerRolePinnedCount: markerRoleFrame?.nextPinnedMarkerKeysInOrder.length ?? 0,
    markerRoleDotCount: markerRoleFrame?.nextDotMarkerKeysInOrder.length ?? 0,
    replaceSourceCount,
    patchSourceCount,
    removeFeatureCount,
    upsertFeatureCount,
    nextFeatureCount,
    dirtyGroupCount,
    orderChangedGroupCount,
    removedGroupCount,
    sourceModeSignature,
    sourceOperationSignature,
    sourceDeltaShapeSignature:
      sourceTransport.sourceDeltas
        ?.map(
          (delta) =>
            `${delta.sourceId}:${delta.mode}:r${delta.removeIds.length}:u${
              delta.upsertFeatures?.length ?? 0
            }:n${delta.nextFeatureIdsInOrder.length}:d${
              delta.dirtyGroupIds?.length ?? 0
            }:o${delta.orderChangedGroupIds?.length ?? 0}:g${delta.removedGroupIds?.length ?? 0}`
        )
        .join(',') || 'none',
    sourceDeltaSummaries:
      sourceTransport.sourceDeltas?.map((delta) => ({
        sourceId: delta.sourceId,
        mode: delta.mode,
        removeFeatureCount: delta.removeIds.length,
        upsertFeatureCount: delta.upsertFeatures?.length ?? 0,
        nextFeatureCount: delta.nextFeatureIdsInOrder.length,
        dirtyGroupCount: delta.dirtyGroupIds?.length ?? 0,
        orderChangedGroupCount: delta.orderChangedGroupIds?.length ?? 0,
        removedGroupCount: delta.removedGroupIds?.length ?? 0,
      })) ?? [],
  };
};

const countPinnedMarkersForSelectedRestaurant = (
  snapshot: SearchMapRenderSnapshot,
  selectedRestaurantId: string | null
): number => {
  if (selectedRestaurantId == null) {
    return 0;
  }
  let count = 0;
  snapshot.pins.idsInOrder.forEach((featureId) => {
    const feature = snapshot.pins.transportFeatureById.get(featureId);
    if (feature?.properties?.restaurantId === selectedRestaurantId) {
      count += 1;
    }
  });
  return count;
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
  snapshot.labelCollisions.acknowledgeTransportRevision(sourceRevisions.labelCollisions);
};

const useSearchMapNativeRenderOwnerStatus = ({
  mapComponentInstanceId,
  resolvedMapTag,
  isMapStyleReady,
  resultsPresentationAuthority,
  selectedRestaurantId,
  pinSourceId,
  pinInteractionSourceId,
  dotSourceId,
  labelCollisionSourceId,
  sourceFramePort = null,
  onExecutionBatchMountedHidden,
  onMarkerEnterStarted,
  onMarkerEnterSettled,
  onToggleSettled,
  onMarkerExitStarted,
  onMarkerExitSettled,
  onRecoveredAfterStyleReload,
  onViewportChanged,
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
  const isPresentationActiveRef = React.useRef(
    deriveSearchMapRenderPresentationStatusState(
      deriveSearchMapNativePresentationState({
        resultsPresentationAuthority,
        selectedRestaurantId,
        sourceFramePort,
      })
    ).isPresentationActive
  );
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
    dotSourceId,
    isMapStyleReady,
    isNativeAvailable,
    labelCollisionSourceId,
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

  const resolveNativeEventSourceCounts = React.useCallback(
    (event: {
      frameGenerationId?: string | null;
      executionBatchId?: string | null;
      phase?: SearchRuntimeMapPresentationPhase | null;
      coverState?: SearchMapRenderPresentationState['coverState'] | null;
      pinCount?: number;
      dotCount?: number;
    }) => {
      const eventPinCount = typeof event.pinCount === 'number' ? event.pinCount : null;
      const eventDotCount = typeof event.dotCount === 'number' ? event.dotCount : null;
      if (eventPinCount != null && eventDotCount != null) {
        return {
          pinCount: eventPinCount,
          dotCount: eventDotCount,
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
        };
      }
      const snapshot =
        eventPinCount == null || eventDotCount == null
          ? (sourceFramePortRef.current?.getSnapshot() ?? null)
          : null;
      const pinCount =
        eventPinCount ?? queuedCounts?.pinCount ?? snapshot?.pinSourceStore.idsInOrder.length ?? 0;
      const dotCount =
        eventDotCount ?? queuedCounts?.dotCount ?? snapshot?.dotSourceStore.idsInOrder.length ?? 0;
      return {
        pinCount,
        dotCount,
      };
    },
    [instanceId]
  );

  React.useEffect(() => {
    let isActive = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attachTimer: ReturnType<typeof setTimeout> | null = null;
    const attachAttempt = attachRetryNonce;
    const scheduleRecoverableRetry = () => {
      if (attachAttempt >= MAX_RECOVERABLE_MAP_HANDLE_ATTACH_RETRIES) {
        return false;
      }
      retryTimer = setTimeout(() => {
        if (!isActive) {
          return;
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
      setAttachState('idle');
      const retryScheduled = scheduleRecoverableRetry();
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
          const retryScheduled = isRecoverableAttachError && scheduleRecoverableRetry();
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
    dotSourceId,
    instanceId,
    isMapStyleReady,
    isNativeAvailable,
    labelCollisionSourceId,
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
              return;
            }
            if (event.instanceId !== instanceId) {
              return;
            }
            if (event.type === 'camera_changed') {
              onViewportChanged?.({
                center: [event.centerLng, event.centerLat],
                zoom: event.zoom,
                bearing: event.bearing,
                pitch: event.pitch,
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
            if (event.type === 'map_native_visible_markers') {
              // Stage B (B2): native projected the candidate catalog to screen
              // space and reported the on-screen marker set under the live camera.
              // Stash it for the JS selection policy (B3) and emit a contract so we
              // can prove the projection produces sane, camera-accurate counts
              // (e.g. shrinks under zoom-in, changes under twist/pitch — which a
              // lat/lng AABB cannot capture).
              sourceFramePortRef.current?.publishNativeVisibleMarkerKeys({
                markerKeys: event.markerKeys,
                nativePromotedKeys: event.nativePromotedKeys ?? [],
                catalogCount: event.catalogCount,
              });
              const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
              if (isPerfScenarioAttributionActive(scenarioConfig)) {
                logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
                  event: 'map_native_screenspace_visibility_contract',
                  nativeVisibleMarkerCount: event.markerCount,
                  catalogCount: event.catalogCount,
                  zoom: event.zoom,
                  bearing: event.bearing,
                  pitch: event.pitch,
                  isMoving: event.isMoving,
                });
              }
              return;
            }
            if (event.type === 'map_rendered_dot_observation') {
              const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
              if (isPerfScenarioAttributionActive(scenarioConfig)) {
                logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
                  event: 'map_rendered_dot_contract',
                  expectedDemotedDotCount: event.expectedDemotedDotCount,
                  renderedDemotedDotCount: event.renderedDemotedDotCount,
                  culledDemotedDotCount: event.culledDemotedDotCount,
                  renderedDotFeatureCount: event.renderedDotFeatureCount,
                  allDemotedDotsRendered:
                    event.expectedDemotedDotCount === event.renderedDemotedDotCount,
                  nativeEmittedAtMs: event.emittedAtMs,
                });
              }
              return;
            }
            if (event.type === 'lod_snap_contract') {
              const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
              if (isPerfScenarioAttributionActive(scenarioConfig)) {
                logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
                  event: 'native_lod_snap_contract',
                  reason: event.reason,
                  snapshotReused: event.snapshotReused,
                  desiredPinCount: event.desiredPinCount,
                  promotedPinCount: event.promotedPinCount,
                  roleFlipCount: event.roleFlipCount,
                  silentPinFlipCount: event.silentPinFlipCount,
                  silentDotFlipCount: event.silentDotFlipCount,
                  pinTransitionCreatedCount: event.pinTransitionCreatedCount,
                  dotTransitionCreatedCount: event.dotTransitionCreatedCount,
                  allowNewTransitions: event.allowNewTransitions,
                  nativeEmittedAtMs: event.emittedAtMs,
                });
              }
              return;
            }
            if (event.type === 'lod_render_snap_contract') {
              const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
              if (isPerfScenarioAttributionActive(scenarioConfig)) {
                logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
                  event: 'native_lod_render_snap_contract',
                  sourceId: event.sourceId,
                  fsRemovalFlashCount: event.fsRemovalFlashCount,
                  fsJumpCount: event.fsJumpCount,
                  samples: event.samples,
                  nativeEmittedAtMs: event.emittedAtMs,
                });
              }
              return;
            }
            if (event.type === 'live_lod_transition_contract') {
              const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
              if (isPerfScenarioAttributionActive(scenarioConfig)) {
                logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
                  event: 'native_live_lod_transition_contract',
                  flashReversalCount: event.flashReversalCount,
                  crossfadeGapCount: event.crossfadeGapCount,
                  pinExitMidFadeCount: event.pinExitMidFadeCount,
                  pinTransitionCount: event.pinTransitionCount,
                  pinEnterTransitionCount: event.pinEnterTransitionCount,
                  pinExitTransitionCount: event.pinExitTransitionCount,
                  dotTransitionCount: event.dotTransitionCount,
                  dotEnterTransitionCount: event.dotEnterTransitionCount,
                  dotExitTransitionCount: event.dotExitTransitionCount,
                  pinFeatureStateApplyCount: event.pinFeatureStateApplyCount,
                  labelFeatureStateApplyCount: event.labelFeatureStateApplyCount,
                  dotFeatureStateApplyCount: event.dotFeatureStateApplyCount,
                  pinLabelFadeSynchronized: event.pinLabelFadeSynchronized,
                  transitionDurationMs: event.transitionDurationMs,
                  usesStyleTransition: event.usesStyleTransition,
                  usesNativeFrameStepper: event.usesNativeFrameStepper,
                  hasIntermediateOpacity: event.hasIntermediateOpacity,
                  pinIntermediateOpacityCount: event.pinIntermediateOpacityCount,
                  labelIntermediateOpacityCount: event.labelIntermediateOpacityCount,
                  dotIntermediateOpacityCount: event.dotIntermediateOpacityCount,
                  lodTransitionTrace: event.lodTransitionTrace,
                  nativeEmittedAtMs: event.emittedAtMs,
                });
              }
              return;
            }
            if (event.type === 'pin_visual_order_contract') {
              const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
              if (isPerfScenarioAttributionActive(scenarioConfig)) {
                logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
                  event: 'native_pin_visual_order_contract',
                  reason: event.reason,
                  pinCount: event.pinCount,
                  selectedPinCount: event.selectedPinCount,
                  movedGroupCount: event.movedGroupCount,
                  previousGroupCount: event.previousGroupCount,
                  screenYOrderViolationCount: event.screenYOrderViolationCount,
                  screenYVisualOrder: event.screenYVisualOrder,
                  stableSlotOwnership: event.stableSlotOwnership,
                  appliesScreenYOrdering: event.appliesScreenYOrdering,
                  usesLayerMoves: event.usesLayerMoves,
                  usesViewportYZOrder: event.usesViewportYZOrder,
                  sourceMutationCount: event.sourceMutationCount,
                  isMoving: event.isMoving,
                  cameraZoom: event.cameraZoom,
                  cameraBearing: event.cameraBearing,
                  visualOrderSignature: event.visualOrderSignature,
                  previousVisualOrderSignature: event.previousVisualOrderSignature,
                  nativeEmittedAtMs: event.emittedAtMs,
                });
              }
              return;
            }
            if (event.type === 'native_scoped_promoted_slot_contract') {
              const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
              if (isPerfScenarioAttributionActive(scenarioConfig)) {
                logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
                  event: 'native_scoped_promoted_slot_contract',
                  affectedMarkerCount: event.affectedMarkerCount,
                  orderedAffectedMarkerCount: event.orderedAffectedMarkerCount,
                  pinSourceOpacityMissingCount: event.pinSourceOpacityMissingCount,
                  exitingPinSourceOpacityRiskCount: event.exitingPinSourceOpacityRiskCount,
                  sourceOpacityBacksScopedPins: event.sourceOpacityBacksScopedPins,
                  nativeEmittedAtMs: event.emittedAtMs,
                });
              }
              return;
            }
            if (event.type === 'attached') {
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
              return;
            }
            if (event.type === 'render_owner_invalidated') {
              setOwnerEpoch(event.ownerEpoch);
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
              return;
            }
            if (event.type === 'presentation_execution_batch_mounted_hidden') {
              // §Q redo T1b: the native world frame is mounted hidden — the map source
              // OFFERS its input to the live transaction (consumed iff declared).
              offerTransitionJoinInput('mapFrame');
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
                  mountedSourceDataKey:
                    event.frameGenerationId != null
                      ? (frameSourceDataKeyByGeneration.get(
                          frameSourceDataKeyLedgerKey(event.instanceId, event.frameGenerationId)
                        ) ?? null)
                      : null,
                  desiredSourceDataKey:
                    latestDesiredSourceDataKeyByInstance.get(event.instanceId) ?? null,
                });
              });
              return;
            }
            if (event.type === 'presentation_state_snapshot') {
              // S4d-0/3b RED instrument — observation only, never actuated on. The silent
              // dismiss-in-progress bypasses are DELETED. keyless_payload_during_dismiss is
              // LEGITIMATE ordering (a resubmit's pre-enter transport frames land while the
              // dismiss ramp runs; the dismiss register persists to its floor ack) — logged
              // as a snapshot below, not a violation. snapshot_apply_during_dismiss stays a
              // violation: source data landing mid-dismiss means the enter didn't supersede.
              if (
                event.reason === 'snapshot_apply_during_dismiss' ||
                event.reason === 'contract_violation_visibility_dorm_mid_ramp' ||
                event.reason === 'contract_violation_reveal_completed_undecided'
              ) {
                reportSearchFlowContractViolation(event.reason, {
                  incomingRevealRequestKey: event.incomingRevealRequestKey,
                  incomingDismissRequestKey: event.incomingDismissRequestKey,
                  nativeRevealRequestKey: event.revealRequestKey,
                  nativeDismissRequestKey: event.dismissRequestKey,
                  lifecycleState: event.lifecycleState,
                  renderPhase: event.renderPhase,
                  opacityTarget: event.opacityTarget,
                });
              }
              if (__DEV__) {
                logger.info('[NATIVE-SNAP]', {
                  instanceId: event.instanceId,
                  reason: event.reason,
                  reveal: event.revealRequestKey,
                  revealStarted: event.revealStartedRequestKey,
                  revealSettled: event.revealSettledRequestKey,
                  dismiss: event.dismissRequestKey,
                  incomingReveal: event.incomingRevealRequestKey,
                  incomingDismiss: event.incomingDismissRequestKey,
                  lifecycle: event.lifecycleState,
                  renderPhase: event.renderPhase,
                  opacity: event.opacityTarget,
                  desired: event.desiredCount,
                  catalog: event.catalogCount,
                  deferredWhy: event.deferredWhy,
                  views: event.viewCount,
                  candidates: event.candidateCount,
                  promoted: event.promotedCount,
                });
              }
              return;
            }
            if (event.type === 'presentation_fade_out_acked') {
              if (__DEV__) {
                logger.info('[FADE-OUT-ACK]', {
                  reason: event.reason,
                  requestKey: event.requestKey,
                  lifecycle: event.lifecycleState,
                  nativeTimestampMs: event.nativeTimestampMs,
                });
              }
              // T3 (toggle-strip primitive): the floor ack is the LEVEL the gated toggle
              // commit waits on — the swap lands exactly when the fade-out bottoms out.
              notifySearchPresentationFloorReached();
              return;
            }
            if (event.type === 'presentation_enter_started') {
              // T3: an enter ramp is leaving the floor — the floor level drops until the
              // next fade-out ack.
              notifySearchPresentationFloorLeft();
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
                  settledAtMs: event.settledAtMs,
                });
              });
              return;
            }
            if (event.type === 'presentation_toggle_settled') {
              // UNIFIED-FADE TOGGLE: deterministic cover-lift signal (latest-wins, supersession-immune).
              withNativePresentationEventInnerSpan(event, 'lifecycle_callback', () => {
                onToggleSettled?.({
                  requestKey: event.requestKey,
                  overlayTileCount: event.overlayTileCount,
                  promotedCount: event.promotedCount,
                  degraded: event.degraded,
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
    instanceId,
    isNativeAvailable,
    onExecutionBatchMountedHidden,
    onMarkerExitSettled,
    onMarkerExitStarted,
    onMarkerEnterStarted,
    onMarkerEnterSettled,
    onToggleSettled,
    onViewportChanged,
    onRecoveredAfterStyleReload,
    pinSourceId,
  ]);

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
  const resolvedLabelCollisions = resolveSearchMapSourceStore(labelCollisions);
  const sourceFramePortRef = React.useRef(sourceFramePort);
  const resultsPresentationAuthorityRef = React.useRef(resultsPresentationAuthority);
  const selectedRestaurantIdRef = React.useRef(selectedRestaurantId);
  // Stage B (B1): last candidate-catalog key forwarded to native. The catalog is
  // pushed only when the full candidate set changes (results change), not per frame.
  const lastPushedCandidateCatalogKeyRef = React.useRef<string | null>(null);

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
    frameTransportRevision: number;
    executionBatchId: string;
    frame: SearchMapRenderFrame;
    snapshot: SearchMapRenderSnapshot;
    visualFrameTransaction: SearchMapVisualFrameTransaction;
    sourceTransport: SearchMapRenderSourceTransportPayload;
    sourceFrameKey: string;
    sourceDataKey: string;
    sourceFrameMatchState: SearchMapNativeSourceFrameMatchState;
    sourceTransportBuildDurationMs: number;
    attribution: NativeRenderOwnerFrameAttribution;
  };
  const buildSourceSnapshot = React.useCallback((): SearchMapRenderSnapshot => {
    const directSnapshot = sourceFramePortRef.current?.getSnapshot() ?? null;
    if (directSnapshot) {
      return {
        pins: resolveSearchMapSourceStore(directSnapshot.pinSourceStore),
        pinInteractions: resolveSearchMapSourceStore(directSnapshot.pinInteractionSourceStore),
        dots: resolveSearchMapSourceStore(directSnapshot.dotSourceStore),
        labelCollisions: resolveSearchMapSourceStore(directSnapshot.labelCollisionSourceStore),
      };
    }
    return {
      pins: resolvedPins,
      pinInteractions: resolvedPinInteractions,
      dots: resolvedDots,
      labelCollisions: resolvedLabelCollisions,
    };
  }, [resolvedDots, resolvedLabelCollisions, resolvedPinInteractions, resolvedPins]);
  const transportStateRef = React.useRef(
    createNativeRenderOwnerTransportState<NativeRenderOwnerFrameEnvelope>()
  );
  const isAttachedRef = React.useRef(isAttached);
  const ownerEpochRef = React.useRef<number | null>(ownerEpoch);
  const shouldIgnoreNativeSyncErrorsRef = React.useRef(!isAttached);
  const onSyncErrorRef = React.useRef(onSyncError);
  const getSourceSyncBaselineRevisions =
    React.useCallback((): SearchMapRenderSourceRevisionState | null => {
      return transportStateRef.current.lastNativeAck?.sourceRevisions ?? null;
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
      latestDesiredSourceDataKeyByInstance.delete(instanceId);
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
    // STRUCTURAL-APPLY FENCE (eye-verified 2026-07-13): the preview world's ~85ms
    // main-thread GL apply landed mid-slide and ate the sheet spring's frames (the
    // slide rendered ~4 positions instead of ~11). Same motion-keyed predicate as the
    // seam's world-commit hold: while the sheet is physically moving for the active
    // redraw, STRUCTURAL frames stay queued (latest-wins; presentation-only frames
    // flow untouched); the settle publish re-flushes below. Deadlock-proof by
    // construction — the fence only engages when motion actually started (snap-START
    // producer), never on a deferred/no-op snap.
    const pendingStructural =
      transportState.queueState.pendingFrame?.sourceTransport?.effectiveChangedSourceIds?.length ??
      0;
    if (pendingStructural > 0) {
      const activeRedrawTransaction = getSearchSurfaceRuntime().getSnapshot().redrawTransaction;
      if (activeRedrawTransaction != null && !activeRedrawTransaction.readiness.sheetReady) {
        return;
      }
    }
    const takenDesiredFrame = takeNextNativeRenderOwnerFrameForTransport({
      transportState,
      ownerEpoch: ownerEpochRef.current,
    });
    if (!takenDesiredFrame) {
      return;
    }
    // OPEN-A FIX (wave-4 §3, sim-attributed 2026-07-13): a queued frame's source deltas
    // were computed against the ack at BUILD time. When a prior frame acks while this one
    // waits (back-to-back enters, instance churn), those patch bases are stale BY
    // CONSTRUCTION and native rightly rejects ("claims base v1, native applied v2") —
    // stranding the enter's pins until the resync round-trip. The flush is the only
    // moment that knows native's current truth: rebuild the delta transport against the
    // LATEST ack when any patch base disagrees with it. Live role-frame transports
    // (no sourceDeltas) are untouched.
    let effectiveDesiredFrame = takenDesiredFrame;
    {
      const latestAckRevisions = transportState.lastNativeAck?.sourceRevisions ?? null;
      const hasStaleBasedPatch = (takenDesiredFrame.sourceTransport.sourceDeltas ?? []).some(
        (delta) =>
          delta.mode === 'patch' &&
          (delta.baseSourceRevision ?? null) !== (latestAckRevisions?.[delta.sourceId] ?? null)
      );
      if (hasStaleBasedPatch) {
        const snapshotRevisions = getSearchMapRenderSourceRevisions(takenDesiredFrame.snapshot);
        const changedSourceIds = SEARCH_MAP_RENDER_SOURCE_IDS.filter(
          (sourceId) => (latestAckRevisions?.[sourceId] ?? null) !== snapshotRevisions[sourceId]
        );
        const rebuiltSourceTransport = buildSearchMapRenderSourceTransport({
          previousSourceRevisions: latestAckRevisions,
          acknowledgedSnapshot: transportState.lastNativeAckSnapshot,
          nextSnapshot: takenDesiredFrame.snapshot,
          changedSourceIds,
        });
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log(
            `[BASELEDGER] flush-rebuild stale patch bases → rebuilt against latest ack ` +
              `(changed=${changedSourceIds.join(',') || 'none'} gen=${takenDesiredFrame.frameGenerationId})`
          );
        }
        effectiveDesiredFrame = {
          ...takenDesiredFrame,
          sourceTransport: rebuiltSourceTransport,
        };
        transportState.queueState.inFlightFrame = effectiveDesiredFrame;
      }
    }
    mapMotionPressureController.applySourcePublishLifecycleEvent({ kind: 'started' });
    recordFrameSourceDataKey(
      instanceId,
      effectiveDesiredFrame.frameGenerationId,
      effectiveDesiredFrame.sourceDataKey
    );
    if (__DEV__ && effectiveDesiredFrame.frame.presentation.startToken != null) {
      console.log(`[NGAPJS] tokenFlushed t=${performance.now().toFixed(1)}`);
    }
    const bridgeStartedAtMs = resolveNativeRenderOwnerPerfNow();
    const bridgePresentationLaneState = derivePresentationLaneState(
      effectiveDesiredFrame.frame.presentation
    );
    // Gate C/E (structural lane attribution): `batchPhase` above describes the FRAME's own
    // lane; this captures the LIVE presentation phase at apply time and whether the lane
    // policy permits structural work there. A structural apply that lands inside a visible
    // reveal/dismiss window (allowStructuralApply === false) is a Gate C leak — this is the
    // direct, grep-able signal for whether reveal/dismiss are source-stable windows.
    const liveStructuralExecutionStage =
      resultsPresentationAuthority.getSnapshot().resultsPresentationTransport.executionStage;
    const liveStructuralLanePolicy = resolvePresentationLanePolicy(liveStructuralExecutionStage);
    const bridgeSourceSummary = summarizeSourceTransportForBridgeSlice(
      effectiveDesiredFrame.sourceTransport
    );
    const selectedPinnedMarkerCount = countPinnedMarkersForSelectedRestaurant(
      effectiveDesiredFrame.snapshot,
      selectedRestaurantIdRef.current
    );
    const logNativeRenderFrameBridgeSlice = (
      status: 'queued' | 'applied' | 'dropped' | 'failed',
      message?: string,
      nativeTiming?: SearchMapRenderControllerSetRenderFrameResult | null
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
        laneKind: bridgePresentationLaneState.laneKind,
        batchPhase: bridgePresentationLaneState.batchPhase,
        liveExecutionStage: liveStructuralExecutionStage,
        lanePolicyAllowsStructuralApply: liveStructuralLanePolicy.allowStructuralApply,
        // Cluster 2 (reveal/dismiss plan): presentation/control-only frames
        // (sourceDeltaCount === 0 → effectiveChangedSourceIds.length === 0) nominally
        // travel this same setRenderFrame queue, but they carry ZERO structural work:
        // native skips applySnapshot entirely for them (shouldApplySourcePayload === false
        // in SearchMapRenderController.swift setRenderFrame), so the per-frame cost is just
        // applyPresentation + interaction/highlight — and the presentation-opacity sweep is
        // itself bounded to the on-screen marker set (fix #2). There is no real structural
        // leak when such a frame lands inside a visible reveal/dismiss window, so the leak
        // gate is gated on the frame actually carrying source deltas. Without this guard the
        // diagnostic mislabels a near-zero-cost presentation frame as a structural lane leak.
        isStructuralApplyLaneLeak:
          status === 'applied' &&
          effectiveDesiredFrame.sourceTransport.effectiveChangedSourceIds.length > 0 &&
          !liveStructuralLanePolicy.allowStructuralApply &&
          (liveStructuralExecutionStage === 'enter_executing' ||
            liveStructuralExecutionStage === 'exit_requested' ||
            liveStructuralExecutionStage === 'exit_executing'),
        isNativeAvailable,
        startTimeMs: roundNativeRenderOwnerPerfMs(bridgeStartedAtMs),
        endTimeMs: roundNativeRenderOwnerPerfMs(bridgeSettledAtMs),
        nowMs: roundNativeRenderOwnerPerfMs(bridgeSettledAtMs),
        durationMs: roundNativeRenderOwnerPerfMs(bridgeSettledAtMs - bridgeStartedAtMs),
        pinCount: effectiveDesiredFrame.snapshot.pins.idsInOrder.length,
        dotCount: effectiveDesiredFrame.snapshot.dots.idsInOrder.length,
        selectedRestaurantId: selectedRestaurantIdRef.current,
        markerRoleSelectedPinnedCount: selectedPinnedMarkerCount,
        markerRoleNormalPinnedCount: Math.max(
          0,
          effectiveDesiredFrame.snapshot.pins.idsInOrder.length - selectedPinnedMarkerCount
        ),
        visualFrameTransactionKind: effectiveDesiredFrame.visualFrameTransaction.kind,
        visualFrameSourceSnapshotKind:
          effectiveDesiredFrame.visualFrameTransaction.sourceSnapshotKind,
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
        frameAdmissionDecision: effectiveDesiredFrame.attribution.frameAdmissionDecision,
        normalWorkEffect: effectiveDesiredFrame.attribution.normalWorkEffect,
        sourceBaselineKind: effectiveDesiredFrame.attribution.sourceBaselineKind,
        snapshotChanged: effectiveDesiredFrame.attribution.snapshotChanged,
        viewportBoundsChanged: effectiveDesiredFrame.attribution.viewportBoundsChanged,
        gestureStateChanged: effectiveDesiredFrame.attribution.gestureStateChanged,
        movingStateChanged: effectiveDesiredFrame.attribution.movingStateChanged,
        presentationChanged: effectiveDesiredFrame.attribution.presentationChanged,
        controlStateChanged: effectiveDesiredFrame.attribution.controlStateChanged,
        isMoving: effectiveDesiredFrame.attribution.isMoving,
        isGestureActive: effectiveDesiredFrame.attribution.isGestureActive,
        shouldQueueNativeEnterMountAckFrame:
          effectiveDesiredFrame.attribution.shouldQueueNativeEnterMountAckFrame,
        nominalChangedSourceIds: effectiveDesiredFrame.attribution.nominalChangedSourceIds,
        ...bridgeSourceSummary,
        ...(nativeTiming
          ? {
              nativePayloadBuildDurationMs: nativeTiming.nativePayloadBuildDurationMs,
              nativePayloadSourceDeltaMapDurationMs:
                nativeTiming.nativePayloadSourceDeltaMapDurationMs,
              nativeModuleDurationMs: nativeTiming.nativeModuleDurationMs,
              nativePayloadTotalDurationMs: nativeTiming.nativePayloadTotalDurationMs,
              jsPromiseObservedAtEpochMs: nativeTiming.jsPromiseObservedAtEpochMs,
              nativeModuleReceivedAtEpochMs: nativeTiming.nativeModuleReceivedAtEpochMs,
              nativeMainStartedAtEpochMs: nativeTiming.nativeMainStartedAtEpochMs,
              nativeResolveStartedAtEpochMs: nativeTiming.nativeResolveStartedAtEpochMs,
              nativeResolveToJsPromiseObservedWallClockMs:
                nativeTiming.nativeResolveToJsPromiseObservedWallClockMs,
              nativeResolveToJsPromiseObservedWallClockConfidence:
                nativeTiming.nativeResolveToJsPromiseObservedWallClockConfidence,
              nativeModuleQueueWaitDurationMs: nativeTiming.nativeModuleQueueWaitDurationMs,
              nativeMainExecutionDurationMs: nativeTiming.nativeMainExecutionDurationMs,
              nativeSetFrameActionDurationMs: nativeTiming.nativeSetFrameActionDurationMs,
              nativeBridgeUnattributedDurationMs: nativeTiming.nativeBridgeUnattributedDurationMs,
              nativeSetFramePhase: nativeTiming.nativeSetFramePhase,
              nativeDidSyncResidentFrame: nativeTiming.nativeDidSyncResidentFrame,
            }
          : {}),
        ...(message ? { message } : {}),
      });
    };
    logNativeRenderFrameBridgeSlice('queued');
    // Stage B (B1): forward the full ranked candidate catalog to native whenever
    // it changes (results change), so native can project it to screen space each
    // camera tick for LOD selection. Fire-and-forget; decoupled from the frame.
    {
      // §Q redo — PRESENTER LAW (design §2): catalogs describe WORLD content; with no
      // world-bearing entry resident, none may push. Kills the confirmed post-pop
      // re-present: a fresh owner instance re-shipping the port's retained (dead)
      // catalog re-synced the pin roster after the session's exit. Frame submits are
      // NOT gated (exit frames ride them). `undefined` = decided-not-resident;
      // `null` = no reader registered (boot) — do not gate.
      const residentWorldEntry = readCurrentResidentWorldEntry();
      const candidateCatalog =
        residentWorldEntry === undefined
          ? null
          : (sourceFramePortRef.current?.getCandidateCatalog() ?? null);
      if (__DEV__ && residentWorldEntry === undefined) {
        const retained = sourceFramePortRef.current?.getCandidateCatalog() ?? null;
        if (retained != null && retained.key !== lastPushedCandidateCatalogKeyRef.current) {
          // eslint-disable-next-line no-console
          console.log('[PRESENTER] catalog push refused: no resident world entry');
        }
      }
      if (
        candidateCatalog != null &&
        candidateCatalog.key !== lastPushedCandidateCatalogKeyRef.current
      ) {
        // §Q redo T3 (C6 — the owner's "map items snap out", attributed): the session
        // teardown clears the bus, the EMPTY catalog shipped instantly (roster empties
        // at opacity 1 — pins vanish), and the exit ramp then faded an already-empty
        // roster. An EMPTYING catalog defers to the presentation fade FLOOR: the exit
        // ramp fades real pins, the roster empties after. A superseding non-empty
        // catalog (new world entering) cancels the deferred empty.
        const shouldDeferEmptyingCatalog =
          candidateCatalog.entries.length === 0 &&
          lastPushedCandidateCatalogKeyRef.current != null &&
          !isSearchPresentationAtFloor();
        if (shouldDeferEmptyingCatalog) {
          const emptyCatalogKey = candidateCatalog.key;
          const unsubscribeFloor = subscribeSearchPresentationFloor(() => {
            unsubscribeFloor();
            const latest = sourceFramePortRef.current?.getCandidateCatalog() ?? null;
            if (
              isSearchPresentationAtFloor() &&
              latest != null &&
              latest.key === emptyCatalogKey &&
              latest.key !== lastPushedCandidateCatalogKeyRef.current
            ) {
              lastPushedCandidateCatalogKeyRef.current = latest.key;
              void searchMapRenderController.setCandidateCatalog({
                instanceId,
                entries: latest.entries,
              });
            }
          });
        }
        if (!shouldDeferEmptyingCatalog) {
          lastPushedCandidateCatalogKeyRef.current = candidateCatalog.key;
          if (__DEV__) {
            const invisible = candidateCatalog.entries.filter((e) => e.isInvisibleResident).length;
            // eslint-disable-next-line no-console
            console.log(
              `[CATALOG] push n=${candidateCatalog.entries.length} invisible=${invisible} ` +
                `first=${candidateCatalog.entries
                  .slice(0, 3)
                  .map((e) => `${e.markerKey}@r${e.rank}`)
                  .join(',')} inst=${instanceId.slice(-11)}`
            );
          }
          void searchMapRenderController.setCandidateCatalog({
            instanceId,
            entries: candidateCatalog.entries,
          });
        }
      }
    }
    searchMapRenderController.submitRenderFrameFireAndObserve(
      {
        instanceId,
        ownerEpoch: effectiveDesiredFrame.ownerEpoch,
        frameGenerationId: effectiveDesiredFrame.frameGenerationId,
        executionBatchId: effectiveDesiredFrame.executionBatchId,
        frame: effectiveDesiredFrame.frame,
        visualFrameTransaction: effectiveDesiredFrame.visualFrameTransaction,
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
          onSyncErrorRef.current?.(`SearchMap native render owner frame sync failed: ${message}`);
          markNativeRenderOwnerFrameTransportFailed(
            transportState,
            effectiveDesiredFrame.frameGenerationId
          );
          if (message.includes('Source delta') || message.includes('Patch baseline mismatch')) {
            // BASELINE RESYNC (2026-07-12): a native delta rejection is PROOF the ack
            // baseline no longer matches native's resident collection (and a partially
            // applied multi-source frame advances native state even as the frame
            // rejects). Drop the baseline so the NEXT frame ships a full replace — one
            // loud log, then structural re-sync, never a rejection cascade.
            transportState.lastNativeAck = null;
            transportState.lastNativeAckSnapshot = null;
          }
          mapMotionPressureController.applySourcePublishLifecycleEvent({ kind: 'settled' });
          if (transportState.queueState.pendingFrame && isAttachedRef.current) {
            flushLatestDesiredFrame();
          }
          if (
            (message.includes('Source delta') || message.includes('Patch baseline mismatch')) &&
            !transportState.queueState.pendingFrame &&
            isAttachedRef.current
          ) {
            // No newer frame queued: re-emit the CURRENT desired state so the replace
            // actually ships (the rejected content must not silently stay off-map).
            queueMicrotask(() => {
              if (isAttachedRef.current) {
                queueNativeRenderOwnerFrameRef.current();
              }
            });
          }
        } finally {
          logNativeRenderOwnerWorkSpan({
            owner: 'search_map_native_promise_callback',
            path: `${callbackStatus}:${bridgePresentationLaneState.batchPhase}:${bridgePresentationLaneState.laneKind}`,
            startedAtMs: promiseCallbackStartedAtMs,
            details: {
              status: callbackStatus,
              frameGenerationId: effectiveDesiredFrame.frameGenerationId,
              executionBatchId: effectiveDesiredFrame.executionBatchId,
              batchPhase: bridgePresentationLaneState.batchPhase,
              laneKind: bridgePresentationLaneState.laneKind,
            },
          });
        }
      },
      (result) => {
        logNativeRenderFrameBridgeSlice('applied', undefined, result);
      }
    );
  }, [instanceId, isNativeAvailable, mapMotionPressureController]);

  // Structural-apply fence release: when the sheet settles (sheetReady flips true) or
  // the redraw transaction resolves, flush any structural frame the fence held.
  React.useEffect(
    () =>
      getSearchSurfaceRuntime().subscribe(() => {
        const transportState = transportStateRef.current;
        if (transportState.queueState.pendingFrame == null) {
          return;
        }
        const activeRedrawTransaction = getSearchSurfaceRuntime().getSnapshot().redrawTransaction;
        if (activeRedrawTransaction == null || activeRedrawTransaction.readiness.sheetReady) {
          flushLatestDesiredFrame();
        }
      }),
    [flushLatestDesiredFrame]
  );

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
              transportState.lastNativeAck = null;
              ownerEpochRef.current = event.ownerEpoch;
              retargetNativeRenderOwnerTransportOwnerEpoch(transportState, event.ownerEpoch);
              return;
            }
            if (event.type === 'render_owner_recovered_after_style_reload') {
              transportState.lastNativeAck = null;
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
            if (event.sourceAdmissionOutcome == null) {
              onSyncErrorRef.current?.(
                'SearchMap native render owner did not report source admission outcome. Rebuild the native app so VisualFrameTransaction admission ownership is available.'
              );
              return;
            }
            const matchedFrame = findNativeRenderOwnerFrameTransportMatch(
              transportState,
              event.frameGenerationId
            );
            const didPublishResidentSnapshot =
              doesNativeSourceAdmissionOutcomePublishResidentSnapshot(event.sourceAdmissionOutcome);
            const nativeAck: NativeRenderOwnerSourceAck = {
              frameGenerationId: event.frameGenerationId,
              executionBatchId: event.executionBatchId,
              sourceAdmissionOutcome: event.sourceAdmissionOutcome,
              sourceFrameKey: event.sourceFrameKey,
              sourceDataKey: event.sourceDataKey,
              sourceRevisions: event.sourceRevisions,
            };
            if (didPublishResidentSnapshot) {
              transportState.lastNativeAck = nativeAck;
            }
            if (__DEV__) {
              // eslint-disable-next-line no-console
              console.log(
                `[BASELEDGER] ack outcome=${event.sourceAdmissionOutcome} resident=${didPublishResidentSnapshot} ` +
                  `revs=${JSON.stringify(event.sourceRevisions)} nativeRevs=${JSON.stringify(
                    (event as { nativeSourceRevisions?: unknown }).nativeSourceRevisions ?? null
                  )} gen=${event.frameGenerationId} inst=${instanceId.slice(-11)}`
              );
            }
            if (matchedFrame != null) {
              const didNativeEchoMatchedSourceSnapshot =
                areSearchMapRenderSourceRevisionStatesEqual(
                  event.sourceRevisions,
                  matchedFrame.frame.sourceRevisions
                );
              const shouldAcknowledgeMatchedSnapshot =
                didPublishResidentSnapshot && didNativeEchoMatchedSourceSnapshot;
              if (didPublishResidentSnapshot && !didNativeEchoMatchedSourceSnapshot) {
                logNativePresentationReadinessEvent({
                  event: 'native_render_frame_source_revision_echo_mismatch',
                  instanceId,
                  ownerEpoch: event.ownerEpoch,
                  frameGenerationId: event.frameGenerationId,
                  executionBatchId: event.executionBatchId,
                  sourceAdmissionOutcome: event.sourceAdmissionOutcome,
                  jsSourceRevisions: matchedFrame.frame.sourceRevisions,
                  nativeSourceRevisions: event.sourceRevisions,
                });
              }
              if (shouldAcknowledgeMatchedSnapshot) {
                acknowledgeSnapshotSourceRevisions(matchedFrame.snapshot, event.sourceRevisions);
                transportState.lastNativeAckSnapshot = matchedFrame.snapshot;
              }
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
        latestDesiredSourceDataKeyByInstance.set(instanceId, sourceDataKey);
        const isInitialNativeFrame =
          transportState.lastNativeAck == null &&
          transportState.queueState.inFlightFrame == null &&
          transportState.queueState.pendingFrame == null;
        const isInitialEmptyFrame =
          isInitialNativeFrame &&
          (presentationPhase === 'idle' ||
            (presentationPhase === 'covered' &&
              isSearchMapRenderVisualSnapshotEmpty(preparedSourceSnapshot)));
        if (isInitialEmptyFrame) {
          return;
        }
        const lastDesiredPresentation = lastDesiredFrame?.presentation ?? null;
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
        // Round-2 transport fix: force-replace-on-new-request was a blunt trust reset —
        // it re-shipped the ENTIRE world (measured 4.9MB / ~180ms main-thread GL apply)
        // whenever the presentation REQUEST identity changed, even when the ACKED native
        // world already held byte-identical content (revisions are monotonic per source
        // store, so acked parity is a proof, not a guess: native confirmed applying these
        // exact revisions). Replace is forced only when the acked world provably differs;
        // content parity yields an honest zero-delta presentation-only frame. Residual
        // mismatch stays loud via the native rejection + baseline-resync path.
        const ackedBaselineRevisions = getSourceSyncBaselineRevisions();
        const ackedBaselineMatchesPreparedSnapshot =
          ackedBaselineRevisions != null &&
          ackedBaselineRevisions.pins === preparedSourceSnapshot.pins.sourceRevision &&
          ackedBaselineRevisions.pinInteractions ===
            preparedSourceSnapshot.pinInteractions.sourceRevision &&
          ackedBaselineRevisions.dots === preparedSourceSnapshot.dots.sourceRevision &&
          ackedBaselineRevisions.labelCollisions ===
            preparedSourceSnapshot.labelCollisions.sourceRevision;
        const sourceSyncBaselineRevisions =
          presentationSyncState.shouldForceReplaceForNewRequest &&
          !ackedBaselineMatchesPreparedSnapshot
            ? null
            : ackedBaselineRevisions;
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
          sourceSyncBaselineRevisions?.labelCollisions !==
          preparedSourceSnapshot.labelCollisions.sourceRevision
            ? 'labelCollisions'
            : null,
        ].filter((value): value is SearchMapRenderSourceId => value != null);
        const sourceSnapshotKind = deriveSearchMapVisualFrameSourceSnapshotKind({
          sourceFrameSnapshot,
          preparedSourceSnapshot,
        });
        const visualFrameTransactionKind = deriveSearchMapVisualFrameTransactionKind({
          presentationPhase,
          presentationState: nextPresentationState,
          isInitialNativeFrame,
        });
        const visualFrameTransaction = buildSearchMapVisualFrameTransaction({
          kind: visualFrameTransactionKind,
          presentationPhase,
          sourceFrameKey,
          sourceDataKey,
          sourceSnapshotKind,
        });
        const sourceTransportBuildStartedAtMs = resolveNativeRenderOwnerPerfNow();
        const hasSerializableSourceSnapshot = sourceSnapshotKind !== 'pending';
        const structuralSourceTransport = hasSerializableSourceSnapshot
          ? buildSearchMapRenderSourceTransport({
              previousSourceRevisions: sourceSyncBaselineRevisions,
              acknowledgedSnapshot: transportState.lastNativeAckSnapshot,
              nextSnapshot: preparedSourceSnapshot,
              changedSourceIds:
                sourceSyncBaselineRevisions == null
                  ? SEARCH_MAP_RENDER_SOURCE_IDS
                  : nominalChangedSources,
            })
          : PRESENTATION_ONLY_SEARCH_MAP_RENDER_SOURCE_TRANSPORT;
        const markerRoleFrameBaselineSnapshot =
          transportState.queueState.inFlightFrame?.snapshot ??
          transportState.lastNativeAckSnapshot ??
          (visualFrameTransactionKind === 'live_update'
            ? transportState.lastDesiredSnapshot
            : null);
        // NOTE: the markerRoleFrame is entangled with source ADMISSION + presentation mount/ack (native
        // sources_applied_visible depends on markerRoleFrame != nil), NOT purely LOD — gating it off in JS
        // here drops the instance to life:hidden (proven via the harness). The frame must keep flowing for
        // the lifecycle; the engine is the sole opacity authority NATIVE-side while admission still works.
        const shouldUseNativeRoleFrame =
          hasSerializableSourceSnapshot &&
          visualFrameTransactionKind === 'live_update' &&
          markerRoleFrameBaselineSnapshot != null &&
          structuralSourceTransport.effectiveChangedSourceIds.length > 0;
        const markerRoleFrame = shouldUseNativeRoleFrame
          ? buildSearchMapMarkerRoleFrame({
              mode: 'patch',
              nextSnapshot: preparedSourceSnapshot,
              previousSnapshot: markerRoleFrameBaselineSnapshot,
              sourceTransport: structuralSourceTransport,
            })
          : null;
        const sourceTransport = shouldUseNativeRoleFrame
          ? markerRoleFrame != null
            ? {
                effectiveChangedSourceIds: structuralSourceTransport.effectiveChangedSourceIds,
                markerRoleFrame,
              }
            : PRESENTATION_ONLY_SEARCH_MAP_RENDER_SOURCE_TRANSPORT
          : structuralSourceTransport;
        const effectiveSourceSnapshot = preparedSourceSnapshot;
        const effectiveFrame = preparedFrame;
        const sourceTransportBuildDurationMs =
          resolveNativeRenderOwnerPerfNow() - sourceTransportBuildStartedAtMs;
        const snapshotChanged = sourceTransport.effectiveChangedSourceIds.length > 0;
        const shouldQueueNativeEnterMountAckFrame =
          nextPresentationState.executionStage === 'enter_pending_mount' &&
          sourceSnapshotKind !== 'pending' &&
          sourceTransport.effectiveChangedSourceIds.length === 0 &&
          presentationRequestKey != null;
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
        if (__DEV__) {
          // [NGAPJS] token-hop probe: when a frame carrying a NEW enter startToken is staged,
          // log the admission decision + t — partitions the cardsAdmit→native-arrival gap.
          const g = globalThis as { __ngapLastTokenSeen?: number | null };
          const tokenNow = nextPresentationState.startToken ?? null;
          if (tokenNow != null && g.__ngapLastTokenSeen !== tokenNow) {
            g.__ngapLastTokenSeen = tokenNow;
            console.log(
              `[NGAPJS] tokenStaged t=${performance.now().toFixed(1)} decision=${frameAdmissionDecision}`
            );
          }
        }
        if (
          !shouldQueueNativeEnterMountAckFrame &&
          (frameAdmissionDecision === 'suppress_redundant_hidden_covered_frame' ||
            frameAdmissionDecision ===
              'suppress_same_execution_batch_viewport_presentation_frame' ||
            frameAdmissionDecision === 'suppress_transaction_presentation_only_frame')
        ) {
          transportState.lastDesiredExecutionBatchId = executionBatchId;
          transportState.lastDesiredFrame = effectiveFrame;
          transportState.lastDesiredSnapshot = effectiveSourceSnapshot;
          return;
        }
        if (
          !shouldQueueNativeEnterMountAckFrame &&
          frameAdmissionDecision === 'suppress_viewport_only_frame'
        ) {
          transportState.lastDesiredExecutionBatchId = executionBatchId;
          transportState.lastDesiredFrame = effectiveFrame;
          transportState.lastDesiredSnapshot = effectiveSourceSnapshot;
          return;
        }
        // D6d endgame fix (VDIAG-attributed): a PRESENTATION-ONLY frame (unchanged source
        // snapshot, same execution batch) must NOT mint a new frame generation — the native
        // enter lane keys its mount/source-ready/election state on the generation, so a fresh
        // id for identical sources forced a full re-mount + re-election (~106ms measured, the
        // toggle's residual gap). Reusing the generation lets native skip the reset: same
        // generation + empty deltas -> election and sourceReady survive -> the start token
        // gates through immediately.
        const canReuseFrameGeneration =
          !snapshotChanged &&
          transportState.lastDesiredFrameGenerationId != null &&
          transportState.lastDesiredExecutionBatchId === executionBatchId;
        if (__DEV__ && !canReuseFrameGeneration) {
          // [GENREUSE] endgame probe: WHY did this frame mint a new generation? (first fix
          // attempt was refuted by measurement — these inputs name the blocking condition)
          console.log(
            `[GENREUSE] mint snapshotChanged=${snapshotChanged} changedIds=${sourceTransport.effectiveChangedSourceIds.join(',') || 'none'} batchSame=${transportState.lastDesiredExecutionBatchId === executionBatchId}`
          );
        }
        if (!canReuseFrameGeneration) {
          transportState.frameGenerationSeq += 1;
        }
        const frameGenerationId = canReuseFrameGeneration
          ? transportState.lastDesiredFrameGenerationId!
          : `frame:${transportState.frameGenerationSeq}`;
        rememberSearchMapNativeFrameVisualSourceCounts({
          instanceId,
          frameGenerationId,
          executionBatchId,
          counts: {
            pinCount: effectiveSourceSnapshot.pins.idsInOrder.length,
            dotCount: effectiveSourceSnapshot.dots.idsInOrder.length,
          },
        });
        transportState.lastDesiredExecutionBatchId = executionBatchId;
        transportState.lastDesiredFrame = effectiveFrame;
        transportState.lastDesiredSnapshot = effectiveSourceSnapshot;
        transportState.lastDesiredFrameGenerationId = frameGenerationId;
        queueLatestNativeRenderOwnerFrameForTransport(transportState, {
          ownerEpoch,
          frameGenerationId,
          frameTransportRevision: ++transportState.frameTransportRevisionSeq,
          executionBatchId,
          frame: effectiveFrame,
          snapshot: effectiveSourceSnapshot,
          visualFrameTransaction,
          sourceTransport,
          sourceFrameKey,
          sourceDataKey,
          sourceFrameMatchState,
          sourceTransportBuildDurationMs,
          attribution: {
            frameAdmissionDecision,
            normalWorkEffect: frameAdmission.normalWorkEffect,
            sourceBaselineKind: sourceSyncBaselineRevisions == null ? 'replace_all' : 'ack_delta',
            snapshotChanged,
            viewportBoundsChanged,
            gestureStateChanged,
            movingStateChanged,
            presentationChanged,
            controlStateChanged,
            isMoving: viewportState.isMoving,
            isGestureActive: viewportState.isGestureActive,
            shouldQueueNativeEnterMountAckFrame,
            nominalChangedSourceIds: nominalChangedSources,
          },
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
    selectedRestaurantId,
    dots,
    interactionMode,
    labelCollisions,
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
        'labelCollisionSourceStore',
        'markersRenderKey',
        'mapSearchSurfaceResultsSourcesReady',
        'mapSearchSurfaceResultsSourcesReadyKey',
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
