import React from 'react';

import { logger } from '../../../../utils';
import {
  buildSearchMapRenderSourceTransport,
  getSearchMapRenderSourceRevisions,
  searchMapRenderController,
  type SearchMapRenderControllerEvent,
  type SearchMapRenderFrame,
  type SearchMapRenderInteractionMode,
  type SearchMapRenderSourceId,
  type SearchMapRenderSourceRevisionState,
  type SearchMapRenderSnapshot,
  type SearchMapRenderSourceTransportPayload,
  type SearchMapRenderViewportState,
} from '../../runtime/map/search-map-render-controller';
import type { PresentationLaneState } from '../../runtime/controller/presentation-transition-controller';
import type { SearchRuntimeMapPresentationPhase } from '../../runtime/shared/search-runtime-bus';
import type { SearchMapSourceStore } from '../../runtime/map/search-map-source-store';

type SearchMapNativeRenderOwnerStatusArgs = {
  mapComponentInstanceId: string;
  resolvedMapTag: number | null;
  mapRefIdentityRevision: number;
  isMapStyleReady: boolean;
  pinSourceId: string;
  pinInteractionSourceId: string;
  dotSourceId: string;
  dotInteractionSourceId: string;
  labelSourceId: string;
  labelInteractionSourceId: string;
  labelCollisionSourceId: string;
  onRevealBatchMountedHidden?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    readyAtMs: number;
  }) => void;
  onMarkerRevealStarted?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    startedAtMs: number;
  }) => void;
  onMarkerRevealFirstVisibleFrame?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    syncedAtMs: number;
  }) => void;
  onMarkerRevealSettled?: (payload: {
    requestKey: string;
    frameGenerationId: string | null;
    revealBatchId: string | null;
    settledAtMs: number;
  }) => void;
  onMarkerDismissStarted?: (payload: { requestKey: string; startedAtMs: number }) => void;
  onMarkerDismissSettled?: (payload: { requestKey: string; settledAtMs: number }) => void;
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
};

type SearchMapNativeRenderOwnerStatusResult = {
  instanceId: string;
  isAttached: boolean;
  isNativeAvailable: boolean;
  attachState: 'idle' | 'attaching' | 'attached' | 'failed';
  isNativeOwnerReady: boolean;
  nativeFatalErrorMessage: string | null;
  reportNativeFatalError: (message: string) => void;
};

type SearchMapNativeRenderOwnerSyncArgs = {
  instanceId: string;
  isAttached: boolean;
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
  presentationState: {
    lane: PresentationLaneState;
    loadingMode: string;
    selectedRestaurantId: string | null;
    allowEmptyReveal: boolean;
    batchPhase: SearchRuntimeMapPresentationPhase;
  };
  highlightedMarkerKey: string | null;
  interactionMode: SearchMapRenderInteractionMode;
  onSyncError?: (message: string) => void;
};

const INSTANCE_ID_PREFIX = 'search-map-render-owner';
const NATIVE_READY_TIMEOUT_MS = 4000;
const MOVING_SOURCE_SYNC_MIN_INTERVAL_MS = 48;
const INERTIA_SOURCE_SYNC_MIN_INTERVAL_MS = 96;

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

const shouldLogRenderFrameTransportSummary = ({
  isMoving,
  effectiveChangedSourceIds,
  sourceTransport,
}: {
  isMoving: boolean;
  effectiveChangedSourceIds: SearchMapRenderSourceId[];
  sourceTransport: SearchMapRenderSourceTransportPayload;
}): boolean => {
  if (!isMoving || effectiveChangedSourceIds.length === 0) {
    return false;
  }
  return (sourceTransport.sourceDeltas ?? []).some(
    (delta) =>
      delta.mode === 'replace' ||
      delta.nextFeatureIdsInOrder.length >= 80 ||
      delta.removeIds.length >= 20 ||
      (delta.upsertFeatures?.length ?? 0) >= 20
  );
};

const buildRenderFrameTransportSummary = (
  sourceTransport: SearchMapRenderSourceTransportPayload
): Array<{
  sourceId: SearchMapRenderSourceId;
  mode: 'patch' | 'replace';
  nextCount: number;
  removeCount: number;
  upsertCount: number;
}> =>
  (sourceTransport.sourceDeltas ?? []).map((delta) => ({
    sourceId: delta.sourceId,
    mode: delta.mode,
    nextCount: delta.nextFeatureIdsInOrder.length,
    removeCount: delta.removeIds.length,
    upsertCount: delta.upsertFeatures?.length ?? 0,
  }));

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

