import { unstable_batchedUpdates } from 'react-native';

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
  const currentTop =
    currentRouteState.overlayRouteStack[currentRouteState.overlayRouteStack.length - 1];
  const overlayRouteStack =
    currentTop?.key === overlay
      ? [...currentRouteState.overlayRouteStack.slice(0, -1), nextRoute]
      : [...currentRouteState.overlayRouteStack, nextRoute];
  const previousOverlayRoute =
    currentRouteState.activeOverlayRoute.key === overlay
      ? currentRouteState.previousOverlayRoute
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

  // Fallback guard for the overlap 'content' settle plane. The PRIMARY completer is render-side:
  // the scene-stack crossfade ramp's withTiming onFinish calls completeFromContentSettle at
  // ramp-end (~250ms), so a forward-open settles when the incoming page reveals. This timeout
  // only fires if that onFinish is missed/interrupted (React Animated onFinish is not
  // worklet-guaranteed) — degrading to a slightly-late settle, never a hung overlay. completeMotionPlane
  // is token-guarded, so whichever path fires first wins and the other is a safe no-op.
  private static readonly CONTENT_SETTLE_TIMEOUT_MS = 320;
  private readonly contentPlaneTimeoutByToken = new Map<
    number,
    ReturnType<typeof setTimeout>
  >();

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
  }

  constructor(
    private readonly sheetMotionTargetRegistry: AppRouteSceneSheetMotionTargetRegistry,
    private readonly routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime
  ) {}

  public dispose(): void {
    this.listeners.clear();
    this.settleCallbacksByTransitionToken.clear();
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
    }
    if (settleState.pendingPlanes.size > 0) {
      return;
    }
    this.completeRouteSceneSwitchTransition(state.transitionToken);
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
      () => applyTransitionPlanToRouteState(currentState.routeState, transitionPlan)
    );
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchTransition:syncSettlePlanes',
      () => {
        this.activeSettlePlanesByToken.delete(settleToken);
        this.clearContentPlaneTimeout(settleToken);
        if (transitionPlan.motionPlanes.length > 0) {
          this.activeSettlePlanesByToken.set(settleToken, {
            transitionToken: nextToken,
            pendingPlanes: new Set(transitionPlan.motionPlanes),
          });
          if (transitionPlan.motionPlanes.includes('content')) {
            this.contentPlaneTimeoutByToken.set(
              settleToken,
              setTimeout(() => {
                // Drop our own (now-fired) entry FIRST. completeRouteSceneSwitchMotionPlane
                // early-returns when this transition was already superseded (a newer settleToken
                // is active) and would NOT clear it — leaving a dead handle in the map until the
                // next idle sweep. Deleting here keeps the map bounded on rapid supersede.
                this.contentPlaneTimeoutByToken.delete(settleToken);
                this.completeRouteSceneSwitchMotionPlane(settleToken, 'content');
              }, AppRouteSceneSwitchController.CONTENT_SETTLE_TIMEOUT_MS)
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
      () => applyTransitionPlanToRouteState(currentState.routeState, transitionPlan)
    );
    withSearchNavSwitchRuntimeAttribution(
      'routeSceneSwitchController',
      'commitRouteSceneSwitchIdleState:clearSettlePlanes',
      () => {
        this.activeSettlePlanesByToken.clear();
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
          this.clearContentPlaneTimeout(completedSettleToken);
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
      (currentState) => ({
        routeState: resolveNextRouteState(currentState.routeState),
      }),
      'applyRouteStateMutation'
    );
    this.flushRuntimeDispatchTargets();
  }
}

export const createAppRouteSceneSwitchRuntime = ({
  sheetMotionTargetRegistry,
  routeSceneVisibilityPolicyRuntime,
}: {
  sheetMotionTargetRegistry: AppRouteSceneSheetMotionTargetRegistry;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
}): AppRouteSceneSwitchRuntime =>
  new AppRouteSceneSwitchController(sheetMotionTargetRegistry, routeSceneVisibilityPolicyRuntime);
