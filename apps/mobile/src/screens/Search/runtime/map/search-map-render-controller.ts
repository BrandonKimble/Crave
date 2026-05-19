import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { MapBounds } from '../../../../types';
import {
  isResultsPresentationExecutionStageSettled,
  type ResultsPresentationTransportState,
} from '../shared/results-presentation-runtime-contract';
import type { SearchRuntimeMapPresentationPhase } from '../shared/search-runtime-bus';
import type { SearchMapSourceStoreDelta } from './search-map-source-store';
import type { SearchMapSourceTransportFeature } from './search-map-source-store';

type SearchMapRenderControllerNativeModule = {
  attach: (payload: {
    instanceId: string;
    mapTag: number;
    pinSourceId: string;
    pinInteractionSourceId: string;
    dotSourceId: string;
    dotInteractionSourceId: string;
    labelSourceId: string;
    labelInteractionSourceId: string;
    labelCollisionSourceId: string;
  }) => Promise<void>;
  detach: (instanceId: string) => Promise<void>;
  setRenderFrame: (payload: {
    instanceId: string;
    ownerEpoch: number;
    frameGenerationId: string;
    executionBatchId: string;
    sourceDeltas?: SearchMapRenderControllerNativeSourceDelta[];
    presentationStateJson: string;
    highlightedMarkerKey: string | null;
    interactionMode: string;
  }) => Promise<SearchMapRenderControllerNativeSetFrameTiming | null | void>;
  resetNativeApplyAttribution?: (payload: {
    reason?: string;
    runId?: string;
  }) => Promise<void>;
  flushNativeApplyAttribution?: (payload: {
    reason?: string;
    reset?: boolean;
  }) => Promise<SearchMapNativeApplyAttributionSummary>;
  notifyFrameRendered: (instanceId: string) => Promise<void>;
  configureLabelObservation: (
    payload: {
      instanceId: string;
      observationEnabled: boolean;
      allowFallback: boolean;
      commitInteractionVisibility: boolean;
    } & SearchMapLabelObservationConfig
  ) => Promise<void>;
  queryRenderedPressTarget: (payload: {
    instanceId: string;
    point: {
      x: number;
      y: number;
    };
    pinLayerIds?: string[];
    pinTapHitbox?: {
      radiusPx: number;
      centerShiftYPx: number;
    };
    labelLayerIds?: string[];
    labelQueryBox?: [number, number, number, number] | null;
    labelTapHitbox?: {
      textSize: number;
      radialXEm: number;
      radialYEm: number;
      radialTopEm: number;
      upShiftEm: number;
      charWidthFactor: number;
      lineHeightFactor: number;
      paddingPx: number;
      minWidthPx: number;
      maxWidthPx: number;
    };
    dotLayerIds?: string[];
    dotQueryBox?: [number, number, number, number] | null;
    tapCoordinate?: {
      lng: number;
      lat: number;
    } | null;
  }) => Promise<{
    restaurantId: string;
    coordinate: {
      lng: number;
      lat: number;
    } | null;
    targetKind: 'pin' | 'label' | 'dot';
  } | null>;
  reset: (instanceId: string) => Promise<void>;
};

