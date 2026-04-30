import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import type {
  AppRouteSceneActivitySnapshot,
  AppRouteSceneInteractivitySnapshot,
  AppRouteScenePayloadSnapshot,
  AppRouteSceneSwitchAuthorities,
  AppRouteSceneSwitchSnapshot,
  AppRouteSceneTransitionSnapshot,
} from './app-route-scene-switch-authority';
import type {
  AppRouteSceneSwitchRuntime,
  RouteSceneSwitchTransitionState,
} from './app-route-scene-switch-controller';

type AppRouteSceneAuthorityListenerEntry = {
  listener: () => void;
  attributionLabel: string;
};

const resolveAppRouteSceneSwitchSnapshot = (
  state: RouteSceneSwitchTransitionState
): AppRouteSceneSwitchSnapshot => ({
  routeActiveSceneKey: state.activeSceneKey,
  interactiveSceneKey: state.interactiveSceneKey,
  pendingSceneKey: state.isOverlaySwitchInFlight ? state.pendingTargetSceneKey : null,
  handoffSceneKey: state.isOverlaySwitchInFlight ? state.handoffSceneKey : null,
  transitionPhase: state.transitionPhase,
  transitionToken: state.transitionToken,
  transitionContract: state.transitionContract,
  activePollsParams: state.activePollsParams,
  activeDockedPollsRestoreIntent: state.activeDockedPollsRestoreIntent,
  isInteractive: state.isInteractive,
  routeState: state.routeState,
});

const resolveAppRouteSceneTransitionSnapshot = (
  state: RouteSceneSwitchTransitionState
): AppRouteSceneTransitionSnapshot => ({
  activeSceneKey: state.activeSceneKey,
  interactiveSceneKey: state.interactiveSceneKey,
  pendingSceneKey: state.isOverlaySwitchInFlight ? state.pendingTargetSceneKey : null,
  handoffSceneKey: state.isOverlaySwitchInFlight ? state.handoffSceneKey : null,
  transitionPhase: state.transitionPhase,
  transitionToken: state.transitionToken,
  transitionContract: state.transitionContract,
  activePollsParams: state.activePollsParams,
  activeDockedPollsRestoreIntent: state.activeDockedPollsRestoreIntent,
  isInteractive: state.isInteractive,
  routeState: state.routeState,
});

const resolveAppRouteSceneActivitySnapshot = (
  state: RouteSceneSwitchTransitionState
): AppRouteSceneActivitySnapshot => ({
  routeActiveSceneKey: state.activeSceneKey,
  activeSceneKey: state.activeSceneKey,
  interactiveSceneKey: state.interactiveSceneKey,
  pendingSceneKey: state.isOverlaySwitchInFlight ? state.pendingTargetSceneKey : null,
  handoffSceneKey: state.isOverlaySwitchInFlight ? state.handoffSceneKey : null,
  transitionPhase: state.transitionPhase,
  transitionToken: state.transitionToken,
  transitionContract: state.transitionContract,
  isInteractive: state.isInteractive,
});

const resolveAppRouteScenePayloadSnapshot = (
  state: RouteSceneSwitchTransitionState
): AppRouteScenePayloadSnapshot => ({
  activePollsParams: state.activePollsParams,
  activeDockedPollsRestoreIntent: state.activeDockedPollsRestoreIntent,
});

const resolveAppRouteSceneInteractivitySnapshot = (
  state: RouteSceneSwitchTransitionState
): AppRouteSceneInteractivitySnapshot => ({
  transitionPhase: state.transitionPhase,
  isInteractive: state.isInteractive,
});

const areAppRouteSceneSwitchSnapshotsEqual = (
  left: AppRouteSceneSwitchSnapshot,
  right: AppRouteSceneSwitchSnapshot
): boolean =>
  left.routeActiveSceneKey === right.routeActiveSceneKey &&
  left.interactiveSceneKey === right.interactiveSceneKey &&
  left.pendingSceneKey === right.pendingSceneKey &&
  left.handoffSceneKey === right.handoffSceneKey &&
  left.transitionPhase === right.transitionPhase &&
  left.transitionToken === right.transitionToken &&
  left.transitionContract === right.transitionContract &&
  left.activePollsParams === right.activePollsParams &&
  left.activeDockedPollsRestoreIntent === right.activeDockedPollsRestoreIntent &&
  left.isInteractive === right.isInteractive &&
  left.routeState === right.routeState;

