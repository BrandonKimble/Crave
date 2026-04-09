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
  }) => Promise<void>;
  notifyFrameRendered: (instanceId: string) => Promise<void>;
  configureLabelObservation: (
    payload: {
      instanceId: string;
      observationEnabled: boolean;
      allowFallback: boolean;
      commitInteractionVisibility: boolean;
    } & SearchMapLabelObservationConfig
  ) => Promise<void>;
  queryRenderedDotObservation: (payload: {
    instanceId: string;
    layerIds: string[];
    queryBox?: [number, number, number, number] | null;
  }) => Promise<{
    restaurantIds: string[];
    renderedDots: Array<{
      restaurantId: string;
      coordinate: {
        lng: number;
        lat: number;
      } | null;
    }>;
    renderedFeatureCount: number;
  }>;
  queryRenderedPressTarget: (payload: {
    instanceId: string;
    point: {
      x: number;
      y: number;
    };
    pinLayerIds?: string[];
    labelLayerIds?: string[];
  }) => Promise<{
    restaurantId: string;
    coordinate: {
      lng: number;
      lat: number;
    } | null;
    targetKind: 'pin' | 'label';
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

type SearchMapRenderControllerEvent =
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
      startedAtMs: number;
    }
  | {
      type: 'presentation_enter_settled';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      executionBatchId: string | null;
      settledAtMs: number;
    }
  | {
      type: 'presentation_exit_started';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      startedAtMs: number;
    }
  | {
      type: 'presentation_exit_settled';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      settledAtMs: number;
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
    };

type SearchMapRenderedDotObservation = {
  restaurantIds: string[];
  renderedDots: Array<{
    restaurantId: string;
    coordinate: {
      lng: number;
      lat: number;
    } | null;
  }>;
  renderedFeatureCount: number;
};

type SearchMapRenderedPressTarget = {
  restaurantId: string;
  coordinate: {
    lng: number;
    lat: number;
  } | null;
  targetKind: 'pin' | 'label';
};

type SearchMapRenderSourceRevisionState = Record<SearchMapRenderSourceId, string>;

type SearchMapRenderSourceId =
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

const presentationSerializationCache = new WeakMap<SearchMapRenderPresentationState, string>();

const serializePresentationState = (presentation: SearchMapRenderPresentationState): string => {
  const cached = presentationSerializationCache.get(presentation);
  if (cached != null) {
    return cached;
  }
  const serialized = JSON.stringify(presentation);
  presentationSerializationCache.set(presentation, serialized);
  return serialized;
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
  }): Promise<void> {
    if (!nativeModule) {
      return;
    }
    const attachedSourceIds = attachedPayloadByInstanceId.get(payload.instanceId) ?? null;
    const nativePayload = {
      instanceId: payload.instanceId,
      ownerEpoch: payload.ownerEpoch,
      frameGenerationId: payload.frameGenerationId,
      executionBatchId: payload.executionBatchId,
      ...(payload.sourceTransport.sourceDeltas
        ? {
            sourceDeltas: payload.sourceTransport.sourceDeltas.map((delta) =>
              toNativeRenderSourceDelta(delta, attachedSourceIds)
            ),
          }
        : {}),
      presentationStateJson: serializePresentationState(payload.frame.presentation),
      highlightedMarkerKey: payload.frame.highlightedMarkerKey,
      interactionMode: payload.frame.interactionMode,
    };
    try {
      await nativeModule.setRenderFrame(nativePayload);
    } catch (error) {
      if (!isRecoverableNativeRenderOwnerFrameError(error)) {
        throw error;
      }
      const attachedPayload = attachedPayloadByInstanceId.get(payload.instanceId);
      if (attachedPayload == null) {
        throw error;
      }
      await nativeModule.attach(attachedPayload);
      throw new Error('stale owner epoch');
    }
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

  async queryRenderedDotObservation(payload: {
    instanceId: string;
    layerIds: string[];
    queryBox?: [number, number, number, number] | null;
  }): Promise<SearchMapRenderedDotObservation> {
    if (!nativeModule) {
      return {
        restaurantIds: [],
        renderedDots: [],
        renderedFeatureCount: 0,
      };
    }
    return nativeModule.queryRenderedDotObservation(payload);
  },

  async queryRenderedPressTarget(payload: {
    instanceId: string;
    point: {
      x: number;
      y: number;
    };
    pinLayerIds?: string[];
    labelLayerIds?: string[];
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