type SearchMapRenderControllerAttachPayload = {
  instanceId: string;
  mapTag: number;
  pinSourceId: string;
  pinInteractionSourceId: string;
  dotSourceId: string;
  dotInteractionSourceId: string;
  labelSourceId: string;
  labelInteractionSourceId: string;
  labelCollisionSourceId: string;
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

export type SearchMapRenderControllerEvent =
  | {
      type: 'attached';
      instanceId: string;
      mapTag: number;
      ownerEpoch: number;
    }
  | {
      type: 'detached';
      instanceId: string;
    }
  | {
      type: 'render_frame_synced';
      instanceId: string;
      frameGenerationId: string | null;
      executionBatchId: string | null;
      ownerEpoch: number;
      pinCount: number;
      dotCount: number;
      labelCount: number;
      sourceRevisions: Record<SearchMapRenderSourceId, string>;
    }
  | {
      type: 'presentation_enter_armed';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      executionBatchId: string | null;
      armedAtMs: number;
    }
  | {
      type: 'presentation_execution_batch_mounted_hidden';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      executionBatchId: string | null;
      readyAtMs: number;
    }
  | {
      type: 'presentation_enter_started';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      executionBatchId: string | null;
      pinCount?: number;
      dotCount?: number;
      labelCount?: number;
      startedAtMs: number;
    }
  | {
      type: 'presentation_enter_settled';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      executionBatchId: string | null;
      pinCount?: number;
      dotCount?: number;
      labelCount?: number;
      settledAtMs: number;
    }
  | {
      type: 'presentation_exit_started';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      pinCount?: number;
      dotCount?: number;
      labelCount?: number;
      startedAtMs: number;
    }
  | {
      type: 'presentation_exit_settled';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      pinCount?: number;
      dotCount?: number;
      labelCount?: number;
      settledAtMs: number;
    }
  | {
      type: 'presentation_visual_sources_collision_released';
      instanceId: string;
      requestKey: string | null;
      frameGenerationId: string | null;
      pinCount?: number;
      dotCount?: number;
      labelCount?: number;
      releasedAtMs: number;
    }
  | {
      type: 'presentation_preroll_started';
      instanceId: string;
      phase: SearchRuntimeMapPresentationPhase;
      coverState: ResultsPresentationTransportState['coverState'];
      frameGenerationId: string | null;
      pinCount?: number;
      dotCount?: number;
      labelCount?: number;
      startedAtMs: number;
    }
  | {
      type: 'render_owner_invalidated';
      instanceId: string;
      ownerEpoch: number;
      reason: string;
      invalidatedAtMs: number;
    }
  | {
      type: 'render_owner_recovered_after_style_reload';
      instanceId: string;
      frameGenerationId: string | null;
      ownerEpoch: number;
      recoveredAtMs: number;
    }
  | {
      type: 'camera_changed';
      instanceId: string;
      centerLat: number;
      centerLng: number;
      zoom: number;
      northEastLat: number;
      northEastLng: number;
      southWestLat: number;
      southWestLng: number;
      isGestureActive: boolean;
      isMoving: boolean;
    }
  | {
      type: 'label_observation_updated';
      instanceId: string;
      visibleLabelFeatureIds: string[];
      layerRenderedFeatureCount: number;
      effectiveRenderedFeatureCount: number;
      stickyChanged: boolean;
    }
  | {
      type: 'error';
      instanceId: string;
      message: string;
    }
  | {
      type: 'visual_diagnostic';
      instanceId: string;
      message: string;
    };

type SearchMapRenderedPressTarget = {
  restaurantId: string;
  coordinate: {
    lng: number;
    lat: number;
  } | null;
  targetKind: 'pin' | 'label' | 'dot';
};

type SearchMapRenderSourceRevisionState = Record<SearchMapRenderSourceId, string>;

export type SearchMapNativeApplyAttributionBucket = {
  section: string;
  phase: string;
  source: string;
  count: number;
  totalMs: number;
  maxMs: number;
  operationCount: number;
};

export type SearchMapNativeApplyAttributionSummary = {
  reason: string;
  enabled: boolean;
  startedAtMs: number | null;
  flushedAtMs: number;
  bucketCount: number;
  topBuckets: SearchMapNativeApplyAttributionBucket[];
};

export type SearchMapRenderControllerSetRenderFrameResult = {
  nativePayloadBuildDurationMs: number;
  nativePayloadSourceDeltaMapDurationMs: number;
  nativeModuleDurationMs: number;
  nativePayloadTotalDurationMs: number;
  jsPromiseObservedAtEpochMs?: number;
  nativeModuleReceivedAtEpochMs?: number;
  nativeMainStartedAtEpochMs?: number;
  nativeResolveStartedAtEpochMs?: number;
  nativeResolveToJsPromiseObservedWallClockMs?: number;
  nativeResolveToJsPromiseObservedWallClockConfidence?: 'same_wall_clock_best_effort';
  nativeModuleQueueWaitDurationMs?: number;
  nativeMainExecutionDurationMs?: number;
  nativeSetFrameActionDurationMs?: number;
  nativeBridgeUnattributedDurationMs?: number;
  nativeSetFramePhase?: string | null;
  nativeDidSyncResidentFrame?: boolean;
};

type SearchMapRenderControllerNativeSetFrameTiming = {
  nativeModuleReceivedAtEpochMs?: number;
  nativeMainStartedAtEpochMs?: number;
  nativeResolveStartedAtEpochMs?: number;
  nativeModuleQueueWaitDurationMs?: number;
  nativeMainExecutionDurationMs?: number;
  nativeSetFrameActionDurationMs?: number;
  nativeSetFramePhase?: string | null;
  nativeDidSyncResidentFrame?: boolean;
};

export type SearchMapRenderSourceId =
  | 'pins'
  | 'pinInteractions'
  | 'dots'
  | 'dotInteractions'
  | 'labels'
  | 'labelInteractions'
  | 'labelCollisions';

type SearchMapRenderSourceTransportPayload = {
  effectiveChangedSourceIds: SearchMapRenderSourceId[];
  sourceDeltas?: SearchMapRenderSourceDelta[];
};

type SearchMapRenderFrame = {
  sourceRevisions: SearchMapRenderSourceRevisionState;
  viewport: SearchMapRenderViewportState;
  presentation: SearchMapRenderPresentationState;
  highlightedMarkerKey: string | null;
  highlightedMarkerKeys: readonly string[];
  interactionMode: SearchMapRenderInteractionMode;
};

type SearchMapRenderViewportState = {
  bounds: MapBounds | null;
  isGestureActive: boolean;
  isMoving: boolean;
};

export type SearchMapRenderPresentationState = {
  transactionId: ResultsPresentationTransportState['transactionId'];
  snapshotKind: ResultsPresentationTransportState['snapshotKind'];
  executionBatch: ResultsPresentationTransportState['executionBatch'];
  executionStage: ResultsPresentationTransportState['executionStage'];
  startToken: ResultsPresentationTransportState['startToken'];
  coverState: ResultsPresentationTransportState['coverState'];
  selectedRestaurantId: string | null;
  allowEmptyEnter: boolean;
};

const areSearchMapRenderExecutionBatchesEqual = (
  left: SearchMapRenderPresentationState['executionBatch'],
  right: SearchMapRenderPresentationState['executionBatch']
): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.batchId === right.batchId && left.generationId === right.generationId;
};