const areAppRouteSceneTransitionSnapshotsEqual = (
  left: AppRouteSceneTransitionSnapshot,
  right: AppRouteSceneTransitionSnapshot
): boolean =>
  left.activeSceneKey === right.activeSceneKey &&
  left.interactiveSceneKey === right.interactiveSceneKey &&
  left.pendingSceneKey === right.pendingSceneKey &&
  left.handoffSceneKey === right.handoffSceneKey &&
  left.transitionPhase === right.transitionPhase &&
  left.transitionToken === right.transitionToken &&
  left.transitionContract === right.transitionContract &&
  left.activePollsParams === right.activePollsParams &&
  left.activeDockedPollsRestoreIntent === right.activeDockedPollsRestoreIntent &&
  left.isInteractive === right.isInteractive &&
  left.routeState === right.routeState;

const areAppRouteSceneActivitySnapshotsEqual = (
  left: AppRouteSceneActivitySnapshot,
  right: AppRouteSceneActivitySnapshot
): boolean =>
  left.routeActiveSceneKey === right.routeActiveSceneKey &&
  left.activeSceneKey === right.activeSceneKey &&
  left.interactiveSceneKey === right.interactiveSceneKey &&
  left.pendingSceneKey === right.pendingSceneKey &&
  left.handoffSceneKey === right.handoffSceneKey &&
  left.transitionPhase === right.transitionPhase &&
  left.transitionToken === right.transitionToken &&
  left.transitionContract === right.transitionContract &&
  left.isInteractive === right.isInteractive;

const areAppRouteScenePayloadSnapshotsEqual = (
  left: AppRouteScenePayloadSnapshot,
  right: AppRouteScenePayloadSnapshot
): boolean =>
  left.activePollsParams === right.activePollsParams &&
  left.activeDockedPollsRestoreIntent === right.activeDockedPollsRestoreIntent;

const areAppRouteSceneInteractivitySnapshotsEqual = (
  left: AppRouteSceneInteractivitySnapshot,
  right: AppRouteSceneInteractivitySnapshot
): boolean =>
  left.transitionPhase === right.transitionPhase && left.isInteractive === right.isInteractive;

export class RouteSceneTransitionFanoutController {
  private currentSwitchSnapshot: AppRouteSceneSwitchSnapshot;

  private currentTransitionSnapshot: AppRouteSceneTransitionSnapshot;

  private currentActivitySnapshot: AppRouteSceneActivitySnapshot;

  private currentPayloadSnapshot: AppRouteScenePayloadSnapshot;

  private currentInteractivitySnapshot: AppRouteSceneInteractivitySnapshot;

  private readonly switchListeners = new Set<AppRouteSceneAuthorityListenerEntry>();

  private readonly transitionListeners = new Set<AppRouteSceneAuthorityListenerEntry>();

  private readonly activityListeners = new Set<AppRouteSceneAuthorityListenerEntry>();

  private readonly payloadListeners = new Set<AppRouteSceneAuthorityListenerEntry>();

  private readonly interactivityListeners = new Set<AppRouteSceneAuthorityListenerEntry>();

  private readonly unsubscribeSceneAuthoritiesDispatchTarget: () => void;

  public readonly authorities: AppRouteSceneSwitchAuthorities;

  constructor(routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime) {
    const initialTransitionState = routeSceneSwitchRuntime.getTransitionState();
    this.currentSwitchSnapshot = resolveAppRouteSceneSwitchSnapshot(initialTransitionState);
    this.currentTransitionSnapshot = resolveAppRouteSceneTransitionSnapshot(initialTransitionState);
    this.currentActivitySnapshot = resolveAppRouteSceneActivitySnapshot(initialTransitionState);
    this.currentPayloadSnapshot = resolveAppRouteScenePayloadSnapshot(initialTransitionState);
    this.currentInteractivitySnapshot =
      resolveAppRouteSceneInteractivitySnapshot(initialTransitionState);

    this.authorities = {
      sceneSwitchAuthority: {
        getSnapshot: () => this.currentSwitchSnapshot,
        subscribe: this.subscribeToSet(this.switchListeners),
      },
      sceneTransitionAuthority: {
        getSnapshot: () => this.currentTransitionSnapshot,
        subscribe: this.subscribeToSet(this.transitionListeners),
      },
      sceneActivityAuthority: {
        getSnapshot: () => this.currentActivitySnapshot,
        subscribe: this.subscribeToSet(this.activityListeners),
      },
      scenePayloadAuthority: {
        getSnapshot: () => this.currentPayloadSnapshot,
        subscribe: this.subscribeToSet(this.payloadListeners),
      },
      sceneInteractivityAuthority: {
        getSnapshot: () => this.currentInteractivitySnapshot,
        subscribe: this.subscribeToSet(this.interactivityListeners),
      },
    };

    this.unsubscribeSceneAuthoritiesDispatchTarget =
      routeSceneSwitchRuntime.setRouteSceneAuthoritiesDispatchTarget((state) => {
        this.syncSnapshotsFromTransitionState(state, 'resolveAndFanout');
      });
  }

