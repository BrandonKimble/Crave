import { unstable_batchedUpdates } from 'react-native';

import { logger } from '../../utils';
import type { OverlayKey } from '../../overlays/types';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import type { OverlayRouteEntry, OverlayRouteParamsMap } from './app-overlay-route-types';
import type {
  RouteSceneSwitchDockedPollsRestoreIntent,
  RouteSceneSwitchMotionPlane,
  RouteSceneSwitchPollsParams,
  RouteSceneSwitchRequestInput,
  RouteSceneSwitchRouteParams,
  RouteSceneSwitchSheetContentHandoff,
  RouteSceneSwitchTransitionContract,
  RouteSceneSwitchTransitionPhase,
} from './app-overlay-route-transition-contract';
import type {
  SceneReadinessContract,
  SceneReadinessGate,
} from './app-route-scene-descriptor-contract';
import type { AppRouteSceneSheetMotionTargetRegistry } from './app-route-scene-sheet-motion-target-registry';
import {
  resolveAppRouteSceneTransitionPlan,
  type AppRouteSceneTransitionPlan,
} from './app-route-scene-transition-policy-runtime';
import type {
  RouteSceneVisibilityPolicyRuntime,
  RouteSceneVisibilityPolicySnapshot,
} from './app-route-scene-visibility-policy-contract';

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

export type RouteSceneSwitchRouteStateSnapshot = {
  activeOverlayRoute: OverlayRouteEntry;
  previousOverlayRoute: OverlayRouteEntry | null;
  overlayRouteStack: readonly OverlayRouteEntry[];
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
};

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
  // Phase 2 (content-plane DRIVER) — see AppRouteSceneSwitchController.markSceneContentGate.
  markSceneContentGate: (
    gate: SceneReadinessGate,
    transactionId: string | null | undefined
  ) => void;
  clearDockedPollsRestoreIntent: (
    token?: number,
    snap?: RouteSceneSwitchDockedPollsRestoreIntent['snap']
  ) => void;
};

export type AppRouteSceneSwitchRuntime = RouteSceneSwitchTransitionActions & {
  getTransitionState: () => RouteSceneSwitchTransitionState;
  getRouteSceneVisibilityPolicySnapshot: () => RouteSceneVisibilityPolicySnapshot;
  getRouteState: () => RouteSceneSwitchRouteStateSnapshot;
  getPreviousRouteKey: () => OverlayKey | null;
  getRootRouteKey: () => OverlayKey | null;
  setRootRouteState: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  updateRouteState: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  pushRouteState: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  closeActiveRouteState: () => void;
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
  dispose: () => void;
};

const SEARCH_ROUTE: OverlayRouteEntry<'search'> = {
  key: 'search',
  params: undefined,
};

const createRouteEntry = (
  key: OverlayKey,
  params?: RouteSceneSwitchRouteParams
): OverlayRouteEntry =>
  ({
    key,
    params,
  }) as OverlayRouteEntry;

const createRouteStateSnapshot = ({
  activeOverlayRoute,
  previousOverlayRoute,
  overlayRouteStack,
}: {
  activeOverlayRoute: OverlayRouteEntry;
  previousOverlayRoute: OverlayRouteEntry | null;
  overlayRouteStack: readonly OverlayRouteEntry[];
}): RouteSceneSwitchRouteStateSnapshot => ({
  activeOverlayRoute,
  previousOverlayRoute,
  overlayRouteStack,
  rootOverlayKey: overlayRouteStack[0]?.key ?? activeOverlayRoute.key,
  overlayRouteStackLength: overlayRouteStack.length,
});

const areOverlayRoutesEqual = (
  left: OverlayRouteEntry | null,
  right: OverlayRouteEntry | null
): boolean =>
  left === right ||
  (left != null && right != null && left.key === right.key && left.params === right.params);

