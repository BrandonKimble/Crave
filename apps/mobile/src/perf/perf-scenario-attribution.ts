// F873: ONE clock for the whole perf directory (was six identical re-declarations).
import { perfNow as resolvePerfNow } from './perf-clock';

import type { RuntimePerfScenarioConfig } from './perf-scenario-runtime-store';
import { usePerfScenarioRuntimeStore } from './perf-scenario-runtime-store';
import type { SearchResultsHeaderSourceContractPayload } from '../screens/Search/runtime/shared/use-search-root-search-scene-surface-render-header-source-runtime';

// Derived from the emitter's payload type so the two cannot drift: `emittedAtMs` is stamped by the
// logger, every other key is a payload field. Adding or removing a field on
// `SearchResultsHeaderSourceContractPayload` reds the `satisfies` below until this list matches.
const SEARCH_RESULTS_HEADER_SOURCE_CONTRACT_ALLOWLIST = Object.keys({
  event: true,
  emittedAtMs: true,
  effectiveFiltersHeaderHeightBase: true,
  effectiveFiltersHeaderHeightForRender: true,
  hasListHeaderForRender: true,
  stableHeaderChromeCoveredByLoadingCover: true,
  renderRowCount: true,
  shouldForceListHeaderForInteraction: true,
  shouldShowResultsSurface: true,
  surfaceMode: true,
} satisfies Record<keyof SearchResultsHeaderSourceContractPayload | 'emittedAtMs', true>);

export const SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO = 'search_submit_dismiss_repeat';
export const SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO = 'search_submit_dismiss_interrupt';
export const SEARCH_SUBMIT_VISUAL_PARITY_SCENARIO = 'search_submit_visual_parity';
export const SEARCH_SUBMIT_NATURAL_SCENARIO = 'search_submit_natural';
export const SEARCH_SUBMIT_SEARCH_THIS_AREA_SCENARIO = 'search_submit_search_this_area';
export const SEARCH_PIN_SELECTION_PROFILE_OPEN_SCENARIO = 'search_pin_selection_profile_open';
export const SEARCH_MAP_LOD_SCENARIO_PREFIX = 'search_map_lod_';

const DEFAULT_SEARCH_PERF_ATTRIBUTION_SCENARIOS = new Set([
  SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO,
  SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO,
  SEARCH_SUBMIT_VISUAL_PARITY_SCENARIO,
  SEARCH_SUBMIT_NATURAL_SCENARIO,
  SEARCH_SUBMIT_SEARCH_THIS_AREA_SCENARIO,
  SEARCH_PIN_SELECTION_PROFILE_OPEN_SCENARIO,
]);

export const isPerfScenarioAttributionActive = (
  config: RuntimePerfScenarioConfig | null,
  scenarioName?: string
): config is RuntimePerfScenarioConfig =>
  config != null &&
  (scenarioName == null
    ? DEFAULT_SEARCH_PERF_ATTRIBUTION_SCENARIOS.has(config.scenario) ||
      config.scenario.startsWith(SEARCH_MAP_LOD_SCENARIO_PREFIX) ||
      config.scenario.startsWith(`${SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO}_`) ||
      config.scenario.startsWith(`${SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO}_`)
    : config.scenario === scenarioName || config.scenario.startsWith(`${scenarioName}_`));

export const isPerfScenarioQuietMeasuredLoopActive = (
  config: RuntimePerfScenarioConfig | null
): config is RuntimePerfScenarioConfig =>
  config != null &&
  (config.scenario === SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO ||
    config.scenario.startsWith(`${SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO}_`) ||
    config.scenario === SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO ||
    config.scenario.startsWith(`${SEARCH_SUBMIT_DISMISS_INTERRUPT_SCENARIO}_`) ||
    config.scenario === SEARCH_PIN_SELECTION_PROFILE_OPEN_SCENARIO ||
    config.scenario.startsWith(`${SEARCH_PIN_SELECTION_PROFILE_OPEN_SCENARIO}_`) ||
    config.scenario.startsWith(SEARCH_MAP_LOD_SCENARIO_PREFIX)) &&
  usePerfScenarioRuntimeStore.getState().measuredRepeatLoopActive;

export const shouldSuppressPerfScenarioMeasuredLoopDiagnostics = (): boolean =>
  isPerfScenarioQuietMeasuredLoopActive(usePerfScenarioRuntimeStore.getState().activeConfig);

export const shouldSuppressPerfScenarioRuntimeDiagnostics = (): boolean =>
  isPerfScenarioAttributionActive(usePerfScenarioRuntimeStore.getState().activeConfig);

let activeSearchThisAreaSubmitId: string | null = null;

export const setActivePerfScenarioSearchThisAreaSubmitId = (submitId: string): void => {
  activeSearchThisAreaSubmitId = submitId;
};

export const getActivePerfScenarioSearchThisAreaSubmitId = (): string | null =>
  activeSearchThisAreaSubmitId;

export const clearActivePerfScenarioSearchThisAreaSubmitId = (submitId: string): void => {
  if (activeSearchThisAreaSubmitId === submitId) {
    activeSearchThisAreaSubmitId = null;
  }
};

/**
 * The keys `withPerfScenarioMetadata` injects into EVERY payload. They are the
 * line's identity — which run, which request, when — and they are named here
 * because the quiet projection has to know not to treat them as payload (F3705).
 */
const PERF_SCENARIO_METADATA_KEYS = [
  'emittedAtMs',
  'scenarioName',
  'scenarioRunId',
  'requestId',
  'signature',
] as const;

