import {
  createRouteLocalRestaurantOverlayInteractionRuntime,
  type RouteLocalRestaurantOverlayInteractionRuntime,
} from './route-local-restaurant-overlay-interaction-runtime';
import {
  createRouteLocalRestaurantOverlayPanelContentRuntime,
  type RouteLocalRestaurantOverlayPanelContentRuntime,
} from './route-local-restaurant-overlay-panel-content-runtime';
import {
  createRouteLocalRestaurantOverlayPolicyRuntime,
  type RouteLocalRestaurantOverlayPolicyRuntime,
} from './route-local-restaurant-overlay-policy-runtime';
import {
  createRouteLocalRestaurantOverlaySessionStateController,
  type RouteLocalRestaurantOverlaySessionStateController,
} from './route-local-restaurant-overlay-session-state-controller';
import type { RouteShellOverlayNavigationAuthority } from './app-route-scene-runtime';
import type {
  AppRouteRestaurantOverlayInteractionPublicationLane,
  AppRouteRestaurantOverlayPolicyPublicationLane,
  AppRouteRestaurantOverlayPanelContentPublicationLane,
} from './app-route-restaurant-overlay-publication-contract';

export class RouteLocalRestaurantOverlayRuntime {
  private readonly routeLocalRestaurantOverlaySessionRuntime: RouteLocalRestaurantOverlaySessionStateController;

  private readonly routeLocalRestaurantOverlayPanelContentRuntime: RouteLocalRestaurantOverlayPanelContentRuntime;

  private readonly routeLocalRestaurantOverlayPolicyRuntime: RouteLocalRestaurantOverlayPolicyRuntime;

  private readonly routeLocalRestaurantOverlayInteractionRuntime: RouteLocalRestaurantOverlayInteractionRuntime;

  public readonly routeLocalRestaurantOverlaySessionAuthority: RouteLocalRestaurantOverlaySessionStateController['routeLocalRestaurantOverlaySessionAuthority'];

  public readonly routeLocalRestaurantOverlayPanelContentAuthority: RouteLocalRestaurantOverlayPanelContentRuntime['routeLocalRestaurantOverlayPanelContentAuthority'];

  public readonly routeLocalRestaurantOverlayPolicyAuthority: RouteLocalRestaurantOverlayPolicyRuntime['routeLocalRestaurantOverlayPolicyAuthority'];

  public readonly routeLocalRestaurantOverlayInteractionAuthority: RouteLocalRestaurantOverlayInteractionRuntime['routeLocalRestaurantOverlayInteractionAuthority'];

  public readonly routeRestaurantOverlayPanelContentPublicationLane: AppRouteRestaurantOverlayPanelContentPublicationLane;

  public readonly routeRestaurantOverlayPolicyPublicationLane: AppRouteRestaurantOverlayPolicyPublicationLane;

  public readonly routeRestaurantOverlayInteractionPublicationLane: AppRouteRestaurantOverlayInteractionPublicationLane;

  constructor({
    routeOverlayNavigationAuthority,
  }: {
    routeOverlayNavigationAuthority: RouteShellOverlayNavigationAuthority;
  }) {
    this.routeLocalRestaurantOverlaySessionRuntime =
      createRouteLocalRestaurantOverlaySessionStateController({
        overlayNavigationOutputAuthority: routeOverlayNavigationAuthority,
      });
    this.routeLocalRestaurantOverlayPanelContentRuntime =
      createRouteLocalRestaurantOverlayPanelContentRuntime();
    this.routeLocalRestaurantOverlayPolicyRuntime =
      createRouteLocalRestaurantOverlayPolicyRuntime();
    this.routeLocalRestaurantOverlayInteractionRuntime =
      createRouteLocalRestaurantOverlayInteractionRuntime();
    this.routeLocalRestaurantOverlaySessionAuthority =
      this.routeLocalRestaurantOverlaySessionRuntime.routeLocalRestaurantOverlaySessionAuthority;
    this.routeLocalRestaurantOverlayPanelContentAuthority =
      this.routeLocalRestaurantOverlayPanelContentRuntime.routeLocalRestaurantOverlayPanelContentAuthority;
    this.routeLocalRestaurantOverlayPolicyAuthority =
      this.routeLocalRestaurantOverlayPolicyRuntime.routeLocalRestaurantOverlayPolicyAuthority;
    this.routeLocalRestaurantOverlayInteractionAuthority =
      this.routeLocalRestaurantOverlayInteractionRuntime.routeLocalRestaurantOverlayInteractionAuthority;
    this.routeRestaurantOverlayPanelContentPublicationLane = {
      syncRouteRestaurantOverlayPanelContentPublication:
        this.routeLocalRestaurantOverlayPanelContentRuntime.syncRouteRestaurantOverlayPanelContentPublication.bind(
          this.routeLocalRestaurantOverlayPanelContentRuntime
        ),
    };
    this.routeRestaurantOverlayPolicyPublicationLane = {
      syncRouteRestaurantOverlayPolicyPublication:
        this.routeLocalRestaurantOverlayPolicyRuntime.syncRouteRestaurantOverlayPolicyPublication.bind(
          this.routeLocalRestaurantOverlayPolicyRuntime
        ),
    };
    this.routeRestaurantOverlayInteractionPublicationLane = {
      syncRouteRestaurantOverlayInteractionPublication:
        this.routeLocalRestaurantOverlayInteractionRuntime.syncRouteRestaurantOverlayInteractionPublication.bind(
          this.routeLocalRestaurantOverlayInteractionRuntime
        ),
    };
  }

  public dispose(): void {
    this.routeLocalRestaurantOverlayInteractionRuntime.dispose();
    this.routeLocalRestaurantOverlayPolicyRuntime.dispose();
    this.routeLocalRestaurantOverlayPanelContentRuntime.dispose();
    this.routeLocalRestaurantOverlaySessionRuntime.dispose();
  }
}

export const createRouteLocalRestaurantOverlayRuntime = ({
  routeOverlayNavigationAuthority,
}: ConstructorParameters<
  typeof RouteLocalRestaurantOverlayRuntime
>[0]): RouteLocalRestaurantOverlayRuntime =>
  new RouteLocalRestaurantOverlayRuntime({
    routeOverlayNavigationAuthority,
  });
