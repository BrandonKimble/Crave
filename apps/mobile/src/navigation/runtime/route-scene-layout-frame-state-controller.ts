import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import type {
  RouteSceneLayoutNavFrameAuthority,
  RouteSceneLayoutNavFrameSnapshot,
} from './route-scene-layout-nav-frame-state-controller';
import type {
  RouteSceneLayoutSearchBarFrameAuthority,
  RouteSceneLayoutSearchBarFrameSnapshot,
} from './route-scene-layout-search-bar-frame-state-controller';

type Listener = () => void;

export type RouteSceneLayoutFrameSnapshot = Pick<
  SearchRouteSceneLayoutState,
  'navBarHeight' | 'navBarTop' | 'searchBarTop'
> | null;

export type RouteSceneLayoutFrameAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteSceneLayoutFrameSnapshot;
};

const areRouteSceneLayoutFramesEqual = (
  left: RouteSceneLayoutFrameSnapshot,
  right: RouteSceneLayoutFrameSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.navBarHeight === right.navBarHeight &&
    left.navBarTop === right.navBarTop &&
    left.searchBarTop === right.searchBarTop);

const resolveRouteSceneLayoutFrameSnapshot = ({
  routeSceneLayoutNavFrameSnapshot,
  routeSceneLayoutSearchBarFrameSnapshot,
}: {
  routeSceneLayoutNavFrameSnapshot: RouteSceneLayoutNavFrameSnapshot;
  routeSceneLayoutSearchBarFrameSnapshot: RouteSceneLayoutSearchBarFrameSnapshot;
}): RouteSceneLayoutFrameSnapshot =>
  routeSceneLayoutNavFrameSnapshot == null ||
  routeSceneLayoutSearchBarFrameSnapshot == null
    ? null
    : {
        navBarHeight: routeSceneLayoutNavFrameSnapshot.navBarHeight,
        navBarTop: routeSceneLayoutNavFrameSnapshot.navBarTop,
        searchBarTop: routeSceneLayoutSearchBarFrameSnapshot.searchBarTop,
      };

export class RouteSceneLayoutFrameStateController {
  private routeSceneLayoutNavFrameSnapshot: RouteSceneLayoutNavFrameSnapshot;

  private routeSceneLayoutSearchBarFrameSnapshot: RouteSceneLayoutSearchBarFrameSnapshot;

  private snapshot: RouteSceneLayoutFrameSnapshot = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteSceneLayoutNavFrame: () => void;

  private readonly unsubscribeRouteSceneLayoutSearchBarFrame: () => void;

  public readonly routeSceneLayoutFrameAuthority: RouteSceneLayoutFrameAuthority;

  constructor({
    routeSceneLayoutNavFrameAuthority,
    routeSceneLayoutSearchBarFrameAuthority,
  }: {
    routeSceneLayoutNavFrameAuthority: RouteSceneLayoutNavFrameAuthority;
    routeSceneLayoutSearchBarFrameAuthority: RouteSceneLayoutSearchBarFrameAuthority;
  }) {
    this.routeSceneLayoutNavFrameSnapshot =
      routeSceneLayoutNavFrameAuthority.getSnapshot();
    this.routeSceneLayoutSearchBarFrameSnapshot =
      routeSceneLayoutSearchBarFrameAuthority.getSnapshot();
    this.routeSceneLayoutFrameAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteSceneLayoutNavFrame =
      routeSceneLayoutNavFrameAuthority.subscribe(() => {
        this.setRouteSceneLayoutNavFrameSnapshot(
          routeSceneLayoutNavFrameAuthority.getSnapshot()
        );
      });
    this.unsubscribeRouteSceneLayoutSearchBarFrame =
      routeSceneLayoutSearchBarFrameAuthority.subscribe(() => {
        this.setRouteSceneLayoutSearchBarFrameSnapshot(
          routeSceneLayoutSearchBarFrameAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteSceneLayoutSearchBarFrame();
    this.unsubscribeRouteSceneLayoutNavFrame();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteSceneLayoutNavFrameSnapshot(
    routeSceneLayoutNavFrameSnapshot: RouteSceneLayoutNavFrameSnapshot
  ): void {
    if (this.routeSceneLayoutNavFrameSnapshot === routeSceneLayoutNavFrameSnapshot) {
      return;
    }
    this.routeSceneLayoutNavFrameSnapshot = routeSceneLayoutNavFrameSnapshot;
    this.recompute(true);
  }

  private setRouteSceneLayoutSearchBarFrameSnapshot(
    routeSceneLayoutSearchBarFrameSnapshot: RouteSceneLayoutSearchBarFrameSnapshot
  ): void {
    if (
      this.routeSceneLayoutSearchBarFrameSnapshot ===
      routeSceneLayoutSearchBarFrameSnapshot
    ) {
      return;
    }
    this.routeSceneLayoutSearchBarFrameSnapshot =
      routeSceneLayoutSearchBarFrameSnapshot;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = resolveRouteSceneLayoutFrameSnapshot({
      routeSceneLayoutNavFrameSnapshot: this.routeSceneLayoutNavFrameSnapshot,
      routeSceneLayoutSearchBarFrameSnapshot:
        this.routeSceneLayoutSearchBarFrameSnapshot,
    });

    if (areRouteSceneLayoutFramesEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;

    if (!notify) {
      return;
    }

    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createRouteSceneLayoutFrameStateController = ({
  routeSceneLayoutNavFrameAuthority,
  routeSceneLayoutSearchBarFrameAuthority,
}: ConstructorParameters<typeof RouteSceneLayoutFrameStateController>[0]): RouteSceneLayoutFrameStateController =>
  new RouteSceneLayoutFrameStateController({
    routeSceneLayoutNavFrameAuthority,
    routeSceneLayoutSearchBarFrameAuthority,
  });
