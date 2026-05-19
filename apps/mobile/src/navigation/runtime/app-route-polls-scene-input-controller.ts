import { StyleSheet } from 'react-native';

import { logger } from '../../utils';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../perf/perf-scenario-runtime-store';
import {
  createSearchRoutePollsSceneStateRuntime,
  type SearchRoutePollsSceneStateRuntime,
} from '../../overlays/useSearchRoutePollsSceneStateRuntime';
import { overlaySheetStyles } from '../../overlays/overlaySheetStyles';
import { normalizeSearchRouteSceneStackShellSpec } from '../../overlays/searchOverlayRouteHostContract';
import type { SearchRouteSceneSnapMeta } from '../../overlays/searchRouteSceneShellMotionContract';
import {
  EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE,
  type SearchRouteSceneLayoutState,
} from '../../overlays/searchRouteSceneLayoutContract';
import type { OverlaySheetSnap } from '../../overlays/types';
import { shouldLogSearchNavSwitchDiagnosticLogs } from '../../screens/Search/runtime/shared/search-nav-switch-perf-probe';
import type { RouteOverlayPollsVisibilitySnapshot } from './route-overlay-display-snapshot-contract';
import type {
  AppRouteSceneBodyAdmissionPolicy,
  AppRouteSceneBodyContentSpec,
  AppRouteSceneBodyTransportSpec,
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from './app-route-scene-descriptor-contract';
import type {
  AppRoutePollsDynamicSceneInputRuntime,
  AppRoutePollsRouteStateRuntime,
  AppRouteSceneSheetSessionInputState,
} from './app-route-dynamic-scene-inputs-contract';
import {
  EMPTY_APP_ROUTE_POLLS_DYNAMIC_SCENE_INPUT_RUNTIME,
  areAppRoutePollsDynamicSceneInputRuntimesEqual,
} from './app-route-dynamic-scene-inputs-contract';
import type { AppRouteSheetSnapSessionSnapshot } from './app-route-sheet-snap-session-runtime';
import type { AppRouteScenePayloadSnapshot } from './app-route-scene-switch-authority';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import type { AppRoutePollsSceneState } from './app-route-polls-scene-runtime';

type ListenerDisposer = () => void;

const pollsSceneInputControllerStyles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 32,
    paddingTop: 16,
  },
});

const POLLS_MOUNTED_SCENE_CHROME: AppRouteSceneChromePublication = {
  surfaceKind: 'mounted',
  mountedChromeKey: 'polls',
};

const POLLS_MOUNTED_SCENE_BODY_CONTENT: AppRouteSceneBodyContentSpec = {
  surfaceKind: 'mounted',
  mountedBodyKey: 'polls',
  contentScrollMode: 'scroll',
};

const POLLS_MOUNTED_SCENE_BODY_TRANSPORT: AppRouteSceneBodyTransportSpec = {
  contentContainerStyle: [pollsSceneInputControllerStyles.scrollContent],
  keyboardShouldPersistTaps: 'handled',
  bounces: false,
  alwaysBounceVertical: false,
  overScrollMode: 'never',
  contentSurfaceStyle: overlaySheetStyles.contentSurfaceWhite,
};

const POLLS_MOUNTED_SCENE_BODY_ADMISSION_POLICY: AppRouteSceneBodyAdmissionPolicy = {
  retainMountedBodyDuringTransition: true,
  keepDataSubscribedAfterActivation: true,
};

const selectPollsRouteNavigationState = (
  snapshot: RouteOverlayPollsVisibilitySnapshot
): Pick<
  AppRoutePollsRouteStateRuntime,
  'isSearchOverlay' | 'isPersistentPollLane' | 'rootOverlayKey'
> => ({
  isSearchOverlay: snapshot.isSearchOverlay,
  isPersistentPollLane: snapshot.isPersistentPollLane,
  rootOverlayKey: 'search',
});

const selectPollsPayloadState = (
  snapshot: AppRouteScenePayloadSnapshot
): Pick<AppRoutePollsRouteStateRuntime, 'activePollsParams' | 'dockedPollsRestoreIntent'> => ({
  activePollsParams: snapshot.activePollsParams,
  dockedPollsRestoreIntent: snapshot.activeDockedPollsRestoreIntent,
});

const selectSheetSessionInputState = (
  snapshot: AppRouteSheetSnapSessionSnapshot
): AppRouteSceneSheetSessionInputState => ({
  isDockedPollsDismissed: snapshot.isDockedPollsDismissed,
});

export type AppRoutePollsSceneInputController = {
  dispose: () => void;
};

