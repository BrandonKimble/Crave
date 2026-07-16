import { unstable_batchedUpdates } from 'react-native';

import { logger } from '../../utils';
import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import type { OverlayRouteEntry, OverlayRouteParamsMap } from './app-overlay-route-types';
import {
  areRouteStateSnapshotsEqual,
  closeActiveRouteState,
  createRouteStateSnapshot,
  popToEntryRouteState,
  popToRootRouteState,
  pushRouteState,
  ROOT_SEARCH_ROUTE_ENTRY,
  setRootRouteState,
  stampRouteEntryDesireState,
  updateRouteState,
  type RouteSceneSwitchRouteStateSnapshot,
} from './app-overlay-route-stack-algebra';
import {
  captureRouteEntryOrigin,
  stageRouteEntryOriginRestore,
} from './route-entry-origin-capture-delegate';
import {
  commitStagedTransitionTxn,
  settleLiveTransitionTxnAtIdle,
  stageTransitionTxnForCommittedSwitch,
} from './transition-engine/transition-txn-stager';
import type {
  RouteSceneSwitchDockedPollsRestoreIntent,
  RouteSceneSwitchMotionPlane,
  RouteSceneSwitchPollsParams,
  RouteSceneSwitchRequestInput,
  RouteSceneSwitchSheetContentHandoff,
  RouteSceneSwitchTransitionContract,
  RouteSceneSwitchTransitionPhase,
} from './app-overlay-route-transition-contract';
import type { AppRouteSceneSheetMotionTargetRegistry } from './app-route-scene-sheet-motion-target-registry';
import {
  notePremountPresentationAck,
  notePremountPresentationFrame,
} from './premount-violation-probe';
import {
  resolveAppRouteSceneTransitionPlan,
  type AppRouteSceneTransitionPlan,
} from './app-route-scene-transition-policy-runtime';
import type { RouteSceneVisibilityPolicyRuntime } from './app-route-scene-visibility-policy-contract';
import {
  arePresentationFramesEqual,
  EMPTY_PRESENTATION_FRAME,
  resolveHeaderNavAction,
  resolveIsChildSceneRevealed,
  resolvePresentationLaneKind,
  resolvePresentedSceneKey,
  resolveSupersededOutgoingEntryId,
  resolveSupersededOutgoingSceneKey,
  type PresentationFrame,
  type PresentationLaneInputs,
} from './app-route-presentation-frame-contract';
import { resolveActiveEntryIdForScene } from './app-route-scene-entry-mounts';
import {
  isEditSessionLiveOnScene,
  subscribeEditSessionLiveness,
} from './edit-session-liveness-contract';

export type RouteSceneSwitchTransitionState = {
  activeSceneKey: OverlayKey | null;
  interactiveSceneKey: OverlayKey | null;
  sourceSceneKey: OverlayKey | null;
  handoffSceneKey: OverlayKey | null;
  transitionPhase: RouteSceneSwitchTransitionPhase;
  isInteractive: boolean;
  isOverlaySwitchInFlight: boolean;
  pendingTargetSceneKey: OverlayKey | null;
  activePollsParams: RouteSceneSwitchPollsParams | null;
  pendingPollsParams: RouteSceneSwitchPollsParams | null;
  activeDockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
  pendingDockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
  transitionToken: number;
  transitionContract: RouteSceneSwitchTransitionContract | null;
  routeState: RouteSceneSwitchRouteStateSnapshot;
};

export type { RouteSceneSwitchRouteStateSnapshot } from './app-overlay-route-stack-algebra';

type RouteSceneSwitchTransitionListener = (
  transitionState: RouteSceneSwitchTransitionState
) => void;

type RouteSceneSwitchTransitionSelector<TSelected> = (
  transitionState: RouteSceneSwitchTransitionState
) => TSelected;

type RouteSceneSwitchTransitionEquality<TSelected> = (left: TSelected, right: TSelected) => boolean;

type RouteSceneSwitchTransitionListenerEntry = {
  listener: RouteSceneSwitchTransitionListener;
  attributionLabel: string;
  shouldNotify?: (transitionState: RouteSceneSwitchTransitionState) => boolean;
};

export type RouteSceneSwitchSettleCallback = () => void;

export type RouteSceneSwitchMotionDispatchSnapshot = {
  activeSceneKey: OverlayKey | null;
  isOverlaySwitchInFlight: boolean;
  transitionContract: RouteSceneSwitchTransitionContract | null;
};

type RouteSceneSwitchMotionDispatchTarget = (
  transitionState: RouteSceneSwitchMotionDispatchSnapshot
) => void;

export type RouteSceneSwitchSceneStackDispatchSnapshot = {
  routeActiveSceneKey: OverlayKey | null;
  interactiveSceneKey: OverlayKey | null;
  pendingSceneKey: OverlayKey | null;
  handoffSceneKey: OverlayKey | null;
  sheetContentHandoff: RouteSceneSwitchSheetContentHandoff;
  transitionPhase: RouteSceneSwitchTransitionPhase;
  isInteractive: boolean;
  /** The route stack (S-B slice 3a): the scene stack derives child-leg lifetime from it. */
  overlayRouteStack: readonly OverlayRouteEntry[];
};

type RouteSceneSwitchSceneStackDispatchTarget = (
  transitionState: RouteSceneSwitchSceneStackDispatchSnapshot
) => void;

type RouteSceneSwitchNativeOverlayDispatchSelector = readonly unknown[];

type RouteSceneSwitchNativeOverlayDispatchTarget = (
  transitionState: RouteSceneSwitchTransitionState
) => void;

type RouteSceneSwitchAuthoritiesDispatchTarget = (
  transitionState: RouteSceneSwitchTransitionState
) => void;

export type RouteSceneSwitchTransitionActions = {
  requestOverlaySwitch: (input: RouteSceneSwitchRequestInput) => number;
  requestOverlaySwitchWithSettleCallback: (
    input: RouteSceneSwitchRequestInput,
    onSettle: RouteSceneSwitchSettleCallback
  ) => number;
  completeRouteSceneSwitchMotionPlane: (
    settleToken: number,
    plane: RouteSceneSwitchMotionPlane
  ) => void;
  clearDockedPollsRestoreIntent: (
    token?: number,
    snap?: RouteSceneSwitchDockedPollsRestoreIntent['snap']
  ) => void;
  /**
   * PresentationFrame read (page-switch-master-plan.md §1/§9). Lives on the ACTIONS slice so
   * controllers wired with only the actions (e.g. the overlay-session-state controller's
   * docked-lane adapter, §9.2 site 5) can read the committed frame without a second derivation.
   * Every provider of this type is the one AppRouteSceneSwitchController runtime.
   */
  getPresentationFrame: () => PresentationFrame;
  /**
   * Frame-publication subscription, on the ACTIONS slice for the same reason as
   * getPresentationFrame: an actions-only consumer that PULL-reads the frame in its snapshot
   * (the overlay-session-state controller's docked-lane formula) must also be able to
   * RECOMPUTE when the frame is re-minted without a switch (a results_dismissing lane
   * re-mint), or its derived state goes stale until an unrelated poke.
   */
  subscribePresentationFrame: (listener: (frame: PresentationFrame) => void) => () => void;
  /**
   * Route-stack read, on the ACTIONS slice for the same reason as getPresentationFrame: the
   * overlay-session-state controller (actions-only wiring) derives the S-C.3-B home-dismissal
   * pop from STACK TRUTH (hasSearchSessionAboveRoot). Every provider is the one controller.
   */
  getRouteState: () => RouteSceneSwitchRouteStateSnapshot;
};

