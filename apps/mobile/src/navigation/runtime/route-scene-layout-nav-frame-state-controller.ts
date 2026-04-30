import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import type { RouteHostVisualRuntime } from './route-host-visual-runtime-state-controller';

type Listener = () => void;

export type RouteSceneLayoutNavFrameSnapshot = Pick<
  SearchRouteSceneLayoutState,
  'navBarHeight' | 'navBarTop'
> | null;

export type RouteSceneLayoutNavFrameAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteSceneLayoutNavFrameSnapshot;
};

const areRouteSceneLayoutNavFramesEqual = (
  left: RouteSceneLayoutNavFrameSnapshot,
  right: RouteSceneLayoutNavFrameSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.navBarHeight === right.navBarHeight &&
    left.navBarTop === right.navBarTop);

const resolveRouteSceneLayoutNavFrameSnapshot = (
  routeHostVisualRuntime: RouteHostVisualRuntime
): RouteSceneLayoutNavFrameSnapshot =>
  routeHostVisualRuntime == null
    ? null
    : {
        navBarHeight: routeHostVisualRuntime.navBarHeight,
        navBarTop: routeHostVisualRuntime.navBarTop,
      };

export class RouteSceneLayoutNavFrameStateController {
  private routeHostVisualRuntime: RouteHostVisualRuntime;

  private snapshot: RouteSceneLayoutNavFrameSnapshot = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteHostVisualRuntime: () => void;

  public readonly routeSceneLayoutNavFrameAuthority: RouteSceneLayoutNavFrameAuthority;

  constructor({
    routeHostVisualRuntimeAuthority,
  }: {
    routeHostVisualRuntimeAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostVisualRuntime;
    };
  }) {
    this.routeHostVisualRuntime = routeHostVisualRuntimeAuthority.getSnapshot();
    this.routeSceneLayoutNavFrameAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteHostVisualRuntime =
      routeHostVisualRuntimeAuthority.subscribe(() => {
        this.setRouteHostVisualRuntime(
          routeHostVisualRuntimeAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteHostVisualRuntime();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteHostVisualRuntime(
    routeHostVisualRuntime: RouteHostVisualRuntime
  ): void {
    if (this.routeHostVisualRuntime === routeHostVisualRuntime) {
      return;
    }
    this.routeHostVisualRuntime = routeHostVisualRuntime;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = resolveRouteSceneLayoutNavFrameSnapshot(
      this.routeHostVisualRuntime
    );

    if (areRouteSceneLayoutNavFramesEqual(this.snapshot, nextSnapshot)) {
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

export const createRouteSceneLayoutNavFrameStateController = ({
  routeHostVisualRuntimeAuthority,
}: ConstructorParameters<
  typeof RouteSceneLayoutNavFrameStateController
>[0]): RouteSceneLayoutNavFrameStateController =>
  new RouteSceneLayoutNavFrameStateController({
    routeHostVisualRuntimeAuthority,
  });