const areOverlayRouteStacksEqual = (
  left: readonly OverlayRouteEntry[],
  right: readonly OverlayRouteEntry[]
): boolean =>
  left.length === right.length &&
  left.every((route, index) => areOverlayRoutesEqual(route, right[index] ?? null));

const areRouteStateSnapshotsEqual = (
  left: RouteSceneSwitchRouteStateSnapshot,
  right: RouteSceneSwitchRouteStateSnapshot
): boolean =>
  areOverlayRoutesEqual(left.activeOverlayRoute, right.activeOverlayRoute) &&
  areOverlayRoutesEqual(left.previousOverlayRoute, right.previousOverlayRoute) &&
  areOverlayRouteStacksEqual(left.overlayRouteStack, right.overlayRouteStack);

const setRootRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  overlay: OverlayKey,
  params?: RouteSceneSwitchRouteParams
): RouteSceneSwitchRouteStateSnapshot => {
  const nextRoute = createRouteEntry(overlay, params);
  const previousOverlayRoute =
    currentRouteState.activeOverlayRoute.key === overlay
      ? currentRouteState.previousOverlayRoute
      : currentRouteState.activeOverlayRoute;
  return createRouteStateSnapshot({
    activeOverlayRoute: nextRoute,
    previousOverlayRoute,
    overlayRouteStack: [nextRoute],
  });
};

const pushRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  overlay: OverlayKey,
  params?: RouteSceneSwitchRouteParams
): RouteSceneSwitchRouteStateSnapshot => {
  const nextRoute = createRouteEntry(overlay, params);
  const currentStack = currentRouteState.overlayRouteStack;
  const currentTop = currentStack[currentStack.length - 1];
  const overlayRouteStack =
    currentTop?.key === overlay
      ? [...currentStack.slice(0, -1), nextRoute]
      : [...currentStack.slice(0, -1), currentTop, nextRoute].filter(
          (entry): entry is OverlayRouteEntry => entry != null
        );
  const previousOverlayRoute =
    currentRouteState.activeOverlayRoute.key === overlay
      ? currentRouteState.previousOverlayRoute
      : currentTop?.key === currentRouteState.activeOverlayRoute.key
        ? currentTop
        : currentRouteState.activeOverlayRoute;
  return createRouteStateSnapshot({
    activeOverlayRoute: nextRoute,
    previousOverlayRoute,
    overlayRouteStack,
  });
};

const updateRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  overlay: OverlayKey,
  params?: RouteSceneSwitchRouteParams
): RouteSceneSwitchRouteStateSnapshot => {
  let didUpdate = false;
  const overlayRouteStack = currentRouteState.overlayRouteStack.map((route) => {
    if (route.key !== overlay) {
      return route;
    }
    didUpdate = true;
    return createRouteEntry(overlay, params);
  });
  if (!didUpdate) {
    return currentRouteState;
  }
  const activeOverlayRoute =
    overlayRouteStack[overlayRouteStack.length - 1] ?? currentRouteState.activeOverlayRoute;
  const previousOverlayRoute =
    overlayRouteStack.length > 1
      ? (overlayRouteStack[overlayRouteStack.length - 2] ?? null)
      : currentRouteState.previousOverlayRoute;
  return createRouteStateSnapshot({
    activeOverlayRoute,
    previousOverlayRoute,
    overlayRouteStack,
  });
};

const closeActiveRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot
): RouteSceneSwitchRouteStateSnapshot => {
  if (currentRouteState.overlayRouteStack.length <= 1) {
    return currentRouteState;
  }
  const overlayRouteStack = currentRouteState.overlayRouteStack.slice(0, -1);
  const activeOverlayRoute = overlayRouteStack[overlayRouteStack.length - 1] ?? SEARCH_ROUTE;
  const previousOverlayRoute =
    overlayRouteStack.length > 1 ? (overlayRouteStack[overlayRouteStack.length - 2] ?? null) : null;
  return createRouteStateSnapshot({
    activeOverlayRoute,
    previousOverlayRoute,
    overlayRouteStack,
  });
};

const popToRootRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot
): RouteSceneSwitchRouteStateSnapshot => {
  const rootOverlayRoute = currentRouteState.overlayRouteStack[0] ?? SEARCH_ROUTE;
  if (
    currentRouteState.overlayRouteStack.length <= 1 &&
    currentRouteState.activeOverlayRoute.key === rootOverlayRoute.key
  ) {
    return currentRouteState;
  }
  return createRouteStateSnapshot({
    activeOverlayRoute: rootOverlayRoute,
    previousOverlayRoute: currentRouteState.previousOverlayRoute,
    overlayRouteStack: [rootOverlayRoute],
  });
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
          transitionPlan.committedRouteParams
        );
      case 'updateActive':
        return updateRouteState(
          currentRouteState,
          currentRouteState.activeOverlayRoute.key,
          transitionPlan.committedRouteParams
        );
      case 'closeActive':
        return closeActiveRouteState(currentRouteState);
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
    activeOverlayRoute: SEARCH_ROUTE,
    previousOverlayRoute: null,
    overlayRouteStack: [SEARCH_ROUTE],
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
});

const areRouteSceneSwitchSceneStackDispatchSnapshotsEqual = (
  left: RouteSceneSwitchSceneStackDispatchSnapshot,
  right: RouteSceneSwitchSceneStackDispatchSnapshot
): boolean =>
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
    state.transitionContract?.headerActionModeTarget ?? null,
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
  committedRouteParams: transitionPlan.committedRouteParams,
  snapTarget: transitionPlan.snapTarget,
  sheetHostSceneKey: transitionPlan.sheetHostSceneKey,
  sheetSnapTarget: transitionPlan.sheetSnapTarget,
  sheetVisibilityTarget: transitionPlan.sheetVisibilityTarget,
  sheetIntent: transitionPlan.sheetIntent,
  sheetTransitionPlan: transitionPlan.sheetTransitionPlan,
  cameraIntent: transitionPlan.cameraIntent,
  chromeVisibilityTarget: transitionPlan.chromeVisibilityTarget,
  headerActionModeTarget: transitionPlan.headerActionModeTarget,
  freezeClassification: transitionPlan.freezeClassification,
  motionPlanes: transitionPlan.motionPlanes,
  pollsParams: transitionPlan.pollsParams,
  dockedPollsRestoreIntent,
  isInteractive: false,
});

// Phase 0/2 (canonical-sheet-transition-master-plan.md §6) — per-scene readiness
// lookup. A row declares which rendered-evidence gates a scene's overlap 'content'
// plane must wait on; as of Phase 2 the collector DRIVES that plane to completion
// when all of a linked txn's requiredContentGates close (it logs [READYGATE] AND
// calls completeRouteSceneSwitchMotionPlane). The crossfade ramp onFinish is now a
// token-guarded co-completer, and SCENE_READINESS_LIVENESS_MS is a never-hit
// watchdog. This table does not itself touch resolveMotionPlanes/resolveContentHandoff.
//
// Rows:
// - search / searchRoute carry the proven reveal join {cards, nativeMarkerFrame,
//   sheet}. A search→results forward open targets the 'search' overlay key
//   (results is a sub-state of the search scene), so the contract is keyed on
//   'search' (and 'searchRoute' for the route-driven entry).
// - pollDetail is SEEDED / swapImmediately on the forward open — it arms no
//   'content' plane, so requiredContentGates is EMPTY. Its requiredRestoreGates
//   mirror the poll-readiness weld used at DISMISS today (search-surface-runtime
//   pollHeaderReady/pollBodyReady/pollHostReady → header/thread/sheet): the poll
//   header, the poll body (a comment thread), and the sheet host.
// - pollCreation / saveList / profile are SEEDED (swapImmediately), arm no content
//   plane, and need no restore gates yet → empty contract.
//
// A LATER phase may populate restore-side loadingGates; the content-completer flip
// has landed (Phase 2 — the collector now drives the 'content' plane).
const EMPTY_SCENE_READINESS_CONTRACT: SceneReadinessContract = {
  requiredContentGates: [],
};