export type AppRouteSceneSwitchRuntime = RouteSceneSwitchTransitionActions & {
  getTransitionState: () => RouteSceneSwitchTransitionState;
  getPreviousRouteKey: () => OverlayKey | null;
  getPreviousRouteEntry: () => OverlayRouteEntry | null;
  getRootRouteKey: () => OverlayKey | null;
  setRootRouteState: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  updateRouteState: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  pushRouteState: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  stampActiveRouteEntryDesire: (desire: OverlayRouteEntry['desire']) => void;
  closeActiveRouteState: () => void;
  popToEntryRouteState: (entryId: string) => void;
  popToRootRouteState: () => void;
  subscribeTransitionState: (
    listener: (transitionState: RouteSceneSwitchTransitionState) => void,
    attributionLabel?: string
  ) => () => void;
  subscribeTransitionSelector: <TSelected>(
    selector: RouteSceneSwitchTransitionSelector<TSelected>,
    listener: (transitionState: RouteSceneSwitchTransitionState) => void,
    isEqual?: RouteSceneSwitchTransitionEquality<TSelected>,
    attributionLabel?: string
  ) => () => void;
  setRouteSceneMotionDispatchTarget: (
    target: RouteSceneSwitchMotionDispatchTarget | null
  ) => () => void;
  setRouteSceneStackTransitionDispatchTarget: (
    target: RouteSceneSwitchSceneStackDispatchTarget | null
  ) => () => void;
  setRouteNativeOverlayTransitionDispatchTarget: (
    target: RouteSceneSwitchNativeOverlayDispatchTarget | null
  ) => () => void;
  setRouteSceneAuthoritiesDispatchTarget: (
    target: RouteSceneSwitchAuthoritiesDispatchTarget | null
  ) => () => void;
  // ─── PresentationFrame (page-switch-master-plan.md §1/§9) — the single committed
  // "what's on screen" value. Minted ONLY here (the one writer); consumers subscribe on the
  // dispatch-flush cadence (§9.1 R7) and read every presentation decision as f(frame).
  // (getPresentationFrame + subscribePresentationFrame are declared on
  // RouteSceneSwitchTransitionActions above — actions-only consumers need both.)
  /** Paint-ack sink, switchId-keyed (§9.1 R2): a late ack from a superseded switch is ignored. */
  commitPresentationPaintAck: (switchId: number) => void;
  /**
   * The docked-polls lane inputs mutate WITHOUT a switch (gesture dismiss; results_dismissing
   * release), so the wiring layer registers a live provider + change subscription and the
   * controller RE-MINTS the frame on change (§9.1 R1) — still the one writer.
   */
  registerPresentationLaneInputs: (
    provider: () => PresentationLaneInputs,
    subscribe: (onChange: () => void) => () => void
  ) => () => void;
  dispose: () => void;
};

// Pre-wiring lane inputs (the runtime provider registers the live feed at boot). All-false resolves
// laneKind 'top-level' — inert until the docked-polls inputs are wired (same atomic phase).
const DEFAULT_PRESENTATION_LANE_INPUTS: PresentationLaneInputs = {
  isPersistentPollLaneEligible: false,
  isResultsDismissing: false,
  canReleasePersistentPolls: false,
  isDockedPollsDismissed: false,
};

// Ack records older than this many switches are pruned — supersede only ever consults the
// immediately-previous frame's switchId.
const PRESENTATION_ACK_RETENTION = 8;

// Route-stack algebra (entries-as-values) lives in app-overlay-route-stack-algebra.ts.

// S-B origin-on-entry: pop restores the popped entry's captured presentation via the restore
// delegate (session controller stages detent ledger + scroll lanes). Dismiss VERBS stage it
// before requesting the switch (the motion plan reads the ledger); the reducer paths below
// stage as a fallback for bare (non-scene-switch) pops.
const stagePoppedEntryOriginRestore = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot
): void => {
  const poppedEntry =
    currentRouteState.overlayRouteStack[currentRouteState.overlayRouteStack.length - 1];
  stageRouteEntryOriginRestore(poppedEntry?.origin);
};

const applyTransitionPlanToRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  transitionPlan: AppRouteSceneTransitionPlan
): RouteSceneSwitchRouteStateSnapshot => {
  const next = ((): RouteSceneSwitchRouteStateSnapshot => {
    switch (transitionPlan.committedRouteAction) {
      case 'preserve':
        return currentRouteState;
      case 'push':
        return pushRouteState(
          currentRouteState,
          transitionPlan.committedRootRouteKey,
          transitionPlan.committedRouteParams,
          // Captured at commit — the departing scene still owns the live detent/scroll.
          captureRouteEntryOrigin(currentRouteState.activeOverlayRoute.key)
        );
      case 'updateActive':
        return updateRouteState(
          currentRouteState,
          currentRouteState.activeOverlayRoute.key,
          transitionPlan.committedRouteParams
        );
      case 'closeActive':
        stagePoppedEntryOriginRestore(currentRouteState);
        return closeActiveRouteState(currentRouteState);
      case 'popToEntry': {
        if (transitionPlan.committedRouteEntryId == null) {
          return currentRouteState;
        }
        // The revealed entry's presentation restores from the entry directly ABOVE it — the
        // one whose push captured it (origins live on pushed entries).
        const targetIndex = currentRouteState.overlayRouteStack.findIndex(
          (entry) => entry.entryId === transitionPlan.committedRouteEntryId
        );
        const entryAboveTarget =
          targetIndex >= 0 ? currentRouteState.overlayRouteStack[targetIndex + 1] : null;
        stageRouteEntryOriginRestore(entryAboveTarget?.origin);
        return popToEntryRouteState(currentRouteState, transitionPlan.committedRouteEntryId);
      }
      case 'popToRoot':
        return popToRootRouteState(currentRouteState);
      case 'setRoot':
      default:
        return setRootRouteState(
          currentRouteState,
          transitionPlan.committedRootRouteKey,
          transitionPlan.committedRouteParams
        );
    }
  })();
  return next;
};

const INITIAL_ROUTE_SCENE_SWITCH_TRANSITION_STATE: RouteSceneSwitchTransitionState = {
  activeSceneKey: 'search',
  interactiveSceneKey: 'search',
  sourceSceneKey: null,
  handoffSceneKey: null,
  transitionPhase: 'idle',
  isInteractive: true,
  isOverlaySwitchInFlight: false,
  pendingTargetSceneKey: null,
  activePollsParams: null,
  pendingPollsParams: null,
  activeDockedPollsRestoreIntent: null,
  pendingDockedPollsRestoreIntent: null,
  transitionToken: 0,
  transitionContract: null,
  routeState: createRouteStateSnapshot({
    activeOverlayRoute: ROOT_SEARCH_ROUTE_ENTRY,
    overlayRouteStack: [ROOT_SEARCH_ROUTE_ENTRY],
  }),
};

const areTransitionStatesEqual = (
  left: RouteSceneSwitchTransitionState,
  right: RouteSceneSwitchTransitionState
): boolean =>
  left.activeSceneKey === right.activeSceneKey &&
  left.interactiveSceneKey === right.interactiveSceneKey &&
  left.sourceSceneKey === right.sourceSceneKey &&
  left.handoffSceneKey === right.handoffSceneKey &&
  left.transitionPhase === right.transitionPhase &&
  left.isInteractive === right.isInteractive &&
  left.isOverlaySwitchInFlight === right.isOverlaySwitchInFlight &&
  left.pendingTargetSceneKey === right.pendingTargetSceneKey &&
  left.activePollsParams === right.activePollsParams &&
  left.pendingPollsParams === right.pendingPollsParams &&
  left.activeDockedPollsRestoreIntent === right.activeDockedPollsRestoreIntent &&
  left.pendingDockedPollsRestoreIntent === right.pendingDockedPollsRestoreIntent &&
  left.transitionToken === right.transitionToken &&
  left.transitionContract === right.transitionContract &&
  areRouteStateSnapshotsEqual(left.routeState, right.routeState);

const resolveRouteSceneSwitchMotionDispatchSnapshot = (
  state: RouteSceneSwitchTransitionState
): RouteSceneSwitchMotionDispatchSnapshot => ({
  activeSceneKey: state.activeSceneKey,
  isOverlaySwitchInFlight: state.isOverlaySwitchInFlight,
  transitionContract: state.transitionContract,
});

const areRouteSceneSwitchMotionDispatchSnapshotsEqual = (
  left: RouteSceneSwitchMotionDispatchSnapshot,
  right: RouteSceneSwitchMotionDispatchSnapshot
): boolean =>
  left.activeSceneKey === right.activeSceneKey &&
  left.isOverlaySwitchInFlight === right.isOverlaySwitchInFlight &&
  left.transitionContract === right.transitionContract;

export const resolveRouteSceneSwitchSceneStackDispatchSnapshot = (
  state: RouteSceneSwitchTransitionState
): RouteSceneSwitchSceneStackDispatchSnapshot => ({
  routeActiveSceneKey: state.activeSceneKey,
  interactiveSceneKey: state.interactiveSceneKey,
  pendingSceneKey: state.isOverlaySwitchInFlight ? state.pendingTargetSceneKey : null,
  handoffSceneKey: state.isOverlaySwitchInFlight ? state.handoffSceneKey : null,
  sheetContentHandoff:
    state.transitionContract?.sheetTransitionPlan.contentHandoff ?? 'swapImmediately',
  transitionPhase: state.transitionPhase,
  isInteractive: state.isInteractive,
  overlayRouteStack: state.routeState.overlayRouteStack,
});

