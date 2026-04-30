import type { RouteHostVisualRuntime } from '../../../../navigation/runtime/route-host-visual-runtime-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantRouteMotionFrameSnapshot = {
  visualRuntime: NonNullable<RouteHostVisualRuntime>;
} | null;

export type SearchOverlayLocalRestaurantRouteMotionFrameAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantRouteMotionFrameSnapshot;
};

const resolveMotionFrameSnapshot = (
  routeHostVisualRuntime: RouteHostVisualRuntime
): SearchOverlayLocalRestaurantRouteMotionFrameSnapshot =>
  routeHostVisualRuntime == null
    ? null
    : {
        visualRuntime: routeHostVisualRuntime,
      };

const areMotionFrameSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantRouteMotionFrameSnapshot,
  right: SearchOverlayLocalRestaurantRouteMotionFrameSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.visualRuntime === right.visualRuntime);

export class SearchOverlayLocalRestaurantRouteMotionFrameStateController {
  private routeHostVisualRuntime: RouteHostVisualRuntime;

  private snapshot: SearchOverlayLocalRestaurantRouteMotionFrameSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteHostVisualRuntime: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantRouteMotionFrameAuthority;

  constructor({
    routeHostVisualRuntimeAuthority,
  }: {
    routeHostVisualRuntimeAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostVisualRuntime;
    };
  }) {
    this.routeHostVisualRuntime = routeHostVisualRuntimeAuthority.getSnapshot();
    this.snapshot = resolveMotionFrameSnapshot(this.routeHostVisualRuntime);
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
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
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = resolveMotionFrameSnapshot(this.routeHostVisualRuntime);

    if (areMotionFrameSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantRouteMotionFrameStateController =
  ({
    routeHostVisualRuntimeAuthority,
  }: ConstructorParameters<
    typeof SearchOverlayLocalRestaurantRouteMotionFrameStateController
  >[0]): SearchOverlayLocalRestaurantRouteMotionFrameStateController =>
    new SearchOverlayLocalRestaurantRouteMotionFrameStateController({
      routeHostVisualRuntimeAuthority,
    });