const parsePendingVisualCommitSummary = (message: string) => {
  const pendingVisualCommitsMatch = message.match(/pendingVisualCommits=([^ ]+)/);
  const blockedRevealWaitMsMatch = message.match(/blockedRevealWaitMs=([^ ]+)/);
  const blockedSettleWaitMsMatch = message.match(/blockedSettleWaitMs=([^ ]+)/);
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
  return {
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
  };
};

const parseSourceIdFromCommitMessage = (message: string): string | null => {
  const match = message.match(/sourceId=([^ ]+)/);
  const sourceId = match?.[1]?.trim();
  return sourceId && sourceId.length > 0 ? sourceId : null;
};

const shouldLogNativeRevealVisualDiag = (message: string): boolean =>
  message.startsWith('frame_final_write_mismatch') ||
  message.startsWith('reveal_started') ||
  message.startsWith('reveal_settled') ||
  message.startsWith('presentation_transition') ||
  message.startsWith('frame_snapshot_bypass');

const sortSourceCountEntries = (sourceCounts: Record<string, number>) =>
  Object.entries(sourceCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([sourceId, count]) => ({ sourceId, count }));

const SEARCH_MAP_RENDER_SOURCE_IDS: SearchMapRenderSourceId[] = [
  'pins',
  'pinInteractions',
  'dots',
  'dotInteractions',
  'labels',
  'labelInteractions',
  'labelCollisions',
];

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