const areRouteSceneSwitchSceneStackDispatchSnapshotsEqual = (
  left: RouteSceneSwitchSceneStackDispatchSnapshot,
  right: RouteSceneSwitchSceneStackDispatchSnapshot
): boolean =>
  left.overlayRouteStack === right.overlayRouteStack &&
  left.routeActiveSceneKey === right.routeActiveSceneKey &&
  left.interactiveSceneKey === right.interactiveSceneKey &&
  left.pendingSceneKey === right.pendingSceneKey &&
  left.handoffSceneKey === right.handoffSceneKey &&
  left.sheetContentHandoff === right.sheetContentHandoff &&
  left.transitionPhase === right.transitionPhase &&
  left.isInteractive === right.isInteractive;

const resolveRouteSceneSwitchNativeOverlayDispatchSelector = (
  state: RouteSceneSwitchTransitionState
): RouteSceneSwitchNativeOverlayDispatchSelector => {
  const pendingSceneKey = state.isOverlaySwitchInFlight ? state.pendingTargetSceneKey : null;
  return [
    state.activeSceneKey,
    pendingSceneKey,
    state.activeSceneKey != null || state.transitionPhase !== 'idle',
    state.transitionContract?.committedRootRouteKey ?? null,
    state.transitionContract?.targetSceneKey ?? null,
    state.activeDockedPollsRestoreIntent,
    state.routeState.activeOverlayRoute,
    state.routeState.overlayRouteStack,
    state.routeState.rootOverlayKey,
    state.routeState.overlayRouteStackLength,
  ];
};

const areRouteSceneSwitchNativeOverlayDispatchSelectorsEqual = (
  left: RouteSceneSwitchNativeOverlayDispatchSelector,
  right: RouteSceneSwitchNativeOverlayDispatchSelector
): boolean =>
  left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

const createTransitionContract = ({
  transitionPlan,
  transitionToken,
  settleToken,
  dockedPollsRestoreIntent,
}: {
  transitionPlan: AppRouteSceneTransitionPlan;
  transitionToken: number;
  settleToken: number;
  dockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null;
}): RouteSceneSwitchTransitionContract => ({
  sourceSceneKey: transitionPlan.sourceSceneKey,
  targetSceneKey: transitionPlan.targetSceneKey,
  transitionPhase: 'overlay-switch',
  transitionToken,
  settleToken,
  committedRootRouteKey: transitionPlan.committedRootRouteKey,
  committedRouteAction: transitionPlan.committedRouteAction,
  committedRouteEntryId: transitionPlan.committedRouteEntryId,
  committedRouteParams: transitionPlan.committedRouteParams,
  snapTarget: transitionPlan.snapTarget,
  sheetHostSceneKey: transitionPlan.sheetHostSceneKey,
  sheetSnapTarget: transitionPlan.sheetSnapTarget,
  sheetVisibilityTarget: transitionPlan.sheetVisibilityTarget,
  sheetIntent: transitionPlan.sheetIntent,
  sheetTransitionPlan: transitionPlan.sheetTransitionPlan,
  cameraIntent: transitionPlan.cameraIntent,
  chromeVisibilityTarget: transitionPlan.chromeVisibilityTarget,
  freezeClassification: transitionPlan.freezeClassification,
  motionPlanes: transitionPlan.motionPlanes,
  pollsParams: transitionPlan.pollsParams,
  dockedPollsRestoreIntent,
  isInteractive: false,
});

export class AppRouteSceneSwitchController implements AppRouteSceneSwitchRuntime {
  private transitionState: RouteSceneSwitchTransitionState =
    INITIAL_ROUTE_SCENE_SWITCH_TRANSITION_STATE;

  private currentMotionDispatchSnapshot: RouteSceneSwitchMotionDispatchSnapshot =
    resolveRouteSceneSwitchMotionDispatchSnapshot(INITIAL_ROUTE_SCENE_SWITCH_TRANSITION_STATE);

  private motionDispatchTarget: RouteSceneSwitchMotionDispatchTarget | null = null;

  private currentSceneStackDispatchSnapshot: RouteSceneSwitchSceneStackDispatchSnapshot =
    resolveRouteSceneSwitchSceneStackDispatchSnapshot(INITIAL_ROUTE_SCENE_SWITCH_TRANSITION_STATE);

  private sceneStackTransitionDispatchTarget: RouteSceneSwitchSceneStackDispatchTarget | null =
    null;

  private currentNativeOverlayDispatchSelector: RouteSceneSwitchNativeOverlayDispatchSelector =
    resolveRouteSceneSwitchNativeOverlayDispatchSelector(
      INITIAL_ROUTE_SCENE_SWITCH_TRANSITION_STATE
    );

  private nativeOverlayTransitionDispatchTarget: RouteSceneSwitchNativeOverlayDispatchTarget | null =
    null;

  private sceneAuthoritiesDispatchTarget: RouteSceneSwitchAuthoritiesDispatchTarget | null = null;

  private pendingSceneAuthoritiesDispatchState: RouteSceneSwitchTransitionState | null = null;

  private pendingNativeOverlayDispatchState: RouteSceneSwitchTransitionState | null = null;

  private pendingMotionDispatchSnapshot: RouteSceneSwitchMotionDispatchSnapshot | null = null;

  private pendingSceneStackDispatchSnapshot: RouteSceneSwitchSceneStackDispatchSnapshot | null =
    null;

  // ─── PresentationFrame state (§9.1). The frame itself, its one-cadence listener set, the
  // switchId-keyed ack record (R2's supersede input), and the live lane-input feed (R1). ───
  private presentationFrame: PresentationFrame = EMPTY_PRESENTATION_FRAME;

  private hasPendingPresentationFrameFlush = false;

  // Flush-transaction depth (stranded-PF-flush guard). The transaction wrappers
  // (runRouteSceneSwitchTransaction / completeRouteSceneSwitchTransition /
  // applyRouteStateMutation) defer ALL dispatch delivery to their explicit flush calls;
  // setTransitionState's stranded-flush guard auto-delivers the PF only when NO wrapper is in
  // flight (depth 0) — i.e. only for naked public entry points.
  private dispatchFlushDepth = 0;

  private readonly presentationFrameListeners = new Set<(frame: PresentationFrame) => void>();

  private readonly presentationAckSwitchIds = new Set<number>();

  private presentationLaneInputsProvider: (() => PresentationLaneInputs) | null = null;

  private presentationLaneInputsUnsubscribe: (() => void) | null = null;

  // Leg 9 — edit-session liveness is a chrome-clock derivation input that mutates WITHOUT a
  // switch (entering/exiting edit on the presented scene), so the controller subscribes to the
  // liveness contract and RE-MINTS the frame on change — same one-writer law as the lane
  // inputs (§9.1 R1). The contract module is dependency-free, so no wiring-layer indirection
  // is needed; the session primitive publishes, this subscription consumes.
  private editSessionLivenessUnsubscribe: (() => void) | null = subscribeEditSessionLiveness(() => {
    this.remintPresentationFrame();
  });

  private readonly listeners = new Set<RouteSceneSwitchTransitionListenerEntry>();

  private readonly settleCallbacksByTransitionToken = new Map<
    number,
    Set<RouteSceneSwitchSettleCallback>
  >();

  private readonly activeSettlePlanesByToken = new Map<
    number,
    {
      transitionToken: number;
      pendingPlanes: Set<RouteSceneSwitchMotionPlane>;
    }
  >();

  private withDeferredDispatchFlush<T>(run: () => T): T {
    this.dispatchFlushDepth += 1;
    try {
      return run();
    } finally {
      this.dispatchFlushDepth -= 1;
    }
  }

  constructor(
    private readonly sheetMotionTargetRegistry: AppRouteSceneSheetMotionTargetRegistry,
    private readonly routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime,
    // The per-scene remembered detent (the snap-session ledger) — feeds the descriptor table's
    // 'rememberedDetent' rule via resolveTransitionPlan (true per-page memory, owner 2026-07-02).
    private readonly resolveSceneRememberedSnap: (sceneKey: OverlayKey) => BottomSheetSnap | null
  ) {}