export const withPerfScenarioMetadata = (
  config: RuntimePerfScenarioConfig,
  payload: Record<string, unknown>
): Record<string, unknown> => ({
  ...payload,
  emittedAtMs: Number(resolvePerfNow().toFixed(1)),
  scenarioName: config.scenario,
  scenarioRunId: config.runId,
  requestId: config.requestId,
  signature: config.signature,
});

type BufferedAttributionEvent = {
  channel: string;
  payload: Record<string, unknown>;
};

type QuietAttributionAggregate = {
  channel: string;
  count: number;
  event: string;
  firstEmittedAtMs: number | null;
  key: string;
  lastEmittedAtMs: number | null;
  maxActualDurationMs: number;
  maxCommitSpanMs: number;
  maxDurationMs: number;
  maxDurationSample: Record<string, unknown> | null;
  samples: Array<Record<string, unknown>>;
  totalActualDurationMs: number;
  totalDurationMs: number;
};

const attributionEventBuffer: BufferedAttributionEvent[] = [];
const quietAttributionAggregates = new Map<string, QuietAttributionAggregate>();
const quietSuppressedVisualContractAggregates = new Map<string, QuietAttributionAggregate>();
const quietVisualContractDedupeKeys = new Map<string, string>();
let isFlushingAttributionBuffer = false;

const writePerfScenarioAttributionEvent = (
  channel: string,
  payload: Record<string, unknown>
): void => {
  // eslint-disable-next-line no-console
  console.log(`[SearchPerf][${channel}] ${JSON.stringify(payload)}`);
};

const resolveQuietAggregateKey = (
  channel: string,
  payload: Record<string, unknown>
): string | null => {
  const event = typeof payload.event === 'string' ? payload.event : null;
  if (channel === 'VisualReadiness' && event === 'native_label_observation_config_apply_contract') {
    return [
      channel,
      event,
      payload.status,
      payload.observationEnabled,
      payload.commitVisibleLabelHits,
      payload.labelSourceCount,
      payload.isAttached,
      payload.isNativeAvailable,
    ].join('|');
  }
  if (channel === 'VisualReadiness' && event === 'native_set_render_frame_bridge_slice') {
    return [
      channel,
      event,
      payload.status,
      payload.batchPhase,
      payload.laneKind,
      payload.visualFrameTransactionKind,
      payload.visualFrameSourceSnapshotKind,
      payload.frameAdmissionDecision,
      payload.normalWorkEffect,
      payload.sourceBaselineKind,
      payload.sourceModeSignature,
      payload.sourceOperationSignature,
      payload.markerRoleFrameMode,
      payload.sourceDeltaCount,
      payload.markerRoleDirtyCount,
      payload.markerRoleNormalPinnedCount,
      payload.markerRoleSelectedPinnedCount,
      payload.upsertFeatureCount,
    ].join('|');
  }
  if (channel === 'Profiler' && event === 'scenario_profiler_span') {
    return [
      channel,
      event,
      payload.id,
      payload.phase,
      payload.stageHint,
      payload.handoffPhase,
    ].join('|');
  }
  if (channel === 'WorkSpan' && event === 'scenario_work_span') {
    const path = typeof payload.path === 'string' ? payload.path : '';
    return [channel, event, payload.owner, path.slice(0, 160)].join('|');
  }
  return null;
};

const roundNumber = (value: number): number => Number(value.toFixed(3));

const numberFromPayload = (payload: Record<string, unknown>, key: string): number | null => {
  const value = Number(payload[key]);
  return Number.isFinite(value) ? value : null;
};

