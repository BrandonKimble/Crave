import type { AppRouteRestaurantOverlayPolicyPublication } from './app-route-restaurant-overlay-publication-contract';
import { EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_POLICY_PUBLICATION } from './app-route-restaurant-overlay-publication-contract';
import {
  areRouteLocalRestaurantOverlayPolicySnapshotsEqual,
  EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_POLICY_SNAPSHOT,
  type RouteLocalRestaurantOverlayPolicySnapshot,
} from './route-local-restaurant-overlay-policy-snapshot-contract';

type Listener = () => void;

export type RouteLocalRestaurantOverlayPolicyAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteLocalRestaurantOverlayPolicySnapshot;
};

export class RouteLocalRestaurantOverlayPolicyRuntime {
  private routeRestaurantOverlayPolicyPublication: AppRouteRestaurantOverlayPolicyPublication =
    EMPTY_APP_ROUTE_RESTAURANT_OVERLAY_POLICY_PUBLICATION;

  private snapshot: RouteLocalRestaurantOverlayPolicySnapshot =
    EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_POLICY_SNAPSHOT;

  private readonly listeners = new Set<Listener>();

  public readonly routeLocalRestaurantOverlayPolicyAuthority: RouteLocalRestaurantOverlayPolicyAuthority;

  constructor() {
    this.routeLocalRestaurantOverlayPolicyAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
  }

  public dispose(): void {
    this.listeners.clear();
  }

  public syncRouteRestaurantOverlayPolicyPublication(
    routeRestaurantOverlayPolicyPublication: AppRouteRestaurantOverlayPolicyPublication
  ): void {
    if (this.routeRestaurantOverlayPolicyPublication === routeRestaurantOverlayPolicyPublication) {
      return;
    }

    this.routeRestaurantOverlayPolicyPublication = routeRestaurantOverlayPolicyPublication;
    this.recompute();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private recompute(): void {
    const nextSnapshot: RouteLocalRestaurantOverlayPolicySnapshot = {
      shouldSuppressRestaurantOverlay:
        this.routeRestaurantOverlayPolicyPublication.shouldSuppressRestaurantOverlay,
      shouldFreezeRestaurantPanelContent:
        this.routeRestaurantOverlayPolicyPublication.shouldFreezeRestaurantPanelContent,
      shouldEnableRestaurantOverlayInteraction:
        this.routeRestaurantOverlayPolicyPublication.shouldEnableRestaurantOverlayInteraction,
    };

    if (areRouteLocalRestaurantOverlayPolicySnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createRouteLocalRestaurantOverlayPolicyRuntime =
  (): RouteLocalRestaurantOverlayPolicyRuntime => new RouteLocalRestaurantOverlayPolicyRuntime();
