import type { AppRouteHostVisualRuntime } from './app-route-host-visual-runtime-contract';

type Listener = () => void;

export type RouteHostVisualRuntime = AppRouteHostVisualRuntime | null;

export type RouteHostVisualRuntimeAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteHostVisualRuntime;
};

const areRouteHostVisualRuntimesEqual = (
  left: RouteHostVisualRuntime,
  right: RouteHostVisualRuntime
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.navBarHeight === right.navBarHeight &&
    left.navBarTop === right.navBarTop &&
    left.overlayHeaderActionProgress === right.overlayHeaderActionProgress &&
    left.closeVisualHandoffProgress === right.closeVisualHandoffProgress &&
    left.navBarCutoutProgress === right.navBarCutoutProgress &&
    left.navBarCutoutIsHiding === right.navBarCutoutIsHiding);

export class RouteHostVisualRuntimeStateController {
  private routeHostVisualRuntime: RouteHostVisualRuntime = null;

  private readonly listeners = new Set<Listener>();

  public readonly routeHostVisualRuntimeAuthority: RouteHostVisualRuntimeAuthority;

  constructor() {
    this.routeHostVisualRuntimeAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.routeHostVisualRuntime,
    };
  }

  public syncRouteHostVisualRuntime(
    routeHostVisualRuntime: RouteHostVisualRuntime
  ): void {
    if (
      areRouteHostVisualRuntimesEqual(
        this.routeHostVisualRuntime,
        routeHostVisualRuntime
      )
    ) {
      return;
    }

    this.routeHostVisualRuntime = routeHostVisualRuntime;
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

export const createRouteHostVisualRuntimeStateController =
  (): RouteHostVisualRuntimeStateController =>
    new RouteHostVisualRuntimeStateController();