export const areSearchMapRenderPresentationStatesEqual = (
  left: SearchMapRenderPresentationState,
  right: SearchMapRenderPresentationState
): boolean =>
  left.coverState === right.coverState &&
  left.transactionId === right.transactionId &&
  left.snapshotKind === right.snapshotKind &&
  left.executionStage === right.executionStage &&
  left.startToken === right.startToken &&
  left.selectedRestaurantId === right.selectedRestaurantId &&
  left.allowEmptyEnter === right.allowEmptyEnter &&
  areSearchMapRenderExecutionBatchesEqual(left.executionBatch, right.executionBatch);

export const deriveSearchMapRenderPresentationPhase = (
  presentationState: SearchMapRenderPresentationState
): SearchRuntimeMapPresentationPhase => {
  if (presentationState.snapshotKind === 'results_exit') {
    if (presentationState.executionStage === 'exit_executing') {
      return 'exiting';
    }
    if (presentationState.executionStage === 'exit_requested') {
      return 'exit_preroll';
    }
  }
  if (presentationState.snapshotKind != null && presentationState.snapshotKind !== 'results_exit') {
    if (presentationState.executionStage === 'enter_executing') {
      return 'entering';
    }
    if (
      presentationState.executionStage === 'enter_pending_mount' ||
      presentationState.executionStage === 'enter_mounted_hidden'
    ) {
      return 'enter_requested';
    }
    if (presentationState.executionStage === 'settled') {
      return 'live';
    }
  }
  if (presentationState.coverState === 'initial_loading') {
    return 'covered';
  }
  return 'idle';
};

export const deriveSearchMapRenderPresentationRequestKey = (
  presentationState: SearchMapRenderPresentationState
): string | null =>
  presentationState.transactionId != null &&
  presentationState.snapshotKind != null &&
  presentationState.snapshotKind !== 'results_exit' &&
  !isResultsPresentationExecutionStageSettled(presentationState.executionStage)
    ? presentationState.transactionId
    : null;

export type SearchMapRenderInteractionMode = 'enabled' | 'suppressed';

const MODULE_NAME = 'SearchMapRenderController';
const nativeModule = NativeModules[MODULE_NAME] as
  | SearchMapRenderControllerNativeModule
  | undefined;

const nativeEmitter =
  nativeModule != null ? new NativeEventEmitter(nativeModule as never) : undefined;

const attachedPayloadByInstanceId = new Map<string, SearchMapRenderControllerAttachPayload>();