const compactQuietAttributionSample = (
  channel: string,
  payload: Record<string, unknown>
): Record<string, unknown> => {
  const event = typeof payload.event === 'string' ? payload.event : null;
  if (channel === 'Profiler' && event === 'scenario_profiler_span') {
    return {
      event,
      id: payload.id,
      phase: payload.phase,
      stageHint: payload.stageHint,
      actualDurationMs: payload.actualDurationMs,
      commitSpanMs: payload.commitSpanMs,
      handoffPhase: payload.handoffPhase,
      handoffOperationId: payload.handoffOperationId,
    };
  }
  if (channel === 'WorkSpan' && event === 'scenario_work_span') {
    const path = typeof payload.path === 'string' ? payload.path : null;
    return {
      event,
      owner: payload.owner,
      path: path == null || path.length <= 120 ? path : `${path.slice(0, 117)}...`,
      durationMs: payload.durationMs,
      activeTab: payload.activeTab,
      batchPhase: payload.batchPhase,
      frameGenerationId: payload.frameGenerationId,
      listenerLabel: payload.listenerLabel,
      listenerCount: payload.listenerCount,
      nativeEventType: payload.nativeEventType,
      status: payload.status,
    };
  }
  if (channel === 'VisualReadiness' && event === 'native_label_observation_config_apply_contract') {
    return {
      event,
      status: payload.status,
      observationEnabled: payload.observationEnabled,
      commitVisibleLabelHits: payload.commitVisibleLabelHits,
      labelSourceCount: payload.labelSourceCount,
      isAttached: payload.isAttached,
      isNativeAvailable: payload.isNativeAvailable,
      observationRequestKey: payload.observationRequestKey,
      sourceFrameVisualCycleKey: payload.sourceFrameVisualCycleKey,
    };
  }
  if (channel === 'VisualReadiness' && event === 'native_set_render_frame_bridge_slice') {
    return {
      event,
      status: payload.status,
      batchPhase: payload.batchPhase,
      laneKind: payload.laneKind,
      requestKey: payload.requestKey,
      frameGenerationId: payload.frameGenerationId,
      executionBatchId: payload.executionBatchId,
      startTimeMs: payload.startTimeMs,
      endTimeMs: payload.endTimeMs,
      nowMs: payload.nowMs,
      durationMs: payload.durationMs,
      nativeModuleDurationMs: payload.nativeModuleDurationMs,
      jsPromiseObservedAtEpochMs: payload.jsPromiseObservedAtEpochMs,
      nativeModuleReceivedAtEpochMs: payload.nativeModuleReceivedAtEpochMs,
      nativeMainStartedAtEpochMs: payload.nativeMainStartedAtEpochMs,
      nativeResolveStartedAtEpochMs: payload.nativeResolveStartedAtEpochMs,
      nativeResolveToJsPromiseObservedWallClockMs:
        payload.nativeResolveToJsPromiseObservedWallClockMs,
      nativeResolveToJsPromiseObservedWallClockConfidence:
        payload.nativeResolveToJsPromiseObservedWallClockConfidence,
      nativeModuleQueueWaitDurationMs: payload.nativeModuleQueueWaitDurationMs,
      nativeMainExecutionDurationMs: payload.nativeMainExecutionDurationMs,
      nativeSetFrameActionDurationMs: payload.nativeSetFrameActionDurationMs,
      nativeBridgeUnattributedDurationMs: payload.nativeBridgeUnattributedDurationMs,
      visualFrameTransactionKind: payload.visualFrameTransactionKind,
      visualFrameSourceSnapshotKind: payload.visualFrameSourceSnapshotKind,
      frameAdmissionDecision: payload.frameAdmissionDecision,
      normalWorkEffect: payload.normalWorkEffect,
      sourceBaselineKind: payload.sourceBaselineKind,
      snapshotChanged: payload.snapshotChanged,
      viewportBoundsChanged: payload.viewportBoundsChanged,
      gestureStateChanged: payload.gestureStateChanged,
      movingStateChanged: payload.movingStateChanged,
      presentationChanged: payload.presentationChanged,
      controlStateChanged: payload.controlStateChanged,
      isMoving: payload.isMoving,
      isGestureActive: payload.isGestureActive,
      shouldQueueNativeEnterMountAckFrame: payload.shouldQueueNativeEnterMountAckFrame,
      nominalChangedSourceIds: payload.nominalChangedSourceIds,
      selectedRestaurantId: payload.selectedRestaurantId,
      sourceDeltaCount: payload.sourceDeltaCount,
      markerRoleFrameMode: payload.markerRoleFrameMode,
      markerRoleDirtyCount: payload.markerRoleDirtyCount,
      markerRoleRemovedCount: payload.markerRoleRemovedCount,
      markerRoleUpsertCount: payload.markerRoleUpsertCount,
      markerRolePinnedCount: payload.markerRolePinnedCount,
      markerRoleNormalPinnedCount: payload.markerRoleNormalPinnedCount,
      markerRoleSelectedPinnedCount: payload.markerRoleSelectedPinnedCount,
      markerRoleDotCount: payload.markerRoleDotCount,
      replaceSourceCount: payload.replaceSourceCount,
      patchSourceCount: payload.patchSourceCount,
      removeFeatureCount: payload.removeFeatureCount,
      upsertFeatureCount: payload.upsertFeatureCount,
      nextFeatureCount: payload.nextFeatureCount,
      dirtyGroupCount: payload.dirtyGroupCount,
      orderChangedGroupCount: payload.orderChangedGroupCount,
      removedGroupCount: payload.removedGroupCount,
      sourceModeSignature: payload.sourceModeSignature,
      sourceOperationSignature: payload.sourceOperationSignature,
      sourceDeltaShapeSignature: payload.sourceDeltaShapeSignature,
      sourceDeltaSummaries: payload.sourceDeltaSummaries,
      effectiveChangedSourceIds: payload.effectiveChangedSourceIds,
      pinCount: payload.pinCount,
      dotCount: payload.dotCount,
      labelCount: payload.labelCount,
    };
  }
  return {
    event,
  };
};

const QUIET_VISUAL_CONTRACT_DEDUPE_EVENTS = new Set([
  'map_marker_visual_sources_contract',
  'map_pin_label_visibility_contract',
  'map_surface_results_source_frame_ready_contract',
  'mounted_results_count_contract',
  'native_enter_visual_frame_armed',
  'native_execution_batch_mounted_hidden_ready',
  'search_header_visual_contract',
  'search_results_header_source_contract',
  'search_shortcuts_visibility_contract',
]);

const QUIET_VISUAL_CONTRACT_DEDUPE_BOUNDARY_EVENTS = new Set([
  'results_dismiss_bottom_snap_handoff_contract',
  'results_dismiss_press_up_contract',
  'shortcut_submit_press_up_contract',
]);