const SCENE_READINESS_CONTRACT_BY_TARGET: Partial<
  Record<OverlayKey, SceneReadinessContract>
> = {
  search: { requiredContentGates: ['cards', 'nativeMarkerFrame', 'sheet'] },
  searchRoute: { requiredContentGates: ['cards', 'nativeMarkerFrame', 'sheet'] },
  pollDetail: {
    requiredContentGates: [],
    requiredRestoreGates: ['header', 'thread', 'sheet'],
  },
  pollCreation: { requiredContentGates: [] },
  saveList: { requiredContentGates: [] },
  profile: { requiredContentGates: [] },
};

const resolveSceneReadinessContract = (
  targetSceneKey: OverlayKey | null | undefined
): SceneReadinessContract =>
  (targetSceneKey != null ? SCENE_READINESS_CONTRACT_BY_TARGET[targetSceneKey] : undefined) ??
  EMPTY_SCENE_READINESS_CONTRACT;

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

  // Phase 2 — transaction-keyed readiness collector (content-plane DRIVER). Records
  // which SceneReadinessGates have closed, keyed by the REDRAW transactionId the marks
  // already carry (e.g. "search-surface-results-transaction:3"). This accumulates
  // from submit-time so it captures gates that fire BEFORE the overlay switch goes
  // in-flight (cards + nativeMarkerFrame during data-load) AND the one that fires
  // DURING the switch (sheet) — the settle token misses the pre-switch gates.
  // When the search content gates are ALL satisfied it logs [READYGATE] content-ready
  // AND — if the txn has been LINKED to a content-plane settleToken at arm time —
  // calls completeRouteSceneSwitchMotionPlane(settleToken, 'content') to drive that
  // plane to completion on real paint. The crossfade ramp onFinish is now a
  // token-guarded CO-COMPLETER (whichever of {collector, ramp} fires first wins; the
  // SCENE_READINESS_LIVENESS_MS watchdog is a never-hit safety net).
  private static readonly READINESS_COLLECTOR_MAX_ENTRIES = 16;
  private readonly satisfiedReadinessGatesByTransaction = new Map<
    string,
    {
      satisfiedGates: Set<SceneReadinessGate>;
      contentReadyLogged: boolean;
    }
  >();

  // Phase 2 (canonical-sheet-transition-master-plan.md §5/§6) — NEVER-HIT liveness
  // WATCHDOG for the overlap 'content' settle plane. Two co-completers drive the plane
  // on real evidence, whichever fires first (the other token-guard no-ops):
  //   (1) the readiness COLLECTOR — markSceneContentGate completes the linked settleToken
  //       once all requiredContentGates close (real card/marker/sheet paint), and
  //   (2) the scene-stack crossfade ramp's withTiming onFinish (~250ms, render-side).
  // This timer is a pure safety net for the pathological case where BOTH miss (a dropped
  // Reanimated onFinish AND a gate that never reports). A FIRE IS AN ERROR CONDITION, not a
  // path — raised well past the ramp so it cannot beat a healthy completer. completeMotionPlane
  // is token-guarded, so a late fire on an already-settled token is a safe no-op.
  private static readonly SCENE_READINESS_LIVENESS_MS = 600;
  private readonly contentPlaneTimeoutByToken = new Map<
    number,
    ReturnType<typeof setTimeout>
  >();

  // Phase 2 — THE LINK. The collector keys gates by the redraw transactionId; the
  // 'content' motion plane keys by the settleToken — independent counters. At
  // content-plane arm we record the association {settleToken → (transactionId,
  // requiredContentGates)}. The driver flip reads this both ways:
  //  • markSceneContentGate (txn-keyed) → finds the linked settleToken to complete.
  //  • arm-time check-on-arm → tests the linked txn's already-satisfied gates.
  // Keyed by settleToken (one in-flight forward open at a time), cleared on settle/
  // supersede/idle/dispose alongside the timeout + settle-plane maps.
  private readonly contentReadinessLinkBySettleToken = new Map<
    number,
    {
      transactionId: string;
      requiredContentGates: readonly SceneReadinessGate[];
    }
  >();

  // Phase 2 — the CURRENT search redraw transactionId. A search→results reveal is a
  // MULTI-SWITCH dance: `openAppSearchRouteResults` fires the txn-carrying switch, but a
  // docked-polls reveal then fires polls→search restore switches that SUPERSEDE it, and the
  // FINAL search switch (the one whose content plane actually survives + crossfades) carries
  // NO txn (it is an internal restore, not the reveal call). Attributed on-device 2026-06-28:
  // the resolve-time switch sequence is inputTxn=:N(search) → NULL(polls) → NULL(search→ARMED).
  // So we stamp the most-recent reveal txn here at plan-resolve time (the one chokepoint every switch passes
  // through) and the arm site reads it when its own switch carried none. Cleared when the
  // collector resolves the linked plane and on idle/dispose, so a stale reveal txn can't leak
  // into an unrelated later switch.
  private lastRevealContentReadinessTransactionId: string | null = null;

  private clearContentReadinessLink(settleToken: number): void {
    this.contentReadinessLinkBySettleToken.delete(settleToken);
  }

  private clearContentPlaneTimeout(settleToken: number): void {
    const handle = this.contentPlaneTimeoutByToken.get(settleToken);
    if (handle != null) {
      clearTimeout(handle);
      this.contentPlaneTimeoutByToken.delete(settleToken);
    }
  }

  private clearAllContentPlaneTimeouts(): void {
    this.contentPlaneTimeoutByToken.forEach((handle) => clearTimeout(handle));
    this.contentPlaneTimeoutByToken.clear();
    // Phase 2 — the readiness link + the stamped reveal txn share the content-plane
    // lifecycle (armed with the timeout, cleared on settle/supersede/idle/dispose), so
    // clear them on the same sweeps.
    this.contentReadinessLinkBySettleToken.clear();
    this.lastRevealContentReadinessTransactionId = null;
  }

  constructor(
    private readonly sheetMotionTargetRegistry: AppRouteSceneSheetMotionTargetRegistry,
    private readonly routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime
  ) {}

  public dispose(): void {
    if (activeAppRouteSceneSwitchController === this) {
      activeAppRouteSceneSwitchController = null;
    }
    this.listeners.clear();
    this.settleCallbacksByTransitionToken.clear();
    this.satisfiedReadinessGatesByTransaction.clear();
    this.clearAllContentPlaneTimeouts();
    this.motionDispatchTarget = null;
    this.sceneStackTransitionDispatchTarget = null;
    this.nativeOverlayTransitionDispatchTarget = null;
    this.sceneAuthoritiesDispatchTarget = null;
    this.pendingSceneAuthoritiesDispatchState = null;
    this.pendingNativeOverlayDispatchState = null;
    this.pendingMotionDispatchSnapshot = null;
    this.pendingSceneStackDispatchSnapshot = null;
  }

  public getTransitionState(): RouteSceneSwitchTransitionState {
    return this.transitionState;
  }

  public getRouteSceneVisibilityPolicySnapshot(): RouteSceneVisibilityPolicySnapshot {
    return this.routeSceneVisibilityPolicyRuntime.getSnapshot();
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
      pushRouteState(currentRouteState, overlay, params)
    );
  }

  public closeActiveRouteState(): void {
    this.applyRouteStateMutation(closeActiveRouteState);
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
    if (plane === 'content') {
      this.clearContentPlaneTimeout(settleToken);
      // Phase 2 — the content plane is now resolved (by collector, ramp, or watchdog);
      // drop its readiness link so a late gate mark can't re-resolve a settled token.
      this.clearContentReadinessLink(settleToken);
    }
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
  public markSceneContentGate(
    gate: SceneReadinessGate,
    transactionId: string | null | undefined
  ): void {
    if (transactionId == null) {
      return;
    }
    logger.info(`[READYGATE] gate=${gate} txn=${transactionId}`);

    let collectorState = this.satisfiedReadinessGatesByTransaction.get(transactionId);
    if (!collectorState) {
      collectorState = {
        satisfiedGates: new Set<SceneReadinessGate>(),
        contentReadyLogged: false,
      };
      this.satisfiedReadinessGatesByTransaction.set(transactionId, collectorState);
      // Bound the map: evict the oldest (insertion-order) entry so a long-lived
      // session can't grow it unbounded. The idle/dispose clears also reset it.
      while (
        this.satisfiedReadinessGatesByTransaction.size >
        AppRouteSceneSwitchController.READINESS_COLLECTOR_MAX_ENTRIES
      ) {
        const oldestKey = this.satisfiedReadinessGatesByTransaction.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        this.satisfiedReadinessGatesByTransaction.delete(oldestKey);
      }
    }
    collectorState.satisfiedGates.add(gate);

    this.evaluateContentReadinessForTransaction(transactionId, collectorState);
  }

  /**
   * Phase 2 — shared all-gates-satisfied evaluation, invoked from BOTH the collector
   * (gate arrives) and the arm site (CHECK-ON-ARM, gates may have closed before the
   * switch went in-flight). Logs `[READYGATE] content-ready` once, and if a
   * content-plane settleToken is linked to this txn, completes that plane.
   *
   * The gate contract: when the txn is LINKED (a content plane is in flight for it),
   * use the linked contract's requiredContentGates; otherwise fall back to the search
   * reveal join via SCENE_READINESS_CONTRACT_BY_TARGET['search'] so the content-ready
   * log still fires in the gate-before-arm window (where only the search surface
   * reports gates today). Either way only the search-family scenes ever carry a
   * non-empty content contract (Phase 1 invariant), so this stays scoped to them.
   */
  private evaluateContentReadinessForTransaction(
    transactionId: string,
    collectorState: { satisfiedGates: Set<SceneReadinessGate>; contentReadyLogged: boolean }
  ): void {
    const linkedSettleToken = this.findLinkedSettleTokenForTransaction(transactionId);
    const requiredContentGates =
      linkedSettleToken != null
        ? (this.contentReadinessLinkBySettleToken.get(linkedSettleToken)?.requiredContentGates ??
          [])
        : resolveSceneReadinessContract('search').requiredContentGates;
    if (requiredContentGates.length === 0) {
      return;
    }
    const allSatisfied = requiredContentGates.every((requiredGate) =>
      collectorState.satisfiedGates.has(requiredGate)
    );
    if (!allSatisfied) {
      return;
    }
    if (!collectorState.contentReadyLogged) {
      collectorState.contentReadyLogged = true;
      logger.info(
        `[READYGATE] content-ready txn=${transactionId} gates=${requiredContentGates.join(',')}`
      );
    }
    // DRIVER: complete the linked content plane on real paint. completeRouteSceneSwitchMotionPlane
    // token-guards (no-ops a superseded/already-completed token) so the ramp onFinish co-completer
    // and this driver are mutually idempotent — whichever fires first wins.
    if (linkedSettleToken != null) {
      this.completeRouteSceneSwitchMotionPlane(linkedSettleToken, 'content');
    }
  }

  private findLinkedSettleTokenForTransaction(transactionId: string): number | null {
    for (const [settleToken, link] of this.contentReadinessLinkBySettleToken) {
      if (link.transactionId === transactionId) {
        return settleToken;
      }
    }
    return null;
  }

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
    this.flushSceneAuthoritiesDispatchTarget();
    this.flushNativeOverlayTransitionDispatchTarget();
    this.flushMotionDispatchTarget();
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
    if (input.contentReadinessTransactionId != null) {
      this.lastRevealContentReadinessTransactionId = input.contentReadinessTransactionId;
    }
    return withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'resolveTransitionPlan',
      () =>
        resolveAppRouteSceneTransitionPlan({
          ...input,
          currentRootRouteKey: this.transitionState.routeState.rootOverlayKey,
          resolveCurrentSheetSnapTarget: (sceneKey: OverlayKey) =>
            this.sheetMotionTargetRegistry.resolveCurrentSnapTarget(sceneKey),
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
    const routeState = withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchTransition:applyRouteState',
      () =>
        applyTransitionPlanToRouteState(currentState.routeState, transitionPlan)
    );
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchTransition:syncSettlePlanes',
      () => {
        this.activeSettlePlanesByToken.delete(settleToken);
        // satisfiedReadinessGatesByTransaction is keyed by redraw transactionId, not
        // the settle token — its size cap + idle/dispose clears handle cleanup, so no
        // per-settle-token delete here.
        this.clearContentPlaneTimeout(settleToken);
        this.clearContentReadinessLink(settleToken);
        if (transitionPlan.motionPlanes.length > 0) {
          this.activeSettlePlanesByToken.set(settleToken, {
            transitionToken: nextToken,
            pendingPlanes: new Set(transitionPlan.motionPlanes),
          });
          if (transitionPlan.motionPlanes.includes('content')) {
            // Phase 2 — THE LINK: associate the redraw transactionId (which the
            // readiness gate marks carry) with this settleToken (which the content
            // plane carries), so the collector can drive the plane to completion.
            // Prefer the txn this switch carried; fall back to the most-recent reveal
            // txn for the SURVIVING content plane of a multi-switch reveal whose
            // txn-carrying switch was superseded (see lastRevealContentReadinessTransactionId).
            // Only matters for search-family targets — they are the only scenes with a
            // non-empty content contract (Phase 1 invariant) AND the only producers of
            // gate marks, so a non-search target gets requiredContentGates=[] and no link.
            const { requiredContentGates } = resolveSceneReadinessContract(
              transitionPlan.targetSceneKey
            );
            const contentReadinessTransactionId =
              requiredContentGates.length > 0
                ? (transitionPlan.contentReadinessTransactionId ??
                  this.lastRevealContentReadinessTransactionId)
                : null;
            if (contentReadinessTransactionId != null) {
              this.contentReadinessLinkBySettleToken.set(settleToken, {
                transactionId: contentReadinessTransactionId,
                requiredContentGates,
              });
            }
            // Phase 2 — NEVER-HIT liveness WATCHDOG (renamed from the old 320ms
            // completer). The collector (real paint) + the ramp onFinish are the
            // co-completers; a fire here is an ERROR CONDITION, not a path.
            this.contentPlaneTimeoutByToken.set(
              settleToken,
              setTimeout(() => {
                // Drop our own (now-fired) entry FIRST. completeRouteSceneSwitchMotionPlane
                // early-returns when this transition was already superseded (a newer settleToken
                // is active) and would NOT clear it — leaving a dead handle in the map until the
                // next idle sweep. Deleting here keeps the map bounded on rapid supersede.
                this.contentPlaneTimeoutByToken.delete(settleToken);
                this.completeRouteSceneSwitchMotionPlane(settleToken, 'content');
              }, AppRouteSceneSwitchController.SCENE_READINESS_LIVENESS_MS)
            );
          }
        }
      }
    );
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
    // Phase 2 — CHECK-ON-ARM. The search content gates (cards + nativeMarkerFrame)
    // can close DURING data-load, BEFORE this switch goes in-flight — and the sheet
    // gate is reported by the reveal path itself. The collector accumulates those
    // from submit-time keyed by the redraw transactionId, so by the time we arm the
    // plane the link's gates may already ALL be satisfied. Test immediately and
    // complete synchronously if so, rather than waiting for a future gate mark that
    // will never come. Runs AFTER setTransitionState so the switch is in-flight and
    // completeRouteSceneSwitchMotionPlane's guards pass. Idempotent with the ramp. Reads the
    // txn off the LINK we just recorded (which already applied the lastReveal fallback), not
    // off the plan — the surviving reveal switch carries no txn of its own.
    const linkedTransactionId =
      this.contentReadinessLinkBySettleToken.get(settleToken)?.transactionId ?? null;
    if (linkedTransactionId != null) {
      const collectorState = this.satisfiedReadinessGatesByTransaction.get(linkedTransactionId);
      if (collectorState) {
        this.evaluateContentReadinessForTransaction(linkedTransactionId, collectorState);
      }
    }
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
    const routeState = withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchIdleState:applyRouteState',
      () =>
        applyTransitionPlanToRouteState(currentState.routeState, transitionPlan)
    );
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchIdleState:clearSettlePlanes',
      () => {
        this.activeSettlePlanesByToken.clear();
        this.satisfiedReadinessGatesByTransaction.clear();
        this.clearAllContentPlaneTimeouts();
      }
    );
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
          // satisfiedReadinessGatesByTransaction is transactionId-keyed, not settle-token
          // keyed — its size cap + idle/dispose clears handle cleanup (no delete here).
          this.clearContentPlaneTimeout(completedSettleToken);
          this.clearContentReadinessLink(completedSettleToken);
        }
      }
    );
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
    this.flushRuntimeDispatchTargets();
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'completeRouteSceneSwitchTransition:flushSettleCallbacks',
      () => {
        this.flushSettleCallbacks(completedTransitionToken);
      }
    );
    this.flushSceneStackTransitionDispatchTarget();
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
    this.setTransitionState(
      (currentState) => {
        const next = resolveNextRouteState(currentState.routeState);
        return { routeState: next };
      },
      'applyRouteStateMutation'
    );
    this.flushRuntimeDispatchTargets();
  }
}

