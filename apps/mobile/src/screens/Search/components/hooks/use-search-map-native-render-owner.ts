import React from 'react';

import { logger } from '../../../../utils';
import type { MapBounds } from '../../../../types';
import {
  areSearchMapRenderPresentationStatesEqual,
  deriveSearchMapRenderPresentationPhase,
  deriveSearchMapRenderPresentationRequestKey,
  searchMapRenderController,
  type SearchMapRenderInteractionMode,
  type SearchMapRenderPresentationState,
} from '../../runtime/map/search-map-render-controller';
import {
  type MapMotionPressureController,
  type MotionPressureState,
} from '../../runtime/map/map-motion-pressure';
import type {
  SearchMapCommittedSourceDeltaJournal,
  SearchMapSourceStore,
  SearchMapSourceStoreDelta,
} from '../../runtime/map/search-map-source-store';

type SearchMapNativeRenderOwnerStatusArgs = {
  mapComponentInstanceId: string;
  resolvedMapTag: number | null;
  isMapStyleReady: boolean;
  presentationState: SearchMapRenderPresentationState;
  pinSourceId: string;
  pinInteractionSourceId: string;
  dotSourceId: string;
  dotInteractionSourceId: string;
  labelSourceId: string;
  labelInteractionSourceId: string;
  labelCollisionSourceId: string;
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
    startedAtMs: number;
  }) => void;
  onMarkerEnterSettled?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    executionBatchId: string | null;
    settledAtMs: number;
  }) => void;
  onMarkerExitStarted?: (payload: { requestKey: string; startedAtMs: number }) => void;
  onMarkerExitSettled?: (payload: { requestKey: string; settledAtMs: number }) => void;
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
  isMapStyleReady: boolean;
  isNativeAvailable: boolean;
  pins: SearchMapSourceStore;
  pinInteractions: SearchMapSourceStore;
  dots: SearchMapSourceStore;
  dotInteractions: SearchMapSourceStore;
  labels: SearchMapSourceStore;
  labelInteractions: SearchMapSourceStore;
  labelCollisions: SearchMapSourceStore;
  viewportState: SearchMapRenderViewportState;
  presentationState: SearchMapRenderPresentationState;
  highlightedMarkerKey: string | null;
  interactionMode: SearchMapRenderInteractionMode;
  onSyncError?: (message: string) => void;
};

type SearchMapNativeRenderOwnerArgs = SearchMapNativeRenderOwnerStatusArgs &
  Omit<
    SearchMapNativeRenderOwnerSyncArgs,
    'instanceId' | 'isAttached' | 'ownerEpoch' | 'isNativeAvailable'
  >;

const INSTANCE_ID_PREFIX = 'search-map-render-owner';
const NATIVE_READY_TIMEOUT_MS = 4000;

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
  interactionMode: SearchMapRenderInteractionMode;
};

const resolveNativeRenderOwnerFrameAdmission = ({
  hasPreviousDesiredFrame,
  snapshotChanged,
  viewportBoundsChanged,
  gestureStateChanged,
  movingStateChanged,
  presentationChanged,
  controlStateChanged,
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
  isSameExecutionBatchAsPreviousDesiredFrame: boolean;
  isMoving: boolean;
  isGestureActive: boolean;
  nowMs: number;
  pressureState: MotionPressureState;
}): {
  decision:
    | 'emit_frame'
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

  if (
    hasPreviousDesiredFrame &&
    !snapshotChanged &&
    !controlStateChanged &&
    isSameExecutionBatchAsPreviousDesiredFrame &&
    !isMoving &&
    !isGestureActive &&
    !gestureStateChanged &&
    !movingStateChanged &&
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
    isSameExecutionBatchAsPreviousDesiredFrame
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
};

const createNativeRenderOwnerTransportState = <
  TFrame extends MapRenderFrameTransportQueueFrame
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
});