const QUIET_VISUAL_CONTRACT_FIELD_ALLOWLIST = new Map<string, string[]>([
  [
    'cards_pins_cover_release_gate',
    [
      'event',
      'emittedAtMs',
      'transactionId',
      'requestKey',
      'frameGenerationId',
      'executionBatchId',
      'nativeMarkerEnterSettled',
      'pinCount',
      'dotCount',
      'labelCount',
    ],
  ],
  [
    'cards_pins_prepared_commit_gate',
    [
      'event',
      'emittedAtMs',
      'kind',
      'transactionId',
      'listPreparedRowsReady',
      'resultsSnapshotKey',
      'hydratedResultsKey',
      'isResultsHydrationSettled',
      'shouldHydrateResultsForRender',
      'mapPreparedLabelSourcesReady',
      'mapPreparedLabelSourcesReadyKey',
      'isShortcutCoverageLoading',
    ],
  ],
  [
    'card_reveal_settled',
    [
      'event',
      'emittedAtMs',
      'requestKey',
      'frameGenerationId',
      'executionBatchId',
      'pinCount',
      'dotCount',
      'labelCount',
      'settledAtMs',
    ],
  ],
  [
    'card_reveal_started',
    [
      'event',
      'emittedAtMs',
      'requestKey',
      'frameGenerationId',
      'executionBatchId',
      'pinCount',
      'dotCount',
      'labelCount',
      'startedAtMs',
    ],
  ],
  [
    'lod_classification_contract',
    [
      'event',
      'emittedAtMs',
      'searchMode',
      'activeTab',
      'readinessKey',
      'isMapMoving',
      'candidateRestaurantCount',
      'classifiedRestaurantCount',
      'dotRestaurantCount',
      'fullPinBudget',
      'pinRestaurantCount',
      'pinVisualIdentityCount',
      'dotVisualIdentityCount',
      'classifiedVisualIdentityCount',
      'promotedRestaurantsRenderAsPins',
      'nonPromotedRestaurantsRenderAsDots',
      'allEligibleVisualIdentitiesClassified',
      'unclassifiedCandidateRestaurantIdCount',
      'unclassifiedCandidateVisualIdentityCount',
    ],
  ],
  [
    'lod_source_overlap_contract',
    [
      'event',
      'emittedAtMs',
      'searchMode',
      'activeTab',
      'readinessKey',
      'preparedVisualCycleKey',
      'pinCount',
      'dotCount',
      'markerKeyOverlapCount',
      'restaurantIdOverlapCount',
    ],
  ],
  [
    'map_marker_visual_sources_contract',
    [
      'event',
      'emittedAtMs',
      'searchMode',
      'activeTab',
      'readinessKey',
      'pinCount',
      'dotCount',
      'normalPinCount',
      'selectedPinCount',
      'pinInteractionCount',
      'labelCount',
      'labelCollisionCount',
      'projectedVisualFeatureCount',
      'eligibleCoverageFeatureCount',
      'projectedVisualFeatureCountMatchesCoverage',
      'pinDotMarkerKeyOverlapCount',
      'pinDotVisualIdentityOverlapCount',
      'promotedRoleFamiliesAreComplete',
      'demotedRoleFamiliesAreDotOnly',
      'promotedPinInteractionCountMatchesPinCount',
      'labelPerPinCandidateCount',
      'hasPins',
      'hasDots',
      'hasPinLabels',
      'hasLabelCollisionSource',
      'nativeMapLabelCollisionPreserved',
    ],
  ],
  [
    'map_pin_label_layer_mount_contract',
    [
      'event',
      'emittedAtMs',
      'directDotSourceCount',
      'directLabelSourceCount',
      'directPinSourceCount',
      'isNativeOwnedMarkerRuntimeReady',
      'labelSourceCount',
      'shouldProjectSearchMarkerFamilies',
      'markerLayerShellMounted',
    ],
  ],
  [
    'map_pin_label_observation_config_contract',
    [
      'event',
      'emittedAtMs',
      'allowLiveLabelUpdates',
      'directLabelSourceCount',
      'directPinSourceCount',
      'directDotSourceCount',
      'isNativeManaged',
      'labelSourceCount',
      'pinSourceCount',
      'presentationTelemetryPhase',
      'publishVisibleLabelFeatureIds',
      'requestedNativeLabelObservationEnabled',
      'shouldDisableMarkers',
      'shouldRenderLabels',
    ],
  ],
  [
    'map_pin_label_visibility_contract',
    [
      'event',
      'emittedAtMs',
      'visibleLabelCount',
      'layerRenderedFeatureCount',
      'effectiveRenderedFeatureCount',
      'stickyChanged',
      'expectedPinLabelSourceCount',
      'expectedPinCount',
      'hasVisiblePinLabels',
    ],
  ],
  [
    'map_rendered_label_collision_contract',
    [
      'event',
      'emittedAtMs',
      'visibleLabelCount',
      'visibleLabelMarkerCount',
      'multipleVisibleLabelCandidateMarkerCount',
      'visibleLabelsWithoutPromotedPinCount',
      'visibleLabelsForDemotedMarkerCount',
      'visibleLabelsWithoutPromotedPinMarkerKeys',
      'visibleLabelsForDemotedMarkerKeys',
      'expectedPromotedPinCount',
      'expectedDemotedDotCount',
      'promotedPinCollisionObstacleCount',
      'promotedPinCollisionObstacleCountMatchesPins',
      'labelCollisionConfigured',
      'contractUsesNativeRoleTable',
    ],
  ],
  [
    'native_lod_snap_contract',
    [
      'event',
      'nativeEmittedAtMs',
      'reason',
      'snapshotReused',
      'desiredPinCount',
      'promotedPinCount',
      'roleFlipCount',
      'silentPinFlipCount',
      'silentDotFlipCount',
      'pinTransitionCreatedCount',
      'dotTransitionCreatedCount',
      'allowNewTransitions',
    ],
  ],
  [
    'native_lod_render_snap_contract',
    ['event', 'nativeEmittedAtMs', 'sourceId', 'fsRemovalFlashCount', 'fsJumpCount', 'samples'],
  ],
  [
    'native_live_lod_transition_contract',
    [
      'event',
      'emittedAtMs',
      'flashReversalCount',
      'crossfadeGapCount',
      'pinExitMidFadeCount',
      'lodTransitionTrace',
      'pinTransitionCount',
      'pinEnterTransitionCount',
      'pinExitTransitionCount',
      'dotTransitionCount',
      'dotEnterTransitionCount',
      'dotExitTransitionCount',
      'pinFeatureStateApplyCount',
      'labelFeatureStateApplyCount',
      'dotFeatureStateApplyCount',
      'pinLabelFadeSynchronized',
      'transitionDurationMs',
      'usesStyleTransition',
      'usesNativeFrameStepper',
      'hasIntermediateOpacity',
      'pinIntermediateOpacityCount',
      'labelIntermediateOpacityCount',
      'dotIntermediateOpacityCount',
      'nativeEmittedAtMs',
    ],
  ],
  [
    'native_pin_visual_order_contract',
    [
      'event',
      'emittedAtMs',
      'reason',
      'pinCount',
      'selectedPinCount',
      'movedGroupCount',
      'previousGroupCount',
      'screenYOrderViolationCount',
      'screenYVisualOrder',
      'stableSlotOwnership',
      'appliesScreenYOrdering',
      'usesLayerMoves',
      'usesViewportYZOrder',
      'sourceMutationCount',
      'isMoving',
      'visualOrderSignature',
      'previousVisualOrderSignature',
      'nativeEmittedAtMs',
    ],
  ],
  [
    'profile_pin_selection_camera_contract',
    [
      'event',
      'emittedAtMs',
      'restaurantId',
      'source',
      'hasPressedCoordinate',
      'selectedLocationId',
      'hasTargetCamera',
      'targetZoom',
      'paddingTop',
      'paddingBottom',
      'pressedTargetDistanceMeters',
      'targetMatchesPressedPin',
      'centersAboveSheet',
    ],
  ],
  [
    'map_surface_results_source_frame_ready_contract',
    [
      'event',
      'emittedAtMs',
      'transactionId',
      'readinessKey',
      'sourceFrameVisualCycleKey',
      'didPublishSourceFrame',
      'coalescedBeforeNativeEnter',
      'hasVisualSources',
      'expectsPreparedVisualSources',
      'mapPreparedLabelSourcesReady',
      'pinCount',
      'dotCount',
      'labelCount',
    ],
  ],
  [
    'mounted_results_count_contract',
    [
      'event',
      'emittedAtMs',
      'activeList',
      'activeTab',
      'admittedDishRowCount',
      'admittedRestaurantCardRowCount',
      'admittedRestaurantRowCount',
      'backendDishCountOnPage',
      'backendRestaurantCountOnPage',
      'mode',
      'renderRowCount',
      'rowsByTabDishRowCount',
      'rowsByTabRestaurantCardRowCount',
      'rowsByTabRestaurantRowCount',
      'totalFood',
      'totalRestaurants',
    ],
  ],
  [
    'mounted_sheet_layer_contract',
    [
      'event',
      'emittedAtMs',
      'activeList',
      'activeTab',
      'hostLayer',
      'inSheetBody',
      'primaryRowCount',
      'renderRowCount',
      'rootExternalListHost',
      'secondaryRowCount',
      'surfaceKind',
      'usesMountedRowsSnapshot',
    ],
  ],
  [
    'native_enter_visual_frame_armed',
    [
      'event',
      'emittedAtMs',
      'requestKey',
      'frameGenerationId',
      'executionBatchId',
      'pinCount',
      'dotCount',
      'labelCount',
    ],
  ],
  [
    'native_execution_batch_mounted_hidden_ready',
    [
      'event',
      'emittedAtMs',
      'requestKey',
      'frameGenerationId',
      'executionBatchId',
      'pinCount',
      'dotCount',
      'labelCount',
    ],
  ],
  [
    'native_marker_enter_settled',
    [
      'event',
      'emittedAtMs',
      'requestKey',
      'frameGenerationId',
      'executionBatchId',
      'pinCount',
      'dotCount',
      'labelCount',
      'pinsLabelsDotsFadeTogether',
    ],
  ],
  [
    'native_marker_enter_started',
    [
      'event',
      'emittedAtMs',
      'requestKey',
      'frameGenerationId',
      'executionBatchId',
      'pinCount',
      'dotCount',
      'labelCount',
      'pinsLabelsDotsFadeTogether',
    ],
  ],
  [
    'native_marker_exit_settled',
    [
      'event',
      'emittedAtMs',
      'requestKey',
      'frameGenerationId',
      'executionBatchId',
      'pinCount',
      'dotCount',
      'labelCount',
    ],
  ],
  [
    'native_marker_exit_started',
    [
      'event',
      'emittedAtMs',
      'requestKey',
      'frameGenerationId',
      'executionBatchId',
      'pinCount',
      'dotCount',
      'labelCount',
    ],
  ],
  [
    'results_dismiss_bottom_snap_handoff_contract',
    ['event', 'emittedAtMs', 'dockedSceneSwitchAtBottomSnap', 'snap', 'handoffTrigger'],
  ],
  [
    'results_dismiss_collapsed_boundary_contract',
    ['event', 'emittedAtMs', 'dockedSceneSwitchAtBottomSnap', 'handoffTrigger', 'handoffSource'],
  ],
  [
    'results_dismiss_press_up_contract',
    [
      'event',
      'emittedAtMs',
      'currentSheetSnap',
      'pinsLabelsDotsFadeOutRequested',
      'pinsLabelsFadeOutRequested',
      'pollsSwitchImmediate',
      'queryClearedToPlaceholder',
      'resultSheetBeginsSlidingDown',
      'shortcutsFadeInRequested',
    ],
  ],
  [
    'search_header_visual_contract',
    [
      'event',
      'emittedAtMs',
      'backdropTarget',
      'chromeMode',
      'displayQuery',
      'isCloseTransitionActive',
      'searchSheetContentLaneKind',
      'shortcutsInteractive',
      'shortcutsVisibleTarget',
    ],
  ],
  ['search_results_header_source_contract', SEARCH_RESULTS_HEADER_SOURCE_CONTRACT_ALLOWLIST],
  [
    'search_results_toggle_bar_contract',
    [
      'event',
      'emittedAtMs',
      'inSheetBody',
      'hostLayer',
      'hasCutoutMask',
      'hasRestaurantsSegment',
      'hasDishesSegment',
      'hasOpenNowToggle',
      'hasPriceToggle',
      'hasVotesToggle',
    ],
  ],
  [
    'search_shortcuts_visibility_contract',
    [
      'event',
      'emittedAtMs',
      'backdropTarget',
      'shouldShowSearchShortcutsTarget',
      'shouldEnableSearchShortcutsInteraction',
      'shortcutBackgroundOpacityTarget',
      'shortcutChipContainerOpacityTarget',
      'shortcutContentOpacityTarget',
      'shortcutOpacityTargetsShareTransition',
    ],
  ],
  [
    'shortcut_submit_press_up_contract',
    [
      'event',
      'emittedAtMs',
      'coverState',
      'loadingStateVisible',
      'queryPopulated',
      'resultSheetBeginsSlidingUp',
      'shortcutButtonsFadeOutRequested',
      'targetSnap',
      'transactionId',
    ],
  ],
]);

