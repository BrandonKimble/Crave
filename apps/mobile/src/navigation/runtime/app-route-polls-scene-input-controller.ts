import {
  createSearchRoutePollsSceneStateRuntime,
  type SearchRoutePollsSceneStateRuntime,
} from '../../overlays/useSearchRoutePollsSceneStateRuntime';
import { overlaySheetStyles } from '../../overlays/overlaySheetStyles';
import { normalizeSearchRouteSceneStackShellSpec } from '../../overlays/searchOverlayRouteHostContract';
import {
  EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE,
  type SearchRouteSceneLayoutState,
} from '../../overlays/searchRouteSceneLayoutContract';
import type { OverlaySheetSnap } from '../../overlays/types';
import type { RouteOverlayRootSnapshot } from './route-overlay-display-snapshot-contract';
import type {
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from './app-route-scene-descriptor-contract';
import type {
  AppRoutePollsDynamicSceneInputRuntime,
  AppRoutePollsRouteStateRuntime,
} from './app-route-dynamic-scene-inputs-contract';
import {
  EMPTY_APP_ROUTE_DYNAMIC_SCENE_INPUT_RUNTIME,
  areAppRouteDynamicSceneInputRuntimesEqual,
} from './app-route-dynamic-scene-inputs-contract';
import type { AppRouteScenePayloadSnapshot } from './app-route-scene-switch-authority';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import type { AppRoutePollsSceneState } from './app-route-polls-scene-runtime';

type ListenerDisposer = () => void;

const POLLS_MOUNTED_SCENE_CHROME: AppRouteSceneChromePublication = {
  surfaceKind: 'mounted',
  mountedChromeKey: 'polls',
};

// Polls demotion (home-surface-charter Job 3): polls is a regular tab now — the
// navigation fact that matters is WHICH ROOT is active (the root survives child
// pushes, so the feed stays live under pollDetail). The docked-lane visibility
// subscription moved to the home controller with the docked seat itself.
// F1393/F1394: this used to also carry a hardcoded `isDockedLane: false` — its ONLY
// writer, forever false by the demotion above, driving a docked-scene-restore probe
// (`logDockedSceneRestoreStateContract`) that could never fire. Deleted with the field.
const selectPollsRouteNavigationState = (
  snapshot: RouteOverlayRootSnapshot
): Pick<AppRoutePollsRouteStateRuntime, 'isSearchOverlay' | 'rootOverlayKey'> => ({
  isSearchOverlay: snapshot.isSearchOverlay,
  rootOverlayKey: snapshot.rootOverlayKey,
});

const selectPollsPayloadState = (
  snapshot: AppRouteScenePayloadSnapshot
): Pick<AppRoutePollsRouteStateRuntime, 'activePollsParams' | 'dockedSceneRestoreIntent'> => ({
  activePollsParams: snapshot.activePollsParams,
  dockedSceneRestoreIntent: snapshot.activeDockedSceneRestoreIntent,
});

export type AppRoutePollsSceneInputController = {
  dispose: () => void;
};

class AppRoutePollsSceneInputRuntimeController implements AppRoutePollsSceneInputController {
  private readonly disposers: ListenerDisposer[] = [];

  private readonly requestReturnToSearchFromPolls = (): void => {
    // Two-posture law: leaving the polls page for home lands at HOME's remembered posture
    // (the verb derives the motion from the home seat; no forced collapsed). The old
    // docked-lane dismiss branch died with the demotion (home owns the docked lane).
    this.routeSceneRuntime.routeSearchCommandActions.returnAppSearchRouteToDockedSearch();
  };

  private pollsRouteState: AppRoutePollsRouteStateRuntime;

  private sceneLayout: SearchRouteSceneLayoutState;

  private pollsSheetSnap: OverlaySheetSnap;

  private dynamicSceneInputRuntime: AppRoutePollsDynamicSceneInputRuntime;

  private isDisposed = false;

  constructor(private readonly routeSceneRuntime: AppRouteSceneRuntime) {
    this.pollsRouteState = {
      ...selectPollsRouteNavigationState(routeSceneRuntime.routeOverlayRootAuthority.getSnapshot()),
      ...selectPollsPayloadState(routeSceneRuntime.scenePayloadAuthority.getSnapshot()),
    };
    this.sceneLayout =
      routeSceneRuntime.routeSceneLayoutAuthority.getSnapshot().routeSceneLayout ??
      EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE;
    this.pollsSheetSnap =
      routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls');
    this.dynamicSceneInputRuntime =
      routeSceneRuntime.routeDynamicSceneInputAuthority.getPollsRuntimeSnapshot() ??
      EMPTY_APP_ROUTE_DYNAMIC_SCENE_INPUT_RUNTIME;

    this.disposers.push(
      routeSceneRuntime.routeOverlayRootAuthority.registerTarget({
        attributionLabel: 'AppRoutePollsSceneInputRootOverlay',
        syncRootSnapshot: (snapshot) => {
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
      // F1394: this used to also call setSheetSessionState here — `sheetSessionState` was
      // read ONLY by its own dedup check (never by recomputeAndPublish), so every
      // isDockedSceneDismissed flip forced a full recompute + republish that could not
      // change any output. Deleted with the field.
      routeSceneRuntime.routeSheetSnapSessionAuthority.subscribe(() => {
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
    nextState: Pick<AppRoutePollsRouteStateRuntime, 'isSearchOverlay' | 'rootOverlayKey'>
  ): void {
    if (
      this.pollsRouteState.isSearchOverlay === nextState.isSearchOverlay &&
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
      'activePollsParams' | 'dockedSceneRestoreIntent'
    >
  ): void {
    if (
      this.pollsRouteState.activePollsParams === nextState.activePollsParams &&
      this.pollsRouteState.dockedSceneRestoreIntent === nextState.dockedSceneRestoreIntent
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

  private setPollsSheetSnap(nextSnap: OverlaySheetSnap): void {
    if (this.pollsSheetSnap === nextSnap) {
      return;
    }
    this.pollsSheetSnap = nextSnap;
    this.recomputeAndPublish();
  }

  private setDynamicSceneInputRuntime(nextRuntime: AppRoutePollsDynamicSceneInputRuntime): void {
    if (
      areAppRouteDynamicSceneInputRuntimesEqual(this.dynamicSceneInputRuntime, nextRuntime)
    ) {
      return;
    }
    this.dynamicSceneInputRuntime = nextRuntime;
    this.recomputeAndPublish();
  }

  private recomputeAndPublish(): void {
    if (this.isDisposed) {
      return;
    }
    const pollsSceneStateRuntime = createSearchRoutePollsSceneStateRuntime({
      sceneLayout: this.sceneLayout,
      pollOverlayParams: this.pollsRouteState.activePollsParams ?? undefined,
      dockedSceneRestoreIntent: this.pollsRouteState.dockedSceneRestoreIntent,
      commandState: {
        pollsSheetSnap: this.pollsSheetSnap,
      },
      overlayVisibilityState: {
        isPollsRoot: this.pollsRouteState.rootOverlayKey === 'polls',
      },
      interactionRef: this.dynamicSceneInputRuntime.searchInteractionRef,
    });
    this.publishPollsSceneState({
      pollsSceneStateRuntime,
    });
    this.publishPollsSceneDescriptor(pollsSceneStateRuntime);
  }

  private publishPollsSceneState({
    pollsSceneStateRuntime,
  }: {
    pollsSceneStateRuntime: SearchRoutePollsSceneStateRuntime;
  }): void {
    const reactSceneState: AppRoutePollsSceneState = {
      visible: pollsSceneStateRuntime.visible,
      params: pollsSceneStateRuntime.params,
      initialSnapPoint: pollsSceneStateRuntime.initialSnapPoint,
      mode: pollsSceneStateRuntime.mode,
      currentSnap: pollsSceneStateRuntime.currentSnap,
      navBarTop: pollsSceneStateRuntime.navBarTop,
      navBarHeight: pollsSceneStateRuntime.navBarHeight,
      searchBarTop: pollsSceneStateRuntime.searchBarTop,
      snapPoints: pollsSceneStateRuntime.snapPoints,
      onRequestPollCreationExpand: undefined,
      // CURRENTLY UNWIRED (2026-07-02): the polls grab-handle used to invoke this in overlay mode,
      // but the grab-handle tap is now the shared promote-to-middle (owner req: dismiss ONLY from
      // the close X, and polls-as-home has no close). The programmatic path is KEPT intact pending
      // the owner's dismiss-model decision — if overlay-mode polls should regain a return-to-map
      // affordance, wire this to a control; the handler + dismissDockedScene path still work.
      onRequestReturnToSearch: this.requestReturnToSearchFromPolls,
      interactionRef: pollsSceneStateRuntime.interactionRef,
    };

    this.routeSceneRuntime.routePollsSceneRuntime.sceneActions.publishSceneState(reactSceneState);
  }

  private publishPollsSceneDescriptor(
    pollsSceneStateRuntime: SearchRoutePollsSceneStateRuntime
  ): void {
    const pollsShellSpec: AppRouteSceneStackShellSpec = normalizeSearchRouteSceneStackShellSpec({
      overlayKey: 'polls',
      snapPoints: pollsSceneStateRuntime.snapPoints,
      style: overlaySheetStyles.container,
    });

    // Shell + chrome only — the polls feed body is published as a `'list'`
    // surface by useAppRoutePollsSceneInputWriterRuntime (the gesture-aware
    // results-sheet surface). Keeping them on separate lane fields avoids any
    // last-writer-wins race between this controller and the React body writer.
    this.routeSceneRuntime.sceneInputLane.publishRouteSceneShell({
      sceneKey: 'polls',
      shellSpec: pollsShellSpec,
    });
    this.routeSceneRuntime.sceneInputLane.publishRouteSceneChrome({
      sceneKey: 'polls',
      sceneChrome: POLLS_MOUNTED_SCENE_CHROME,
    });
  }
}

export const createAppRoutePollsSceneInputController = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): AppRoutePollsSceneInputController =>
  new AppRoutePollsSceneInputRuntimeController(routeSceneRuntime);
