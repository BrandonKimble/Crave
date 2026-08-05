import { overlaySheetStyles } from '../../overlays/overlaySheetStyles';
import { normalizeSearchRouteSceneStackShellSpec } from '../../overlays/searchOverlayRouteHostContract';
import {
  EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE,
  type SearchRouteSceneLayoutState,
} from '../../overlays/searchRouteSceneLayoutContract';
import type { OverlaySheetSnap } from '../../overlays/types';
import { useHomeSceneStateStore } from '../../overlays/panels/runtime/home-feed-store';
import type { RouteOverlayDockedSceneVisibilitySnapshot } from './route-overlay-display-snapshot-contract';
import type {
  AppRouteSceneChromePublication,
  AppRouteSceneStackShellSpec,
} from './app-route-scene-descriptor-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';

type ListenerDisposer = () => void;

/**
 * THE home scene-input controller (home-surface-charter): the docked lane's
 * hybrid publisher for 'home' — shell + chrome publications (the polls
 * controller's pattern, minus the polls-only scene-state runtime). The home
 * BODY is a `'list'` surface published by useAppRouteHomeSceneInputWriterRuntime
 * (separate lane fields — no last-writer-wins race). The controller also
 * derives the docked-visibility fact the body's data gate reads (the
 * home-scene-state store): visible ⟺ the docked lane presents home and the
 * sheet is neither dismissed nor physically hidden — byte-for-byte the old
 * polls-as-docked visibility law.
 */
const HOME_MOUNTED_SCENE_CHROME: AppRouteSceneChromePublication = {
  surfaceKind: 'mounted',
  mountedChromeKey: 'home',
};

class AppRouteHomeSceneInputRuntimeController {
  private readonly disposers: ListenerDisposer[] = [];

  private sceneLayout: SearchRouteSceneLayoutState;

  private dockedVisibility: RouteOverlayDockedSceneVisibilitySnapshot;

  private homeSheetSnap: OverlaySheetSnap;

  private isDockedSceneDismissed: boolean;

  private hasDockedSceneRestoreIntent: boolean;

  private restoreIntentSnap: OverlaySheetSnap | null;

  private isDisposed = false;

  constructor(private readonly routeSceneRuntime: AppRouteSceneRuntime) {
    this.sceneLayout =
      routeSceneRuntime.routeSceneLayoutAuthority.getSnapshot().routeSceneLayout ??
      EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE;
    this.dockedVisibility =
      routeSceneRuntime.routeOverlayDockedSceneVisibilityAuthority.getSnapshot();
    this.homeSheetSnap =
      routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('home');
    const snapSession = routeSceneRuntime.routeSheetSnapSessionAuthority.getSnapshot();
    this.isDockedSceneDismissed = snapSession.isDockedSceneDismissed;
    const restoreIntent =
      routeSceneRuntime.scenePayloadAuthority.getSnapshot().activeDockedSceneRestoreIntent;
    this.hasDockedSceneRestoreIntent = restoreIntent != null;
    this.restoreIntentSnap = restoreIntent?.snap ?? null;

    this.disposers.push(
      routeSceneRuntime.routeOverlayDockedSceneVisibilityAuthority.registerTarget({
        attributionLabel: 'AppRouteHomeSceneInputDockedSceneVisibility',
        syncDockedSceneVisibilitySnapshot: (snapshot) => {
          if (
            this.dockedVisibility.isSearchOverlay === snapshot.isSearchOverlay &&
            this.dockedVisibility.isDockedLane === snapshot.isDockedLane
          ) {
            return;
          }
          this.dockedVisibility = snapshot;
          this.recomputeAndPublish();
        },
      }),
      routeSceneRuntime.scenePayloadAuthority.subscribe(() => {
        const nextIntent =
          routeSceneRuntime.scenePayloadAuthority.getSnapshot().activeDockedSceneRestoreIntent;
        const hasIntent = nextIntent != null;
        const intentSnap = nextIntent?.snap ?? null;
        if (
          this.hasDockedSceneRestoreIntent === hasIntent &&
          this.restoreIntentSnap === intentSnap
        ) {
          return;
        }
        this.hasDockedSceneRestoreIntent = hasIntent;
        this.restoreIntentSnap = intentSnap;
        this.recomputeAndPublish();
      }, 'AppRouteHomeSceneInputController'),
      routeSceneRuntime.routeSceneLayoutAuthority.subscribe(() => {
        const nextLayout =
          routeSceneRuntime.routeSceneLayoutAuthority.getSnapshot().routeSceneLayout ??
          EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE;
        if (this.sceneLayout === nextLayout) {
          return;
        }
        this.sceneLayout = nextLayout;
        this.recomputeAndPublish();
      }),
      routeSceneRuntime.routeSheetSnapSessionAuthority.subscribe(() => {
        const snapshot = routeSceneRuntime.routeSheetSnapSessionAuthority.getSnapshot();
        const nextSnap =
          routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('home');
        if (
          this.isDockedSceneDismissed === snapshot.isDockedSceneDismissed &&
          this.homeSheetSnap === nextSnap
        ) {
          return;
        }
        this.isDockedSceneDismissed = snapshot.isDockedSceneDismissed;
        this.homeSheetSnap = nextSnap;
        this.recomputeAndPublish();
      })
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
    this.routeSceneRuntime.sceneInputLane.clearRouteSceneInput('home');
  }

  private recomputeAndPublish(): void {
    if (this.isDisposed) {
      return;
    }
    // Visibility law (the old polls-as-docked calc, re-homed): a live restore
    // intent presents even while the physical snap is still 'hidden'.
    const isDockedLane =
      this.dockedVisibility.isSearchOverlay && this.dockedVisibility.isDockedLane;
    const visible =
      isDockedLane &&
      (this.hasDockedSceneRestoreIntent ||
        (!this.isDockedSceneDismissed && this.homeSheetSnap !== 'hidden'));
    useHomeSceneStateStore.getState().setSceneState({ visible });

    const homeShellSpec: AppRouteSceneStackShellSpec = normalizeSearchRouteSceneStackShellSpec({
      overlayKey: 'home',
      snapPoints: this.sceneLayout.snapPoints,
      style: overlaySheetStyles.container,
    });
    this.routeSceneRuntime.sceneInputLane.publishRouteSceneShell({
      sceneKey: 'home',
      shellSpec: homeShellSpec,
    });
    this.routeSceneRuntime.sceneInputLane.publishRouteSceneChrome({
      sceneKey: 'home',
      sceneChrome: HOME_MOUNTED_SCENE_CHROME,
    });
  }
}

export type AppRouteHomeSceneInputController = {
  dispose: () => void;
};

export const createAppRouteHomeSceneInputController = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): AppRouteHomeSceneInputController =>
  new AppRouteHomeSceneInputRuntimeController(routeSceneRuntime);
