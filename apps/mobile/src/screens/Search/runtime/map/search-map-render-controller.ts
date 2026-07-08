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
    labelSourceId: string;
    labelCollisionSourceId: string;
    labelLayerIds: string[];
    labelCollisionLayerIds: string[];
  }) => Promise<void>;
  detach: (instanceId: string) => Promise<void>;
  setRenderFrame: (payload: {
    instanceId: string;
    ownerEpoch: number;
    frameGenerationId: string;
    executionBatchId: string;
    visualFrameTransaction: SearchMapVisualFrameTransaction;
    sourceDeltas?: SearchMapRenderControllerNativeSourceDelta[];
    markerRoleFrame?: SearchMapMarkerRoleFrame;
    presentationStateJson: string;
    highlightedRestaurantId: string | null;
    highlightedMarkerKey: string | null;
    highlightedMarkerKeys: readonly string[];
    interactionMode: string;
  }) => Promise<SearchMapRenderControllerNativeSetFrameTiming | null | void>;
  setCandidateCatalog: (payload: {
    instanceId: string;
    entries: ReadonlyArray<{ markerKey: string; lng: number; lat: number; rank: number }>;
  }) => Promise<{ catalogCount: number } | null | void>;
  beginInteractionFadeOut?: (payload: { instanceId?: string }) => Promise<void>;
  commitEnterStart?: (payload: {
    instanceId?: string;
    requestKey: string;
    startToken: number;
  }) => Promise<{ started: boolean }>;
  resetNativeApplyAttribution?: (payload: { reason?: string; runId?: string }) => Promise<void>;
  flushNativeApplyAttribution?: (payload: {
    reason?: string;
    reset?: boolean;
  }) => Promise<SearchMapNativeApplyAttributionSummary>;
  configureNativeLayerGroups: (payload: {
    instanceId: string;
    labelLayerIds: string[];
    labelCollisionLayerIds: string[];
  }) => Promise<void>;
  configureNativePressTargeting: (payload: {
    instanceId: string;
    enabled: boolean;
    dotLayerIds?: string[];
    dotTapIntentRadiusPx?: number;
  }) => Promise<void>;
  queryRenderedPressTarget: (payload: {
    instanceId: string;
    point: {
      x: number;
      y: number;
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
  labelSourceId: string;
  labelCollisionSourceId: string;
  labelLayerIds: string[];
  labelCollisionLayerIds: string[];
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
      sourceAdmissionOutcome: SearchMapVisualFrameSourceAdmissionOutcome;
      sourceFrameKey: string | null;
      sourceDataKey: string | null;
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
      // UNIFIED-FADE TOGGLE (map-LOD-v6): deterministic cover-lift signal emitted on a fade-IN ramp
      // completion, keyed to the LATEST request (immune to rapid-tap supersession). Replaces the racy
      // per-batch mounted_hidden gate for toggle cover-lift. `degraded` = the roster failed to build
      // (promoted>0 but overlayTileCount==0) — JS lifts the cover anyway rather than hang.
      type: 'presentation_toggle_settled';
      instanceId: string;
      requestKey: string | null;
      pinCount?: number;
      dotCount?: number;
      labelCount?: number;
      overlayTileCount: number;
      promotedCount: number;
      degraded: boolean;
      settledAtMs: number;
    }
  | {
      // S4d-0 RED instrument: native (worldId, phase, opacity) register snapshot emitted
      // at the presentation machine's idempotence path (same-state ack) and RED protocol
      // contracts — observation only, never actuated on. S4d-3b deleted the silent
      // dismiss-in-progress bypasses; the *_during_dismiss reasons are loud contract
      // violations (the payload/snapshot still processes as the latest desired level).
      type: 'presentation_state_snapshot';
      instanceId: string;
      reason:
        | 'apply_same_state'
        | 'keyless_payload_during_dismiss'
        | 'snapshot_apply_during_dismiss'
        | 'reveal_begin'
        | 'pin_roster_teardown_inactive'
        | 'pin_roster_synced'
        | 'catalog_arrived'
        | 'reproject_deferred';
      catalogCount?: number;
      deferredWhy?: string;
      desiredCount?: number;
      viewCount?: number;
      candidateCount?: number;
      promotedCount?: number;
      revealRequestKey: string | null;
      revealStartedRequestKey: string | null;
      revealSettledRequestKey: string | null;
      dismissRequestKey: string | null;
      incomingRevealRequestKey: string | null;
      incomingDismissRequestKey: string | null;
      lifecycleState: string;
      renderPhase: string;
      opacityTarget: number;
      nowMs: number;
    }
  | {
      // S4d-2 ack-everything: the fade-out ramp reached the dark floor (mach-clocked).
      // The reveal statechart's `covering` exit input; log-only until S4d-3 consumes it.
      type: 'presentation_fade_out_acked';
      instanceId: string;
      reason: string;
      requestKey: string | null;
      lifecycleState: string;
      nativeTimestampMs: number;
      ackedAtMs: number;
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
      bearing: number;
      pitch: number;
      northEastLat: number;
      northEastLng: number;
      southWestLat: number;
      southWestLng: number;
      isGestureActive: boolean;
      isMoving: boolean;
    }
  | {
      type: 'map_native_visible_markers';
      instanceId: string;
      markerKeys: string[];
      markerCount: number;
      // The native LIVE promoted set (top-N by rank of the on-screen subset). Used to bake the label-
      // collision obstacle from CURRENT promotion (not publish-time) so labels yield to pins promoted
      // mid-zoom (#16) — native emits it; previously the TS type dropped it.
      nativePromotedKeys: string[];
      catalogCount: number;
      zoom: number;
      bearing: number;
      pitch: number;
      isMoving: boolean;
    }
  | {
      type: 'map_rendered_dot_observation';
      instanceId: string;
      expectedDemotedDotCount: number;
      renderedDemotedDotCount: number;
      culledDemotedDotCount: number;
      renderedDotFeatureCount: number;
      emittedAtMs: number;
    }
  | {
      type: 'lod_snap_contract';
      instanceId: string;
      reason?: string;
      snapshotReused?: boolean;
      desiredPinCount?: number;
      promotedPinCount?: number;
      roleFlipCount?: number;
      silentPinFlipCount?: number;
      silentDotFlipCount?: number;
      pinTransitionCreatedCount?: number;
      dotTransitionCreatedCount?: number;
      allowNewTransitions?: boolean;
      emittedAtMs: number;
    }
  | {
      type: 'lod_render_snap_contract';
      instanceId: string;
      sourceId: string;
      fsRemovalFlashCount: number;
      fsJumpCount: number;
      samples?: Array<Record<string, number | string | boolean>>;
      emittedAtMs: number;
    }
  | {
      type: 'live_lod_transition_contract';
      instanceId: string;
      flashReversalCount?: number;
      crossfadeGapCount?: number;
      pinExitMidFadeCount?: number;
      pinTransitionCount: number;
      pinEnterTransitionCount: number;
      pinExitTransitionCount: number;
      dotTransitionCount: number;
      dotEnterTransitionCount: number;
      dotExitTransitionCount: number;
      pinFeatureStateApplyCount: number;
      labelFeatureStateApplyCount: number;
      dotFeatureStateApplyCount: number;
      pinLabelFadeSynchronized: boolean;
      transitionDurationMs: number;
      usesStyleTransition: boolean;
      usesNativeFrameStepper?: boolean;
      hasIntermediateOpacity?: boolean;
      pinIntermediateOpacityCount?: number;
      labelIntermediateOpacityCount?: number;
      dotIntermediateOpacityCount?: number;
      lodTransitionTrace?: Array<Record<string, number | string | boolean>>;
      emittedAtMs: number;
    }
  | {
      type: 'pin_visual_order_contract';
      instanceId: string;
      reason: string;
      pinCount: number;
      selectedPinCount: number;
      movedGroupCount: number;
      previousGroupCount: number;
      screenYOrderViolationCount: number;
      screenYVisualOrder?: Array<{
        slotIndex: number;
        screenY: number;
      }>;
      stableSlotOwnership: boolean;
      appliesScreenYOrdering: boolean;
      usesLayerMoves: boolean;
      usesViewportYZOrder?: boolean;
      sourceMutationCount: number;
      isMoving: boolean;
      cameraZoom?: number;
      cameraBearing?: number;
      visualOrderSignature: string;
      previousVisualOrderSignature: string;
      emittedAtMs: number;
    }
  | {
      type: 'native_scoped_promoted_slot_contract';
      instanceId: string;
      affectedMarkerCount: number;
      orderedAffectedMarkerCount: number;
      pinSourceOpacityMissingCount: number;
      exitingPinSourceOpacityRiskCount: number;
      sourceOpacityBacksScopedPins: boolean;
      emittedAtMs: number;
    }
  | {
      type: 'native_press_target_resolved';
      instanceId: string;
      sequence: number;
      target: SearchMapRenderedPressTarget | null;
      point: {
        x: number;
        y: number;
      };
      pressCoordinate: {
        lng: number;
        lat: number;
      } | null;
      durationMs: number;
      resolvedAtMs: number;
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

export type SearchMapRenderSourceRevisionState = Record<SearchMapRenderSourceId, string>;

export type SearchMapVisualFrameSourceAdmissionOutcome =
  | 'source_pending'
  | 'sources_applied_hidden'
  | 'sources_applied_visible'
  | 'sources_reused_resident'
  | 'source_apply_blocked_dismissing'
  | 'sources_cleared_hidden'
  | 'presentation_only_dismiss'
  | 'presentation_only_clear_hidden';

export type SearchMapVisualFrameTransactionKind =
  | 'bootstrap'
  | 'hidden_preload'
  | 'enter'
  | 'live_update'
  | 'dismiss'
  | 'clear_hidden';

export type SearchMapVisualFrameSourceSnapshotKind = 'pending' | 'ready' | 'empty';

export type SearchMapVisualFrameTransaction = {
  kind: SearchMapVisualFrameTransactionKind;
  presentationPhase: SearchRuntimeMapPresentationPhase;
  requestKey: string | null;
  visualCycleKey: string | null;
  readinessKey: string | null;
  shortcutCoverageRequestKey: string | null;
  markersRenderKey: string | null;
  sourceFrameKey: string;
  sourceDataKey: string;
  sourceSnapshotKind: SearchMapVisualFrameSourceSnapshotKind;
};

export type SearchMapNativeApplyAttributionBucket = {
  section: string;
  phase: string;
  source: string;
  count: number;
  totalMs: number;
  maxMs: number;
  operationCount: number;
};

export type SearchMapNativeApplyContextAttributionBucket = SearchMapNativeApplyAttributionBucket & {
  transactionKind: string;
  sourceSnapshotKind: string;
  sourcePayloadDisposition: string;
  rawSourceDeltaCount: number;
  appliedSourceDeltaCount: number;
  sourceFamilySignature: string;
  sourceModeSignature: string;
  sourceOperationSignature: string;
};

export type SearchMapNativeApplyAttributionSummary = {
  reason: string;
  enabled: boolean;
  startedAtMs: number | null;
  flushedAtMs: number;
  bucketCount: number;
  topBuckets: SearchMapNativeApplyAttributionBucket[];
  contextBucketCount?: number;
  topContextBuckets?: SearchMapNativeApplyContextAttributionBucket[];
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
  | 'labels'
  | 'labelCollisions';

type SearchMapRenderSourceTransportPayload = {
  effectiveChangedSourceIds: SearchMapRenderSourceId[];
  sourceDeltas?: SearchMapRenderSourceDelta[];
  markerRoleFrame?: SearchMapMarkerRoleFrame;
};

export type SearchMapMarkerRoleKind = 'pin' | 'dot';

export type SearchMapMarkerRoleRow = {
  markerKey: string;
  role: SearchMapMarkerRoleKind;
  slotIndex: number | null;
  pinFeature?: SearchMapSourceTransportFeature;
  pinInteractionFeature?: SearchMapSourceTransportFeature;
  dotFeature?: SearchMapSourceTransportFeature;
  labelFeatures?: SearchMapSourceTransportFeature[];
  labelCollisionFeature?: SearchMapSourceTransportFeature;
};

export type SearchMapMarkerRoleFrame = {
  mode: 'patch' | 'replace';
  nextPinnedMarkerKeysInOrder: string[];
  nextDotMarkerKeysInOrder: string[];
  residentDotMarkerKeysInOrder: string[];
  dirtyMarkerKeys: string[];
  removedMarkerKeys: string[];
  upsertRoles: SearchMapMarkerRoleRow[];
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
    message.includes('unknown instance') ||
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
  visualFrameTransaction: SearchMapVisualFrameTransaction;
  sourceTransport: SearchMapRenderSourceTransportPayload;
};

type SearchMapRenderControllerNativeFramePayload = {
  instanceId: string;
  ownerEpoch: number;
  frameGenerationId: string;
  executionBatchId: string;
  sourceRevisions: SearchMapRenderSourceRevisionState;
  visualFrameTransaction: SearchMapVisualFrameTransaction;
  sourceDeltas?: SearchMapRenderControllerNativeSourceDelta[];
  markerRoleFrame?: SearchMapMarkerRoleFrame;
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
    case 'labels':
      return attachedSourceIds.labelSourceId;
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
    sourceRevisions: payload.frame.sourceRevisions,
    visualFrameTransaction: payload.visualFrameTransaction,
    ...(sourceDeltas ? { sourceDeltas } : {}),
    ...(payload.sourceTransport.markerRoleFrame
      ? { markerRoleFrame: payload.sourceTransport.markerRoleFrame }
      : {}),
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
    labelSourceId: string;
    labelCollisionSourceId: string;
    labelLayerIds: string[];
    labelCollisionLayerIds: string[];
  }): Promise<void> {
    if (!nativeModule) {
      return;
    }
    attachedPayloadByInstanceId.set(payload.instanceId, payload);
    await nativeModule.attach(payload);
  },

  async configureNativeLayerGroups(payload: {
    instanceId: string;
    labelLayerIds: string[];
    labelCollisionLayerIds: string[];
  }): Promise<void> {
    if (!nativeModule?.configureNativeLayerGroups) {
      throw new Error(
        `SearchMapRenderController.configureNativeLayerGroups is required on ${Platform.OS}. Rebuild the native app so promoted slot layer ownership is available.`
      );
    }
    try {
      await nativeModule.configureNativeLayerGroups(payload);
    } catch (error) {
      const recoveredError = await recoverNativeRenderFrameSubmissionError(
        payload.instanceId,
        error
      );
      if (recoveredError.message !== 'stale owner epoch') {
        throw recoveredError;
      }
      await nativeModule.configureNativeLayerGroups(payload);
    }
  },

  async detach(instanceId: string): Promise<void> {
    if (!nativeModule) {
      return;
    }
    attachedPayloadByInstanceId.delete(instanceId);
    await nativeModule.detach(instanceId);
  },

  // Stage B (B1): push the full ranked candidate catalog (markerKey + coordinate
  // + rank) once per results change. Native projects it per camera tick for
  // screen-space LOD selection. Fire-and-forget: a failed push just leaves the
  // previous catalog in place until the next results change.
  async setCandidateCatalog(payload: {
    instanceId: string;
    entries: ReadonlyArray<{
      markerKey: string;
      lng: number;
      lat: number;
      rank: number;
      badgeImageId?: string;
      activeBadgeImageId?: string;
      restaurantId?: string;
    }>;
  }): Promise<void> {
    if (!nativeModule?.setCandidateCatalog) {
      return;
    }
    await nativeModule.setCandidateCatalog(payload);
  },

  // Press-up marker fade-out: ramps the native presentation scalar 1→0 + snapSettled immediately, decoupled from
  // the debounced data commit (so markers fade out on press, co-triggered with the JS frost). Idempotent.
  // U2 (§D6c): deliver the enter-start token over the direct bridge — skips the +32ms
  // full-frame rebuild the token used to ride. Fire-and-forget safe: the gate is idempotent
  // and the follow-up frame carrying the same token is a no-op.
  async commitEnterStart(payload: {
    requestKey: string;
    startToken: number;
    instanceId?: string;
  }): Promise<boolean> {
    if (!nativeModule?.commitEnterStart) {
      return false;
    }
    const result = await nativeModule.commitEnterStart(payload);
    return result?.started === true;
  },

  async beginInteractionFadeOut(instanceId?: string): Promise<void> {
    if (!nativeModule?.beginInteractionFadeOut) {
      return;
    }
    await nativeModule.beginInteractionFadeOut(instanceId != null ? { instanceId } : {});
  },

  async setRenderFrame(payload: {
    instanceId: string;
    ownerEpoch: number;
    frameGenerationId: string;
    executionBatchId: string;
    frame: SearchMapRenderFrame;
    visualFrameTransaction: SearchMapVisualFrameTransaction;
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
        nativeMainStartedAtEpochMs: finiteNumberOrUndefined(
          nativeTiming?.nativeMainStartedAtEpochMs
        ),
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
    onError: (error: Error) => void,
    onApplied?: (result: SearchMapRenderControllerSetRenderFrameResult | null) => void
  ): void {
    if (!nativeModule) {
      return;
    }
    void searchMapRenderController
      .setRenderFrame(payload)
      .then((result) => {
        onApplied?.(result);
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error : new Error(String(error)));
      });
  },

  async resetNativeApplyAttribution(
    payload: {
      reason?: string;
      runId?: string;
    } = {}
  ): Promise<void> {
    if (!nativeModule?.resetNativeApplyAttribution) {
      return;
    }
    await nativeModule.resetNativeApplyAttribution(payload);
  },

  async flushNativeApplyAttribution(
    payload: {
      reason?: string;
      reset?: boolean;
    } = {}
  ): Promise<SearchMapNativeApplyAttributionSummary | null> {
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
    try {
      return await nativeModule.queryRenderedPressTarget(payload);
    } catch (error) {
      const recoveredError = await recoverNativeRenderFrameSubmissionError(
        payload.instanceId,
        error
      );
      if (recoveredError.message !== 'stale owner epoch') {
        throw recoveredError;
      }
      return null;
    }
  },

  async configureNativePressTargeting(payload: {
    instanceId: string;
    enabled: boolean;
    dotLayerIds?: string[];
    dotTapIntentRadiusPx?: number;
  }): Promise<void> {
    if (!nativeModule?.configureNativePressTargeting) {
      throw new Error(
        `SearchMapRenderController.configureNativePressTargeting is required on ${Platform.OS}. Rebuild the native app so native-first map press ownership is available.`
      );
    }
    try {
      await nativeModule.configureNativePressTargeting(payload);
    } catch (error) {
      const recoveredError = await recoverNativeRenderFrameSubmissionError(
        payload.instanceId,
        error
      );
      if (recoveredError.message !== 'stale owner epoch') {
        throw recoveredError;
      }
      await nativeModule.configureNativePressTargeting(payload);
    }
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