const resetNativeRenderOwnerTransportState = <TFrame extends MapRenderFrameTransportQueueFrame>({
  state,
  resetDesiredExecutionBatchId = false,
}: {
  state: NativeRenderOwnerTransportState<TFrame>;
  resetDesiredExecutionBatchId?: boolean;
}): void => {
  state.lastDesiredFrame = null;
  state.lastDesiredFrameGenerationId = null;
  state.lastAppliedFrame = null;
  state.acknowledgedSourceRevisions = null;
  state.queueState.inFlightFrame = null;
  state.queueState.pendingFrame = null;
  state.queueState.syncInFlight = false;
  if (resetDesiredExecutionBatchId) {
    state.lastDesiredExecutionBatchId = null;
  }
};

const queueLatestNativeRenderOwnerFrameForTransport = <
  TFrame extends MapRenderFrameTransportQueueFrame
>(
  transportState: NativeRenderOwnerTransportState<TFrame>,
  nextFrame: TFrame
): void => {
  transportState.queueState.pendingFrame = nextFrame;
};

const takeNextNativeRenderOwnerFrameForTransport = <
  TFrame extends MapRenderFrameTransportQueueFrame
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
  TFrame extends MapRenderFrameTransportQueueFrame
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
  TFrame extends MapRenderFrameTransportQueueFrame
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
  TFrame extends MapRenderFrameTransportQueueFrame
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
  TFrame extends MapRenderFrameTransportQueueFrame
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
      return snapshot.pins;
    case 'pinInteractions':
      return snapshot.pinInteractions;
    case 'dots':
      return snapshot.dots;
    case 'dotInteractions':
      return snapshot.dotInteractions;
    case 'labels':
      return snapshot.labels;
    case 'labelInteractions':
      return snapshot.labelInteractions;
    case 'labelCollisions':
      return snapshot.labelCollisions;
  }
};