/**
 * THE QUIET-MODE PROJECTION — and, since F853, an HONEST one.
 *
 * F853 (2026-08-03): this silently copied `field in payload` and warned about nothing, over
 * a table of ~50 event names each with a HAND-LISTED field array whose keys must match emit
 * -site string literals with no compile-time link. Three defects were invisible by
 * construction, and the analysis you would run against these logs could be missing exactly
 * the field that would show RED:
 *
 *   1. a field ADDED at the emit site never appears in quiet-mode logs — it is not in the
 *      list, so it is dropped without trace;
 *   2. a TYPO in a list entry drops the real field AND names a field that does not exist;
 *   3. an event RENAMED at the emit site quietly falls back to "log everything", which at
 *      least is loud in volume — the only one of the three that was ever noticeable.
 *
 * The projection now REPORTS itself. Both diagnostic keys are omitted when empty, so a
 * healthy line is byte-identical to before and only a DRIFTING one grows:
 *
 *   `quietDroppedFields`  — payload keys the allowlist discarded. A field you cannot find
 *                           in a quiet log is now named in the log that dropped it.
 *   `quietUnlistedFields` — allowlist entries the payload does not have. A typo, a renamed
 *                           emit-site field, or a list entry that has outlived its payload.
 *
 * The deeper rederivation the finding argues for — emit sites declaring their own quiet
 * projection beside the payload, so there is ONE colocated truth — is NOT done here: it
 * touches ~50 emit sites across the search runtime and belongs with that lane. These two
 * keys make its absence VISIBLE rather than silent, which is the point of the instrument.
 */
