import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import type { RouteHostOverlayGeometryBinding } from './route-host-overlay-geometry-state-controller';

type Listener = () => void;

export type RouteSceneLayoutSearchBarFrameSnapshot = Pick<
  SearchRouteSceneLayoutState,
  'searchBarTop'
> | null;

export type RouteSceneLayoutSearchBarFrameAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteSceneLayoutSearchBarFrameSnapshot;
};

const areRouteSceneLayoutSearchBarFramesEqual = (
  left: RouteSceneLayoutSearchBarFrameSnapshot,
  right: RouteSceneLayoutSearchBarFrameSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.searchBarTop === right.searchBarTop);

const resolveRouteSceneLayoutSearchBarFrameSnapshot = (
  routeHostOverlayGeometry: RouteHostOverlayGeometryBinding
): RouteSceneLayoutSearchBarFrameSnapshot =>
  routeHostOverlayGeometry == null
    ? null
    : {
        searchBarTop: routeHostOverlayGeometry.searchBarTop,
      };

export class RouteSceneLayoutSearchBarFrameStateController {
  private routeHostOverlayGeometry: RouteHostOverlayGeometryBinding;

  private snapshot: RouteSceneLayoutSearchBarFrameSnapshot = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteHostOverlayGeometry: () => void;

  public readonly routeSceneLayoutSearchBarFrameAuthority: RouteSceneLayoutSearchBarFrameAuthority;

  constructor({
    routeHostOverlayGeometryAuthority,
  }: {
    routeHostOverlayGeometryAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostOverlayGeometryBinding;
    };
  }) {
    this.routeHostOverlayGeometry = routeHostOverlayGeometryAuthority.getSnapshot();
    this.routeSceneLayoutSearchBarFrameAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteHostOverlayGeometry =
      routeHostOverlayGeometryAuthority.subscribe(() => {
        this.setRouteHostOverlayGeometry(
          routeHostOverlayGeometryAuthority.getSnapshot()
        );
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
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = resolveRouteSceneLayoutSearchBarFrameSnapshot(
      this.routeHostOverlayGeometry
    );

    if (
      areRouteSceneLayoutSearchBarFramesEqual(this.snapshot, nextSnapshot)
    ) {
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

export const createRouteSceneLayoutSearchBarFrameStateController = ({
  routeHostOverlayGeometryAuthority,
}: ConstructorParameters<
  typeof RouteSceneLayoutSearchBarFrameStateController
>[0]): RouteSceneLayoutSearchBarFrameStateController =>
  new RouteSceneLayoutSearchBarFrameStateController({
    routeHostOverlayGeometryAuthority,
  });
