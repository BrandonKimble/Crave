import type {
  SearchSessionOriginContext,
  SearchOverlaySheetSnap,
} from '../../overlays/searchRouteSessionTypes';
import type { AppSearchRouteCommandActions } from './app-search-route-command-runtime';
import type { OverlayKey } from './app-overlay-route-types';
import {
  type AppRouteOverlaySessionActions,
  type AppRouteOverlaySessionAuthority,
  type AppRouteOverlaySessionControllerSharedSnapState,
  type AppRouteOverlaySessionSnapshot,
  type AppRouteSearchCloseRestoreOptions,
} from './app-route-overlay-session-contract';
import type {
  AppRouteSheetSnapSessionActions,
  AppRouteSheetSnapSessionAuthority,
} from './app-route-sheet-snap-session-runtime';
import type { RouteScenePolicySnapshot } from './app-route-scene-policy-contract';
import type {
  RouteSceneVisibilityPolicyRuntime,
  RouteSceneVisibilityPolicySnapshot,
} from './app-route-scene-visibility-policy-contract';
import { resolveSearchLaunchOriginSnap } from './app-route-session-utils';
import type { RouteOverlayIdentitySnapshot } from './route-overlay-navigation-snapshot-contract';
import type { RouteOverlayRootSnapshot } from './route-overlay-display-snapshot-contract';
import type { RouteSceneSwitchTransitionActions } from './app-route-scene-switch-controller';

type OutputAuthority<T> = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => T;
};

type SnapshotSource<T> = {
  getSnapshot: () => T;
};

type RootSnapshotTargetAuthority = SnapshotSource<RouteOverlayRootSnapshot> & {
  registerTarget: (target: {
    syncRootSnapshot: (snapshot: RouteOverlayRootSnapshot) => void;
    attributionLabel: string;
  }) => () => void;
};

type AppRouteOverlaySessionStateControllerArgs = {
  routeOverlayIdentityAuthority: SnapshotSource<RouteOverlayIdentitySnapshot>;
  routeOverlayRootAuthority: RootSnapshotTargetAuthority;
  routeScenePolicyAuthority: OutputAuthority<RouteScenePolicySnapshot>;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  routeSceneSwitchActions: RouteSceneSwitchTransitionActions;
  routeSearchCommandActions: AppSearchRouteCommandActions;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
};

const EMPTY_APP_ROUTE_OVERLAY_SESSION_SNAPSHOT: AppRouteOverlaySessionSnapshot = {
  isSearchOriginRestorePending: false,
  shouldShowDockedPollsTarget: false,
  shouldShowDockedPolls: false,
  shouldShowPollsSheet: false,
};

const areAppRouteOverlaySessionSnapshotsEqual = (
  left: AppRouteOverlaySessionSnapshot,
  right: AppRouteOverlaySessionSnapshot
): boolean =>
  left.isSearchOriginRestorePending === right.isSearchOriginRestorePending &&
  left.shouldShowDockedPollsTarget === right.shouldShowDockedPollsTarget &&
  left.shouldShowDockedPolls === right.shouldShowDockedPolls &&
  left.shouldShowPollsSheet === right.shouldShowPollsSheet;

export class AppRouteOverlaySessionStateController {
  private readonly routeOverlayIdentityAuthority: SnapshotSource<RouteOverlayIdentitySnapshot>;

  private readonly routeScenePolicyAuthority: OutputAuthority<RouteScenePolicySnapshot>;

  private readonly routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;

  private readonly routeSceneSwitchActions: RouteSceneSwitchTransitionActions;

  private readonly routeSearchCommandActions: AppSearchRouteCommandActions;

  private readonly routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;

  private readonly routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;

  private readonly listeners = new Set<() => void>();

  private readonly unsubscribers: Array<() => void> = [];

  private snapshot = EMPTY_APP_ROUTE_OVERLAY_SESSION_SNAPSHOT;

  private previousRootOverlay: OverlayKey | null = null;

  public readonly authority: AppRouteOverlaySessionAuthority;

  public readonly actions: AppRouteOverlaySessionActions;