const pickPayloadFields = (
  payload: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  const unlisted: string[] = [];
  // F3705 (2026-08-06): THE PROMISE ABOVE WAS FALSE FOR EVERY LINE EVER EMITTED.
  // `logPerfScenarioAttributionEvent` calls `withPerfScenarioMetadata` FIRST, so
  // compaction runs over an already-enriched payload — and not one of the ~50
  // allowlists contains `emittedAtMs`/`scenarioName`/`scenarioRunId`/`requestId`/
  // `signature`. So `quietDroppedFields` fired on EVERY quiet line with the same
  // five names, which is a noise FLOOR: a genuinely dropped field was
  // indistinguishable from the permanent hum, and the "a healthy line is
  // byte-identical to before" claim was never true. Worse, the compacted buffered
  // lines LOST their scenarioRunId and signature and could not be correlated to a
  // run at all, while the aggregate path re-attached metadata — the two flush paths
  // disagreed. Metadata is the line's IDENTITY, not payload: it is kept implicitly,
  // and an allowlist never has to list it.
  PERF_SCENARIO_METADATA_KEYS.forEach((key) => {
    if (key in payload) {
      next[key] = payload[key];
    }
  });
  fields.forEach((field) => {
    if (field in payload) {
      next[field] = payload[field];
    } else {
      unlisted.push(field);
    }
  });
  const dropped = Object.keys(payload).filter((key) => !(key in next));
  if (dropped.length > 0) {
    next.quietDroppedFields = dropped;
  }
  if (unlisted.length > 0) {
    next.quietUnlistedFields = unlisted;
  }
  return next;
};

const compactQuietBufferedPayload = (
  channel: string,
  payload: Record<string, unknown>
): Record<string, unknown> => {
  const event = typeof payload.event === 'string' ? payload.event : null;
  if (channel !== 'VisualReadiness' || event == null) {
    return payload;
  }
  const fields = QUIET_VISUAL_CONTRACT_FIELD_ALLOWLIST.get(event);
  return fields == null ? payload : pickPayloadFields(payload, fields);
};

