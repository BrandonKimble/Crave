import type { SearchRootOverlaySessionGeometryRuntime } from '../../screens/Search/runtime/shared/search-root-scaffold-runtime-contract';

type Listener = () => void;

export type RouteHostOverlayGeometryBinding = Pick<
  SearchRootOverlaySessionGeometryRuntime,
  | 'searchBarTop'
  | 'navBarTopForSnaps'
  | 'navBarCutoutHeight'
  | 'bottomNavHiddenTranslateY'
> | null;

export type RouteHostOverlayGeometryAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteHostOverlayGeometryBinding;
};

const areRouteHostOverlayGeometriesEqual = (
  left: RouteHostOverlayGeometryBinding,
  right: RouteHostOverlayGeometryBinding
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.searchBarTop === right.searchBarTop &&
    left.navBarTopForSnaps === right.navBarTopForSnaps &&
    left.navBarCutoutHeight === right.navBarCutoutHeight &&
    left.bottomNavHiddenTranslateY === right.bottomNavHiddenTranslateY);

export class RouteHostOverlayGeometryStateController {
  private routeHostOverlayGeometryRuntime: RouteHostOverlayGeometryBinding = null;

  private readonly listeners = new Set<Listener>();

  public readonly routeHostOverlayGeometryAuthority: RouteHostOverlayGeometryAuthority;

  constructor() {
    this.routeHostOverlayGeometryAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.routeHostOverlayGeometryRuntime,
    };
  }

  public syncRouteHostOverlayGeometryRuntime(
    routeHostOverlayGeometryRuntime: RouteHostOverlayGeometryBinding
  ): void {
    if (
      areRouteHostOverlayGeometriesEqual(
        this.routeHostOverlayGeometryRuntime,
        routeHostOverlayGeometryRuntime
      )
    ) {
      return;
    }

    this.routeHostOverlayGeometryRuntime = routeHostOverlayGeometryRuntime;
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  public dispose(): void {
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const createRouteHostOverlayGeometryStateController =
  (): RouteHostOverlayGeometryStateController =>
    new RouteHostOverlayGeometryStateController();