  public dispose(): void {
    if (activeAppRouteSceneSwitchController === this) {
      activeAppRouteSceneSwitchController = null;
    }
    this.listeners.clear();
    this.settleCallbacksByTransitionToken.clear();
    this.activeSettlePlanesByToken.clear();
    this.motionDispatchTarget = null;
    this.sceneStackTransitionDispatchTarget = null;
    this.nativeOverlayTransitionDispatchTarget = null;
    this.sceneAuthoritiesDispatchTarget = null;
    this.pendingSceneAuthoritiesDispatchState = null;
    this.pendingNativeOverlayDispatchState = null;
    this.pendingMotionDispatchSnapshot = null;
    this.pendingSceneStackDispatchSnapshot = null;
    this.presentationFrameListeners.clear();
    this.presentationAckSwitchIds.clear();
    this.presentationLaneInputsUnsubscribe?.();
    this.presentationLaneInputsUnsubscribe = null;
    this.presentationLaneInputsProvider = null;
    this.editSessionLivenessUnsubscribe?.();
    this.editSessionLivenessUnsubscribe = null;
    this.hasPendingPresentationFrameFlush = false;
  }

  public getTransitionState(): RouteSceneSwitchTransitionState {
    return this.transitionState;
  }

  public getPresentationFrame(): PresentationFrame {
    return this.presentationFrame;
  }

  public subscribePresentationFrame(listener: (frame: PresentationFrame) => void): () => void {
    this.presentationFrameListeners.add(listener);
    return () => {
      this.presentationFrameListeners.delete(listener);
    };
  }

  public commitPresentationPaintAck(switchId: number): void {
    // A late ack from a SUPERSEDED switch must never mark the live one (R2) — key strictly.
    if (switchId !== this.presentationFrame.switchId) {
      return;
    }
    this.presentationAckSwitchIds.add(switchId);
    // W1 slice 3 — [PREMOUNT] mirror: the ack IS the visibility flip instant.
    notePremountPresentationAck(switchId);
  }

  public registerPresentationLaneInputs(
    provider: () => PresentationLaneInputs,
    subscribe: (onChange: () => void) => () => void
  ): () => void {
    this.presentationLaneInputsUnsubscribe?.();
    this.presentationLaneInputsProvider = provider;
    this.presentationLaneInputsUnsubscribe = subscribe(() => {
      this.remintPresentationFrame();
    });
    // Fold the live inputs into the current frame, but DEFER delivery: registration happens
    // mid-construction of the wiring layer (before its initial snapshots exist), so a synchronous
    // listener notification here can poke a half-constructed consumer (boot crash: reading
    // presentationFrame off not-yet-initialized state). The frame value is updated immediately —
    // anyone pulling getPresentationFrame() sees it — and the next dispatch flush notifies.
    this.remintPresentationFrame({ deferFlush: true });
    return () => {
      if (this.presentationLaneInputsProvider === provider) {
        this.presentationLaneInputsUnsubscribe?.();
        this.presentationLaneInputsUnsubscribe = null;
        this.presentationLaneInputsProvider = null;
      }
    };
  }

  // Re-mint on a lane-input change WITHOUT a switch (gesture docked-polls dismiss; the
  // results_dismissing release) — §9.1 R1. Same single writer; identity fields stay
  // switch-static, `revision` bumps. Delivery is immediate for runtime input changes (no batch is
  // in flight for a gesture) but DEFERRED at registration time (see registerPresentationLaneInputs).
  private remintPresentationFrame(options?: { deferFlush?: boolean }): void {
    this.commitPresentationFrame(this.transitionState);
    // Flush whenever a frame is pending — including one stranded by an earlier deferFlush
    // registration — unless this remint itself is the deferred (mid-construction) one.
    if (this.hasPendingPresentationFrameFlush && !options?.deferFlush) {
      this.flushPresentationFrameDispatch();
    }
  }

  // The whole frame derives from ONE transition-state snapshot + the live lane inputs — every
  // consumer decision (leg opacity, body attach, header, snap, touch) is then f(frame).
  private resolveNextPresentationFrame(
    nextState: RouteSceneSwitchTransitionState
  ): PresentationFrame {
    const previousFrame = this.presentationFrame;
    const contract = nextState.transitionContract;
    // The FRESH resolved target — the exact coalesce the old deny-list trusted
    // (contract.targetSceneKey ?? pendingSceneKey ?? routeActiveSceneKey).
    const resolvedTargetSceneKey =
      contract?.targetSceneKey ??
      (nextState.isOverlaySwitchInFlight ? nextState.pendingTargetSceneKey : null) ??
      nextState.activeSceneKey;
    const laneKind = resolvePresentationLaneKind({
      resolvedTargetSceneKey,
      rootOverlayKey: nextState.routeState.rootOverlayKey,
      hasActiveDockedPollsRestoreIntent: nextState.activeDockedPollsRestoreIntent != null,
      laneInputs: this.presentationLaneInputsProvider?.() ?? DEFAULT_PRESENTATION_LANE_INPUTS,
    });
    const presentedSceneKey = resolvePresentedSceneKey(laneKind, resolvedTargetSceneKey);
    const isNewSwitch = nextState.transitionToken !== previousFrame.switchId;
    // W1 slice 1 (C5) — the frame's ENTRY identity: topmost stack entry of the key. Additive;
    // key-typed consumers untouched. Read from the SAME route-state snapshot as the keys.
    const overlayRouteStack = nextState.routeState.overlayRouteStack;
    const activeEntryId =
      resolvedTargetSceneKey == null
        ? null
        : resolveActiveEntryIdForScene(resolvedTargetSceneKey, overlayRouteStack);
    const presentedEntryId =
      presentedSceneKey == null
        ? null
        : presentedSceneKey === resolvedTargetSceneKey
          ? activeEntryId
          : resolveActiveEntryIdForScene(presentedSceneKey, overlayRouteStack);
    let outgoingSceneKey: OverlayKey | null;
    let outgoingEntryId: string | null;
    if (!nextState.isOverlaySwitchInFlight || contract == null) {
      // Idle-committed or settled — no held leg.
      outgoingSceneKey = null;
      outgoingEntryId = null;
    } else if (isNewSwitch) {
      const preservesOutgoing =
        contract.sheetTransitionPlan.contentHandoff === 'preserveOutgoingUntilSettle';
      const previousAckCommitted = this.presentationAckSwitchIds.has(previousFrame.switchId);
      outgoingSceneKey = resolveSupersededOutgoingSceneKey({
        previousFrame,
        previousAckCommitted,
        preservesOutgoing,
      });
      // Entry-level hold mirrors the scene-key supersede but is NOT nulled on a same-KEY
      // switch: userProfile(A)→userProfile(B) holds no outgoing LEG, yet A remains the
      // leg-internal outgoing UNIT until settle (entry-keyed child mounts, contract c).
      outgoingEntryId = resolveSupersededOutgoingEntryId({
        previousFrame,
        previousAckCommitted,
        preservesOutgoing,
      });
      if (outgoingSceneKey === presentedSceneKey) {
        // Same-scene re-entry: the leg resolves 'incoming' at full opacity; keep the frame canonical.
        outgoingSceneKey = null;
      }
      if (outgoingEntryId === presentedEntryId) {
        outgoingEntryId = null;
      }
    } else {
      // An in-flight update on the SAME switch (phase/interactive bookkeeping) keeps its hold.
      outgoingSceneKey = previousFrame.outgoingSceneKey;
      outgoingEntryId = previousFrame.outgoingEntryId;
    }
    return {
      switchId: nextState.transitionToken,
      revision: isNewSwitch ? 0 : previousFrame.revision,
      activeSceneKey: resolvedTargetSceneKey,
      presentedSceneKey,
      outgoingSceneKey,
      laneKind,
      activeEntryId,
      presentedEntryId,
      outgoingEntryId,
      // ─── PF CHROME CLOCK (leg 6): nav-out + headerNavAction ride the frame so header
      // title/strip, nav-out start and plus↔X rotation start share ONE commit. Nav-out keys
      // on the top-of-stack ROUTE entry (parity with the deleted nav-out store's writer);
      // the header action keys on the PRESENTED scene (docked-polls lane shows the polls plus).
      // Leg 9: edit-session liveness is a derivation input — a live session makes its scene a
      // child page (nav-out + close) wherever it lives; the liveness subscription re-mints.
      isChildSceneRevealed: resolveIsChildSceneRevealed(
        nextState.routeState.activeOverlayRoute.key,
        isEditSessionLiveOnScene(nextState.routeState.activeOverlayRoute.key)
      ),
      headerNavAction: resolveHeaderNavAction(
        presentedSceneKey,
        isEditSessionLiveOnScene(presentedSceneKey)
      ),
    };
  }