class AppRoutePollsSceneInputRuntimeController implements AppRoutePollsSceneInputController {
  private readonly disposers: ListenerDisposer[] = [];

  private readonly handlePollsSnapChange = (
    snap: OverlaySheetSnap,
    meta?: SearchRouteSceneSnapMeta
  ): void => {
    this.routeSceneRuntime.routeSheetSnapSessionActions.settleRouteScenePollsSnap({
      rootOverlayKey: this.pollsRouteState.rootOverlayKey ?? 'search',
      snap,
      source: meta?.source,
      routeSceneTransitionAuthority: this.routeSceneRuntime.sceneTransitionAuthority,
      routeSceneSwitchActions: this.routeSceneRuntime.routeOverlayTransitionActions,
    });
  };

  private readonly requestReturnToSearchFromPolls = (): void => {
    if (this.pollsRouteState.isSearchOverlay && this.pollsRouteState.isPersistentPollLane) {
      this.routeSceneRuntime.routeSheetSnapSessionActions.setIsDockedPollsDismissed(true);
      this.routeSceneRuntime.routeOverlayTransitionActions.requestOverlaySwitch({
        targetSceneKey: 'search',
        sheetTransitionKind: 'terminalDismiss',
        sheetOpenerSource: 'systemDismiss',
        sheetMotion: { kind: 'hide' },
        dockedPollsRestoreSnap: null,
      });
      return;
    }
    this.routeSceneRuntime.routeSearchCommandActions.returnAppSearchRouteToDockedSearch({
      snap: 'collapsed',
    });
  };

  private pollsRouteState: AppRoutePollsRouteStateRuntime;

  private sceneLayout: SearchRouteSceneLayoutState;

  private sheetSessionState: AppRouteSceneSheetSessionInputState;

  private pollsSheetSnap: OverlaySheetSnap;

  private dynamicSceneInputRuntime: AppRoutePollsDynamicSceneInputRuntime;

  private lastDiagnosticsSnapshot: string | null = null;

  private isDisposed = false;

  constructor(private readonly routeSceneRuntime: AppRouteSceneRuntime) {
    this.pollsRouteState = {
      ...selectPollsRouteNavigationState(
        routeSceneRuntime.routeOverlayPollsVisibilityAuthority.getSnapshot()
      ),
      ...selectPollsPayloadState(routeSceneRuntime.scenePayloadAuthority.getSnapshot()),
    };
    this.sceneLayout =
      routeSceneRuntime.routeSceneLayoutAuthority.getSnapshot().routeSceneLayout ??
      EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE;
    this.sheetSessionState = selectSheetSessionInputState(
      routeSceneRuntime.routeSheetSnapSessionAuthority.getSnapshot()
    );
    this.pollsSheetSnap =
      routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls');
    this.dynamicSceneInputRuntime =
      routeSceneRuntime.routeDynamicSceneInputAuthority.getPollsRuntimeSnapshot() ??
      EMPTY_APP_ROUTE_POLLS_DYNAMIC_SCENE_INPUT_RUNTIME;

    this.disposers.push(
      routeSceneRuntime.routeOverlayPollsVisibilityAuthority.registerTarget({
        attributionLabel: 'AppRoutePollsSceneInputPollsVisibility',
        syncPollsVisibilitySnapshot: (snapshot) => {
          this.setPollsRouteNavigationState(selectPollsRouteNavigationState(snapshot));
        },
      }),
      routeSceneRuntime.scenePayloadAuthority.subscribe(() => {
        this.setPollsPayloadState(
          selectPollsPayloadState(routeSceneRuntime.scenePayloadAuthority.getSnapshot())
        );
      }, 'AppRoutePollsSceneInputController'),
      routeSceneRuntime.routeSceneLayoutAuthority.subscribe(() => {
        this.setSceneLayout(
          routeSceneRuntime.routeSceneLayoutAuthority.getSnapshot().routeSceneLayout ??
            EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE
        );
      }),
      routeSceneRuntime.routeSheetSnapSessionAuthority.subscribe(() => {
        const snapshot = routeSceneRuntime.routeSheetSnapSessionAuthority.getSnapshot();
        this.setSheetSessionState(selectSheetSessionInputState(snapshot));
        this.setPollsSheetSnap(
          routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls')
        );
      }),
      routeSceneRuntime.routeDynamicSceneInputAuthority.subscribePollsRuntime(() => {
        this.setDynamicSceneInputRuntime(
          routeSceneRuntime.routeDynamicSceneInputAuthority.getPollsRuntimeSnapshot()
        );
      }, 'AppRoutePollsSceneInputController')
    );

    this.recomputeAndPublish();
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.disposers.splice(0).forEach((dispose) => {
      dispose();
    });
    this.routeSceneRuntime.sceneInputLane.clearRouteSceneInput('polls');
    this.routeSceneRuntime.routePollsSceneRuntime.sceneActions.clearSceneState();
  }

