import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { MapBounds } from '../../../../types';
import type { PresentationLaneState } from '../controller/presentation-transition-controller';
import type { SearchRuntimeMapPresentationPhase } from '../shared/search-runtime-bus';
import type {
  SearchMapCommittedSourceDeltaJournal,
  SearchMapSourceStoreDelta,
  SearchMapSourceStore,
} from './search-map-source-store';
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
    frameGenerationId: string;
    revealBatchId: string;
    sourceDeltas?: SearchMapRenderControllerNativeSourceDelta[];
    presentationStateJson: string;
    highlightedMarkerKey: string | null;
    interactionMode: string;
  }) => Promise<void>;
  notifyFrameRendered: (instanceId: string) => Promise<void>;
  querySourceMembership: (payload: { instanceId: string; sourceId: string }) => Promise<{
    sourceId: string;
    featureIds: string[];
  }>;
  queryRenderedLabelObservation: (payload: {
    instanceId: string;
    allowFallback: boolean;
    commitInteractionVisibility: boolean;
    refreshMsIdle: number;
    refreshMsMoving: number;
    enableStickyLabelCandidates: boolean;
    stickyLockStableMsMoving: number;
    stickyLockStableMsIdle: number;
    stickyUnlockMissingMsMoving: number;
    stickyUnlockMissingMsIdle: number;
    stickyUnlockMissingStreakMoving: number;
    labelResetRequestKey: string | null;
  }) => Promise<{
    visibleLabelFeatureIds: string[];
    placedLabels: Array<{
      markerKey: string;
      candidate: string;
      restaurantId: string | null;
    }>;
    layerRenderedFeatureCount: number;
    effectiveRenderedFeatureCount: number;
    stickyRevision: number;
    stickyCandidates: Array<{
      identityKey: string;
      candidate: string;
    }>;
    dirtyStickyIdentityKeys: string[];
  }>;
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

type SearchMapRenderControllerAttachedSourceIds = {
  pinSourceId: string;
  pinInteractionSourceId: string;
  dotSourceId: string;
  dotInteractionSourceId: string;
  labelSourceId: string;
  labelInteractionSourceId: string;
  labelCollisionSourceId: string;
};

export type SearchMapRenderControllerEvent =
  | {
      type: 'attached';
      instanceId: string;
      mapTag: number;
    }
  | {
      type: 'detached';
      instanceId: string;
    }
  | {
      type: 'render_frame_synced';
      instanceId: string;
      frameGenerationId: string | null;
      revealBatchId: string | null;
      pinCount: number;
      dotCount: number;
      labelCount: number;
      sourceRevisions: SearchMapRenderSourceRevisionState;
    }
  | {
      type: 'presentation_reveal_armed';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      revealBatchId: string | null;
      armedAtMs: number;
    }
  | {
      type: 'presentation_reveal_batch_mounted_hidden';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      revealBatchId: string | null;
      readyAtMs: number;
    }
  | {
      type: 'presentation_reveal_started';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      revealBatchId: string | null;
      startedAtMs: number;
    }
  | {
      type: 'presentation_reveal_first_visible_frame';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      revealBatchId: string | null;
      syncedAtMs: number;
    }
  | {
      type: 'presentation_reveal_settled';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      revealBatchId: string | null;
      settledAtMs: number;
    }
  | {
      type: 'presentation_dismiss_started';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      startedAtMs: number;
    }
  | {
      type: 'presentation_dismiss_settled';
      instanceId: string;
      requestKey: string;
      frameGenerationId: string | null;
      settledAtMs: number;
    }
  | {
      type: 'render_owner_recovered_after_style_reload';
      instanceId: string;
      frameGenerationId: string | null;
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
      stickyRevision: number;
      stickyCandidates: Array<{
        identityKey: string;
        candidate: string;
      }>;
      dirtyStickyIdentityKeys: string[];
    }
  | {
      type: 'error';
      instanceId: string;
      message: string;
    };

export type SearchMapRenderSourceMembership = {
  sourceId: string;
  featureIds: string[];
};

export type SearchMapRenderedLabelObservation = {
  visibleLabelFeatureIds: string[];
  placedLabels: Array<{
    markerKey: string;
    candidate: string;
    restaurantId: string | null;
  }>;
  layerRenderedFeatureCount: number;
  effectiveRenderedFeatureCount: number;
  stickyRevision: number;
  stickyCandidates: Array<{
    identityKey: string;
    candidate: string;
  }>;
  dirtyStickyIdentityKeys: string[];
};