const quietVisualContractDedupeKey = (
  channel: string,
  payload: Record<string, unknown>
): string | null => {
  const event = typeof payload.event === 'string' ? payload.event : null;
  if (channel !== 'VisualReadiness' || event == null) {
    return null;
  }
  if (QUIET_VISUAL_CONTRACT_DEDUPE_BOUNDARY_EVENTS.has(event)) {
    quietVisualContractDedupeKeys.clear();
    return null;
  }
  if (!QUIET_VISUAL_CONTRACT_DEDUPE_EVENTS.has(event)) {
    return null;
  }
  const compactPayload = compactQuietBufferedPayload(channel, payload);
  const payloadWithoutTime = { ...compactPayload };
  delete payloadWithoutTime.emittedAtMs;
  return JSON.stringify(payloadWithoutTime);
};

const aggregateQuietAttributionEvent = (
  channel: string,
  payload: Record<string, unknown>,
  key: string,
  target: Map<string, QuietAttributionAggregate> = quietAttributionAggregates
): void => {
  const event = typeof payload.event === 'string' ? payload.event : 'unknown';
  const current =
    target.get(key) ??
    ({
      channel,
      count: 0,
      event,
      firstEmittedAtMs: null,
      key,
      lastEmittedAtMs: null,
      maxActualDurationMs: 0,
      maxCommitSpanMs: 0,
      maxDurationMs: 0,
      maxDurationSample: null,
      samples: [],
      totalActualDurationMs: 0,
      totalDurationMs: 0,
    } satisfies QuietAttributionAggregate);
  current.count += 1;
  const emittedAtMs = numberFromPayload(payload, 'emittedAtMs');
  if (emittedAtMs != null) {
    current.firstEmittedAtMs = current.firstEmittedAtMs ?? emittedAtMs;
    current.lastEmittedAtMs = emittedAtMs;
  }
  const durationMs = numberFromPayload(payload, 'durationMs');
  if (durationMs != null) {
    current.totalDurationMs = roundNumber(current.totalDurationMs + durationMs);
    if (durationMs >= current.maxDurationMs) {
      current.maxDurationMs = durationMs;
      current.maxDurationSample = compactQuietAttributionSample(channel, payload);
    }
  }
  const actualDurationMs = numberFromPayload(payload, 'actualDurationMs');
  if (actualDurationMs != null) {
    current.totalActualDurationMs = roundNumber(current.totalActualDurationMs + actualDurationMs);
    current.maxActualDurationMs = Math.max(current.maxActualDurationMs, actualDurationMs);
  }
  const commitSpanMs = numberFromPayload(payload, 'commitSpanMs');
  if (commitSpanMs != null) {
    current.maxCommitSpanMs = Math.max(current.maxCommitSpanMs, commitSpanMs);
  }
  if (current.samples.length < 2) {
    current.samples.push(compactQuietAttributionSample(channel, payload));
  }
  target.set(key, current);
};

export const flushPerfScenarioAttributionEventBuffer = (
  config: RuntimePerfScenarioConfig,
  reason: string
): void => {
  if (
    attributionEventBuffer.length === 0 &&
    quietAttributionAggregates.size === 0 &&
    quietSuppressedVisualContractAggregates.size === 0
  ) {
    return;
  }
  const bufferedEvents = attributionEventBuffer.splice(0, attributionEventBuffer.length);
  const aggregateEvents = [...quietAttributionAggregates.values()].sort(
    (left, right) => right.count - left.count
  );
  const suppressedVisualContractEvents = [...quietSuppressedVisualContractAggregates.values()].sort(
    (left, right) => right.count - left.count
  );
  quietAttributionAggregates.clear();
  quietSuppressedVisualContractAggregates.clear();
  quietVisualContractDedupeKeys.clear();
  isFlushingAttributionBuffer = true;
  writePerfScenarioAttributionEvent(
    'Scenario',
    withPerfScenarioMetadata(config, {
      event: 'quiet_measured_loop_attribution_flush',
      reason,
      bufferedEventCount: bufferedEvents.length,
      aggregateEventCount: aggregateEvents.length,
      aggregateSampleCount: aggregateEvents.reduce((sum, event) => sum + event.count, 0),
      suppressedVisualContractEventCount: suppressedVisualContractEvents.length,
      suppressedVisualContractSampleCount: suppressedVisualContractEvents.reduce(
        (sum, event) => sum + event.count,
        0
      ),
    })
  );
  if (suppressedVisualContractEvents.length > 0) {
    writePerfScenarioAttributionEvent(
      'Scenario',
      withPerfScenarioMetadata(config, {
        event: 'quiet_measured_loop_visual_contract_summary',
        reason,
        aggregates: suppressedVisualContractEvents.slice(0, 30).map((aggregate) => ({
          sourceEvent: aggregate.event,
          aggregateKey: aggregate.key,
          count: aggregate.count,
          firstEmittedAtMs: aggregate.firstEmittedAtMs,
          lastEmittedAtMs: aggregate.lastEmittedAtMs,
          sample: aggregate.samples[0] ?? null,
        })),
      })
    );
  }
  aggregateEvents.forEach((aggregate) => {
    writePerfScenarioAttributionEvent(aggregate.channel, {
      event: 'quiet_measured_loop_attribution_aggregate',
      sourceEvent: aggregate.event,
      aggregateKey: aggregate.key,
      count: aggregate.count,
      firstEmittedAtMs: aggregate.firstEmittedAtMs,
      lastEmittedAtMs: aggregate.lastEmittedAtMs,
      maxActualDurationMs: aggregate.maxActualDurationMs,
      maxCommitSpanMs: aggregate.maxCommitSpanMs,
      maxDurationMs: aggregate.maxDurationMs,
      maxDurationSample: aggregate.maxDurationSample,
      samples: aggregate.samples,
      totalActualDurationMs: aggregate.totalActualDurationMs,
      totalDurationMs: aggregate.totalDurationMs,
      quietBuffered: true,
      flushReason: reason,
      ...withPerfScenarioMetadata(config, {}),
    });
  });
  bufferedEvents.forEach((event) => {
    writePerfScenarioAttributionEvent(event.channel, {
      ...event.payload,
      quietBuffered: true,
      flushReason: reason,
    });
  });
  isFlushingAttributionBuffer = false;
};

