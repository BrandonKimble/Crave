import {
  EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_SESSION_SNAPSHOT,
  type RouteLocalRestaurantOverlaySessionSnapshot,
} from './route-local-restaurant-overlay-session-snapshot-contract';
import type { OverlayRouteEntry } from './app-overlay-route-types';
import type { RouteOverlayNavigationSnapshot } from './route-overlay-navigation-snapshot-contract';

type OutputAuthority<TSnapshot> = {
  getSnapshot: () => TSnapshot;
  registerTarget: <TSelected>(target: {
    selector: (snapshot: TSnapshot) => TSelected;
    syncNavigationSnapshot: (snapshot: TSnapshot, selected: TSelected) => void;
    isEqual?: (left: TSelected, right: TSelected) => boolean;
    attributionLabel: string;
  }) => () => void;
};

type Listener = () => void;

const isLocalRestaurantRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'restaurant'> =>
  route.key === 'restaurant' &&
  route.params != null &&
  'source' in route.params &&
  route.params.source === 'search';

export type RouteLocalRestaurantOverlaySessionAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RouteLocalRestaurantOverlaySessionSnapshot;
};

const areRouteLocalRestaurantOverlaySessionSnapshotsEqual = (
  left: RouteLocalRestaurantOverlaySessionSnapshot,
  right: RouteLocalRestaurantOverlaySessionSnapshot
): boolean =>
  left.activeOverlayRoute === right.activeOverlayRoute &&
  left.activeOverlayRouteKey === right.activeOverlayRouteKey &&
  left.rootOverlayKey === right.rootOverlayKey &&
  left.overlayRouteStackLength === right.overlayRouteStackLength;

type LocalRestaurantNavigationSelection = {
  activeOverlayRoute: OverlayRouteEntry<'restaurant'> | null;
  activeOverlayRouteKey: string | null;
  rootOverlayKey: RouteOverlayNavigationSnapshot['rootOverlayKey'];
  overlayRouteStackLength: number;
};

const EMPTY_LOCAL_RESTAURANT_NAVIGATION_SELECTION: LocalRestaurantNavigationSelection = {
  activeOverlayRoute: null,
  activeOverlayRouteKey: null,
  rootOverlayKey: 'search',
  overlayRouteStackLength: 0,
};

const selectLocalRestaurantNavigation = (
  snapshot: RouteOverlayNavigationSnapshot
): LocalRestaurantNavigationSelection => {
  const activeOverlayRoute = snapshot.activeOverlayRoute;
  if (!isLocalRestaurantRouteEntry(activeOverlayRoute)) {
    return EMPTY_LOCAL_RESTAURANT_NAVIGATION_SELECTION;
  }
  return {
    activeOverlayRoute,
    activeOverlayRouteKey: snapshot.activeOverlayRouteKey,
    rootOverlayKey: snapshot.rootOverlayKey,
    overlayRouteStackLength: snapshot.overlayRouteStackLength,
  };
};

const areLocalRestaurantNavigationSelectionsEqual = (
  left: LocalRestaurantNavigationSelection,
  right: LocalRestaurantNavigationSelection
): boolean =>
  left.activeOverlayRoute === right.activeOverlayRoute &&
  left.activeOverlayRouteKey === right.activeOverlayRouteKey &&
  left.rootOverlayKey === right.rootOverlayKey &&
  left.overlayRouteStackLength === right.overlayRouteStackLength;

export class RouteLocalRestaurantOverlaySessionStateController {
  private routeOverlayNavigationSnapshot: RouteOverlayNavigationSnapshot;

  private snapshot: RouteLocalRestaurantOverlaySessionSnapshot =
    EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_SESSION_SNAPSHOT;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeOverlayNavigation: () => void;

  public readonly routeLocalRestaurantOverlaySessionAuthority: RouteLocalRestaurantOverlaySessionAuthority;

  constructor({
    overlayNavigationOutputAuthority,
  }: {
    overlayNavigationOutputAuthority: OutputAuthority<RouteOverlayNavigationSnapshot>;
  }) {
    this.routeOverlayNavigationSnapshot = overlayNavigationOutputAuthority.getSnapshot();
    this.routeLocalRestaurantOverlaySessionAuthority = {
      subscribe: (listener) => this.subscribeTo(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeOverlayNavigation = overlayNavigationOutputAuthority.registerTarget({
      selector: selectLocalRestaurantNavigation,
      syncNavigationSnapshot: (snapshot) => {
        this.setRouteOverlayNavigationSnapshot(snapshot);
      },
      isEqual: areLocalRestaurantNavigationSelectionsEqual,
      attributionLabel: 'RouteLocalRestaurantOverlaySession',
    });
  }

  public dispose(): void {
    this.unsubscribeOverlayNavigation();
    this.listeners.clear();
  }

  private subscribeTo(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteOverlayNavigationSnapshot(
    routeOverlayNavigationSnapshot: RouteOverlayNavigationSnapshot
  ): void {
    if (this.routeOverlayNavigationSnapshot === routeOverlayNavigationSnapshot) {
      return;
    }

    this.routeOverlayNavigationSnapshot = routeOverlayNavigationSnapshot;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const activeOverlayRoute = this.routeOverlayNavigationSnapshot.activeOverlayRoute;
    const nextSnapshot: RouteLocalRestaurantOverlaySessionSnapshot = isLocalRestaurantRouteEntry(
      activeOverlayRoute
    )
      ? {
          activeOverlayRoute,
          activeOverlayRouteKey: this.routeOverlayNavigationSnapshot.activeOverlayRouteKey,
          rootOverlayKey: this.routeOverlayNavigationSnapshot.rootOverlayKey,
          overlayRouteStackLength: this.routeOverlayNavigationSnapshot.overlayRouteStackLength,
        }
      : EMPTY_ROUTE_LOCAL_RESTAURANT_OVERLAY_SESSION_SNAPSHOT;

    if (areRouteLocalRestaurantOverlaySessionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;

    if (!notify) {
      return;
    }

    this.listeners.forEach((listener) => listener());
  }
}

export const createRouteLocalRestaurantOverlaySessionStateController = ({
  overlayNavigationOutputAuthority,
}: {
  overlayNavigationOutputAuthority: OutputAuthority<RouteOverlayNavigationSnapshot>;
}): RouteLocalRestaurantOverlaySessionStateController =>
  new RouteLocalRestaurantOverlaySessionStateController({
    overlayNavigationOutputAuthority,
  });
