import { unstable_batchedUpdates } from 'react-native';

import type {
  GlobalRestaurantRouteDraft,
  RestaurantRoutePanelDraft,
} from '../../overlays/restaurantRoutePanelContract';
import type { OverlayRouteEntry } from './app-overlay-route-types';
import type { AppOverlayRouteCommandRuntime } from './app-overlay-route-command-runtime';
import type { RouteSceneSwitchRouteStateSnapshot } from './app-route-scene-switch-controller';
import {
  EMPTY_ROUTE_GLOBAL_RESTAURANT_OVERLAY_SNAPSHOT,
  type RouteGlobalRestaurantOverlaySnapshot,
} from './route-global-restaurant-overlay-snapshot-contract';
import type { RouteOverlayNavigationSnapshot } from './route-overlay-navigation-snapshot-contract';

type Listener = () => void;

type OutputAuthority<TSnapshot> = {
  getSnapshot: () => TSnapshot;
  registerTarget: <TSelected>(target: {
    selector: (snapshot: TSnapshot) => TSelected;
    syncNavigationSnapshot: (snapshot: TSnapshot, selected: TSelected) => void;
    isEqual?: (left: TSelected, right: TSelected) => boolean;
    attributionLabel: string;
  }) => () => void;
};

export type AppRouteGlobalRestaurantRouteAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteGlobalRestaurantOverlaySnapshot;
};

export type OpenGlobalRestaurantRouteArgs = {
  restaurantId: string;
  panel: RestaurantRoutePanelDraft;
};

export type AppRouteGlobalRestaurantRouteActions = {
  openRestaurantRoute: (args: OpenGlobalRestaurantRouteArgs) => number;
  updateRestaurantRoutePanel: (sessionToken: number, panel: RestaurantRoutePanelDraft) => boolean;
  closeRestaurantRoute: (sessionToken?: number | null) => void;
  getActiveRestaurantRouteSessionToken: () => number | null;
};

export type AppRouteGlobalRestaurantRouteController = {
  authority: AppRouteGlobalRestaurantRouteAuthority;
  actions: AppRouteGlobalRestaurantRouteActions;
  dispose: () => void;
};

const isGlobalRestaurantRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'restaurant'> =>
  route.key === 'restaurant' &&
  route.params != null &&
  'source' in route.params &&
  route.params.source === 'global';

const areRouteGlobalRestaurantOverlaySnapshotsEqual = (
  left: RouteGlobalRestaurantOverlaySnapshot,
  right: RouteGlobalRestaurantOverlaySnapshot
): boolean =>
  left.presentationDraft === right.presentationDraft &&
  left.activeSessionToken === right.activeSessionToken &&
  left.activeOverlayRouteKey === right.activeOverlayRouteKey &&
  left.rootOverlayKey === right.rootOverlayKey &&
  left.overlayRouteStackLength === right.overlayRouteStackLength;

type GlobalRestaurantNavigationSelection = {
  activeOverlayRoute: OverlayRouteEntry<'restaurant'> | null;
  activeOverlayRouteKey: string | null;
  rootOverlayKey: RouteOverlayNavigationSnapshot['rootOverlayKey'];
  overlayRouteStackLength: number;
};

const EMPTY_GLOBAL_RESTAURANT_NAVIGATION_SELECTION: GlobalRestaurantNavigationSelection = {
  activeOverlayRoute: null,
  activeOverlayRouteKey: null,
  rootOverlayKey: 'search',
  overlayRouteStackLength: 0,
};

const selectGlobalRestaurantNavigation = (
  snapshot: RouteOverlayNavigationSnapshot
): GlobalRestaurantNavigationSelection => {
  const activeOverlayRoute = snapshot.activeOverlayRoute;
  if (!isGlobalRestaurantRouteEntry(activeOverlayRoute)) {
    return EMPTY_GLOBAL_RESTAURANT_NAVIGATION_SELECTION;
  }
  return {
    activeOverlayRoute,
    activeOverlayRouteKey: snapshot.activeOverlayRouteKey,
    rootOverlayKey: snapshot.rootOverlayKey,
    overlayRouteStackLength: snapshot.overlayRouteStackLength,
  };
};

const areGlobalRestaurantNavigationSelectionsEqual = (
  left: GlobalRestaurantNavigationSelection,
  right: GlobalRestaurantNavigationSelection
): boolean =>
  left.activeOverlayRoute === right.activeOverlayRoute &&
  left.activeOverlayRouteKey === right.activeOverlayRouteKey &&
  left.rootOverlayKey === right.rootOverlayKey &&
  left.overlayRouteStackLength === right.overlayRouteStackLength;