const getSearchMapRenderSourceRevisions = (
  snapshot: SearchMapRenderSnapshot
): SearchMapRenderSourceRevisionState => ({
  pins: snapshot.pins.sourceRevision,
  pinInteractions: snapshot.pinInteractions.sourceRevision,
  dots: snapshot.dots.sourceRevision,
  dotInteractions: snapshot.dotInteractions.sourceRevision,
  labels: snapshot.labels.sourceRevision,
  labelInteractions: snapshot.labelInteractions.sourceRevision,
  labelCollisions: snapshot.labelCollisions.sourceRevision,
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
      : buildReplayJournalDelta(acknowledgedSourceRevision, nextSourceStore) ??
        nextSourceStore.buildReplaceDelta();
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
      message.startsWith('enter_started') ||
      message.startsWith('enter_settled') ||
      message.startsWith('presentation_transition') ||
      message.startsWith('frame_snapshot_bypass'),
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
      ? presentationState.executionBatch?.batchId ?? null
      : null;
  if (presentationBatchId != null) {
    return presentationBatchId;
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
  if (presentationState.transactionId == null || presentationState.snapshotKind == null) {
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

const useSearchMapNativeRenderOwnerStatus = ({
  mapComponentInstanceId,
  resolvedMapTag,
  isMapStyleReady,
  presentationState,
  pinSourceId,
  pinInteractionSourceId,
  dotSourceId,
  dotInteractionSourceId,
  labelSourceId,
  labelInteractionSourceId,
  labelCollisionSourceId,
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
  const { isPresentationActive } = deriveSearchMapRenderPresentationStatusState(presentationState);
  const instanceIdRef = React.useRef<string | null>(null);
  const [isAttached, setIsAttached] = React.useState(false);
  const [attachState, setAttachState] = React.useState<
    'idle' | 'attaching' | 'attached' | 'failed'
  >('idle');
  const [ownerEpoch, setOwnerEpoch] = React.useState<number | null>(null);
  const [hasSyncedInitialFrame, setHasSyncedInitialFrame] = React.useState(false);
  const [nativeFatalErrorMessage, setNativeFatalErrorMessage] = React.useState<string | null>(null);
  const isAttachedStateRef = React.useRef(isAttached);
  const ownerEpochStateRef = React.useRef(ownerEpoch);
  const hasSyncedInitialFrameRef = React.useRef(hasSyncedInitialFrame);
  const isPresentationActiveRef = React.useRef(isPresentationActive);
  const nativeCommitBurstRef = React.useRef<NativeCommitBurstState>(createNativeCommitBurstState());
  if (instanceIdRef.current == null) {
    instanceIdRef.current = `${INSTANCE_ID_PREFIX}:${Math.random().toString(36).slice(2)}`;
  }
  const instanceId = instanceIdRef.current;
  const isNativeAvailable = searchMapRenderController.isAvailable();

  React.useEffect(() => {
    isAttachedStateRef.current = isAttached;
    ownerEpochStateRef.current = ownerEpoch;
    hasSyncedInitialFrameRef.current = hasSyncedInitialFrame;
    isPresentationActiveRef.current = isPresentationActive;
  }, [hasSyncedInitialFrame, isAttached, isPresentationActive, ownerEpoch]);

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

  React.useEffect(() => {
    let isActive = true;
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
      });
      setAttachState('failed');
      setNativeFatalErrorMessage(message);
      return () => {
        isActive = false;
      };
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
        logger.debug('[MAP-VIS-DIAG] native:attachReject', {
          instanceId,
          message,
        });
        setIsAttached(false);
        setAttachState('failed');
        setOwnerEpoch(null);
        setHasSyncedInitialFrame(false);
        setNativeFatalErrorMessage(`SearchMap native render owner attach failed: ${message}`);
      });
    return () => {
      isActive = false;
      setIsAttached(false);
      setAttachState('idle');
      setOwnerEpoch(null);
      setHasSyncedInitialFrame(false);
      setNativeFatalErrorMessage(null);
      void searchMapRenderController.detach(instanceId);
    };
  }, [
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
    const removeListener = searchMapRenderController.addListener((event) => {
      if (event.type === 'error') {
        const message = event.message ?? '';
        const isNativeDiagEvent = event.instanceId === '__native_diag__';
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
        if (message.startsWith('map_handle_refresh_context')) {
          flushNativeCommitBurst('map_handle_refresh_context', false);
          logger.debug('[MAP-RELOAD-DIAG] native:mapHandleRefreshContext', {
            instanceId,
            message,
          });
          return;
        }
        if (message.startsWith('map_handle_refresh')) {
          flushNativeCommitBurst('map_handle_refresh', false);
          logger.debug('[MAP-RELOAD-DIAG] native:mapHandleRefresh', {
            instanceId,
            message,
          });
          return;
        }
        if (message.startsWith('source_recovery_begin')) {
          flushNativeCommitBurst('source_recovery_begin', false);
          logger.debug('[MAP-RELOAD-DIAG] native:sourceRecovery', {
            instanceId,
            message,
          });
          return;
        }
        if (deriveNativeDiagnosticMessageState(message).shouldLogTransitionDiagnostics) {
          logger.debug('[MAP-VIS-DIAG] native:transition', {
            instanceId,
            message,
          });
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
        onLabelObservationUpdated?.({
          visibleLabelFeatureIds: event.visibleLabelFeatureIds,
          layerRenderedFeatureCount: event.layerRenderedFeatureCount,
          effectiveRenderedFeatureCount: event.effectiveRenderedFeatureCount,
          stickyChanged: event.stickyChanged,
        });
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
          setHasSyncedInitialFrame(false);
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
        setOwnerEpoch(event.ownerEpoch);
        setHasSyncedInitialFrame(true);
        return;
      }
      if (event.type === 'presentation_enter_armed') {
        logger.debug('[PRESENTATION-LANE-DIAG] nativeEnterArmed', {
          instanceId,
          requestKey: event.requestKey,
          frameGenerationId: event.frameGenerationId,
          executionBatchId: event.executionBatchId,
          armedAtMs: event.armedAtMs,
        });
        return;
      }
      if (event.type === 'presentation_execution_batch_mounted_hidden') {
        onExecutionBatchMountedHidden?.({
          requestKey: event.requestKey,
          frameGenerationId: event.frameGenerationId,
          executionBatchId: event.executionBatchId,
          readyAtMs: event.readyAtMs,
        });
        return;
      }
      if (event.type === 'presentation_enter_started') {
        onMarkerEnterStarted?.({
          requestKey: event.requestKey,
          frameGenerationId: event.frameGenerationId,
          executionBatchId: event.executionBatchId,
          startedAtMs: event.startedAtMs,
        });
        return;
      }
      if (event.type === 'presentation_enter_settled') {
        onMarkerEnterSettled?.({
          requestKey: event.requestKey,
          frameGenerationId: event.frameGenerationId,
          executionBatchId: event.executionBatchId,
          settledAtMs: event.settledAtMs,
        });
        return;
      }
      if (event.type === 'presentation_exit_started') {
        onMarkerExitStarted?.({
          requestKey: event.requestKey,
          startedAtMs: event.startedAtMs,
        });
        return;
      }
      if (event.type === 'presentation_exit_settled') {
        onMarkerExitSettled?.({
          requestKey: event.requestKey,
          settledAtMs: event.settledAtMs,
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
    });
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

  React.useEffect(() => {
    if (!isNativeAvailable || !isAttached) {
      return;
    }
    void searchMapRenderController
      .configureLabelObservation({
        instanceId,
        observationEnabled: labelObservationEnabled,
        allowFallback: true,
        commitInteractionVisibility: commitVisibleLabelInteractionVisibility,
        ...labelObservationConfig,
      })
      .catch(() => undefined);
  }, [
    commitVisibleLabelInteractionVisibility,
    instanceId,
    isAttached,
    isNativeAvailable,
    labelObservationConfig,
    labelObservationEnabled,
  ]);

  const isNativeOwnerReady = isAttached && ownerEpoch != null && hasSyncedInitialFrame;

  React.useEffect(() => {
    if (
      !isMapStyleReady ||
      !isNativeAvailable ||
      !isAttached ||
      isNativeOwnerReady ||
      !isPresentationActive
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
  }, [isAttached, isMapStyleReady, isNativeAvailable, isNativeOwnerReady, isPresentationActive]);

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
  isMapStyleReady,
  isNativeAvailable,
  pins,
  pinInteractions,
  dots,
  dotInteractions,
  labels,
  labelInteractions,
  labelCollisions,
  viewportState,
  presentationState,
  highlightedMarkerKey,
  interactionMode,
  onSyncError,
}: SearchMapNativeRenderOwnerSyncArgs): void => {
  type NativeRenderOwnerFrameEnvelope = {
    ownerEpoch: number;
    frameGenerationId: string;
    executionBatchId: string;
    frame: SearchMapRenderFrame;
    snapshot: SearchMapRenderSnapshot;
    sourceTransport: SearchMapRenderSourceTransportPayload;
  };
  const buildSourceSnapshot = React.useCallback(
    (): SearchMapRenderSnapshot => ({
      pins,
      pinInteractions,
      dots,
      dotInteractions,
      labels,
      labelInteractions,
      labelCollisions,
    }),
    [dots, dotInteractions, labelCollisions, labelInteractions, labels, pinInteractions, pins]
  );
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
        transportState.queueState.inFlightFrame?.frame.sourceRevisions ??
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
    void searchMapRenderController
      .setRenderFrame({
        instanceId,
        ownerEpoch: effectiveDesiredFrame.ownerEpoch,
        frameGenerationId: effectiveDesiredFrame.frameGenerationId,
        executionBatchId: effectiveDesiredFrame.executionBatchId,
        frame: effectiveDesiredFrame.frame,
        sourceTransport: effectiveDesiredFrame.sourceTransport,
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const shouldDropFrame =
          message.includes('stale owner epoch') ||
          (shouldIgnoreNativeSyncErrorsRef.current &&
            message.includes('invalid render frame payload'));
        if (shouldDropFrame) {
          const presentationDiagnosticsState = derivePresentationDiagnosticsState(
            effectiveDesiredFrame.frame.presentation
          );
          logger.debug('[MAP-VIS-DIAG] native:setRenderFrame:dropped', {
            instanceId,
            frameGenerationId: effectiveDesiredFrame.frameGenerationId,
            executionBatchId: effectiveDesiredFrame.executionBatchId,
            laneKind: presentationDiagnosticsState.laneKind,
            batchPhase: presentationDiagnosticsState.batchPhase,
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
      })
      .finally(() => {
        // Completion is coordinated by render_frame_synced or explicit recovery events.
      });
  }, [instanceId, mapMotionPressureController]);

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
    const removeListener = searchMapRenderController.addListener((event) => {
      if (event.instanceId !== instanceId) {
        return;
      }
      const transportState = transportStateRef.current;
      if (event.type === 'render_owner_invalidated') {
        logger.debug('[MAP-VIS-DIAG] native:ownerInvalidated', {
          instanceId,
          ownerEpoch: event.ownerEpoch,
          reason: event.reason,
          invalidatedAtMs: event.invalidatedAtMs,
        });
        ownerEpochRef.current = event.ownerEpoch;
        retargetNativeRenderOwnerTransportOwnerEpoch(transportState, event.ownerEpoch);
        return;
      }
      if (event.type === 'render_owner_recovered_after_style_reload') {
        logger.debug('[MAP-VIS-DIAG] native:recoveredAfterStyleReload:flushLatestDesiredFrame', {
          instanceId,
          frameGenerationId: event.frameGenerationId,
          ownerEpoch: event.ownerEpoch,
          recoveredAtMs: event.recoveredAtMs,
        });
        ownerEpochRef.current = event.ownerEpoch;
        retargetNativeRenderOwnerTransportOwnerEpoch(transportState, event.ownerEpoch);
        if (transportState.queueState.pendingFrame && isAttachedRef.current) {
          flushLatestDesiredFrame();
        }
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
      if (matchedFrame) {
        acknowledgeSnapshotSourceRevisions(matchedFrame.snapshot, event.sourceRevisions);
        transportState.lastAppliedFrame = matchedFrame;
      }
      if (transportState.queueState.inFlightFrame?.frameGenerationId === event.frameGenerationId) {
        acknowledgeNativeRenderOwnerFrameTransportSync(transportState, event.frameGenerationId);
        mapMotionPressureController.applySourcePublishLifecycleEvent({
          kind: 'synced',
          nowMs: Date.now(),
        });
        if (transportState.queueState.pendingFrame && isAttachedRef.current) {
          flushLatestDesiredFrame();
        }
      }
    });
    return () => {
      removeListener?.();
    };
  }, [flushLatestDesiredFrame, instanceId, isNativeAvailable, mapMotionPressureController]);

  React.useEffect(() => {
    mapMotionPressureController.updatePresentationTransaction(
      deriveMotionPressurePresentationTransaction(presentationState)
    );
    if (!isNativeAvailable || !isMapStyleReady || !isAttached || ownerEpoch == null) {
      return;
    }
    const nextSourceSnapshot = buildSourceSnapshot();
    const nextFrame: SearchMapRenderFrame = {
      sourceRevisions: getSearchMapRenderSourceRevisions(nextSourceSnapshot),
      viewport: viewportState,
      presentation: presentationState,
      highlightedMarkerKey,
      interactionMode,
    };
    const transportState = transportStateRef.current;
    const lastDesiredFrame = transportState.lastDesiredFrame;
    const lastDesiredPresentation = lastDesiredFrame?.presentation ?? null;
    const presentationTransportDiagnostics = deriveTransportDiagnosticsState(presentationState);
    const {
      viewportBoundsChanged,
      gestureStateChanged,
      movingStateChanged,
      presentationChanged,
      controlStateChanged,
    } = deriveFrameChangeState({
      previousFrame: lastDesiredFrame,
      nextFrame,
    });
    const presentationSyncState = derivePresentationSyncState({
      presentationState,
      previousPresentationState: lastDesiredPresentation,
    });
    const sourceSyncBaselineRevisions = presentationSyncState.shouldForceReplaceForNewRequest
      ? null
      : getSourceSyncBaselineRevisions();
    const nominalChangedSources = [
      sourceSyncBaselineRevisions?.pins !== pins.sourceRevision ? 'pins' : null,
      sourceSyncBaselineRevisions?.pinInteractions !== pinInteractions.sourceRevision
        ? 'pinInteractions'
        : null,
      sourceSyncBaselineRevisions?.dots !== dots.sourceRevision ? 'dots' : null,
      sourceSyncBaselineRevisions?.dotInteractions !== dotInteractions.sourceRevision
        ? 'dotInteractions'
        : null,
      sourceSyncBaselineRevisions?.labels !== labels.sourceRevision ? 'labels' : null,
      sourceSyncBaselineRevisions?.labelInteractions !== labelInteractions.sourceRevision
        ? 'labelInteractions'
        : null,
      sourceSyncBaselineRevisions?.labelCollisions !== labelCollisions.sourceRevision
        ? 'labelCollisions'
        : null,
    ].filter((value): value is SearchMapRenderSourceId => value != null);
    const sourceTransport = buildSearchMapRenderSourceTransport({
      previousSourceRevisions: sourceSyncBaselineRevisions,
      nextSnapshot: nextSourceSnapshot,
      changedSourceIds:
        sourceSyncBaselineRevisions == null ? SEARCH_MAP_RENDER_SOURCE_IDS : nominalChangedSources,
    });
    const sourceTransportDiagnostics = deriveSourceTransportDiagnostics({
      isMoving: viewportState.isMoving,
      sourceTransport,
    });
    const snapshotChanged = sourceTransport.effectiveChangedSourceIds.length > 0;
    if (sourceTransportDiagnostics.shouldLogSummary) {
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
      presentationState,
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
      isSameExecutionBatchAsPreviousDesiredFrame,
      isMoving: viewportState.isMoving,
      isGestureActive: viewportState.isGestureActive,
      nowMs,
      pressureState: mapMotionPressureController.getState(),
    });
    mapMotionPressureController.applyNormalWorkEffect(frameAdmission.normalWorkEffect, nowMs);
    const frameAdmissionDecision = frameAdmission.decision;
    if (
      frameAdmissionDecision === 'suppress_same_execution_batch_viewport_presentation_frame' ||
      frameAdmissionDecision === 'suppress_transaction_presentation_only_frame'
    ) {
      transportState.lastDesiredExecutionBatchId = executionBatchId;
      transportState.lastDesiredFrame = nextFrame;
      return;
    }
    if (frameAdmissionDecision === 'suppress_viewport_only_frame') {
      transportState.lastDesiredExecutionBatchId = executionBatchId;
      transportState.lastDesiredFrame = nextFrame;
      return;
    }
    transportState.frameGenerationSeq += 1;
    const frameGenerationId = `frame:${transportState.frameGenerationSeq}`;
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
    transportState.lastDesiredExecutionBatchId = executionBatchId;
    transportState.lastDesiredFrame = nextFrame;
    transportState.lastDesiredFrameGenerationId = frameGenerationId;
    queueLatestNativeRenderOwnerFrameForTransport(transportState, {
      ownerEpoch,
      frameGenerationId,
      executionBatchId,
      frame: nextFrame,
      snapshot: nextSourceSnapshot,
      sourceTransport,
    });
    flushLatestDesiredFrame();
  }, [
    buildSourceSnapshot,
    flushLatestDesiredFrame,
    highlightedMarkerKey,
    isAttached,
    isMapStyleReady,
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
    presentationState,
    mapMotionPressureController,
    viewportState,
  ]);
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
    viewportState,
    interactionMode,
    onSyncError,
    ...statusArgs
  } = args;

  const status = useSearchMapNativeRenderOwnerStatus(statusArgs);

  useSearchMapNativeRenderOwnerSync({
    mapMotionPressureController,
    instanceId: status.instanceId,
    isAttached: status.isAttached,
    ownerEpoch: status.ownerEpoch,
    isMapStyleReady: statusArgs.isMapStyleReady,
    isNativeAvailable: status.isNativeAvailable,
    pins,
    pinInteractions,
    dots,
    dotInteractions,
    labels,
    labelInteractions,
    labelCollisions,
    viewportState,
    presentationState: statusArgs.presentationState,
    highlightedMarkerKey: args.highlightedMarkerKey,
    interactionMode,
    onSyncError: onSyncError ?? status.reportNativeFatalError,
  });

  return status;
};