export const useSearchMapNativeRenderOwnerStatus = ({
  mapComponentInstanceId,
  resolvedMapTag,
  mapRefIdentityRevision,
  isMapStyleReady,
  pinSourceId,
  pinInteractionSourceId,
  dotSourceId,
  dotInteractionSourceId,
  labelSourceId,
  labelInteractionSourceId,
  labelCollisionSourceId,
  onRevealBatchMountedHidden,
  onMarkerRevealStarted,
  onMarkerRevealFirstVisibleFrame,
  onMarkerRevealSettled,
  onMarkerDismissStarted,
  onMarkerDismissSettled,
  onRecoveredAfterStyleReload,
  onViewportChanged,
}: SearchMapNativeRenderOwnerStatusArgs): SearchMapNativeRenderOwnerStatusResult => {
  const instanceIdRef = React.useRef<string | null>(null);
  const [isAttached, setIsAttached] = React.useState(false);
  const [attachState, setAttachState] = React.useState<
    'idle' | 'attaching' | 'attached' | 'failed'
  >('idle');
  const [hasSyncedInitialFrame, setHasSyncedInitialFrame] = React.useState(false);
  const [nativeFatalErrorMessage, setNativeFatalErrorMessage] = React.useState<string | null>(null);
  const nativeCommitBurstRef = React.useRef<NativeCommitBurstState>(createNativeCommitBurstState());
  if (instanceIdRef.current == null) {
    instanceIdRef.current = `${INSTANCE_ID_PREFIX}:${Math.random().toString(36).slice(2)}`;
  }
  const instanceId = instanceIdRef.current;
  const isNativeAvailable = searchMapRenderController.isAvailable();

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
      logger.info('[MAP-CHURN-DIAG] native:commitBurst', {
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
        topPendingEventSources: sortSourceCountEntries(burst.pendingEventCountBySourceId),
        topAckEventSources: sortSourceCountEntries(burst.ackEventCountBySourceId),
        topPendingVisualSources: sortSourceCountEntries(burst.maxPendingVisualEntriesBySourceId),
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
    const parsed = parsePendingVisualCommitSummary(message);
    if (burst.startedAtMs <= 0) {
      burst.startedAtMs = nowMs;
    }
    if (message.startsWith('source_commit_pending')) {
      burst.pendingEventCount += 1;
    } else if (message.startsWith('source_commit_ack')) {
      burst.ackEventCount += 1;
    }
    const sourceId = parseSourceIdFromCommitMessage(message);
    if (sourceId) {
      if (message.startsWith('source_commit_pending')) {
        burst.pendingEventCountBySourceId[sourceId] =
          (burst.pendingEventCountBySourceId[sourceId] ?? 0) + 1;
      } else if (message.startsWith('source_commit_ack')) {
        burst.ackEventCountBySourceId[sourceId] =
          (burst.ackEventCountBySourceId[sourceId] ?? 0) + 1;
      }
    }
    burst.maxPendingSources = Math.max(burst.maxPendingSources, parsed.pendingSources);
    burst.maxPendingEntries = Math.max(burst.maxPendingEntries, parsed.pendingEntries);
    Object.entries(parsed.pendingVisualEntriesBySourceId).forEach(([pendingSourceId, count]) => {
      burst.maxPendingVisualEntriesBySourceId[pendingSourceId] = Math.max(
        burst.maxPendingVisualEntriesBySourceId[pendingSourceId] ?? 0,
        count
      );
    });
    burst.maxBlockedRevealWaitMs = Math.max(
      burst.maxBlockedRevealWaitMs ?? 0,
      parsed.blockedRevealWaitMs ?? 0
    );
    burst.maxBlockedSettleWaitMs = Math.max(
      burst.maxBlockedSettleWaitMs ?? 0,
      parsed.blockedSettleWaitMs ?? 0
    );
    burst.lastMessageAtMs = nowMs;
  }, []);

  React.useEffect(() => {
    let isActive = true;
    setIsAttached(false);
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
      logger.info('[MAP-VIS-DIAG] native:attachRejectedNoMapTag', {
        instanceId,
        componentInstanceId: mapComponentInstanceId,
        mapTag,
        mapRefIdentityRevision,
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
        setIsAttached(true);
        setAttachState('attached');
        setHasSyncedInitialFrame(false);
        setNativeFatalErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        logger.info('[MAP-VIS-DIAG] native:attachReject', {
          instanceId,
          message,
        });
        setIsAttached(false);
        setAttachState('failed');
        setHasSyncedInitialFrame(false);
        setNativeFatalErrorMessage(`SearchMap native render owner attach failed: ${message}`);
      });
    return () => {
      isActive = false;
      setIsAttached(false);
      setAttachState('idle');
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
    mapRefIdentityRevision,
    pinInteractionSourceId,
    pinSourceId,
    resolvedMapTag,
  ]);

  React.useEffect(() => {
    if (!isNativeAvailable) {
      return;
    }
    const removeListener = searchMapRenderController.addListener(
      (event: SearchMapRenderControllerEvent) => {
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
            logger.info('[MAP-RELOAD-DIAG] native:mapHandleRefreshContext', {
              instanceId,
              message,
            });
            return;
          }
          if (message.startsWith('map_handle_refresh')) {
            flushNativeCommitBurst('map_handle_refresh', false);
            logger.info('[MAP-RELOAD-DIAG] native:mapHandleRefresh', {
              instanceId,
              message,
            });
            return;
          }
          if (message.startsWith('source_recovery_begin')) {
            flushNativeCommitBurst('source_recovery_begin', false);
            logger.info('[MAP-RELOAD-DIAG] native:sourceRecovery', {
              instanceId,
              message,
            });
            return;
          }
          if (shouldLogNativeRevealVisualDiag(message)) {
            logger.info('[MAP-VIS-DIAG] native:transition', {
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
        if (event.type === 'attached') {
          setIsAttached(true);
          setAttachState('attached');
          setHasSyncedInitialFrame(false);
          setNativeFatalErrorMessage(null);
          return;
        }
        if (event.type === 'detached') {
          setIsAttached(false);
          setAttachState('idle');
          setHasSyncedInitialFrame(false);
          return;
        }
        if (event.type === 'render_frame_synced') {
          setHasSyncedInitialFrame(true);
          return;
        }
        if (event.type === 'presentation_reveal_armed') {
          onRevealBatchMountedHidden?.({
            requestKey: event.requestKey,
            frameGenerationId: event.frameGenerationId,
            revealBatchId: event.revealBatchId,
            readyAtMs: event.armedAtMs,
          });
          return;
        }
        if (event.type === 'presentation_reveal_batch_mounted_hidden') {
          return;
        }
        if (event.type === 'presentation_reveal_first_visible_frame') {
          onMarkerRevealFirstVisibleFrame?.({
            requestKey: event.requestKey,
            frameGenerationId: event.frameGenerationId,
            revealBatchId: event.revealBatchId,
            syncedAtMs: event.syncedAtMs,
          });
          return;
        }
        if (event.type === 'presentation_reveal_started') {
          onMarkerRevealStarted?.({
            requestKey: event.requestKey,
            frameGenerationId: event.frameGenerationId,
            revealBatchId: event.revealBatchId,
            startedAtMs: event.startedAtMs,
          });
          return;
        }
        if (event.type === 'presentation_reveal_settled') {
          onMarkerRevealSettled?.({
            requestKey: event.requestKey,
            frameGenerationId: event.frameGenerationId,
            revealBatchId: event.revealBatchId,
            settledAtMs: event.settledAtMs,
          });
          return;
        }
        if (event.type === 'presentation_dismiss_started') {
          onMarkerDismissStarted?.({
            requestKey: event.requestKey,
            startedAtMs: event.startedAtMs,
          });
          return;
        }
        if (event.type === 'presentation_dismiss_settled') {
          onMarkerDismissSettled?.({
            requestKey: event.requestKey,
            settledAtMs: event.settledAtMs,
          });
          return;
        }
        if (event.type === 'render_owner_recovered_after_style_reload') {
          setHasSyncedInitialFrame(true);
          onRecoveredAfterStyleReload?.({
            recoveredAtMs: event.recoveredAtMs,
          });
        }
      }
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
    onRevealBatchMountedHidden,
    onMarkerDismissSettled,
    onMarkerDismissStarted,
    onMarkerRevealFirstVisibleFrame,
    onMarkerRevealStarted,
    onMarkerRevealSettled,
    onViewportChanged,
    onRecoveredAfterStyleReload,
    pinSourceId,
  ]);

  const isNativeOwnerReady = isAttached && hasSyncedInitialFrame;

  React.useEffect(() => {
    if (!isMapStyleReady || !isNativeAvailable || !isAttached || isNativeOwnerReady) {
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
    isNativeOwnerReady,
    nativeFatalErrorMessage,
    reportNativeFatalError,
  };
};

export const useSearchMapNativeRenderOwnerSync = ({
  instanceId,
  isAttached,
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
  type NativeRenderOwnerQueuedFrame = {
    frameGenerationId: string;
    revealBatchId: string;
    frame: SearchMapRenderFrame;
    snapshot: SearchMapRenderSnapshot;
    sourceTransport: SearchMapRenderSourceTransportPayload;
    suppressedViewportFrames: number;
    replacedQueuedFrames: number;
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
  const lastDesiredFrameRef = React.useRef<SearchMapRenderFrame | null>(null);
  const lastAppliedFrameRef = React.useRef<NativeRenderOwnerQueuedFrame | null>(null);
  const acknowledgedSourceRevisionsRef = React.useRef<SearchMapRenderSourceRevisionState | null>(
    null
  );
  const inFlightFrameRef = React.useRef<NativeRenderOwnerQueuedFrame | null>(null);
  const frameGenerationSeqRef = React.useRef(0);
  const revealBatchSeqRef = React.useRef(0);
  const lastDesiredRevealBatchIdRef = React.useRef<string | null>(null);
  const syncInFlightRef = React.useRef(false);
  const isAttachedRef = React.useRef(isAttached);
  const shouldIgnoreNativeSyncErrorsRef = React.useRef(!isAttached);
  const suppressedViewportFrameCountRef = React.useRef(0);
  const lastMovingSourceSyncAtMsRef = React.useRef(0);
  const replacedQueuedFrameCountRef = React.useRef(0);
  const queuedFrameRef = React.useRef<NativeRenderOwnerQueuedFrame | null>(null);
  const deferredPostRevealFrameRef = React.useRef<NativeRenderOwnerQueuedFrame | null>(null);
  const deferredPostDismissFrameRef = React.useRef<NativeRenderOwnerQueuedFrame | null>(null);
  const presentationStateRef = React.useRef(presentationState);
  const onSyncErrorRef = React.useRef(onSyncError);
  const awaitingSyncFrameGenerationIdRef = React.useRef<string | null>(null);
  const getSourceSyncBaselineRevisions =
    React.useCallback((): SearchMapRenderSourceRevisionState | null => {
      return (
        inFlightFrameRef.current?.frame.sourceRevisions ??
        lastAppliedFrameRef.current?.frame.sourceRevisions ??
        acknowledgedSourceRevisionsRef.current
      );
    }, []);

  const isDismissQueuedFrame = React.useCallback(
    (queuedFrame: NativeRenderOwnerQueuedFrame | null): boolean =>
      queuedFrame?.frame.presentation.lane?.kind === 'dismiss',
    []
  );

  React.useEffect(() => {
    onSyncErrorRef.current = onSyncError;
  }, [onSyncError]);

  React.useEffect(() => {
    presentationStateRef.current = presentationState;
  }, [presentationState]);

  React.useEffect(() => {
    isAttachedRef.current = isAttached;
    shouldIgnoreNativeSyncErrorsRef.current = !isAttached;
  }, [isAttached]);

  React.useEffect(() => {
    return () => {
      shouldIgnoreNativeSyncErrorsRef.current = true;
      isAttachedRef.current = false;
      queuedFrameRef.current = null;
      deferredPostRevealFrameRef.current = null;
      deferredPostDismissFrameRef.current = null;
      acknowledgedSourceRevisionsRef.current = null;
      syncInFlightRef.current = false;
      awaitingSyncFrameGenerationIdRef.current = null;
    };
  }, []);

  const flushQueuedFrame = React.useCallback(() => {
    if (!isAttachedRef.current) {
      queuedFrameRef.current = null;
      syncInFlightRef.current = false;
      return;
    }
    if (syncInFlightRef.current || !queuedFrameRef.current) {
      return;
    }
    const nextQueuedFrame = queuedFrameRef.current;
    queuedFrameRef.current = null;
    syncInFlightRef.current = true;
    inFlightFrameRef.current = nextQueuedFrame;
    awaitingSyncFrameGenerationIdRef.current = nextQueuedFrame.frameGenerationId;
    void searchMapRenderController
      .setRenderFrame({
        instanceId,
        frameGenerationId: nextQueuedFrame.frameGenerationId,
        revealBatchId: nextQueuedFrame.revealBatchId,
        frame: nextQueuedFrame.frame,
        sourceTransport: nextQueuedFrame.sourceTransport,
      })
      .catch((error: unknown) => {
        awaitingSyncFrameGenerationIdRef.current = null;
        const message = error instanceof Error ? error.message : String(error);
        const shouldSuppressMissingInstance = message.includes('unknown instance or frame');
        const shouldSuppressStalePreDismissReject =
          presentationStateRef.current.lane?.kind === 'dismiss' &&
          !isDismissQueuedFrame(nextQueuedFrame);
        const shouldSuppressDetachRace =
          shouldSuppressMissingInstance ||
          (shouldIgnoreNativeSyncErrorsRef.current &&
            (message.includes('invalid render frame payload') ||
              message.includes('unknown instance or frame')));
        if (shouldSuppressStalePreDismissReject) {
          logger.info('[MAP-VIS-DIAG] native:setRenderFrame:suppressStalePreDismissReject', {
            instanceId,
            frameGenerationId: nextQueuedFrame.frameGenerationId,
            revealBatchId: nextQueuedFrame.revealBatchId,
            message,
          });
          syncInFlightRef.current = false;
          if (inFlightFrameRef.current === nextQueuedFrame) {
            inFlightFrameRef.current = null;
          }
          if (queuedFrameRef.current && isAttachedRef.current) {
            flushQueuedFrame();
          }
          return;
        }
        if (shouldSuppressDetachRace) {
          logger.info('[MAP-VIS-DIAG] native:setRenderFrame:suppressDetachRace', {
            instanceId,
            message,
          });
          return;
        }
        logger.info('[MAP-VIS-DIAG] native:setRenderFrame:reject', {
          instanceId,
          message,
        });
        onSyncErrorRef.current?.(`SearchMap native render owner frame sync failed: ${message}`);
        syncInFlightRef.current = false;
        if (inFlightFrameRef.current === nextQueuedFrame) {
          inFlightFrameRef.current = null;
        }
        if (queuedFrameRef.current && isAttachedRef.current) {
          flushQueuedFrame();
        }
      })
      .finally(() => {
        // Advance the queue only after render_frame_synced acknowledges the frame.
      });
  }, [instanceId]);

  React.useEffect(() => {
    if (!isAttached) {
      lastDesiredFrameRef.current = null;
      lastAppliedFrameRef.current = null;
      lastDesiredRevealBatchIdRef.current = null;
      acknowledgedSourceRevisionsRef.current = null;
      inFlightFrameRef.current = null;
      queuedFrameRef.current = null;
      deferredPostRevealFrameRef.current = null;
      deferredPostDismissFrameRef.current = null;
      syncInFlightRef.current = false;
      awaitingSyncFrameGenerationIdRef.current = null;
      suppressedViewportFrameCountRef.current = 0;
      lastMovingSourceSyncAtMsRef.current = 0;
      replacedQueuedFrameCountRef.current = 0;
    }
  }, [isAttached]);

  React.useEffect(() => {
    if (
      presentationState.lane?.kind === 'reveal' ||
      presentationState.batchPhase === 'revealing' ||
      presentationState.batchPhase === 'reveal_requested'
    ) {
      return;
    }
    deferredPostRevealFrameRef.current = null;
  }, [presentationState.batchPhase, presentationState.lane]);

  React.useEffect(() => {
    if (presentationState.lane?.kind === 'dismiss') {
      return;
    }
    const deferredFrame = deferredPostDismissFrameRef.current;
    if (deferredFrame == null) {
      return;
    }
    deferredPostDismissFrameRef.current = null;
    if (syncInFlightRef.current && queuedFrameRef.current) {
      replacedQueuedFrameCountRef.current += 1;
    }
    queuedFrameRef.current = deferredFrame;
    flushQueuedFrame();
  }, [flushQueuedFrame, presentationState.lane]);

  React.useEffect(() => {
    if (!isNativeAvailable) {
      return;
    }
    const removeListener = searchMapRenderController.addListener(
      (event: SearchMapRenderControllerEvent) => {
        if (event.instanceId !== instanceId || event.type !== 'render_frame_synced') {
          return;
        }
        acknowledgedSourceRevisionsRef.current = event.sourceRevisions;
        const matchedFrame = [
          inFlightFrameRef.current,
          lastAppliedFrameRef.current,
          queuedFrameRef.current,
        ].find((candidateFrame) => candidateFrame?.frameGenerationId === event.frameGenerationId);
        if (matchedFrame) {
          acknowledgeSnapshotSourceRevisions(matchedFrame.snapshot, event.sourceRevisions);
          lastAppliedFrameRef.current = matchedFrame;
        }
        if (awaitingSyncFrameGenerationIdRef.current === event.frameGenerationId) {
          awaitingSyncFrameGenerationIdRef.current = null;
          if (inFlightFrameRef.current?.frameGenerationId === event.frameGenerationId) {
            inFlightFrameRef.current = null;
          }
          syncInFlightRef.current = false;
          if (queuedFrameRef.current && isAttachedRef.current) {
            flushQueuedFrame();
          }
        }
      }
    );
    return () => {
      removeListener?.();
    };
  }, [flushQueuedFrame, instanceId, isNativeAvailable]);

  React.useEffect(() => {
    if (!isNativeAvailable) {
      return;
    }
    const removeListener = searchMapRenderController.addListener(
      (event: SearchMapRenderControllerEvent) => {
        if (event.instanceId !== instanceId || event.type !== 'presentation_reveal_settled') {
          return;
        }
        const activeRevealLane =
          presentationStateRef.current.lane?.kind === 'reveal'
            ? presentationStateRef.current.lane
            : null;
        if (
          activeRevealLane?.kind !== 'reveal' ||
          activeRevealLane.status !== 'revealing' ||
          activeRevealLane.requestKey !== event.requestKey ||
          deferredPostRevealFrameRef.current == null
        ) {
          return;
        }
        const deferredFrame = deferredPostRevealFrameRef.current;
        deferredPostRevealFrameRef.current = null;
        if (deferredFrame == null) {
          return;
        }
        if (syncInFlightRef.current && queuedFrameRef.current) {
          replacedQueuedFrameCountRef.current += 1;
        }
        queuedFrameRef.current = deferredFrame;
        flushQueuedFrame();
      }
    );
    return () => {
      removeListener?.();
    };
  }, [flushQueuedFrame, instanceId, isNativeAvailable]);

  React.useEffect(() => {
    if (!isNativeAvailable || !isMapStyleReady || !isAttached) {
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
    const lastDesiredFrame = lastDesiredFrameRef.current;
    const nowMs = Date.now();
    const viewportBoundsChanged =
      lastDesiredFrame?.viewport.bounds?.northEast.lat !== viewportState.bounds?.northEast.lat ||
      lastDesiredFrame?.viewport.bounds?.northEast.lng !== viewportState.bounds?.northEast.lng ||
      lastDesiredFrame?.viewport.bounds?.southWest.lat !== viewportState.bounds?.southWest.lat ||
      lastDesiredFrame?.viewport.bounds?.southWest.lng !== viewportState.bounds?.southWest.lng;
    const gestureStateChanged =
      lastDesiredFrame?.viewport.isGestureActive !== viewportState.isGestureActive;
    const movingStateChanged = lastDesiredFrame?.viewport.isMoving !== viewportState.isMoving;
    const presentationChanged =
      lastDesiredFrame?.presentation.lane !== presentationState.lane ||
      lastDesiredFrame?.presentation.loadingMode !== presentationState.loadingMode ||
      lastDesiredFrame?.presentation.selectedRestaurantId !==
        presentationState.selectedRestaurantId ||
      lastDesiredFrame?.presentation.batchPhase !== presentationState.batchPhase;
    const controlStateChanged =
      lastDesiredFrame?.highlightedMarkerKey !== highlightedMarkerKey ||
      lastDesiredFrame?.interactionMode !== interactionMode;
    const sourceSyncBaselineRevisions = getSourceSyncBaselineRevisions();
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
    const snapshotChanged = sourceTransport.effectiveChangedSourceIds.length > 0;
    if (
      shouldLogRenderFrameTransportSummary({
        isMoving: viewportState.isMoving,
        effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
        sourceTransport,
      })
    ) {
      logger.info('[MAP-CHURN-DIAG] js:renderFrameTransport', {
        instanceId,
        isMoving: viewportState.isMoving,
        isGestureActive: viewportState.isGestureActive,
        batchPhase: presentationState.batchPhase,
        effectiveChangedSourceIds: sourceTransport.effectiveChangedSourceIds,
        sourceDeltaSummary: buildRenderFrameTransportSummary(sourceTransport),
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
    const shouldSuppressViewportOnlyFrame =
      lastDesiredFrame != null &&
      !snapshotChanged &&
      !presentationChanged &&
      !controlStateChanged &&
      (viewportBoundsChanged || gestureStateChanged || movingStateChanged);
    if (shouldSuppressViewportOnlyFrame) {
      suppressedViewportFrameCountRef.current += 1;
      return;
    }
    const shouldSuppressMovingSourceFrame =
      lastDesiredFrame != null &&
      viewportState.isMoving &&
      presentationState.batchPhase === 'live' &&
      snapshotChanged &&
      !presentationChanged &&
      !controlStateChanged &&
      nowMs - lastMovingSourceSyncAtMsRef.current <
        (viewportState.isGestureActive
          ? MOVING_SOURCE_SYNC_MIN_INTERVAL_MS
          : INERTIA_SOURCE_SYNC_MIN_INTERVAL_MS);
    if (shouldSuppressMovingSourceFrame) {
      lastDesiredRevealBatchIdRef.current = revealBatchId;
      lastDesiredFrameRef.current = nextFrame;
      return;
    }
    frameGenerationSeqRef.current += 1;
    const frameGenerationId = `frame:${frameGenerationSeqRef.current}`;
    const revealBatchId = snapshotChanged
      ? `batch:${++revealBatchSeqRef.current}`
      : lastDesiredRevealBatchIdRef.current ?? `batch:${++revealBatchSeqRef.current}`;
    const activeRevealLane =
      presentationState.lane?.kind === 'reveal' ? presentationState.lane : null;
    const shouldFreezeRevealBatchFrame =
      presentationState.batchPhase === 'revealing' &&
      activeRevealLane != null &&
      activeRevealLane.batch != null &&
      lastDesiredFrame != null &&
      lastDesiredFrame.presentation.lane?.kind === 'reveal' &&
      lastDesiredFrame.presentation.lane.batch?.requestKey === activeRevealLane.batch.requestKey &&
      lastDesiredFrame.presentation.lane.batch?.batchId === activeRevealLane.batch.batchId &&
      lastDesiredFrame.presentation.lane.batch?.generationId ===
        activeRevealLane.batch.generationId &&
      lastDesiredFrame.presentation.lane.startToken === activeRevealLane.startToken &&
      (snapshotChanged ||
        viewportBoundsChanged ||
        gestureStateChanged ||
        movingStateChanged ||
        controlStateChanged);
    const activeDismissLane =
      presentationState.lane?.kind === 'dismiss' ? presentationState.lane : null;
    const dismissBaselineQueuedFrame =
      activeDismissLane != null ? lastAppliedFrameRef.current : null;
    const dismissBaselineFrame =
      activeDismissLane != null
        ? dismissBaselineQueuedFrame?.frame ?? lastDesiredFrameRef.current
        : null;
    const dismissBaselineSnapshot = dismissBaselineQueuedFrame?.snapshot ?? nextSourceSnapshot;
    const dismissBaselineRevealBatchId =
      dismissBaselineQueuedFrame?.revealBatchId ??
      lastDesiredRevealBatchIdRef.current ??
      revealBatchId;
    const shouldArmDismissFreezeFrame =
      activeDismissLane != null &&
      dismissBaselineFrame != null &&
      !(
        lastDesiredFrame?.presentation.lane?.kind === 'dismiss' &&
        lastDesiredFrame.presentation.lane.requestKey === activeDismissLane.requestKey
      );
    const shouldFreezeDismissFrame =
      activeDismissLane != null &&
      lastDesiredFrame != null &&
      lastDesiredFrame.presentation.lane?.kind === 'dismiss' &&
      lastDesiredFrame.presentation.lane.requestKey === activeDismissLane.requestKey &&
      (snapshotChanged ||
        viewportBoundsChanged ||
        gestureStateChanged ||
        movingStateChanged ||
        controlStateChanged ||
        presentationChanged);
    if (shouldArmDismissFreezeFrame) {
      const frozenFrame: SearchMapRenderFrame = {
        sourceRevisions: dismissBaselineFrame.sourceRevisions,
        viewport: dismissBaselineFrame.viewport,
        presentation: presentationState,
        highlightedMarkerKey: dismissBaselineFrame.highlightedMarkerKey,
        interactionMode,
      };
      lastDesiredRevealBatchIdRef.current = dismissBaselineRevealBatchId;
      lastDesiredFrameRef.current = frozenFrame;
      if (syncInFlightRef.current && queuedFrameRef.current) {
        replacedQueuedFrameCountRef.current += 1;
      }
      const replacedQueuedFrames = replacedQueuedFrameCountRef.current;
      const suppressedViewportFrames = suppressedViewportFrameCountRef.current;
      replacedQueuedFrameCountRef.current = 0;
      suppressedViewportFrameCountRef.current = 0;
      queuedFrameRef.current = {
        frameGenerationId,
        revealBatchId: dismissBaselineRevealBatchId,
        frame: frozenFrame,
        snapshot: dismissBaselineSnapshot,
        sourceTransport: {
          effectiveChangedSourceIds: [],
        },
        replacedQueuedFrames,
        suppressedViewportFrames,
      };
      flushQueuedFrame();
      return;
    }
    if (shouldFreezeRevealBatchFrame) {
      const replacedQueuedFrames = replacedQueuedFrameCountRef.current;
      const suppressedViewportFrames = suppressedViewportFrameCountRef.current;
      replacedQueuedFrameCountRef.current = 0;
      suppressedViewportFrameCountRef.current = 0;
      deferredPostRevealFrameRef.current = {
        frameGenerationId,
        revealBatchId,
        frame: nextFrame,
        snapshot: nextSourceSnapshot,
        sourceTransport,
        replacedQueuedFrames,
        suppressedViewportFrames,
      };
      lastDesiredRevealBatchIdRef.current = revealBatchId;
      lastDesiredFrameRef.current = nextFrame;
      return;
    }
    if (shouldFreezeDismissFrame) {
      return;
    }
    lastDesiredRevealBatchIdRef.current = revealBatchId;
    lastDesiredFrameRef.current = nextFrame;
    if (syncInFlightRef.current && queuedFrameRef.current) {
      replacedQueuedFrameCountRef.current += 1;
    }
    const replacedQueuedFrames = replacedQueuedFrameCountRef.current;
    const suppressedViewportFrames = suppressedViewportFrameCountRef.current;
    replacedQueuedFrameCountRef.current = 0;
    suppressedViewportFrameCountRef.current = 0;
    queuedFrameRef.current = {
      frameGenerationId,
      revealBatchId,
      frame: nextFrame,
      snapshot: nextSourceSnapshot,
      sourceTransport,
      replacedQueuedFrames,
      suppressedViewportFrames,
    };
    if (viewportState.isMoving && snapshotChanged) {
      lastMovingSourceSyncAtMsRef.current = nowMs;
    }
    flushQueuedFrame();
  }, [
    buildSourceSnapshot,
    flushQueuedFrame,
    highlightedMarkerKey,
    isAttached,
    isMapStyleReady,
    isNativeAvailable,
    dots,
    dotInteractions,
    interactionMode,
    labelCollisions,
    labelInteractions,
    labels,
    pinInteractions,
    pins,
    presentationState,
    viewportState,
  ]);
};