  private setPollsRouteNavigationState(
    nextState: Pick<
      AppRoutePollsRouteStateRuntime,
      'isSearchOverlay' | 'isPersistentPollLane' | 'rootOverlayKey'
    >
  ): void {
    if (
      this.pollsRouteState.isSearchOverlay === nextState.isSearchOverlay &&
      this.pollsRouteState.isPersistentPollLane === nextState.isPersistentPollLane &&
      this.pollsRouteState.rootOverlayKey === nextState.rootOverlayKey
    ) {
      return;
    }
    this.pollsRouteState = {
      ...this.pollsRouteState,
      ...nextState,
    };
    this.recomputeAndPublish();
  }

  private setPollsPayloadState(
    nextState: Pick<
      AppRoutePollsRouteStateRuntime,
      'activePollsParams' | 'dockedPollsRestoreIntent'
    >
  ): void {
    if (
      this.pollsRouteState.activePollsParams === nextState.activePollsParams &&
      this.pollsRouteState.dockedPollsRestoreIntent === nextState.dockedPollsRestoreIntent
    ) {
      return;
    }
    this.pollsRouteState = {
      ...this.pollsRouteState,
      ...nextState,
    };
    this.recomputeAndPublish();
  }

  private setSceneLayout(nextSceneLayout: SearchRouteSceneLayoutState): void {
    if (this.sceneLayout === nextSceneLayout) {
      return;
    }
    this.sceneLayout = nextSceneLayout;
    this.recomputeAndPublish();
  }

  private setSheetSessionState(nextState: AppRouteSceneSheetSessionInputState): void {
    if (
      this.sheetSessionState.isDockedPollsDismissed === nextState.isDockedPollsDismissed
    ) {
      return;
    }
    this.sheetSessionState = nextState;
    this.recomputeAndPublish();
  }

  private setPollsSheetSnap(nextSnap: OverlaySheetSnap): void {
    if (this.pollsSheetSnap === nextSnap) {
      return;
    }
    this.pollsSheetSnap = nextSnap;
    this.recomputeAndPublish();
  }

  private setDynamicSceneInputRuntime(nextRuntime: AppRoutePollsDynamicSceneInputRuntime): void {
    if (
      areAppRoutePollsDynamicSceneInputRuntimesEqual(this.dynamicSceneInputRuntime, nextRuntime)
    ) {
      return;
    }
    this.dynamicSceneInputRuntime = nextRuntime;
    this.recomputeAndPublish();
  }