class AppRouteGlobalRestaurantRouteRuntimeController
  implements AppRouteGlobalRestaurantRouteController
{
  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteOverlayNavigation: () => void;

  private presentationDraft: GlobalRestaurantRouteDraft | null = null;

  private snapshot = EMPTY_ROUTE_GLOBAL_RESTAURANT_OVERLAY_SNAPSHOT;

  private nextRestaurantRouteSessionToken = 1;

  public readonly authority: AppRouteGlobalRestaurantRouteAuthority = {
    subscribe: (listener) => this.subscribe(listener),
    getSnapshot: () => this.snapshot,
  };

  public readonly actions: AppRouteGlobalRestaurantRouteActions = {
    openRestaurantRoute: ({ restaurantId, panel }) => {
      const sessionToken = this.createRestaurantRouteSessionToken();
      unstable_batchedUpdates(() => {
        this.publishDraft({
          sessionToken,
          panelDraft: panel,
        });
        this.routeOverlayRouteCommandRuntime.pushRoute('restaurant', {
          restaurantId,
          source: 'global',
          sessionToken,
        });
      });
      return sessionToken;
    },
    updateRestaurantRoutePanel: (sessionToken, panel) => {
      if (this.getRestaurantRouteSessionToken() !== sessionToken) {
        return false;
      }
      this.publishDraft({
        sessionToken,
        panelDraft: panel,
      });
      return true;
    },
    closeRestaurantRoute: (sessionToken) => {
      this.closeRestaurantRouteSession(sessionToken);
    },
    getActiveRestaurantRouteSessionToken: () => this.getRestaurantRouteSessionToken(),
  };

  constructor(
    private readonly routeOverlayNavigationAuthority: OutputAuthority<RouteOverlayNavigationSnapshot>,
    private readonly routeOverlayRouteCommandRuntime: AppOverlayRouteCommandRuntime
  ) {
    this.recompute(false);
    this.unsubscribeRouteOverlayNavigation = routeOverlayNavigationAuthority.registerTarget({
      selector: selectGlobalRestaurantNavigation,
      syncNavigationSnapshot: () => {
        this.recompute(true);
      },
      isEqual: areGlobalRestaurantNavigationSelectionsEqual,
      attributionLabel: 'AppRouteGlobalRestaurantRouteNavigation',
    });
  }

  public dispose(): void {
    this.unsubscribeRouteOverlayNavigation();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private createRestaurantRouteSessionToken(): number {
    const sessionToken = this.nextRestaurantRouteSessionToken;
    this.nextRestaurantRouteSessionToken += 1;
    return sessionToken;
  }

  private getRestaurantRouteSessionToken(): number | null {
    return this.presentationDraft?.sessionToken ?? null;
  }

  private publishDraft(presentationDraft: GlobalRestaurantRouteDraft | null): void {
    if (Object.is(this.presentationDraft, presentationDraft)) {
      return;
    }
    this.presentationDraft = presentationDraft;
    this.recompute(true);
  }

  private isRestaurantRouteSessionActive(
    sessionToken: number | null | undefined,
    routeState: RouteSceneSwitchRouteStateSnapshot
  ): boolean {
    if (sessionToken == null) {
      return false;
    }
    if (!isGlobalRestaurantRouteEntry(routeState.activeOverlayRoute)) {
      return false;
    }
    if (routeState.activeOverlayRoute.params?.sessionToken !== sessionToken) {
      return false;
    }
    return this.getRestaurantRouteSessionToken() === sessionToken;
  }

  private clearGlobalRestaurantDraftAfterSettle(sessionToken: number): void {
    if (this.getRestaurantRouteSessionToken() !== sessionToken) {
      return;
    }

    const { activeOverlayRoute } = this.routeOverlayRouteCommandRuntime.getRouteState();
    if (
      isGlobalRestaurantRouteEntry(activeOverlayRoute) &&
      activeOverlayRoute.params?.sessionToken === sessionToken
    ) {
      return;
    }

    this.publishDraft(null);
  }

  private closeRestaurantRouteSession(sessionToken: number | null | undefined): void {
    const targetSessionToken = sessionToken ?? this.getRestaurantRouteSessionToken();
    if (targetSessionToken == null) {
      return;
    }
    const currentSessionToken = this.getRestaurantRouteSessionToken();
    if (currentSessionToken == null || currentSessionToken !== targetSessionToken) {
      return;
    }
    if (
      this.isRestaurantRouteSessionActive(
        targetSessionToken,
        this.routeOverlayRouteCommandRuntime.getRouteState()
      )
    ) {
      this.routeOverlayRouteCommandRuntime.closeActiveRouteAfterSettle(() => {
        this.clearGlobalRestaurantDraftAfterSettle(targetSessionToken);
      });
      return;
    }
    this.publishDraft(null);
  }

  private recompute(notify: boolean): void {
    const overlayState = this.routeOverlayNavigationAuthority.getSnapshot();
    const activeOverlayRoute = overlayState.activeOverlayRoute;
    const isGlobalRestaurantRouteActive = isGlobalRestaurantRouteEntry(activeOverlayRoute);
    const nextSnapshot: RouteGlobalRestaurantOverlaySnapshot =
      this.presentationDraft == null && !isGlobalRestaurantRouteActive
        ? EMPTY_ROUTE_GLOBAL_RESTAURANT_OVERLAY_SNAPSHOT
        : {
            presentationDraft: this.presentationDraft,
            activeSessionToken: isGlobalRestaurantRouteActive
              ? activeOverlayRoute.params?.sessionToken ?? null
              : null,
            activeOverlayRouteKey: activeOverlayRoute.key,
            rootOverlayKey: overlayState.rootOverlayKey,
            overlayRouteStackLength: overlayState.overlayRouteStackLength,
          };

    if (areRouteGlobalRestaurantOverlaySnapshotsEqual(this.snapshot, nextSnapshot)) {
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

export const createAppRouteGlobalRestaurantRouteController = ({
  routeOverlayNavigationAuthority,
  routeOverlayRouteCommandRuntime,
}: {
  routeOverlayNavigationAuthority: OutputAuthority<RouteOverlayNavigationSnapshot>;
  routeOverlayRouteCommandRuntime: AppOverlayRouteCommandRuntime;
}): AppRouteGlobalRestaurantRouteController =>
  new AppRouteGlobalRestaurantRouteRuntimeController(
    routeOverlayNavigationAuthority,
    routeOverlayRouteCommandRuntime
  );
