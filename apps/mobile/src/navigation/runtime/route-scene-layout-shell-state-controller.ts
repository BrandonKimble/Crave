import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import type { RouteSceneLayoutFrameAuthority } from './route-scene-layout-frame-state-controller';

type Listener = () => void;

export type RouteSceneLayoutShellSnapshot = Pick<
  SearchRouteSceneLayoutState,
  'navBarHeight' | 'navBarTop' | 'searchBarTop'
> | null;

export type RouteSceneLayoutShellAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteSceneLayoutShellSnapshot;
};

const areRouteSceneLayoutShellsEqual = (
  left: RouteSceneLayoutShellSnapshot,
  right: RouteSceneLayoutShellSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.navBarHeight === right.navBarHeight &&
    left.navBarTop === right.navBarTop &&
    left.searchBarTop === right.searchBarTop);

const createRouteSceneLayoutShellSnapshot = (
  routeSceneLayoutFrameSnapshot: ReturnType<
    RouteSceneLayoutFrameAuthority['getSnapshot']
  >
): RouteSceneLayoutShellSnapshot =>
  routeSceneLayoutFrameSnapshot == null
    ? null
    : {
        navBarHeight: routeSceneLayoutFrameSnapshot.navBarHeight,
        navBarTop: routeSceneLayoutFrameSnapshot.navBarTop,
        searchBarTop: routeSceneLayoutFrameSnapshot.searchBarTop,
      };

export class RouteSceneLayoutShellStateController {
  private routeSceneLayoutFrameSnapshot: ReturnType<
    RouteSceneLayoutFrameAuthority['getSnapshot']
  >;

  private snapshot: RouteSceneLayoutShellSnapshot = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteSceneLayoutFrame: () => void;

  public readonly routeSceneLayoutShellAuthority: RouteSceneLayoutShellAuthority;

  constructor({
    routeSceneLayoutFrameAuthority,
  }: {
    routeSceneLayoutFrameAuthority: RouteSceneLayoutFrameAuthority;
  }) {
    this.routeSceneLayoutFrameSnapshot = routeSceneLayoutFrameAuthority.getSnapshot();
    this.routeSceneLayoutShellAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteSceneLayoutFrame =
      routeSceneLayoutFrameAuthority.subscribe(() => {
        this.setRouteSceneLayoutFrameSnapshot(
          routeSceneLayoutFrameAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteSceneLayoutFrame();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteSceneLayoutFrameSnapshot(
    routeSceneLayoutFrameSnapshot: ReturnType<
      RouteSceneLayoutFrameAuthority['getSnapshot']
    >
  ): void {
    if (this.routeSceneLayoutFrameSnapshot === routeSceneLayoutFrameSnapshot) {
      return;
    }
    this.routeSceneLayoutFrameSnapshot = routeSceneLayoutFrameSnapshot;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = createRouteSceneLayoutShellSnapshot(
      this.routeSceneLayoutFrameSnapshot
    );

    if (areRouteSceneLayoutShellsEqual(this.snapshot, nextSnapshot)) {
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

export const createRouteSceneLayoutShellStateController = ({
  routeSceneLayoutFrameAuthority,
}: ConstructorParameters<
  typeof RouteSceneLayoutShellStateController
>[0]): RouteSceneLayoutShellStateController =>
  new RouteSceneLayoutShellStateController({
    routeSceneLayoutFrameAuthority,
  });