  // REVISION CONTRACT (final red-team shouldFix) — the ONE mint chokepoint. Resolves the next
  // frame from a transition-state snapshot and commits it iff it changed; ANY same-switchId
  // inequality bumps `revision` REGARDLESS of mint path (switch commit or lane re-mint), so
  // (switchId, revision) is a COMPLETE change key for consumers — a same-switch mutation (e.g.
  // the settle commit nulling outgoingSceneKey) can no longer publish new fields under an
  // unchanged revision. A new switch resets revision to 0 (resolver-side).
  private commitPresentationFrame(nextState: RouteSceneSwitchTransitionState): void {
    const next = this.resolveNextPresentationFrame(nextState);
    if (arePresentationFramesEqual(this.presentationFrame, next)) {
      return;
    }
    this.presentationFrame =
      next.switchId === this.presentationFrame.switchId
        ? { ...next, revision: this.presentationFrame.revision + 1 }
        : next;
    // W1 slice 3 — [PREMOUNT] mirror: the probe tracks (switchId, presentedEntryId) so a
    // child unit's first Fabric commit can be tested against the visibility flip.
    notePremountPresentationFrame(
      this.presentationFrame.switchId,
      this.presentationFrame.presentedEntryId
    );
    this.hasPendingPresentationFrameFlush = true;
  }

  private prunePresentationAcks(currentSwitchId: number): void {
    this.presentationAckSwitchIds.forEach((switchId) => {
      if (switchId < currentSwitchId - PRESENTATION_ACK_RETENTION) {
        this.presentationAckSwitchIds.delete(switchId);
      }
    });
  }

  public getRouteState(): RouteSceneSwitchRouteStateSnapshot {
    return this.transitionState.routeState;
  }

  public getPreviousRouteKey(): OverlayKey | null {
    return (
      this.transitionState.routeState.overlayRouteStack[
        this.transitionState.routeState.overlayRouteStack.length - 2
      ]?.key ?? null
    );
  }

  /** The entry a pop will reveal — the VALUE, not just its key (S-B: pops target entries). */
  public getPreviousRouteEntry(): OverlayRouteEntry | null {
    return (
      this.transitionState.routeState.overlayRouteStack[
        this.transitionState.routeState.overlayRouteStack.length - 2
      ] ?? null
    );
  }

  public getRootRouteKey(): OverlayKey | null {
    return this.transitionState.routeState.overlayRouteStack[0]?.key ?? null;
  }

  public setRootRouteState<K extends OverlayKey>(
    overlay: K,
    params?: OverlayRouteParamsMap[K]
  ): void {
    this.applyRouteStateMutation((currentRouteState) =>
      setRootRouteState(currentRouteState, overlay, params)
    );
  }

  public updateRouteState<K extends OverlayKey>(
    overlay: K,
    params?: OverlayRouteParamsMap[K]
  ): void {
    this.applyRouteStateMutation((currentRouteState) =>
      updateRouteState(currentRouteState, overlay, params)
    );
  }