  public dispose(): void {
    this.unsubscribeSceneAuthoritiesDispatchTarget();
    this.switchListeners.clear();
    this.transitionListeners.clear();
    this.activityListeners.clear();
    this.payloadListeners.clear();
    this.interactivityListeners.clear();
  }

  private notifyListeners(
    operation: string,
    listeners: Set<AppRouteSceneAuthorityListenerEntry>
  ): void {
    if (listeners.size === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('routeSceneTransitionFanout', operation, () => {
      listeners.forEach(({ listener, attributionLabel }) => {
        withSearchNavSwitchRuntimeAttribution(
          'routeSceneTransitionFanout',
          `${operation}:${attributionLabel}`,
          listener
        );
      });
    });
  }

  private syncSnapshotsFromTransitionState(
    state: RouteSceneSwitchTransitionState,
    operation: string
  ): void {
    withSearchNavSwitchRuntimeAttribution('routeSceneTransitionFanout', operation, () => {
      const nextSwitchSnapshot = resolveAppRouteSceneSwitchSnapshot(state);
      const nextTransitionSnapshot = resolveAppRouteSceneTransitionSnapshot(state);
      const nextActivitySnapshot = resolveAppRouteSceneActivitySnapshot(state);
      const nextPayloadSnapshot = resolveAppRouteScenePayloadSnapshot(state);
      const nextInteractivitySnapshot = resolveAppRouteSceneInteractivitySnapshot(state);

      if (!areAppRouteSceneSwitchSnapshotsEqual(this.currentSwitchSnapshot, nextSwitchSnapshot)) {
        this.currentSwitchSnapshot = nextSwitchSnapshot;
        this.notifyListeners('switchListeners', this.switchListeners);
      }

      if (
        !areAppRouteSceneTransitionSnapshotsEqual(
          this.currentTransitionSnapshot,
          nextTransitionSnapshot
        )
      ) {
        this.currentTransitionSnapshot = nextTransitionSnapshot;
        this.notifyListeners('transitionListeners', this.transitionListeners);
      }

      if (
        !areAppRouteSceneActivitySnapshotsEqual(this.currentActivitySnapshot, nextActivitySnapshot)
      ) {
        this.currentActivitySnapshot = nextActivitySnapshot;
        this.notifyListeners('activityListeners', this.activityListeners);
      }

      if (
        !areAppRouteScenePayloadSnapshotsEqual(this.currentPayloadSnapshot, nextPayloadSnapshot)
      ) {
        this.currentPayloadSnapshot = nextPayloadSnapshot;
        this.notifyListeners('payloadListeners', this.payloadListeners);
      }

      if (
        !areAppRouteSceneInteractivitySnapshotsEqual(
          this.currentInteractivitySnapshot,
          nextInteractivitySnapshot
        )
      ) {
        this.currentInteractivitySnapshot = nextInteractivitySnapshot;
        this.notifyListeners('interactivityListeners', this.interactivityListeners);
      }
    });
  }

  private subscribeToSet(
    listeners: Set<AppRouteSceneAuthorityListenerEntry>
  ): (listener: () => void, attributionLabel?: string) => () => void {
    return (listener, attributionLabel = 'anonymous') => {
      const entry: AppRouteSceneAuthorityListenerEntry = {
        listener,
        attributionLabel,
      };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    };
  }
}

export const createRouteSceneTransitionFanoutController = (
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime
): RouteSceneTransitionFanoutController =>
  new RouteSceneTransitionFanoutController(routeSceneSwitchRuntime);
