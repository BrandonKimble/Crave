import type { AppRouteRestaurantOverlayInteractionPublication } from './app-route-restaurant-overlay-publication-contract';
import { EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_INTERACTION_PUBLICATION } from './app-route-restaurant-overlay-publication-contract';
import {
  areRouteLocalRestaurantOverlayInteractionSnapshotsEqual,
  EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_INTERACTION_SNAPSHOT,
  type RouteLocalRestaurantOverlayInteractionSnapshot,
} from './route-local-restaurant-overlay-interaction-snapshot-contract';

type Listener = () => void;

export type RouteLocalRestaurantOverlayInteractionAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteLocalRestaurantOverlayInteractionSnapshot;
};

export class RouteLocalRestaurantOverlayInteractionRuntime {
  private routeRestaurantOverlayInteractionPublication: AppRouteRestaurantOverlayInteractionPublication =
    EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_INTERACTION_PUBLICATION;

  private snapshot: RouteLocalRestaurantOverlayInteractionSnapshot =
    EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_INTERACTION_SNAPSHOT;

  private readonly listeners = new Set<Listener>();

  public readonly routeLocalRestaurantOverlayInteractionAuthority: RouteLocalRestaurantOverlayInteractionAuthority;

  constructor() {
    this.routeLocalRestaurantOverlayInteractionAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
  }

  public dispose(): void {
    this.listeners.clear();
  }

  public syncRouteRestaurantOverlayInteractionPublication(
    routeRestaurantOverlayInteractionPublication: AppRouteRestaurantOverlayInteractionPublication
  ): void {
    if (
      this.routeRestaurantOverlayInteractionPublication ===
      routeRestaurantOverlayInteractionPublication
    ) {
      return;
    }

    this.routeRestaurantOverlayInteractionPublication =
      routeRestaurantOverlayInteractionPublication;
    this.recompute();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private recompute(): void {
    const nextSnapshot: RouteLocalRestaurantOverlayInteractionSnapshot = {
      onToggleFavorite: this.routeRestaurantOverlayInteractionPublication.onToggleFavorite,
      closeRestaurantProfile:
        this.routeRestaurantOverlayInteractionPublication.closeRestaurantProfile,
      restaurantSheetSnapController:
        this.routeRestaurantOverlayInteractionPublication.restaurantSheetSnapController,
    };

    if (areRouteLocalRestaurantOverlayInteractionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createRouteLocalRestaurantOverlayInteractionRuntime =
  (): RouteLocalRestaurantOverlayInteractionRuntime =>
    new RouteLocalRestaurantOverlayInteractionRuntime();