const isRecoverableNativeRenderOwnerFrameError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('unknown instance or frame') ||
    message.includes('invalid render frame payload') ||
    message.includes('Source delta missing feature') ||
    message.includes('Source delta upsert missing feature')
  );
};

const serializePresentationState = (presentation: SearchMapRenderPresentationState): string => {
  return JSON.stringify(presentation);
};

const resolveRenderControllerPerfNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const roundRenderControllerPerfMs = (value: number): number => Number(value.toFixed(1));

const finiteNumberOrUndefined = (value: unknown): number | undefined => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

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

type SearchMapRenderControllerNativeSourceDelta = Omit<SearchMapRenderSourceDelta, 'sourceId'> & {
  sourceId: string;
};

type SearchMapRenderControllerSetFramePayload = {
  instanceId: string;
  ownerEpoch: number;
  frameGenerationId: string;
  executionBatchId: string;
  frame: SearchMapRenderFrame;
  sourceTransport: SearchMapRenderSourceTransportPayload;
};

type SearchMapRenderControllerNativeFramePayload = {
  instanceId: string;
  ownerEpoch: number;
  frameGenerationId: string;
  executionBatchId: string;
  sourceDeltas?: SearchMapRenderControllerNativeSourceDelta[];
  presentationStateJson: string;
  highlightedRestaurantId: string | null;
  highlightedMarkerKey: string | null;
  highlightedMarkerKeys: readonly string[];
  interactionMode: string;
};

const toNativeSourceId = (
  sourceId: SearchMapRenderSourceId,
  attachedSourceIds: SearchMapRenderControllerAttachPayload | null
): string => {
  if (attachedSourceIds == null) {
    return sourceId;
  }
  switch (sourceId) {
    case 'pins':
      return attachedSourceIds.pinSourceId;
    case 'pinInteractions':
      return attachedSourceIds.pinInteractionSourceId;
    case 'dots':
      return attachedSourceIds.dotSourceId;
    case 'dotInteractions':
      return attachedSourceIds.dotInteractionSourceId;
    case 'labels':
      return attachedSourceIds.labelSourceId;
    case 'labelInteractions':
      return attachedSourceIds.labelInteractionSourceId;
    case 'labelCollisions':
      return attachedSourceIds.labelCollisionSourceId;
  }
};

const toNativeRenderSourceDelta = (
  delta: SearchMapRenderSourceDelta,
  attachedSourceIds: SearchMapRenderControllerAttachPayload | null
): SearchMapRenderControllerNativeSourceDelta => ({
  ...delta,
  sourceId: toNativeSourceId(delta.sourceId, attachedSourceIds),
});

const createNativeRenderFramePayload = (
  payload: SearchMapRenderControllerSetFramePayload
): {
  nativePayload: SearchMapRenderControllerNativeFramePayload;
  nativePayloadBuildDurationMs: number;
  nativePayloadSourceDeltaMapDurationMs: number;
  totalStartedAtMs: number;
} => {
  const totalStartedAtMs = resolveRenderControllerPerfNow();
  const attachedSourceIds = attachedPayloadByInstanceId.get(payload.instanceId) ?? null;
  const sourceDeltaMapStartedAtMs = resolveRenderControllerPerfNow();
  const sourceDeltas = payload.sourceTransport.sourceDeltas?.map((delta) =>
    toNativeRenderSourceDelta(delta, attachedSourceIds)
  );
  const nativePayloadSourceDeltaMapDurationMs =
    resolveRenderControllerPerfNow() - sourceDeltaMapStartedAtMs;
  const nativePayload = {
    instanceId: payload.instanceId,
    ownerEpoch: payload.ownerEpoch,
    frameGenerationId: payload.frameGenerationId,
    executionBatchId: payload.executionBatchId,
    ...(sourceDeltas ? { sourceDeltas } : {}),
    presentationStateJson: serializePresentationState(payload.frame.presentation),
    highlightedRestaurantId: payload.frame.presentation.selectedRestaurantId,
    highlightedMarkerKey: payload.frame.highlightedMarkerKey,
    highlightedMarkerKeys: payload.frame.highlightedMarkerKeys,
    interactionMode: payload.frame.interactionMode,
  };
  return {
    nativePayload,
    nativePayloadBuildDurationMs: resolveRenderControllerPerfNow() - totalStartedAtMs,
    nativePayloadSourceDeltaMapDurationMs,
    totalStartedAtMs,
  };
};

