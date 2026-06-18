import type { RouteHostOverlayGeometryBinding } from '../../../../navigation/runtime/route-host-overlay-geometry-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantRouteGeometryFrameSnapshot = {
  overlayGeometryRuntime: NonNullable<RouteHostOverlayGeometryBinding>;
} | null;

export type SearchOverlayLocalRestaurantRouteGeometryFrameAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantRouteGeometryFrameSnapshot;
};

const resolveGeometryFrameSnapshot = (
  routeHostOverlayGeometry: RouteHostOverlayGeometryBinding
): SearchOverlayLocalRestaurantRouteGeometryFrameSnapshot =>
  routeHostOverlayGeometry == null
    ? null
    : {
        overlayGeometryRuntime: routeHostOverlayGeometry,
      };

const areGeometryFrameSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantRouteGeometryFrameSnapshot,
  right: SearchOverlayLocalRestaurantRouteGeometryFrameSnapshot
): boolean =>
  left === right ||
  (left != null && right != null && left.overlayGeometryRuntime === right.overlayGeometryRuntime);

export class SearchOverlayLocalRestaurantRouteGeometryFrameStateController {
  private routeHostOverlayGeometry: RouteHostOverlayGeometryBinding;

  private snapshot: SearchOverlayLocalRestaurantRouteGeometryFrameSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteHostOverlayGeometry: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantRouteGeometryFrameAuthority;

  constructor({
    routeHostOverlayGeometryAuthority,
  }: {
    routeHostOverlayGeometryAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostOverlayGeometryBinding;
    };
  }) {
    this.routeHostOverlayGeometry = routeHostOverlayGeometryAuthority.getSnapshot();
    this.snapshot = resolveGeometryFrameSnapshot(this.routeHostOverlayGeometry);
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribeRouteHostOverlayGeometry = routeHostOverlayGeometryAuthority.subscribe(() => {
      this.setRouteHostOverlayGeometry(routeHostOverlayGeometryAuthority.getSnapshot());
    });
  }

  public dispose(): void {
    this.unsubscribeRouteHostOverlayGeometry();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteHostOverlayGeometry(
    routeHostOverlayGeometry: RouteHostOverlayGeometryBinding
  ): void {
    if (this.routeHostOverlayGeometry === routeHostOverlayGeometry) {
      return;
    }
    this.routeHostOverlayGeometry = routeHostOverlayGeometry;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = resolveGeometryFrameSnapshot(this.routeHostOverlayGeometry);

    if (areGeometryFrameSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantRouteGeometryFrameStateController = ({
  routeHostOverlayGeometryAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantRouteGeometryFrameStateController
>[0]): SearchOverlayLocalRestaurantRouteGeometryFrameStateController =>
  new SearchOverlayLocalRestaurantRouteGeometryFrameStateController({
    routeHostOverlayGeometryAuthority,
  });
