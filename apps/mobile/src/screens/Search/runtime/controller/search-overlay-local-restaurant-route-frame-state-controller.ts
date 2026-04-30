import type { RouteHostOverlayGeometryBinding } from '../../../../navigation/runtime/route-host-overlay-geometry-state-controller';
import type { RouteHostVisualRuntime } from '../../../../navigation/runtime/route-host-visual-runtime-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantRouteFrameSnapshot = {
  overlayGeometryRuntime: NonNullable<RouteHostOverlayGeometryBinding>;
  visualRuntime: NonNullable<RouteHostVisualRuntime>;
} | null;

export type SearchOverlayLocalRestaurantRouteFrameAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantRouteFrameSnapshot;
};

const resolveLocalRestaurantRouteFrameSnapshot = ({
  routeHostOverlayGeometry,
  routeHostVisualRuntime,
}: {
  routeHostOverlayGeometry: RouteHostOverlayGeometryBinding;
  routeHostVisualRuntime: RouteHostVisualRuntime;
}): SearchOverlayLocalRestaurantRouteFrameSnapshot =>
  routeHostOverlayGeometry == null || routeHostVisualRuntime == null
    ? null
    : {
        overlayGeometryRuntime: routeHostOverlayGeometry,
        visualRuntime: routeHostVisualRuntime,
      };

export class SearchOverlayLocalRestaurantRouteFrameStateController {
  private routeHostOverlayGeometry: RouteHostOverlayGeometryBinding;

  private routeHostVisualRuntime: RouteHostVisualRuntime;

  private snapshot: SearchOverlayLocalRestaurantRouteFrameSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantRouteFrameAuthority;

  constructor({
    routeHostOverlayGeometryAuthority,
    routeHostVisualRuntimeAuthority,
  }: {
    routeHostOverlayGeometryAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostOverlayGeometryBinding;
    };
    routeHostVisualRuntimeAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostVisualRuntime;
    };
  }) {
    this.routeHostOverlayGeometry = routeHostOverlayGeometryAuthority.getSnapshot();
    this.routeHostVisualRuntime = routeHostVisualRuntimeAuthority.getSnapshot();
    this.snapshot = resolveLocalRestaurantRouteFrameSnapshot({
      routeHostOverlayGeometry: this.routeHostOverlayGeometry,
      routeHostVisualRuntime: this.routeHostVisualRuntime,
    });
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribers.push(
      routeHostOverlayGeometryAuthority.subscribe(() => {
        this.setRouteHostOverlayGeometry(
          routeHostOverlayGeometryAuthority.getSnapshot()
        );
      }),
      routeHostVisualRuntimeAuthority.subscribe(() => {
        this.setRouteHostVisualRuntime(
          routeHostVisualRuntimeAuthority.getSnapshot()
        );
      })
    );
  }

  public dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers.length = 0;
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
    const nextSnapshot = resolveLocalRestaurantRouteFrameSnapshot({
      routeHostOverlayGeometry: this.routeHostOverlayGeometry,
      routeHostVisualRuntime: this.routeHostVisualRuntime,
    });

    if (this.snapshot === nextSnapshot) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantRouteFrameStateController = ({
  routeHostOverlayGeometryAuthority,
  routeHostVisualRuntimeAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantRouteFrameStateController
>[0]): SearchOverlayLocalRestaurantRouteFrameStateController =>
  new SearchOverlayLocalRestaurantRouteFrameStateController({
    routeHostOverlayGeometryAuthority,
    routeHostVisualRuntimeAuthority,
  });