const recoverNativeRenderFrameSubmissionError = async (
  instanceId: string,
  error: unknown
): Promise<Error> => {
  if (!isRecoverableNativeRenderOwnerFrameError(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  if (!nativeModule) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const attachedPayload = attachedPayloadByInstanceId.get(instanceId);
  if (attachedPayload == null) {
    return error instanceof Error ? error : new Error(String(error));
  }
  await nativeModule.attach(attachedPayload);
  return new Error('stale owner epoch');
};

export const searchMapRenderController = {
  isAvailable(): boolean {
    return nativeModule != null;
  },

  async attach(payload: {
    instanceId: string;
    mapTag: number;
    pinSourceId: string;
    pinInteractionSourceId: string;
    dotSourceId: string;
    dotInteractionSourceId: string;
    labelSourceId: string;
    labelInteractionSourceId: string;
    labelCollisionSourceId: string;
  }): Promise<void> {
    if (!nativeModule) {
      return;
    }
    attachedPayloadByInstanceId.set(payload.instanceId, payload);
    await nativeModule.attach(payload);
  },

  async detach(instanceId: string): Promise<void> {
    if (!nativeModule) {
      return;
    }
    attachedPayloadByInstanceId.delete(instanceId);
    await nativeModule.detach(instanceId);
  },

  async setRenderFrame(payload: {
    instanceId: string;
    ownerEpoch: number;
    frameGenerationId: string;
    executionBatchId: string;
    frame: SearchMapRenderFrame;
    sourceTransport: SearchMapRenderSourceTransportPayload;
  }): Promise<SearchMapRenderControllerSetRenderFrameResult | null> {
    if (!nativeModule) {
      return null;
    }
    const {
      nativePayload,
      nativePayloadBuildDurationMs,
      nativePayloadSourceDeltaMapDurationMs,
      totalStartedAtMs,
    } = createNativeRenderFramePayload(payload);
    try {
      const nativeModuleStartedAtMs = resolveRenderControllerPerfNow();
      const nativeTimingResult = await nativeModule.setRenderFrame(nativePayload);
      const jsPromiseObservedAtEpochMs = Date.now();
      const nativeTiming: SearchMapRenderControllerNativeSetFrameTiming | null =
        nativeTimingResult && typeof nativeTimingResult === 'object' ? nativeTimingResult : null;
      const nativeModuleDurationMs = resolveRenderControllerPerfNow() - nativeModuleStartedAtMs;
      const nativeObservedDurationMs =
        (nativeTiming?.nativeModuleQueueWaitDurationMs ?? 0) +
        (nativeTiming?.nativeMainExecutionDurationMs ?? 0);
      const nativeBridgeUnattributedDurationMs =
        nativeObservedDurationMs > 0 ? nativeModuleDurationMs - nativeObservedDurationMs : 0;
      const nativeResolveStartedAtEpochMs = finiteNumberOrUndefined(
        nativeTiming?.nativeResolveStartedAtEpochMs
      );
      const nativeResolveToJsPromiseObservedWallClockMs =
        nativeResolveStartedAtEpochMs == null
          ? undefined
          : Math.max(0, jsPromiseObservedAtEpochMs - nativeResolveStartedAtEpochMs);
      return {
        nativePayloadBuildDurationMs: roundRenderControllerPerfMs(nativePayloadBuildDurationMs),
        nativePayloadSourceDeltaMapDurationMs: roundRenderControllerPerfMs(
          nativePayloadSourceDeltaMapDurationMs
        ),
        nativeModuleDurationMs: roundRenderControllerPerfMs(nativeModuleDurationMs),
        nativePayloadTotalDurationMs: roundRenderControllerPerfMs(
          resolveRenderControllerPerfNow() - totalStartedAtMs
        ),
        jsPromiseObservedAtEpochMs,
        nativeModuleReceivedAtEpochMs: finiteNumberOrUndefined(
          nativeTiming?.nativeModuleReceivedAtEpochMs
        ),
        nativeMainStartedAtEpochMs: finiteNumberOrUndefined(nativeTiming?.nativeMainStartedAtEpochMs),
        nativeResolveStartedAtEpochMs,
        nativeResolveToJsPromiseObservedWallClockMs:
          nativeResolveToJsPromiseObservedWallClockMs == null
            ? undefined
            : roundRenderControllerPerfMs(nativeResolveToJsPromiseObservedWallClockMs),
        nativeResolveToJsPromiseObservedWallClockConfidence:
          nativeResolveToJsPromiseObservedWallClockMs == null
            ? undefined
            : 'same_wall_clock_best_effort',
        nativeModuleQueueWaitDurationMs:
          nativeTiming?.nativeModuleQueueWaitDurationMs == null
            ? undefined
            : roundRenderControllerPerfMs(nativeTiming.nativeModuleQueueWaitDurationMs),
        nativeMainExecutionDurationMs:
          nativeTiming?.nativeMainExecutionDurationMs == null
            ? undefined
            : roundRenderControllerPerfMs(nativeTiming.nativeMainExecutionDurationMs),
        nativeSetFrameActionDurationMs:
          nativeTiming?.nativeSetFrameActionDurationMs == null
            ? undefined
            : roundRenderControllerPerfMs(nativeTiming.nativeSetFrameActionDurationMs),
        nativeBridgeUnattributedDurationMs: roundRenderControllerPerfMs(
          nativeBridgeUnattributedDurationMs
        ),
        nativeSetFramePhase: nativeTiming?.nativeSetFramePhase ?? null,
        nativeDidSyncResidentFrame: nativeTiming?.nativeDidSyncResidentFrame,
      };
    } catch (error) {
      throw await recoverNativeRenderFrameSubmissionError(payload.instanceId, error);
    }
  },

  submitRenderFrameFireAndObserve(
    payload: SearchMapRenderControllerSetFramePayload,
    onError: (error: Error) => void
  ): void {
    if (!nativeModule) {
      return;
    }
    const { nativePayload } = createNativeRenderFramePayload(payload);
    void nativeModule.setRenderFrame(nativePayload).catch((error: unknown) => {
      recoverNativeRenderFrameSubmissionError(payload.instanceId, error)
        .then(onError)
        .catch((recoveryError: unknown) => {
          onError(recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError)));
        });
    });
  },

  async configureLabelObservation(
    payload: {
      instanceId: string;
      observationEnabled: boolean;
      allowFallback: boolean;
      commitInteractionVisibility: boolean;
    } & SearchMapLabelObservationConfig
  ): Promise<void> {
    if (!nativeModule) {
      return;
    }
    await nativeModule.configureLabelObservation(payload);
  },

  async resetNativeApplyAttribution(payload: {
    reason?: string;
    runId?: string;
  } = {}): Promise<void> {
    if (!nativeModule?.resetNativeApplyAttribution) {
      return;
    }
    await nativeModule.resetNativeApplyAttribution(payload);
  },

  async flushNativeApplyAttribution(payload: {
    reason?: string;
    reset?: boolean;
  } = {}): Promise<SearchMapNativeApplyAttributionSummary | null> {
    if (!nativeModule?.flushNativeApplyAttribution) {
      return null;
    }
    return nativeModule.flushNativeApplyAttribution(payload);
  },

  async queryRenderedPressTarget(payload: {
    instanceId: string;
    point: {
      x: number;
      y: number;
    };
    pinLayerIds?: string[];
    pinTapHitbox?: {
      radiusPx: number;
      centerShiftYPx: number;
    };
    labelLayerIds?: string[];
    labelQueryBox?: [number, number, number, number] | null;
    labelTapHitbox?: {
      textSize: number;
      radialXEm: number;
      radialYEm: number;
      radialTopEm: number;
      upShiftEm: number;
      charWidthFactor: number;
      lineHeightFactor: number;
      paddingPx: number;
      minWidthPx: number;
      maxWidthPx: number;
    };
    dotLayerIds?: string[];
    dotQueryBox?: [number, number, number, number] | null;
    tapCoordinate?: {
      lng: number;
      lat: number;
    } | null;
  }): Promise<SearchMapRenderedPressTarget | null> {
    if (!nativeModule) {
      return null;
    }
    return nativeModule.queryRenderedPressTarget(payload);
  },

  async reset(instanceId: string): Promise<void> {
    if (!nativeModule) {
      return;
    }
    await nativeModule.reset(instanceId);
  },

  addListener(listener: (event: SearchMapRenderControllerEvent) => void): (() => void) | null {
    if (!nativeEmitter) {
      return null;
    }
    const subscription = nativeEmitter.addListener('searchMapRenderControllerEvent', listener);
    return () => {
      subscription.remove();
    };
  },

  platform: Platform.OS,
};