  constructor({
    routeOverlayIdentityAuthority,
    routeOverlayRootAuthority,
    routeScenePolicyAuthority,
    routeSceneVisibilityPolicyRuntime,
    routeSceneSwitchActions,
    routeSearchCommandActions,
    routeSheetSnapSessionAuthority,
    routeSheetSnapSessionActions,
  }: AppRouteOverlaySessionStateControllerArgs) {
    this.routeOverlayIdentityAuthority = routeOverlayIdentityAuthority;
    this.routeScenePolicyAuthority = routeScenePolicyAuthority;
    this.routeSceneVisibilityPolicyRuntime = routeSceneVisibilityPolicyRuntime;
    this.routeSceneSwitchActions = routeSceneSwitchActions;
    this.routeSearchCommandActions = routeSearchCommandActions;
    this.routeSheetSnapSessionAuthority = routeSheetSnapSessionAuthority;
    this.routeSheetSnapSessionActions = routeSheetSnapSessionActions;
    this.authority = {
      subscribe: this.subscribe.bind(this),
      getSnapshot: this.getSnapshot.bind(this),
    };
    this.actions = {
      captureSearchSessionOrigin: this.captureSearchSessionOrigin.bind(this),
      armSearchCloseRestore: this.armSearchCloseRestore.bind(this),
      commitSearchCloseRestore: this.commitSearchCloseRestore.bind(this),
      cancelSearchCloseRestore: this.cancelSearchCloseRestore.bind(this),
      prepareSearchSessionEntry: this.prepareSearchSessionEntry.bind(this),
      flushPendingSearchOriginRestore: this.flushPendingSearchOriginRestore.bind(this),
      requestDefaultPostSearchRestore: this.requestDefaultPostSearchRestore.bind(this),
    };
    this.unsubscribers.push(
      routeOverlayRootAuthority.registerTarget({
        attributionLabel: 'AppRouteOverlaySessionRoot',
        syncRootSnapshot: () => {
          this.handleRootOverlayTransition();
          this.recompute(true);
        },
      }),
      routeScenePolicyAuthority.subscribe(() => {
        this.handleNavRestorePending();
        this.recompute(true);
      }),
      routeSheetSnapSessionAuthority.subscribe(() => {
        this.handleNavRestorePending();
        this.recompute(true);
      })
    );
    this.handleRootOverlayTransition();
    this.handleNavRestorePending();
    this.snapshot = this.computeSnapshot();
  }