export type SearchMapRenderedDotObservation = {
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

export type SearchMapRenderedPressTarget = {
  restaurantId: string;
  coordinate: {
    lng: number;
    lat: number;
  } | null;
  targetKind: 'pin' | 'label';
};

export type SearchMapRenderSnapshot = {
  pins: SearchMapSourceStore;
  pinInteractions: SearchMapSourceStore;
  dots: SearchMapSourceStore;
  dotInteractions: SearchMapSourceStore;
  labels: SearchMapSourceStore;
  labelInteractions: SearchMapSourceStore;
  labelCollisions: SearchMapSourceStore;
};

export type SearchMapRenderSourceRevisionState = Record<SearchMapRenderSourceId, string>;

export type SearchMapRenderSourceId =
  | 'pins'
  | 'pinInteractions'
  | 'dots'
  | 'dotInteractions'
  | 'labels'
  | 'labelInteractions'
  | 'labelCollisions';

export type SearchMapRenderSourceTransportPayload = {
  effectiveChangedSourceIds: SearchMapRenderSourceId[];
  sourceDeltas?: SearchMapRenderSourceDelta[];
};

export type SearchMapRenderFrame = {
  sourceRevisions: SearchMapRenderSourceRevisionState;
  viewport: SearchMapRenderViewportState;
  presentation: SearchMapRenderPresentationState;
  highlightedMarkerKey: string | null;
  interactionMode: SearchMapRenderInteractionMode;
};

export type SearchMapRenderViewportState = {
  bounds: MapBounds | null;
  isGestureActive: boolean;
  isMoving: boolean;
};

export type SearchMapRenderPresentationState = {
  lane: PresentationLaneState;
  loadingMode: string;
  selectedRestaurantId: string | null;
  allowEmptyReveal: boolean;
  batchPhase: SearchRuntimeMapPresentationPhase;
};

export type SearchMapRenderInteractionMode = 'enabled' | 'suppressed';

const MODULE_NAME = 'SearchMapRenderController';
const nativeModule = NativeModules[MODULE_NAME] as
  | SearchMapRenderControllerNativeModule
  | undefined;

const nativeEmitter =
  nativeModule != null ? new NativeEventEmitter(nativeModule as never) : undefined;

const attachedSourceIdsByInstanceId = new Map<string, SearchMapRenderControllerAttachedSourceIds>();

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

export const getSearchMapRenderSourceRevisions = (
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

export type SearchMapRenderSourceDelta = {
  sourceId: SearchMapRenderSourceId;
  mode: SearchMapSourceStoreDelta['mode'];
  nextFeatureIdsInOrder: string[];
  removeIds: string[];
  dirtyGroupIds?: string[];
  orderChangedGroupIds?: string[];
  removedGroupIds?: string[];
  upsertFeatures?: SearchMapSourceTransportFeature[];
};

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

type SearchMapRenderControllerNativeSourceDelta = Omit<SearchMapRenderSourceDelta, 'sourceId'> & {
  sourceId: string;
};

const toNativeSourceId = (
  sourceId: SearchMapRenderSourceId,
  attachedSourceIds: SearchMapRenderControllerAttachedSourceIds | null
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
  attachedSourceIds: SearchMapRenderControllerAttachedSourceIds | null
): SearchMapRenderControllerNativeSourceDelta => ({
  ...delta,
  sourceId: toNativeSourceId(delta.sourceId, attachedSourceIds),
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

export const buildSearchMapRenderSourceTransport = ({
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
    attachedSourceIdsByInstanceId.set(payload.instanceId, {
      pinSourceId: payload.pinSourceId,
      pinInteractionSourceId: payload.pinInteractionSourceId,
      dotSourceId: payload.dotSourceId,
      dotInteractionSourceId: payload.dotInteractionSourceId,
      labelSourceId: payload.labelSourceId,
      labelInteractionSourceId: payload.labelInteractionSourceId,
      labelCollisionSourceId: payload.labelCollisionSourceId,
    });
    await nativeModule.attach(payload);
  },

  async detach(instanceId: string): Promise<void> {
    if (!nativeModule) {
      return;
    }
    attachedSourceIdsByInstanceId.delete(instanceId);
    await nativeModule.detach(instanceId);
  },

  async setRenderFrame(payload: {
    instanceId: string;
    frameGenerationId: string;
    revealBatchId: string;
    frame: SearchMapRenderFrame;
    sourceTransport: SearchMapRenderSourceTransportPayload;
  }): Promise<void> {
    if (!nativeModule) {
      return;
    }
    const attachedSourceIds = attachedSourceIdsByInstanceId.get(payload.instanceId) ?? null;
    await nativeModule.setRenderFrame({
      instanceId: payload.instanceId,
      frameGenerationId: payload.frameGenerationId,
      revealBatchId: payload.revealBatchId,
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
    });
  },

  async querySourceMembership(payload: {
    instanceId: string;
    sourceId: string;
  }): Promise<SearchMapRenderSourceMembership> {
    if (!nativeModule) {
      return {
        sourceId: payload.sourceId,
        featureIds: [],
      };
    }
    return nativeModule.querySourceMembership(payload);
  },

  async queryRenderedLabelObservation(payload: {
    instanceId: string;
    allowFallback: boolean;
    commitInteractionVisibility: boolean;
    refreshMsIdle: number;
    refreshMsMoving: number;
    enableStickyLabelCandidates: boolean;
    stickyLockStableMsMoving: number;
    stickyLockStableMsIdle: number;
    stickyUnlockMissingMsMoving: number;
    stickyUnlockMissingMsIdle: number;
    stickyUnlockMissingStreakMoving: number;
    labelResetRequestKey: string | null;
  }): Promise<SearchMapRenderedLabelObservation> {
    if (!nativeModule) {
      return {
        visibleLabelFeatureIds: [],
        placedLabels: [],
        layerRenderedFeatureCount: 0,
        effectiveRenderedFeatureCount: 0,
        stickyRevision: 0,
        stickyCandidates: [],
        dirtyStickyIdentityKeys: [],
      };
    }
    return nativeModule.queryRenderedLabelObservation(payload);
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