  public pushRouteState<K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]): void {
    this.applyRouteStateMutation((currentRouteState) =>
      pushRouteState(
        currentRouteState,
        overlay,
        params,
        captureRouteEntryOrigin(currentRouteState.activeOverlayRoute.key)
      )
    );
  }

  /** Leg 4 (design §1.3): stamp the world identity onto the ACTIVE entry — the launch
   *  chokepoint's write when a world presents into the entry. Identity-preserving. */
  public stampActiveRouteEntryDesire(desire: OverlayRouteEntry['desire']): void {
    this.applyRouteStateMutation((currentRouteState) =>
      stampRouteEntryDesireState(
        currentRouteState,
        currentRouteState.activeOverlayRoute.entryId,
        desire
      )
    );
  }

  public closeActiveRouteState(): void {
    this.applyRouteStateMutation((currentRouteState) => {
      stagePoppedEntryOriginRestore(currentRouteState);
      return closeActiveRouteState(currentRouteState);
    });
  }

  public popToEntryRouteState(entryId: string): void {
    this.applyRouteStateMutation((currentRouteState) => {
      const targetIndex = currentRouteState.overlayRouteStack.findIndex(
        (entry) => entry.entryId === entryId
      );
      const entryAboveTarget =
        targetIndex >= 0 ? currentRouteState.overlayRouteStack[targetIndex + 1] : null;
      stageRouteEntryOriginRestore(entryAboveTarget?.origin);
      return popToEntryRouteState(currentRouteState, entryId);
    });
  }

  public popToRootRouteState(): void {
    this.applyRouteStateMutation(popToRootRouteState);
  }

  public subscribeTransitionState(
    listener: (transitionState: RouteSceneSwitchTransitionState) => void,
    attributionLabel = 'anonymous'
  ): () => void {
    const entry: RouteSceneSwitchTransitionListenerEntry = {
      listener,
      attributionLabel,
    };
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  public subscribeTransitionSelector<TSelected>(
    selector: RouteSceneSwitchTransitionSelector<TSelected>,
    listener: (transitionState: RouteSceneSwitchTransitionState) => void,
    isEqual: RouteSceneSwitchTransitionEquality<TSelected> = Object.is,
    attributionLabel = 'anonymous'
  ): () => void {
    let selected = selector(this.transitionState);
    const entry: RouteSceneSwitchTransitionListenerEntry = {
      listener,
      attributionLabel,
      shouldNotify: (transitionState) => {
        const nextSelected = selector(transitionState);
        if (isEqual(selected, nextSelected)) {
          return false;
        }
        selected = nextSelected;
        return true;
      },
    };
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }

  public setRouteSceneMotionDispatchTarget(
    target: RouteSceneSwitchMotionDispatchTarget | null
  ): () => void {
    this.motionDispatchTarget = target;
    return () => {
      if (this.motionDispatchTarget === target) {
        this.motionDispatchTarget = null;
      }
    };
  }

  public setRouteSceneStackTransitionDispatchTarget(
    target: RouteSceneSwitchSceneStackDispatchTarget | null
  ): () => void {
    this.sceneStackTransitionDispatchTarget = target;
    return () => {
      if (this.sceneStackTransitionDispatchTarget === target) {
        this.sceneStackTransitionDispatchTarget = null;
      }
    };
  }

  public setRouteNativeOverlayTransitionDispatchTarget(
    target: RouteSceneSwitchNativeOverlayDispatchTarget | null
  ): () => void {
    this.nativeOverlayTransitionDispatchTarget = target;
    return () => {
      if (this.nativeOverlayTransitionDispatchTarget === target) {
        this.nativeOverlayTransitionDispatchTarget = null;
      }
    };
  }

  public setRouteSceneAuthoritiesDispatchTarget(
    target: RouteSceneSwitchAuthoritiesDispatchTarget | null
  ): () => void {
    this.sceneAuthoritiesDispatchTarget = target;
    return () => {
      if (this.sceneAuthoritiesDispatchTarget === target) {
        this.sceneAuthoritiesDispatchTarget = null;
      }
    };
  }

  public requestOverlaySwitch(input: RouteSceneSwitchRequestInput): number {
    return this.requestOverlaySwitchBase(input);
  }

  public requestOverlaySwitchWithSettleCallback(
    input: RouteSceneSwitchRequestInput,
    onSettle: RouteSceneSwitchSettleCallback
  ): number {
    return this.requestOverlaySwitchBase(input, onSettle);
  }

  private requestOverlaySwitchBase(
    input: RouteSceneSwitchRequestInput,
    onSettle?: RouteSceneSwitchSettleCallback
  ): number {
    const sourceSceneKey = input.sourceSceneKey ?? this.transitionState.activeSceneKey ?? 'search';
    return this.runRouteSceneSwitchTransaction(
      {
        ...input,
        sourceSceneKey,
      },
      onSettle
    );
  }

  public completeRouteSceneSwitchMotionPlane(
    settleToken: number,
    plane: RouteSceneSwitchMotionPlane
  ): void {
    const state = this.transitionState;
    const activeSettleToken = state.transitionContract?.settleToken ?? state.transitionToken;
    const settleState = this.activeSettlePlanesByToken.get(settleToken);
    if (!state.isOverlaySwitchInFlight || activeSettleToken !== settleToken) {
      return;
    }
    if (!settleState || settleState.transitionToken !== state.transitionToken) {
      return;
    }
    settleState.pendingPlanes.delete(plane);
    if (settleState.pendingPlanes.size > 0) {
      return;
    }
    this.completeRouteSceneSwitchTransition(state.transitionToken);
  }

  /**
   * Phase 2 (canonical-sheet-transition-master-plan.md §6 / Layer 1) —
   * transaction-keyed readiness collector, now a DRIVER for search-family content
   * planes. Records the gate against the REDRAW transactionId the marks carry (NOT
   * the settle token), so it captures the gates that fire BEFORE the overlay switch
   * goes in-flight (cards + nativeMarkerFrame during data-load) as well as the one
   * that fires DURING the switch (sheet). When all of the scene's
   * requiredContentGates close it logs `[READYGATE] content-ready` AND — if this
   * txn has been LINKED to a content-plane settleToken at arm time — completes that
   * plane via completeRouteSceneSwitchMotionPlane(settleToken, 'content'). The
   * crossfade ramp onFinish remains a TOKEN-GUARDED CO-COMPLETER: whichever of
   * {collector, ramp} fires first wins and the other no-ops (completeMotionPlane is
   * idempotent on a superseded/already-resolved token). No-ops cleanly when there is
   * no transactionId to key on. Until a txn is linked (the gate-before-arm window)
   * the search reveal join {cards, nativeMarkerFrame, sheet} drives the
   * content-ready log; once linked the linked contract's gates govern.
   */
  // S3 FINAL (reveal-pipeline unification §4/§6): the readiness COLLECTOR + the
  // 'content' motion plane are DELETED. Probe-proven dead: zero content-plane arms
  // across the full matrix (every mouth × dismissal) + shortcut/toggle/natural soaks —
  // every forward-open target is SEEDED (swapImmediately), so the overlap crossfade the
  // plane held open no longer exists anywhere. The world reveal is the episode
  // TransitionTxn's join; the route reveal is the route txn's {paint, chrome} join.

  public clearDockedPollsRestoreIntent(
    token?: number,
    snap?: RouteSceneSwitchDockedPollsRestoreIntent['snap']
  ): void {
    const state = this.transitionState;
    const activeIntent = state.activeDockedPollsRestoreIntent;
    if (!activeIntent) {
      return;
    }
    if (token != null && activeIntent.token !== token) {
      return;
    }
    if (snap != null && activeIntent.snap !== snap) {
      return;
    }
    this.setTransitionState(
      {
        activeDockedPollsRestoreIntent: null,
        pendingDockedPollsRestoreIntent: null,
        transitionContract: state.transitionContract
          ? {
              ...state.transitionContract,
              dockedPollsRestoreIntent: null,
            }
          : null,
      },
      'clearDockedPollsRestoreIntent'
    );
  }

  private setTransitionState(
    next:
      | Partial<RouteSceneSwitchTransitionState>
      | ((current: RouteSceneSwitchTransitionState) => Partial<RouteSceneSwitchTransitionState>),
    attributionReason = 'update'
  ): void {
    const current = this.transitionState;
    const partial = typeof next === 'function' ? next(current) : next;
    const nextState: RouteSceneSwitchTransitionState = {
      activeSceneKey:
        'activeSceneKey' in partial ? (partial.activeSceneKey ?? null) : current.activeSceneKey,
      interactiveSceneKey:
        'interactiveSceneKey' in partial
          ? (partial.interactiveSceneKey ?? null)
          : current.interactiveSceneKey,
      sourceSceneKey:
        'sourceSceneKey' in partial ? (partial.sourceSceneKey ?? null) : current.sourceSceneKey,
      handoffSceneKey:
        'handoffSceneKey' in partial ? (partial.handoffSceneKey ?? null) : current.handoffSceneKey,
      transitionPhase: partial.transitionPhase ?? current.transitionPhase,
      isInteractive: partial.isInteractive ?? current.isInteractive,
      isOverlaySwitchInFlight: partial.isOverlaySwitchInFlight ?? current.isOverlaySwitchInFlight,
      pendingTargetSceneKey:
        'pendingTargetSceneKey' in partial
          ? (partial.pendingTargetSceneKey ?? null)
          : current.pendingTargetSceneKey,
      activePollsParams:
        'activePollsParams' in partial
          ? (partial.activePollsParams ?? null)
          : current.activePollsParams,
      pendingPollsParams:
        'pendingPollsParams' in partial
          ? (partial.pendingPollsParams ?? null)
          : current.pendingPollsParams,
      activeDockedPollsRestoreIntent:
        'activeDockedPollsRestoreIntent' in partial
          ? (partial.activeDockedPollsRestoreIntent ?? null)
          : current.activeDockedPollsRestoreIntent,
      pendingDockedPollsRestoreIntent:
        'pendingDockedPollsRestoreIntent' in partial
          ? (partial.pendingDockedPollsRestoreIntent ?? null)
          : current.pendingDockedPollsRestoreIntent,
      transitionToken: partial.transitionToken ?? current.transitionToken,
      transitionContract:
        'transitionContract' in partial
          ? (partial.transitionContract ?? null)
          : current.transitionContract,
      routeState:
        'routeState' in partial ? (partial.routeState ?? current.routeState) : current.routeState,
    };
    if (areTransitionStatesEqual(current, nextState)) {
      return;
    }
    this.transitionState = nextState;
    // ─── PresentationFrame mint (§9.1) — the ONE place "what's on screen" is decided, in the
    // same atomic commit as the transition state. Delivered on the dispatch-flush cadence.
    // Routed through commitPresentationFrame so a same-switch inequality bumps `revision`
    // here exactly like the lane re-mint path (revision contract, final red-team). ───
    this.commitPresentationFrame(nextState);
    if (!nextState.isOverlaySwitchInFlight) {
      // Idle-committed or settled: the presented leg is what the opacity shows (a watchdog-forced
      // settle still forces the swap), so record the switch as landed — a LATER supersede then
      // resolves its outgoing to this frame's presented leg (R2 ack-conditional).
      this.presentationAckSwitchIds.add(nextState.transitionToken);
      // W1 slice 3 — [PREMOUNT] mirror: an idle/settled commit counts as the flip (warm legs).
      notePremountPresentationAck(nextState.transitionToken);
      this.prunePresentationAcks(nextState.transitionToken);
    }
    const nextMotionDispatchSnapshot = resolveRouteSceneSwitchMotionDispatchSnapshot(nextState);
    const shouldDispatchMotion =
      nextMotionDispatchSnapshot.transitionContract != null &&
      !areRouteSceneSwitchMotionDispatchSnapshotsEqual(
        this.currentMotionDispatchSnapshot,
        nextMotionDispatchSnapshot
      );
    this.currentMotionDispatchSnapshot = nextMotionDispatchSnapshot;
    const nextSceneStackDispatchSnapshot =
      resolveRouteSceneSwitchSceneStackDispatchSnapshot(nextState);
    const shouldDispatchSceneStackTransition = !areRouteSceneSwitchSceneStackDispatchSnapshotsEqual(
      this.currentSceneStackDispatchSnapshot,
      nextSceneStackDispatchSnapshot
    );
    this.currentSceneStackDispatchSnapshot = nextSceneStackDispatchSnapshot;
    const nextNativeOverlayDispatchSelector =
      resolveRouteSceneSwitchNativeOverlayDispatchSelector(nextState);
    const shouldDispatchNativeOverlayTransition =
      !areRouteSceneSwitchNativeOverlayDispatchSelectorsEqual(
        this.currentNativeOverlayDispatchSelector,
        nextNativeOverlayDispatchSelector
      );
    this.currentNativeOverlayDispatchSelector = nextNativeOverlayDispatchSelector;
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'notifyTransitionState',
      () => {
        withSearchNavSwitchRuntimeAttribution(
          'routeSceneSwitchController',
          `notifyTransitionState:reason:${attributionReason}`,
          () => {
            this.listeners.forEach(({ listener, attributionLabel, shouldNotify }) => {
              if (shouldNotify != null && !shouldNotify(nextState)) {
                return;
              }
              withSearchNavSwitchRuntimeAttribution(
                'routeSceneSwitchController',
                `notifyTransitionState:${attributionLabel}`,
                () => {
                  listener(nextState);
                }
              );
            });
          }
        );
      }
    );
    if (this.sceneAuthoritiesDispatchTarget != null) {
      this.pendingSceneAuthoritiesDispatchState = nextState;
    }
    if (
      shouldDispatchNativeOverlayTransition &&
      this.nativeOverlayTransitionDispatchTarget != null
    ) {
      this.pendingNativeOverlayDispatchState = nextState;
    }
    if (shouldDispatchMotion && this.motionDispatchTarget != null) {
      this.pendingMotionDispatchSnapshot = nextMotionDispatchSnapshot;
    }
    if (shouldDispatchSceneStackTransition) {
      this.pendingSceneStackDispatchSnapshot = nextSceneStackDispatchSnapshot;
    }
    // NO STRANDED PF FLUSH (final red-team shouldFix): public entry points that commit OUTSIDE
    // the transaction wrappers (clearDockedPollsRestoreIntent today) used to mint the frame,
    // mark the pending flush, and notify NO ONE until an unrelated later flush — a
    // restore-intent clear could leave laneKind subscribers stale for a whole gesture. When no
    // wrapper is in flight (depth 0), deliver the PF here on the same cadence position it
    // occupies in flushRuntimeDispatchTargets (PF first). Wrapped paths (depth > 0) keep their
    // exact explicit-flush ordering.
    if (this.hasPendingPresentationFrameFlush && this.dispatchFlushDepth === 0) {
      this.flushPresentationFrameDispatch();
    }
  }

  private flushSceneAuthoritiesDispatchTarget(): void {
    const pendingSceneAuthoritiesDispatchState = this.pendingSceneAuthoritiesDispatchState;
    if (pendingSceneAuthoritiesDispatchState == null) {
      return;
    }
    this.pendingSceneAuthoritiesDispatchState = null;
    if (this.sceneAuthoritiesDispatchTarget == null) {
      return;
    }
    this.sceneAuthoritiesDispatchTarget(pendingSceneAuthoritiesDispatchState);
  }

  private flushNativeOverlayTransitionDispatchTarget(): void {
    const pendingNativeOverlayDispatchState = this.pendingNativeOverlayDispatchState;
    if (pendingNativeOverlayDispatchState == null) {
      return;
    }
    this.pendingNativeOverlayDispatchState = null;
    if (this.nativeOverlayTransitionDispatchTarget == null) {
      return;
    }
    this.nativeOverlayTransitionDispatchTarget(pendingNativeOverlayDispatchState);
  }

  private flushMotionDispatchTarget(): void {
    const pendingMotionDispatchSnapshot = this.pendingMotionDispatchSnapshot;
    if (pendingMotionDispatchSnapshot == null) {
      return;
    }
    this.pendingMotionDispatchSnapshot = null;
    if (this.motionDispatchTarget == null) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('sceneMotion', 'dispatch:transition', () => {
      this.motionDispatchTarget?.(pendingMotionDispatchSnapshot);
    });
  }

  private flushRuntimeDispatchTargets(): void {
    // PF first: authorities recomputing on the other dispatches pull the fresh frame (§9.1 R7).
    this.flushPresentationFrameDispatch();
    this.flushSceneAuthoritiesDispatchTarget();
    this.flushNativeOverlayTransitionDispatchTarget();
    this.flushMotionDispatchTarget();
  }

  private flushPresentationFrameDispatch(): void {
    if (!this.hasPendingPresentationFrameFlush) {
      return;
    }
    this.hasPendingPresentationFrameFlush = false;
    const frame = this.presentationFrame;
    if (__DEV__) {
      // [pageswitch] PF flush probe (P4 blank-body attribution): the exact frame every consumer
      // reads, plus the transition-state fields the activity chain keys on.
      // eslint-disable-next-line no-console
      console.log(
        `[pageswitch] frame ${JSON.stringify({
          t: Math.round(performance.now()),
          switchId: frame.switchId,
          rev: frame.revision,
          active: frame.activeSceneKey,
          presented: frame.presentedSceneKey,
          out: frame.outgoingSceneKey,
          lane: frame.laneKind,
          phase: this.transitionState.transitionPhase,
          interactive: this.transitionState.isInteractive,
          interKey: this.transitionState.interactiveSceneKey,
        })}`
      );
    }
    this.presentationFrameListeners.forEach((listener) => {
      listener(frame);
    });
  }

  private flushSceneStackTransitionDispatchTarget(): void {
    const pendingSceneStackDispatchSnapshot = this.pendingSceneStackDispatchSnapshot;
    if (pendingSceneStackDispatchSnapshot == null) {
      return;
    }
    this.pendingSceneStackDispatchSnapshot = null;
    if (this.sceneStackTransitionDispatchTarget == null) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('sceneStack', 'dispatch:routeSceneTransition', () => {
      this.sceneStackTransitionDispatchTarget?.(pendingSceneStackDispatchSnapshot);
    });
  }

  private runRouteSceneSwitchTransaction(
    input: RouteSceneSwitchRequestInput & {
      sourceSceneKey: NonNullable<RouteSceneSwitchRequestInput['sourceSceneKey']>;
    },
    onSettle?: RouteSceneSwitchSettleCallback
  ): number {
    const transitionPlan = this.resolveTransitionPlan(input);
    let transitionToken = 0;
    this.withDeferredDispatchFlush(() => {
      withSearchNavSwitchRuntimeAttribution(
        'routeSceneSwitchController',
        'batchedSwitchCommit',
        () => {
          unstable_batchedUpdates(() => {
            const hasMotionPlanes = transitionPlan.motionPlanes.length > 0;
            transitionToken = withSearchNavSwitchRuntimeAttribution(
              'routeSceneSwitchController',
              hasMotionPlanes
                ? 'batchedSwitchCommit:commitTransition'
                : 'batchedSwitchCommit:commitIdleSwitch',
              () =>
                hasMotionPlanes
                  ? this.commitRouteSceneSwitchTransition(transitionPlan)
                  : this.commitRouteSceneSwitchIdleState(transitionPlan)
            );
            if (onSettle) {
              withSearchNavSwitchRuntimeAttribution(
                'routeSceneSwitchController',
                'batchedSwitchCommit:registerSettleCallback',
                () => {
                  this.registerSettleCallback(transitionToken, onSettle);
                }
              );
            }
          });
        }
      );
    });
    this.flushRuntimeDispatchTargets();
    this.flushSceneStackTransitionDispatchTarget();
    if (!transitionPlan.motionPlanes.length) {
      withSearchNavSwitchRuntimeAttribution(
        'routeSceneSwitchController',
        'flushIdleSwitchCallbacks',
        () => {
          this.flushSettleCallbacks(transitionToken);
        }
      );
    }
    return transitionToken;
  }

  private resolveTransitionPlan(
    input: RouteSceneSwitchRequestInput & { sourceSceneKey: OverlayKey }
  ): AppRouteSceneTransitionPlan {
    // Phase 2 — stamp the most-recent search reveal txn so the arm site can link the
    // SURVIVING content plane even though the txn-carrying reveal switch is superseded by
    // the internal polls→search restore switches that follow it (see the field comment).
    return withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'resolveTransitionPlan',
      () =>
        resolveAppRouteSceneTransitionPlan({
          ...input,
          currentRootRouteKey: this.transitionState.routeState.rootOverlayKey,
          resolveCurrentSheetSnapTarget: (sceneKey: OverlayKey) =>
            this.sheetMotionTargetRegistry.resolveCurrentSnapTarget(sceneKey),
          resolveSceneRememberedSnap: this.resolveSceneRememberedSnap,
        })
    );
  }

  private registerSettleCallback(
    transitionToken: number,
    onSettle: RouteSceneSwitchSettleCallback
  ): void {
    const callbacks = this.settleCallbacksByTransitionToken.get(transitionToken) ?? new Set();
    callbacks.add(onSettle);
    this.settleCallbacksByTransitionToken.set(transitionToken, callbacks);
  }

  private commitRouteSceneSwitchTransition(transitionPlan: AppRouteSceneTransitionPlan): number {
    const currentState = this.transitionState;
    const nextToken = currentState.transitionToken + 1;
    const settleToken = transitionPlan.settleToken ?? nextToken;
    const dockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null =
      transitionPlan.dockedPollsRestoreSnap == null
        ? null
        : {
            snap: transitionPlan.dockedPollsRestoreSnap,
            token: nextToken,
          };
    const transitionContract = withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchTransition:createTransitionContract',
      () =>
        createTransitionContract({
          transitionPlan,
          transitionToken: nextToken,
          settleToken,
          dockedPollsRestoreIntent,
        })
    );
    // §Q redo T1a: the transaction shadows this switch (stage+commit; trace only —
    // consumers convert in T1b+). One switch = one transaction, staged at the same
    // instant the route mutation commits.
    stageTransitionTxnForCommittedSwitch(transitionPlan);
    const routeState = withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchTransition:applyRouteState',
      () => applyTransitionPlanToRouteState(currentState.routeState, transitionPlan)
    );
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchTransition:syncSettlePlanes',
      () => {
        this.activeSettlePlanesByToken.delete(settleToken);
        // satisfiedReadinessGatesByTransaction is keyed by redraw transactionId, not
        // the settle token — its size cap + idle/dispose clears handle cleanup, so no
        // per-settle-token delete here.
        if (transitionPlan.motionPlanes.length > 0) {
          this.activeSettlePlanesByToken.set(settleToken, {
            transitionToken: nextToken,
            pendingPlanes: new Set(transitionPlan.motionPlanes),
          });
        }
      }
    );
    // Reveal-ack correlation (final red-team mustFix): stamp WHICH txn is THIS switch's own
    // reveal txn before the frame mints, so the collector's evaluator can refuse to ack the
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchTransition:setTransitionState',
      () => {
        this.setTransitionState(
          {
            activeSceneKey: transitionPlan.targetSceneKey,
            interactiveSceneKey: currentState.interactiveSceneKey,
            sourceSceneKey: transitionPlan.sourceSceneKey,
            handoffSceneKey:
              transitionPlan.sourceSceneKey !== transitionPlan.targetSceneKey
                ? transitionPlan.sourceSceneKey
                : null,
            transitionPhase: 'overlay-switch',
            isInteractive: false,
            isOverlaySwitchInFlight: true,
            pendingTargetSceneKey: transitionPlan.targetSceneKey,
            activePollsParams: transitionPlan.pollsParams,
            pendingPollsParams: transitionPlan.pollsParams,
            activeDockedPollsRestoreIntent: dockedPollsRestoreIntent,
            pendingDockedPollsRestoreIntent: dockedPollsRestoreIntent,
            transitionToken: nextToken,
            transitionContract,
            routeState,
          },
          'commitRouteSceneSwitchTransition'
        );
      }
    );
    commitStagedTransitionTxn();
    return nextToken;
  }

  private commitRouteSceneSwitchIdleState(transitionPlan: AppRouteSceneTransitionPlan): number {
    const currentState = this.transitionState;
    const nextToken = currentState.transitionToken + 1;
    const dockedPollsRestoreIntent: RouteSceneSwitchDockedPollsRestoreIntent | null =
      transitionPlan.dockedPollsRestoreSnap == null
        ? null
        : {
            snap: transitionPlan.dockedPollsRestoreSnap,
            token: nextToken,
          };
    // §Q redo T1a: the idle-committed (zero-plane) switch stages its transaction too —
    // the degenerate class as a first-class citizen, not an untracked path (Q-4).
    stageTransitionTxnForCommittedSwitch(transitionPlan);
    const routeState = withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchIdleState:applyRouteState',
      () => applyTransitionPlanToRouteState(currentState.routeState, transitionPlan)
    );
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchIdleState:clearSettlePlanes',
      () => {
        this.activeSettlePlanesByToken.clear();
      }
    );
    // Reveal-ack correlation — recorded AFTER the clearAllContentPlaneTimeouts sweep above
    // (which nulls lastRevealContentReadinessTransactionId), so an idle-committed switch only
    // records a txn its own plan carried. Idle switches self-ack in setTransitionState anyway;
    // this keeps the single slot from pointing at a superseded switch's txn.
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchIdleState:setTransitionState',
      () => {
        this.setTransitionState(
          {
            activeSceneKey: transitionPlan.targetSceneKey,
            interactiveSceneKey: transitionPlan.targetSceneKey,
            sourceSceneKey: null,
            handoffSceneKey: null,
            transitionPhase: 'idle',
            isInteractive: true,
            isOverlaySwitchInFlight: false,
            pendingTargetSceneKey: null,
            activePollsParams: transitionPlan.pollsParams,
            pendingPollsParams: null,
            activeDockedPollsRestoreIntent: dockedPollsRestoreIntent,
            pendingDockedPollsRestoreIntent: null,
            transitionToken: nextToken,
            transitionContract: null,
            routeState,
          },
          'commitRouteSceneSwitchIdleState'
        );
      }
    );
    // §Q redo T1c: the idle-committed switch commits its (typically degenerate) txn
    // after its own flush; the same amendment window applies.
    commitStagedTransitionTxn();
    // Idle switches settle synchronously — there is no later boundary for them.
    settleLiveTransitionTxnAtIdle();
    return nextToken;
  }

  private completeRouteSceneSwitchTransition(transitionToken?: number): void {
    const state = this.transitionState;
    if (transitionToken != null && state.transitionToken !== transitionToken) {
      return;
    }
    const completedTransitionToken = state.transitionToken;
    const completedSettleToken = state.transitionContract?.settleToken;
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'completeRouteSceneSwitchTransition:syncSettlePlanes',
      () => {
        if (completedSettleToken != null) {
          this.activeSettlePlanesByToken.delete(completedSettleToken);
        }
      }
    );
    this.withDeferredDispatchFlush(() => {
      withSearchNavSwitchRuntimeAttribution(
        'routeSceneSwitchController',
        'completeRouteSceneSwitchTransition:setTransitionState',
        () => {
          this.setTransitionState(
            {
              activeSceneKey: state.transitionContract?.targetSceneKey ?? state.activeSceneKey,
              interactiveSceneKey: state.transitionContract?.targetSceneKey ?? state.activeSceneKey,
              sourceSceneKey: null,
              handoffSceneKey: null,
              transitionPhase: 'idle',
              isInteractive: true,
              isOverlaySwitchInFlight: false,
              pendingTargetSceneKey: null,
              activePollsParams: state.pendingPollsParams,
              pendingPollsParams: null,
              activeDockedPollsRestoreIntent: null,
              pendingDockedPollsRestoreIntent: null,
              transitionContract: null,
            },
            'completeRouteSceneSwitchTransition'
          );
        }
      );
    });
    this.flushRuntimeDispatchTargets();
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'completeRouteSceneSwitchTransition:flushSettleCallbacks',
      () => {
        this.flushSettleCallbacks(completedTransitionToken);
      }
    );
    this.flushSceneStackTransitionDispatchTarget();
    // §Q redo T1a: the switch settled — the transaction settles with it.
    settleLiveTransitionTxnAtIdle();
  }

  private flushSettleCallbacks(transitionToken: number): void {
    const callbacks = this.settleCallbacksByTransitionToken.get(transitionToken);
    if (!callbacks) {
      return;
    }
    this.settleCallbacksByTransitionToken.delete(transitionToken);
    callbacks.forEach((callback) => {
      callback();
    });
  }

  private applyRouteStateMutation(
    resolveNextRouteState: (
      currentRouteState: RouteSceneSwitchRouteStateSnapshot
    ) => RouteSceneSwitchRouteStateSnapshot
  ): void {
    this.withDeferredDispatchFlush(() => {
      this.setTransitionState((currentState) => {
        const next = resolveNextRouteState(currentState.routeState);
        return { routeState: next };
      }, 'applyRouteStateMutation');
    });
    this.flushRuntimeDispatchTargets();
  }
}

