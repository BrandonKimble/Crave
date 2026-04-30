import type { AppRouteRestaurantOverlayPanelContentPublication } from './app-route-restaurant-overlay-publication-contract';
import { EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_PANEL_CONTENT_PUBLICATION } from './app-route-restaurant-overlay-publication-contract';
import {
  areRouteLocalRestaurantOverlayPanelContentSnapshotsEqual,
  EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_PANEL_CONTENT_SNAPSHOT,
  type RouteLocalRestaurantOverlayPanelContentSnapshot,
} from './route-local-restaurant-overlay-panel-content-snapshot-contract';

type Listener = () => void;

export type RouteLocalRestaurantOverlayPanelContentAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteLocalRestaurantOverlayPanelContentSnapshot;
};

export class RouteLocalRestaurantOverlayPanelContentRuntime {
  private routeRestaurantOverlayPanelContentPublication: AppRouteRestaurantOverlayPanelContentPublication =
    EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_PANEL_CONTENT_PUBLICATION;

  private snapshot: RouteLocalRestaurantOverlayPanelContentSnapshot =
    EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_PANEL_CONTENT_SNAPSHOT;

  private readonly listeners = new Set<Listener>();

  public readonly routeLocalRestaurantOverlayPanelContentAuthority: RouteLocalRestaurantOverlayPanelContentAuthority;

  constructor() {
    this.routeLocalRestaurantOverlayPanelContentAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
  }

  public dispose(): void {
    this.listeners.clear();
  }

  public syncRouteRestaurantOverlayPanelContentPublication(
    routeRestaurantOverlayPanelContentPublication: AppRouteRestaurantOverlayPanelContentPublication
  ): void {
    if (
      this.routeRestaurantOverlayPanelContentPublication ===
      routeRestaurantOverlayPanelContentPublication
    ) {
      return;
    }

    this.routeRestaurantOverlayPanelContentPublication =
      routeRestaurantOverlayPanelContentPublication;
    this.recompute(true);
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private recompute(notify: boolean): void {
    const nextSnapshot: RouteLocalRestaurantOverlayPanelContentSnapshot = {
      restaurantPanelSnapshot:
        this.routeRestaurantOverlayPanelContentPublication.restaurantPanelSnapshot,
      suggestionProgress: this.routeRestaurantOverlayPanelContentPublication.suggestionProgress,
    };

    if (areRouteLocalRestaurantOverlayPanelContentSnapshotsEqual(this.snapshot, nextSnapshot)) {
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

export const createRouteLocalRestaurantOverlayPanelContentRuntime =
  (): RouteLocalRestaurantOverlayPanelContentRuntime =>
    new RouteLocalRestaurantOverlayPanelContentRuntime();