// Phase 1 (canonical-transition-finish-plan.md) — module-level hook so the search
// surface runtime (a module singleton with no controller reference) can dual-report
// its readiness marks into the transaction-keyed collector WITHOUT changing the
// existing reveal join. The route runtime READS the search surface snapshot today;
// there is no surface→controller port, so we register the live controller instance
// here and expose a free delegating function. Phase 2 — markSceneContentGate now
// DRIVES content-plane completion (it logs [READYGATE] content-ready AND completes
// the linked content settleToken once all requiredContentGates close); see
// AppRouteSceneSwitchController.markSceneContentGate. Holding a single active instance
// is correct — createAppRouteSceneRuntime constructs exactly one scene-switch runtime
// for the app.
let activeAppRouteSceneSwitchController: AppRouteSceneSwitchController | null = null;

/**
 * Phase 2 — route a search-surface readiness mark into the active controller's
 * collector, which DRIVES the linked content plane to completion once all gates
 * close. No-ops cleanly when no controller is mounted or the mark carries no
 * transactionId to key on.
 */
export const markActiveSceneContentGate = (
  gate: SceneReadinessGate,
  transactionId: string | null | undefined
): void => {
  activeAppRouteSceneSwitchController?.markSceneContentGate(gate, transactionId);
};

export const createAppRouteSceneSwitchRuntime = ({
  sheetMotionTargetRegistry,
  routeSceneVisibilityPolicyRuntime,
}: {
  sheetMotionTargetRegistry: AppRouteSceneSheetMotionTargetRegistry;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
}): AppRouteSceneSwitchRuntime => {
  const controller = new AppRouteSceneSwitchController(
    sheetMotionTargetRegistry,
    routeSceneVisibilityPolicyRuntime
  );
  activeAppRouteSceneSwitchController = controller;
  return controller;
};
