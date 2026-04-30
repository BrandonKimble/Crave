import type { RouteHostOverlayGeometryBinding } from './route-host-overlay-geometry-state-controller';

type Listener = () => void;

export type RouteSheetChromeGeometrySnapshot = Pick<
  NonNullable<RouteHostOverlayGeometryBinding>,
  'navBarCutoutHeight' | 'bottomNavHiddenTranslateY'
> | null;

export type RouteSheetChromeGeometryAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteSheetChromeGeometrySnapshot;
};

const areChromeGeometrySnapshotsEqual = (
  left: RouteSheetChromeGeometrySnapshot,
  right: RouteSheetChromeGeometrySnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.navBarCutoutHeight === right.navBarCutoutHeight &&
    left.bottomNavHiddenTranslateY === right.bottomNavHiddenTranslateY);

const resolveChromeGeometrySnapshot = (
  routeHostOverlayGeometry: RouteHostOverlayGeometryBinding
): RouteSheetChromeGeometrySnapshot =>
  routeHostOverlayGeometry == null
    ? null
    : {
        navBarCutoutHeight: routeHostOverlayGeometry.navBarCutoutHeight,
        bottomNavHiddenTranslateY:
          routeHostOverlayGeometry.bottomNavHiddenTranslateY,
      };

export class RouteSheetChromeGeometryStateController {
  private routeHostOverlayGeometry: RouteHostOverlayGeometryBinding;

  private snapshot: RouteSheetChromeGeometrySnapshot = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteHostOverlayGeometry: () => void;

  public readonly routeSheetChromeGeometryAuthority: RouteSheetChromeGeometryAuthority;

  constructor({
    routeHostOverlayGeometryAuthority,
  }: {
    routeHostOverlayGeometryAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostOverlayGeometryBinding;
    };
  }) {
    this.routeHostOverlayGeometry = routeHostOverlayGeometryAuthority.getSnapshot();
    this.routeSheetChromeGeometryAuthority = {
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
    const nextSnapshot = resolveChromeGeometrySnapshot(
      this.routeHostOverlayGeometry
    );

    if (areChromeGeometrySnapshotsEqual(this.snapshot, nextSnapshot)) {
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

export const createRouteSheetChromeGeometryStateController = ({
  routeHostOverlayGeometryAuthority,
}: ConstructorParameters<typeof RouteSheetChromeGeometryStateController>[0]): RouteSheetChromeGeometryStateController =>
  new RouteSheetChromeGeometryStateController({
    routeHostOverlayGeometryAuthority,
  });
