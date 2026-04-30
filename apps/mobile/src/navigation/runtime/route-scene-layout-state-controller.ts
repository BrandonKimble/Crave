import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import {
  EMPTY_ROUTE_SCENE_LAYOUT_SNAPSHOT,
  type RouteSceneLayoutSnapshot,
} from '../../screens/Search/runtime/shared/route-scene-layout-snapshot-contract';
import type {
  RouteSceneLayoutSheetAuthority,
  RouteSceneLayoutSheetSnapshot,
} from './route-scene-layout-sheet-state-controller';
import type {
  RouteSceneLayoutShellAuthority,
  RouteSceneLayoutShellSnapshot,
} from './route-scene-layout-shell-state-controller';

type OutputAuthority<TSnapshot> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TSnapshot;
};

type Listener = () => void;

export type RouteSceneLayoutAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RouteSceneLayoutSnapshot;
};

const areRouteSceneLayoutsEqual = (
  left: SearchRouteSceneLayoutState | null,
  right: SearchRouteSceneLayoutState | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.navBarHeight === right.navBarHeight &&
    left.navBarTop === right.navBarTop &&
    left.searchBarTop === right.searchBarTop &&
    left.snapPoints.expanded === right.snapPoints.expanded &&
    left.snapPoints.middle === right.snapPoints.middle &&
    left.snapPoints.collapsed === right.snapPoints.collapsed &&
    left.snapPoints.hidden === right.snapPoints.hidden);

const areRouteSceneLayoutSnapshotsEqual = (
  left: RouteSceneLayoutSnapshot,
  right: RouteSceneLayoutSnapshot
): boolean => areRouteSceneLayoutsEqual(left.routeSceneLayout, right.routeSceneLayout);

const createRouteSceneLayoutSnapshot = ({
  routeSceneLayoutShellSnapshot,
  routeSceneLayoutSheetSnapshot,
}: {
  routeSceneLayoutShellSnapshot: RouteSceneLayoutShellSnapshot;
  routeSceneLayoutSheetSnapshot: RouteSceneLayoutSheetSnapshot;
}): RouteSceneLayoutSnapshot => ({
  routeSceneLayout:
    routeSceneLayoutShellSnapshot == null ||
    routeSceneLayoutSheetSnapshot == null
      ? null
      : {
          navBarHeight: routeSceneLayoutShellSnapshot.navBarHeight,
          navBarTop: routeSceneLayoutShellSnapshot.navBarTop,
          searchBarTop: routeSceneLayoutShellSnapshot.searchBarTop,
          snapPoints: routeSceneLayoutSheetSnapshot.snapPoints,
        },
});

export class RouteSceneLayoutStateController {
  private routeSceneLayoutShellSnapshot: RouteSceneLayoutShellSnapshot;

  private routeSceneLayoutSheetSnapshot: RouteSceneLayoutSheetSnapshot;

  private routeSceneLayoutSnapshot: RouteSceneLayoutSnapshot =
    EMPTY_ROUTE_SCENE_LAYOUT_SNAPSHOT;

  private readonly sceneLayoutListeners = new Set<Listener>();

  private readonly unsubscribeRouteSceneLayoutShell: () => void;

  private readonly unsubscribeRouteSceneLayoutSheet: () => void;

  public readonly routeSceneLayoutAuthority: RouteSceneLayoutAuthority;

  constructor({
    routeSceneLayoutShellAuthority,
    routeSceneLayoutSheetAuthority,
  }: {
    routeSceneLayoutShellAuthority: OutputAuthority<RouteSceneLayoutShellSnapshot>;
    routeSceneLayoutSheetAuthority: OutputAuthority<RouteSceneLayoutSheetSnapshot>;
  }) {
    this.routeSceneLayoutShellSnapshot = routeSceneLayoutShellAuthority.getSnapshot();
    this.routeSceneLayoutSheetSnapshot =
      routeSceneLayoutSheetAuthority.getSnapshot();
    this.routeSceneLayoutAuthority = {
      subscribe: (listener) => this.subscribeTo(listener),
      getSnapshot: () => this.routeSceneLayoutSnapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteSceneLayoutShell =
      routeSceneLayoutShellAuthority.subscribe(() => {
        this.setRouteSceneLayoutShellSnapshot(
          routeSceneLayoutShellAuthority.getSnapshot()
        );
      });
    this.unsubscribeRouteSceneLayoutSheet =
      routeSceneLayoutSheetAuthority.subscribe(() => {
        this.setRouteSceneLayoutSheetSnapshot(
          routeSceneLayoutSheetAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteSceneLayoutSheet();
    this.unsubscribeRouteSceneLayoutShell();
    this.sceneLayoutListeners.clear();
  }

  private subscribeTo(listener: Listener): () => void {
    this.sceneLayoutListeners.add(listener);
    return () => {
      this.sceneLayoutListeners.delete(listener);
    };
  }

  private setRouteSceneLayoutShellSnapshot(
    routeSceneLayoutShellSnapshot: RouteSceneLayoutShellSnapshot
  ): void {
    if (this.routeSceneLayoutShellSnapshot === routeSceneLayoutShellSnapshot) {
      return;
    }
    this.routeSceneLayoutShellSnapshot = routeSceneLayoutShellSnapshot;
    this.recompute(true);
  }

  private setRouteSceneLayoutSheetSnapshot(
    routeSceneLayoutSheetSnapshot: RouteSceneLayoutSheetSnapshot
  ): void {
    if (this.routeSceneLayoutSheetSnapshot === routeSceneLayoutSheetSnapshot) {
      return;
    }
    this.routeSceneLayoutSheetSnapshot = routeSceneLayoutSheetSnapshot;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextRouteSceneLayoutSnapshot = createRouteSceneLayoutSnapshot({
      routeSceneLayoutShellSnapshot: this.routeSceneLayoutShellSnapshot,
      routeSceneLayoutSheetSnapshot: this.routeSceneLayoutSheetSnapshot,
    });

    if (
      areRouteSceneLayoutSnapshotsEqual(
        this.routeSceneLayoutSnapshot,
        nextRouteSceneLayoutSnapshot
      )
    ) {
      return;
    }

    this.routeSceneLayoutSnapshot = nextRouteSceneLayoutSnapshot;

    if (!notify) {
      return;
    }

    this.sceneLayoutListeners.forEach((listener) => listener());
  }
}

export const createRouteSceneLayoutStateController = ({
  routeSceneLayoutShellAuthority,
  routeSceneLayoutSheetAuthority,
}: {
  routeSceneLayoutShellAuthority: OutputAuthority<RouteSceneLayoutShellSnapshot>;
  routeSceneLayoutSheetAuthority: OutputAuthority<RouteSceneLayoutSheetSnapshot>;
}): RouteSceneLayoutStateController =>
  new RouteSceneLayoutStateController({
    routeSceneLayoutShellAuthority,
    routeSceneLayoutSheetAuthority,
  });