  public dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers.length = 0;
    this.listeners.clear();
  }

  private subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private getSnapshot(): AppRouteOverlaySessionSnapshot {
    return this.snapshot;
  }

  public getRouteSceneVisibilityPolicySnapshot(): RouteSceneVisibilityPolicySnapshot {
    return this.routeSceneVisibilityPolicyRuntime.getSnapshot();
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = this.computeSnapshot();
    if (areAppRouteOverlaySessionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }
    this.snapshot = nextSnapshot;
    if (notify) {
      this.listeners.forEach((listener) => {
        listener();
      });
    }
  }

  private getSharedSnapState(): AppRouteOverlaySessionControllerSharedSnapState {
    const overlaySheetPositionState = this.routeSheetSnapSessionAuthority.getSnapshot();
    return {
      hasUserSharedSnap: overlaySheetPositionState.hasUserSharedSnap,
      sharedSnap: overlaySheetPositionState.sharedSnap,
    };
  }

  private createCurrentOriginContext(): SearchSessionOriginContext {
    const routeOverlayIdentitySnapshot = this.routeOverlayIdentityAuthority.getSnapshot();
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    const overlaySnap = this.getSharedSnapState();
    const rootOverlay = routeOverlayIdentitySnapshot.rootOverlayKey;
    return {
      rootOverlay,
      tabSnap: resolveSearchLaunchOriginSnap({
        overlay: rootOverlay,
        pollsSheetSnap: this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls'),
        bookmarksSheetSnap:
          this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('bookmarks'),
        profileSheetSnap: this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('profile'),
        isDockedPollsDismissed: sessionSnapshot.isDockedPollsDismissed,
        hasUserSharedSnap: overlaySnap.hasUserSharedSnap,
        sharedSnap: overlaySnap.sharedSnap,
      }),
    };
  }

  private captureSearchSessionOrigin(): void {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    this.routeSheetSnapSessionActions.setPendingOriginRestoreContext(null);
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
    if (sessionSnapshot.capturedOriginContext) {
      return;
    }
    this.routeSheetSnapSessionActions.setCapturedOriginContext(this.createCurrentOriginContext());
  }

  private armSearchCloseRestore({
    allowFallback = false,
    searchRootRestoreSnap,
  }: AppRouteSearchCloseRestoreOptions = {}): boolean {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    const resolvedOriginContext =
      sessionSnapshot.capturedOriginContext ??
      (allowFallback ? this.createCurrentOriginContext() : null);
    const nextOriginContext =
      resolvedOriginContext?.rootOverlay === 'search' && searchRootRestoreSnap
        ? {
            ...resolvedOriginContext,
            tabSnap: searchRootRestoreSnap,
          }
        : resolvedOriginContext;
    const shouldRestoreOrigin = nextOriginContext != null;
    this.routeSheetSnapSessionActions.setPendingOriginRestoreContext(nextOriginContext);
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
    this.routeSheetSnapSessionActions.setCapturedOriginContext(null);
    return shouldRestoreOrigin;
  }

  private commitSearchCloseRestore(): boolean {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    const hasPendingOrigin = sessionSnapshot.pendingOriginRestoreContext != null;
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(hasPendingOrigin);
    return hasPendingOrigin;
  }

  private cancelSearchCloseRestore(): void {
    this.routeSheetSnapSessionActions.setPendingOriginRestoreContext(null);
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
  }

  private prepareSearchSessionEntry(options?: { captureOrigin?: boolean }): void {
    const routeOverlayIdentitySnapshot = this.routeOverlayIdentityAuthority.getSnapshot();
    if (options?.captureOrigin) {
      this.captureSearchSessionOrigin();
    }
    this.routeSearchCommandActions.ensureAppSearchRouteSearchEntry({
      rootOverlay: routeOverlayIdentitySnapshot.rootOverlayKey,
      activeOverlayKey: routeOverlayIdentitySnapshot.activeOverlayRouteKey,
    });
  }

  private restorePendingOrigin(
    rootOverlayKey: OverlayKey,
    tabSnap: Exclude<SearchOverlaySheetSnap, 'hidden'>
  ): void {
    const resolvedRootOverlay = rootOverlayKey === 'polls' ? 'search' : rootOverlayKey;
    this.routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: resolvedRootOverlay,
      snapTarget: tabSnap,
    });
  }

  private flushPendingSearchOriginRestore(): boolean {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    const pendingOrigin = sessionSnapshot.pendingOriginRestoreContext;
    if (!pendingOrigin) {
      return false;
    }
    this.routeSheetSnapSessionActions.setPendingOriginRestoreContext(null);
    this.routeSheetSnapSessionActions.setNavRestorePending(false);
    this.restorePendingOrigin(pendingOrigin.rootOverlay, pendingOrigin.tabSnap);
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
    return true;
  }

  private requestDefaultPostSearchRestore(): void {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    this.routeSheetSnapSessionActions.setNavRestorePending(false);
    if (sessionSnapshot.pendingOriginRestoreContext) {
      this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
      return;
    }
    this.routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'search',
      snapTarget: 'collapsed',
    });
    this.routeSheetSnapSessionActions.setIsSearchOriginRestorePending(false);
  }

  private handleRootOverlayTransition(): void {
    const routeOverlayIdentitySnapshot = this.routeOverlayIdentityAuthority.getSnapshot();
    const rootOverlay = routeOverlayIdentitySnapshot.rootOverlayKey;
    const previousRootOverlay = this.previousRootOverlay;
    this.previousRootOverlay = rootOverlay;
    if (rootOverlay !== 'search') {
      return;
    }
    if (!previousRootOverlay || previousRootOverlay === 'search') {
      return;
    }
    this.routeSearchCommandActions.ensureAppSearchRouteSearchEntry({
      rootOverlay,
      activeOverlayKey: routeOverlayIdentitySnapshot.activeOverlayRouteKey,
      snap: 'collapsed',
    });
  }

  private computeSnapshot(): AppRouteOverlaySessionSnapshot {
    const routeOverlayIdentitySnapshot = this.routeOverlayIdentityAuthority.getSnapshot();
    const routeScenePolicySnapshot = this.routeScenePolicyAuthority.getSnapshot();
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    const shouldShowDockedPollsTarget =
      routeOverlayIdentitySnapshot.rootOverlayKey === 'search' &&
      routeScenePolicySnapshot.chromeSurfaceTarget === 'polls' &&
      !sessionSnapshot.isSearchOriginRestorePending &&
      !sessionSnapshot.isDockedPollsDismissed;

    return {
      isSearchOriginRestorePending: sessionSnapshot.isSearchOriginRestorePending,
      shouldShowDockedPollsTarget,
      shouldShowDockedPolls: shouldShowDockedPollsTarget,
      shouldShowPollsSheet: shouldShowDockedPollsTarget,
    };
  }

  private handleNavRestorePending(): void {
    const sessionSnapshot = this.routeSheetSnapSessionAuthority.getSnapshot();
    if (!sessionSnapshot.isNavRestorePending) {
      return;
    }
    const routeOverlayIdentitySnapshot = this.routeOverlayIdentityAuthority.getSnapshot();
    if (routeOverlayIdentitySnapshot.rootOverlayKey !== 'search') {
      this.routeSheetSnapSessionActions.setNavRestorePending(false);
      return;
    }
    if (!this.computeSnapshot().shouldShowDockedPollsTarget) {
      return;
    }
    if (this.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls') === 'hidden') {
      return;
    }
    this.routeSheetSnapSessionActions.setNavRestorePending(false);
  }
}

export const createAppRouteOverlaySessionStateController = (
  args: AppRouteOverlaySessionStateControllerArgs
): AppRouteOverlaySessionStateController => new AppRouteOverlaySessionStateController(args);