// Module-global active instance: the one live scene-switch runtime (dev split-brain
// detection below; commitPresentationPaintAck consumers reach it via the runtime value).
let activeAppRouteSceneSwitchController: AppRouteSceneSwitchController | null = null;

export const createAppRouteSceneSwitchRuntime = ({
  sheetMotionTargetRegistry,
  routeSceneVisibilityPolicyRuntime,
  resolveSceneRememberedSnap,
}: {
  sheetMotionTargetRegistry: AppRouteSceneSheetMotionTargetRegistry;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  resolveSceneRememberedSnap: (sceneKey: OverlayKey) => BottomSheetSnap | null;
}): AppRouteSceneSwitchRuntime => {
  const controller = new AppRouteSceneSwitchController(
    sheetMotionTargetRegistry,
    routeSceneVisibilityPolicyRuntime,
    resolveSceneRememberedSnap
  );
  if (__DEV__ && activeAppRouteSceneSwitchController != null) {
    // [pageswitch] watch item: a REPLACED module-global controller means two scene-switch
    // runtimes were constructed in one JS session (a re-created runtime tree / a leaked old
    // one). Gate marks + acks route to the NEW instance from here on; if the old one is still
    // mounted somewhere, that split-brain is the bug to chase.
    // eslint-disable-next-line no-console
    console.log(
      `[pageswitch] controller replaced (prev switchId=${
        activeAppRouteSceneSwitchController.getPresentationFrame().switchId
      })`
    );
  }
  activeAppRouteSceneSwitchController = controller;
  return controller;
};