  private logPersistentPollRestoreStateContract(
    pollsSceneStateRuntime: SearchRoutePollsSceneStateRuntime
  ): void {
    if (
      !pollsSceneStateRuntime.visible ||
      !this.pollsRouteState.isPersistentPollLane ||
      pollsSceneStateRuntime.currentSnap !== 'collapsed'
    ) {
      return;
    }
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }
    logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
      event: 'persistent_polls_restore_state_contract',
      currentSnap: pollsSceneStateRuntime.currentSnap,
      hasDockedPollsRestoreIntent: this.pollsRouteState.dockedPollsRestoreIntent != null,
      restoreIntentSnap: this.pollsRouteState.dockedPollsRestoreIntent?.snap ?? null,
      restoredToCollapsed: true,
      visible: pollsSceneStateRuntime.visible,
    });
  }

  private recomputeAndPublish(): void {
    if (this.isDisposed) {
      return;
    }
    const pollsSceneStateRuntime = createSearchRoutePollsSceneStateRuntime({
      sceneLayout: this.sceneLayout,
      pollOverlayParams: this.pollsRouteState.activePollsParams ?? undefined,
      dockedPollsRestoreIntent: this.pollsRouteState.dockedPollsRestoreIntent,
      commandState: {
        pollsSheetSnap: this.pollsSheetSnap,
        isDockedPollsDismissed: this.sheetSessionState.isDockedPollsDismissed,
      },
      overlayVisibilityState: {
        isSearchOverlay: this.pollsRouteState.isSearchOverlay,
        isPersistentPollLane: this.pollsRouteState.isPersistentPollLane,
      },
      pollBounds: this.dynamicSceneInputRuntime.pollBounds,
      startupPollsSnapshot: this.dynamicSceneInputRuntime.startupPollsSnapshot,
      userLocation: this.dynamicSceneInputRuntime.userLocation,
      interactionRef: this.dynamicSceneInputRuntime.searchInteractionRef,
    });
    this.publishPollsSceneState({
      pollsSceneStateRuntime,
    });
    this.publishPollsSceneDescriptor(pollsSceneStateRuntime);
    this.logPersistentPollRestoreStateContract(pollsSceneStateRuntime);
    this.logDiagnostics(pollsSceneStateRuntime);
  }

  private publishPollsSceneState({
    pollsSceneStateRuntime,
  }: {
    pollsSceneStateRuntime: SearchRoutePollsSceneStateRuntime;
  }): void {
    const reactSceneState: AppRoutePollsSceneState = {
      visible: pollsSceneStateRuntime.visible,
      bounds: pollsSceneStateRuntime.bounds,
      bootstrapSnapshot: pollsSceneStateRuntime.bootstrapSnapshot,
      userLocation: pollsSceneStateRuntime.userLocation,
      params: pollsSceneStateRuntime.params,
      initialSnapPoint: pollsSceneStateRuntime.initialSnapPoint,
      mode: pollsSceneStateRuntime.mode,
      currentSnap: pollsSceneStateRuntime.currentSnap,
      navBarTop: pollsSceneStateRuntime.navBarTop,
      navBarHeight: pollsSceneStateRuntime.navBarHeight,
      searchBarTop: pollsSceneStateRuntime.searchBarTop,
      snapPoints: pollsSceneStateRuntime.snapPoints,
      onSnapChange: this.handlePollsSnapChange,
      onRequestPollCreationExpand: undefined,
      onRequestReturnToSearch: this.requestReturnToSearchFromPolls,
      interactionRef: pollsSceneStateRuntime.interactionRef,
    };

    this.routeSceneRuntime.routePollsSceneRuntime.sceneActions.publishSceneState(reactSceneState);
  }

  private publishPollsSceneDescriptor(
    pollsSceneStateRuntime: SearchRoutePollsSceneStateRuntime
  ): void {
    const resolvedDismissThreshold =
      pollsSceneStateRuntime.mode === 'docked'
        ? pollsSceneStateRuntime.snapPoints.collapsed + 1
        : pollsSceneStateRuntime.navBarTop > 0
        ? pollsSceneStateRuntime.navBarTop
        : undefined;
    const pollsShellSpec: AppRouteSceneStackShellSpec = normalizeSearchRouteSceneStackShellSpec({
      overlayKey: 'polls',
      snapPoints: pollsSceneStateRuntime.snapPoints,
      style: overlaySheetStyles.container,
      onSnapChange: this.handlePollsSnapChange,
      dismissThreshold: resolvedDismissThreshold,
      preventSwipeDismiss: pollsSceneStateRuntime.mode === 'overlay',
    });

    this.routeSceneRuntime.sceneInputLane.publishRouteSceneDescriptor({
      sceneKey: 'polls',
      shellSpec: pollsShellSpec,
      sceneChrome: POLLS_MOUNTED_SCENE_CHROME,
      sceneBodyContent: POLLS_MOUNTED_SCENE_BODY_CONTENT,
      sceneBodyTransport: POLLS_MOUNTED_SCENE_BODY_TRANSPORT,
      sceneBodyAdmissionPolicy: POLLS_MOUNTED_SCENE_BODY_ADMISSION_POLICY,
    });
  }

  private logDiagnostics(pollsSceneStateRuntime: SearchRoutePollsSceneStateRuntime): void {
    if (!shouldLogSearchNavSwitchDiagnosticLogs()) {
      this.lastDiagnosticsSnapshot = null;
      return;
    }
    const nextSnapshot = JSON.stringify({
      visible: pollsSceneStateRuntime.visible,
      mode: pollsSceneStateRuntime.mode,
      initialSnapPoint: pollsSceneStateRuntime.initialSnapPoint,
      currentSnap: pollsSceneStateRuntime.currentSnap,
      navBarTop: pollsSceneStateRuntime.navBarTop,
      navBarHeight: pollsSceneStateRuntime.navBarHeight,
      searchBarTop: pollsSceneStateRuntime.searchBarTop,
      snapPoints: pollsSceneStateRuntime.snapPoints,
    });

    if (this.lastDiagnosticsSnapshot === nextSnapshot) {
      return;
    }
    this.lastDiagnosticsSnapshot = nextSnapshot;
    logger.debug('[SEARCH-ROUTE-POLLS-GEOMETRY-DIAG]', JSON.parse(nextSnapshot));
  }
}

export const createAppRoutePollsSceneInputController = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): AppRoutePollsSceneInputController =>
  new AppRoutePollsSceneInputRuntimeController(routeSceneRuntime);
