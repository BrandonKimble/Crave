import {
  createRouteLocalRestaurantOverlayRuntime,
  type RouteLocalRestaurantOverlayRuntime,
} from './route-local-restaurant-overlay-runtime';
import type { RouteShellOverlayNavigationAuthority } from './app-route-scene-runtime';
import type {
  AppRouteRestaurantOverlayInteractionPublicationLane,
  AppRouteRestaurantOverlayPolicyPublicationLane,
  AppRouteRestaurantOverlayPanelContentPublicationLane,
} from './app-route-restaurant-overlay-publication-contract';

export class RouteRestaurantOverlayRuntime {
  private readonly routeLocalRestaurantOverlayRuntime: RouteLocalRestaurantOverlayRuntime;

  public readonly routeLocalRestaurantOverlaySessionAuthority: RouteLocalRestaurantOverlayRuntime['routeLocalRestaurantOverlaySessionAuthority'];

  public readonly routeLocalRestaurantOverlayPanelContentAuthority: RouteLocalRestaurantOverlayRuntime['routeLocalRestaurantOverlayPanelContentAuthority'];

  public readonly routeLocalRestaurantOverlayPolicyAuthority: RouteLocalRestaurantOverlayRuntime['routeLocalRestaurantOverlayPolicyAuthority'];

  public readonly routeLocalRestaurantOverlayInteractionAuthority: RouteLocalRestaurantOverlayRuntime['routeLocalRestaurantOverlayInteractionAuthority'];

  public readonly routeRestaurantOverlayPanelContentPublicationLane: AppRouteRestaurantOverlayPanelContentPublicationLane;

  public readonly routeRestaurantOverlayPolicyPublicationLane: AppRouteRestaurantOverlayPolicyPublicationLane;

  public readonly routeRestaurantOverlayInteractionPublicationLane: AppRouteRestaurantOverlayInteractionPublicationLane;

  constructor({
    routeOverlayNavigationAuthority,
  }: {
    routeOverlayNavigationAuthority: RouteShellOverlayNavigationAuthority;
  }) {
    this.routeLocalRestaurantOverlayRuntime = createRouteLocalRestaurantOverlayRuntime({
      routeOverlayNavigationAuthority,
    });
    this.routeLocalRestaurantOverlaySessionAuthority =
      this.routeLocalRestaurantOverlayRuntime.routeLocalRestaurantOverlaySessionAuthority;
    this.routeLocalRestaurantOverlayPanelContentAuthority =
      this.routeLocalRestaurantOverlayRuntime.routeLocalRestaurantOverlayPanelContentAuthority;
    this.routeLocalRestaurantOverlayPolicyAuthority =
      this.routeLocalRestaurantOverlayRuntime.routeLocalRestaurantOverlayPolicyAuthority;
    this.routeLocalRestaurantOverlayInteractionAuthority =
      this.routeLocalRestaurantOverlayRuntime.routeLocalRestaurantOverlayInteractionAuthority;
    this.routeRestaurantOverlayPanelContentPublicationLane =
      this.routeLocalRestaurantOverlayRuntime.routeRestaurantOverlayPanelContentPublicationLane;
    this.routeRestaurantOverlayPolicyPublicationLane =
      this.routeLocalRestaurantOverlayRuntime.routeRestaurantOverlayPolicyPublicationLane;
    this.routeRestaurantOverlayInteractionPublicationLane =
      this.routeLocalRestaurantOverlayRuntime.routeRestaurantOverlayInteractionPublicationLane;
  }

  public dispose(): void {
    this.routeLocalRestaurantOverlayRuntime.dispose();
  }
}

export const createRouteRestaurantOverlayRuntime = ({
  routeOverlayNavigationAuthority,
}: ConstructorParameters<typeof RouteRestaurantOverlayRuntime>[0]): RouteRestaurantOverlayRuntime =>
  new RouteRestaurantOverlayRuntime({
    routeOverlayNavigationAuthority,
  });