export const logPerfScenarioAttributionEvent = (
  channel: string,
  config: RuntimePerfScenarioConfig,
  payload: Record<string, unknown>
): void => {
  const eventPayload = withPerfScenarioMetadata(config, payload);
  if (!isFlushingAttributionBuffer && isPerfScenarioQuietMeasuredLoopActive(config)) {
    const aggregateKey = resolveQuietAggregateKey(channel, eventPayload);
    if (aggregateKey != null) {
      aggregateQuietAttributionEvent(channel, eventPayload, aggregateKey);
      return;
    }
    const dedupeKey = quietVisualContractDedupeKey(channel, eventPayload);
    if (dedupeKey != null) {
      const event = typeof eventPayload.event === 'string' ? eventPayload.event : 'unknown';
      if (quietVisualContractDedupeKeys.get(event) === dedupeKey) {
        aggregateQuietAttributionEvent(
          'VisualReadiness',
          compactQuietBufferedPayload(channel, eventPayload),
          `VisualReadiness|${event}|suppressed_duplicate|${dedupeKey.slice(0, 160)}`,
          quietSuppressedVisualContractAggregates
        );
        return;
      }
      quietVisualContractDedupeKeys.set(event, dedupeKey);
    }
    attributionEventBuffer.push({
      channel,
      payload: compactQuietBufferedPayload(channel, eventPayload),
    });
    return;
  }
  writePerfScenarioAttributionEvent(channel, eventPayload);
};

export const logPerfScenarioSearchRequestLifecycle = (payload: Record<string, unknown>): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }
  logPerfScenarioAttributionEvent('SearchRequest', scenarioConfig, {
    event: 'search_request_lifecycle',
    ...payload,
  });
};

const capturePerfScenarioStack = (): string[] => {
  const stack = new Error().stack;
  if (typeof stack !== 'string') {
    return [];
  }
  return stack
    .split('\n')
    .slice(3, 11)
    .map((line) => line.trim())
    .filter(Boolean);
};

type StackAttributionAggregate = {
  owner: string;
  path: string;
  count: number;
  sampleDetails: Array<Record<string, unknown>>;
};

const stackAttributionAggregates = new Map<string, StackAttributionAggregate>();

const aggregateStackAttribution = ({
  owner,
  path,
  details,
}: {
  owner: string;
  path: string;
  details?: Record<string, unknown>;
}): void => {
  const key = `${owner}\n${path}`;
  const current =
    stackAttributionAggregates.get(key) ??
    ({
      owner,
      path,
      count: 0,
      sampleDetails: [],
    } satisfies StackAttributionAggregate);
  current.count += 1;
  if (details && current.sampleDetails.length < 3) {
    current.sampleDetails.push(details);
  }
  stackAttributionAggregates.set(key, current);
};

export const flushPerfScenarioStackAttributionAggregates = (
  config: RuntimePerfScenarioConfig,
  reason: string
): void => {
  if (stackAttributionAggregates.size === 0) {
    return;
  }
  const aggregates = [...stackAttributionAggregates.values()].sort(
    (left, right) => right.count - left.count
  );
  stackAttributionAggregates.clear();
  logPerfScenarioAttributionEvent('WorkSpan', config, {
    event: 'scenario_work_span',
    owner: 'quiet_measured_loop_stack_attribution_summary',
    path: reason,
    // F3705: `durationMs: 0` was hardcoded here and below — a duration that can
    // only ever be zero is not a measurement, and it POISONED the aggregate:
    // `durationMs >= current.maxDurationMs` against an initial 0 let a span that
    // measured nothing claim the "worst sample" slot. A span with no duration now
    // says so by omitting the field, which the aggregator already reads as absent.
    aggregateCount: aggregates.length,
    aggregates,
  });
};

export const logPerfScenarioStackAttribution = ({
  owner,
  path,
  details,
}: {
  owner: string;
  path: string;
  details?: Record<string, unknown>;
}): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (scenarioConfig == null) {
    return;
  }
  if (isPerfScenarioQuietMeasuredLoopActive(scenarioConfig)) {
    aggregateStackAttribution({ owner, path, details });
    return;
  }

  logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
    event: 'scenario_work_span',
    owner,
    path,
    // F3705: see above — a stack attribution has no duration; it had a zero.
    stack: capturePerfScenarioStack(),
    ...(details ?? null),
  });
};

export const logPerfScenarioRenderAttribution = ({
  owner,
  phase,
  details,
}: {
  owner: string;
  phase?: string;
  details?: Record<string, unknown>;
}): void => {
  const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
  if (!isPerfScenarioAttributionActive(scenarioConfig)) {
    return;
  }
  if (isPerfScenarioQuietMeasuredLoopActive(scenarioConfig)) {
    return;
  }

  logPerfScenarioAttributionEvent('Render', scenarioConfig, {
    event: 'scenario_render',
    owner,
    phase: phase ?? 'render',
    ...(details ?? null),
  });
};
