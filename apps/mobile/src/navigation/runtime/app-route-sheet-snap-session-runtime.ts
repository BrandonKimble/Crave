import React from 'react';

import type { SearchSessionOriginContext } from '../../overlays/searchRouteSessionTypes';
import type { OverlayKey, OverlaySheetSnap } from '../../overlays/types';
import type { SearchRouteSceneSnapMeta } from '../../overlays/searchRouteSceneShellMotionContract';
import type { AppRouteSceneTransitionAuthority } from './app-route-scene-switch-authority';
import type { RouteSceneSwitchTransitionActions } from './app-route-scene-switch-controller';

type Listener = () => void;

export type RouteSheetSharedSnap = Exclude<OverlaySheetSnap, 'hidden' | 'collapsed'>;

export const ROUTE_SHARED_SNAP_PERSISTENCE_KEY = 'search-route-shared-snap';

export type DockedPollsSnapRequest = {
  snap: OverlaySheetSnap;
  token: number;
};

export type AppRouteSheetSnapSessionSnapshot = Readonly<{
  pollsDockedSnapRequest: DockedPollsSnapRequest | null;
  isDockedPollsDismissed: boolean;
  dockedPollsRestoreInFlight: boolean;
  ignoreDockedPollsHiddenUntilMs: number;
  pollCreationSnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
  isNavRestorePending: boolean;
  capturedOriginContext: SearchSessionOriginContext | null;
  pendingOriginRestoreContext: SearchSessionOriginContext | null;
  isSearchOriginRestorePending: boolean;
  sceneSheetSnaps: Readonly<Partial<Record<OverlayKey, OverlaySheetSnap>>>;
  hasUserSharedSnap: boolean;
  sharedSnap: RouteSheetSharedSnap;
  persistentSnaps: Readonly<Record<string, OverlaySheetSnap>>;
}>;

export type AppRouteSheetSnapSessionAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => AppRouteSheetSnapSessionSnapshot;
};

type RequestRouteSceneDockedPollsRestoreArgs = {
  snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  isDockedPollsDismissed?: boolean;
  hasUserSharedSnap?: boolean;
  sharedSnap?: RouteSheetSharedSnap;
};

export type AppRouteSheetSnapSessionActions = {
  setPollsDockedSnapRequest: (next: React.SetStateAction<DockedPollsSnapRequest | null>) => void;
  setIsDockedPollsDismissed: (next: React.SetStateAction<boolean>) => void;
  setDockedPollsRestoreInFlight: (next: React.SetStateAction<boolean>) => void;
  setIgnoreDockedPollsHiddenUntilMs: (next: React.SetStateAction<number>) => void;
  setPollCreationSnapRequest: (
    next: React.SetStateAction<Exclude<OverlaySheetSnap, 'hidden'> | null>
  ) => void;
  setNavRestorePending: (next: boolean) => void;
  setCapturedOriginContext: (next: SearchSessionOriginContext | null) => void;
  setPendingOriginRestoreContext: (next: SearchSessionOriginContext | null) => void;
  setIsSearchOriginRestorePending: (next: boolean) => void;
  requestRouteSceneDockedPollsRestore: (args?: RequestRouteSceneDockedPollsRestoreArgs) => void;
  requestRouteScenePollCreationExpand: () => void;
  recordRouteSceneSheetSettle: (args: { sceneKey: OverlayKey; snap: OverlaySheetSnap }) => void;
  settleRouteSceneTabSnap: (args: {
    sceneKey: 'bookmarks' | 'profile';
    snap: OverlaySheetSnap;
    rootOverlayKey: OverlayKey;
    isOverlaySwitchInFlight: boolean;
    returnToDockedSearch: () => void;
  }) => void;
  settleRouteScenePollsSnap: (args: {
    rootOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
    source?: SearchRouteSceneSnapMeta['source'];
    routeSceneTransitionAuthority: Pick<AppRouteSceneTransitionAuthority, 'getSnapshot'>;
    routeSceneSwitchActions: Pick<
      RouteSceneSwitchTransitionActions,
      'clearDockedPollsRestoreIntent'
    >;
  }) => void;
  getRouteSceneSwitchSceneSnap: (sceneKey: OverlayKey) => OverlaySheetSnap;
  getPersistentSnap: (key: string) => OverlaySheetSnap | null;
  recordPersistentSnap: (options: { key: string; snap: OverlaySheetSnap }) => void;
  setSharedSnap: (snap: RouteSheetSharedSnap) => void;
  recordUserSnap: (options: {
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
  }) => void;
};

export type AppRouteSheetSnapSessionRuntime = {
  authority: AppRouteSheetSnapSessionAuthority;
  actions: AppRouteSheetSnapSessionActions;
  dispose: () => void;
};

const DEFAULT_SHARED_SNAP: RouteSheetSharedSnap = 'expanded';

const createInitialSnapshot = (): AppRouteSheetSnapSessionSnapshot => ({
  pollsDockedSnapRequest: null,
  isDockedPollsDismissed: false,
  dockedPollsRestoreInFlight: false,
  ignoreDockedPollsHiddenUntilMs: 0,
  pollCreationSnapRequest: null,
  isNavRestorePending: false,
  capturedOriginContext: null,
  pendingOriginRestoreContext: null,
  isSearchOriginRestorePending: false,
  sceneSheetSnaps: {},
  hasUserSharedSnap: false,
  sharedSnap: DEFAULT_SHARED_SNAP,
  persistentSnaps: {},
});

const resolveStateUpdate = <TValue>(current: TValue, next: React.SetStateAction<TValue>): TValue =>
  typeof next === 'function' ? (next as (value: TValue) => TValue)(current) : next;

const isSharedOverlayKey = (overlayKey: OverlayKey): boolean =>
  overlayKey === 'polls' ||
  overlayKey === 'pollCreation' ||
  overlayKey === 'bookmarks' ||
  overlayKey === 'profile';

export const useAppRouteSheetSnapSessionSelector = <TSelected>({
  authority,
  selector,
  isEqual = Object.is,
}: {
  authority: AppRouteSheetSnapSessionAuthority;
  selector: (snapshot: AppRouteSheetSnapSessionSnapshot) => TSelected;
  isEqual?: (left: TSelected, right: TSelected) => boolean;
}): TSelected => {
  const selectedRef = React.useRef<TSelected>(selector(authority.getSnapshot()));
  return React.useSyncExternalStore(
    authority.subscribe,
    () => {
      const nextSelected = selector(authority.getSnapshot());
      if (!isEqual(selectedRef.current, nextSelected)) {
        selectedRef.current = nextSelected;
      }
      return selectedRef.current;
    },
    () => selectedRef.current
  );
};

class AppRouteSheetSnapSessionController implements AppRouteSheetSnapSessionRuntime {
  private readonly listeners = new Set<Listener>();

  private snapshot = createInitialSnapshot();

  private nextDockedPollsSnapRequestToken = 0;

  public readonly authority: AppRouteSheetSnapSessionAuthority = {
    subscribe: (listener) => this.subscribe(listener),
    getSnapshot: () => this.snapshot,
  };

  public readonly actions: AppRouteSheetSnapSessionActions = {
    setPollsDockedSnapRequest: (next) => {
      this.commit({
        pollsDockedSnapRequest: resolveStateUpdate(this.snapshot.pollsDockedSnapRequest, next),
      });
    },
    setIsDockedPollsDismissed: (next) => {
      this.commit({
        isDockedPollsDismissed: resolveStateUpdate(this.snapshot.isDockedPollsDismissed, next),
      });
    },
    setDockedPollsRestoreInFlight: (next) => {
      this.commit({
        dockedPollsRestoreInFlight: resolveStateUpdate(
          this.snapshot.dockedPollsRestoreInFlight,
          next
        ),
      });
    },
    setIgnoreDockedPollsHiddenUntilMs: (next) => {
      this.commit({
        ignoreDockedPollsHiddenUntilMs: resolveStateUpdate(
          this.snapshot.ignoreDockedPollsHiddenUntilMs,
          next
        ),
      });
    },
    setPollCreationSnapRequest: (next) => {
      this.commit({
        pollCreationSnapRequest: resolveStateUpdate(this.snapshot.pollCreationSnapRequest, next),
      });
    },
    setNavRestorePending: (next) => {
      this.commit({ isNavRestorePending: next });
    },
    setCapturedOriginContext: (next) => {
      this.commit({ capturedOriginContext: next });
    },
    setPendingOriginRestoreContext: (next) => {
      this.commit({ pendingOriginRestoreContext: next });
    },
    setIsSearchOriginRestorePending: (next) => {
      this.commit({ isSearchOriginRestorePending: next });
    },
    requestRouteSceneDockedPollsRestore: (args = {}) => {
      this.requestRouteSceneDockedPollsRestore(args);
    },
    requestRouteScenePollCreationExpand: () => {
      this.requestRouteScenePollCreationExpand();
    },
    recordRouteSceneSheetSettle: (args) => {
      this.recordRouteSceneSheetSettle(args);
    },
    settleRouteSceneTabSnap: (args) => {
      this.settleRouteSceneTabSnap(args);
    },
    settleRouteScenePollsSnap: (args) => {
      this.settleRouteScenePollsSnap(args);
    },
    getRouteSceneSwitchSceneSnap: (sceneKey) => this.getRouteSceneSwitchSceneSnap(sceneKey),
    getPersistentSnap: (key) => this.snapshot.persistentSnaps[key] ?? null,
    recordPersistentSnap: (options) => {
      this.recordPersistentSnap(options);
    },
    setSharedSnap: (snap) => {
      this.setSharedSnap(snap);
    },
    recordUserSnap: (options) => {
      this.recordUserSnap(options);
    },
  };

  public dispose(): void {
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private commit(partial: Partial<AppRouteSheetSnapSessionSnapshot>): void {
    let didChange = false;
    for (const key of Object.keys(partial) as Array<keyof AppRouteSheetSnapSessionSnapshot>) {
      if (this.snapshot[key] !== partial[key]) {
        didChange = true;
        break;
      }
    }
    if (!didChange) {
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      ...partial,
    };
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private getRouteSceneSwitchSceneSnap(sceneKey: OverlayKey): OverlaySheetSnap {
    return this.snapshot.sceneSheetSnaps[sceneKey] ?? 'hidden';
  }

  private recordRouteSceneSheetSettle({
    sceneKey,
    snap,
  }: {
    sceneKey: OverlayKey;
    snap: OverlaySheetSnap;
  }): void {
    if (this.snapshot.sceneSheetSnaps[sceneKey] === snap) {
      return;
    }
    this.commit({
      sceneSheetSnaps: {
        ...this.snapshot.sceneSheetSnaps,
        [sceneKey]: snap,
      },
    });
  }

  private recordPersistentSnap({ key, snap }: { key: string; snap: OverlaySheetSnap }): void {
    if (snap === 'hidden') {
      return;
    }
    if (key === ROUTE_SHARED_SNAP_PERSISTENCE_KEY && snap === 'collapsed') {
      return;
    }
    if (this.snapshot.persistentSnaps[key] === snap) {
      return;
    }
    this.commit({
      persistentSnaps: {
        ...this.snapshot.persistentSnaps,
        [key]: snap,
      },
    });
  }

  private setSharedSnap(snap: RouteSheetSharedSnap): void {
    const shouldUpdateSharedSnap =
      !this.snapshot.hasUserSharedSnap || this.snapshot.sharedSnap !== snap;
    const shouldUpdatePersistentSnap =
      this.snapshot.persistentSnaps[ROUTE_SHARED_SNAP_PERSISTENCE_KEY] !== snap;
    const partial: Partial<AppRouteSheetSnapSessionSnapshot> = {
      ...(shouldUpdateSharedSnap
        ? {
            hasUserSharedSnap: true,
            sharedSnap: snap,
          }
        : {}),
      ...(shouldUpdatePersistentSnap
        ? {
            persistentSnaps: {
              ...this.snapshot.persistentSnaps,
              [ROUTE_SHARED_SNAP_PERSISTENCE_KEY]: snap,
            },
          }
        : {}),
    };
    this.commit(partial);
  }

  private recordUserSnap({
    activeOverlayKey,
    snap,
  }: {
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
  }): void {
    if (!isSharedOverlayKey(activeOverlayKey)) {
      return;
    }
    if (snap === 'hidden' || snap === 'collapsed') {
      return;
    }
    this.setSharedSnap(snap);
  }

  private requestRouteSceneDockedPollsRestore({
    snap,
    isDockedPollsDismissed,
    hasUserSharedSnap,
    sharedSnap,
  }: RequestRouteSceneDockedPollsRestoreArgs): void {
    const ignoreDockedPollsHiddenUntilMs = Date.now() + 650;
    const currentPollsSheetSnap = this.getRouteSceneSwitchSceneSnap('polls');
    const currentDockedDismissed = isDockedPollsDismissed ?? this.snapshot.isDockedPollsDismissed;
    const currentHasUserSharedSnap = hasUserSharedSnap ?? this.snapshot.hasUserSharedSnap;
    const currentSharedSnap = sharedSnap ?? this.snapshot.sharedSnap;
    const isImplicitRecallFromHidden = snap == null && currentPollsSheetSnap === 'hidden';
    const resolvedSnap: Exclude<OverlaySheetSnap, 'hidden'> =
      snap ??
      (currentPollsSheetSnap !== 'hidden'
        ? currentPollsSheetSnap
        : currentDockedDismissed
        ? 'collapsed'
        : currentHasUserSharedSnap
        ? currentSharedSnap
        : 'collapsed');
    const previous = this.snapshot.pollsDockedSnapRequest;
    let pollsDockedSnapRequest = previous;
    if (
      snap == null &&
      resolvedSnap === 'collapsed' &&
      previous &&
      previous.snap !== 'collapsed' &&
      !isImplicitRecallFromHidden
    ) {
      pollsDockedSnapRequest = previous;
    } else {
      this.nextDockedPollsSnapRequestToken += 1;
      pollsDockedSnapRequest = {
        snap: resolvedSnap,
        token: this.nextDockedPollsSnapRequestToken,
      };
    }
    this.commit({
      ignoreDockedPollsHiddenUntilMs,
      dockedPollsRestoreInFlight: true,
      isDockedPollsDismissed: false,
      pollsDockedSnapRequest,
    });
  }

  private requestRouteScenePollCreationExpand(): void {
    if (this.getRouteSceneSwitchSceneSnap('polls') !== 'collapsed') {
      return;
    }
    this.actions.setPollCreationSnapRequest(
      this.snapshot.hasUserSharedSnap ? this.snapshot.sharedSnap : 'expanded'
    );
  }

  private settleRouteSceneTabSnap({
    sceneKey,
    snap,
    rootOverlayKey,
    isOverlaySwitchInFlight,
    returnToDockedSearch,
  }: {
    sceneKey: 'bookmarks' | 'profile';
    snap: OverlaySheetSnap;
    rootOverlayKey: OverlayKey;
    isOverlaySwitchInFlight: boolean;
    returnToDockedSearch: () => void;
  }): void {
    this.recordRouteSceneSheetSettle({ sceneKey, snap });
    if (snap === 'hidden' && rootOverlayKey === sceneKey && !isOverlaySwitchInFlight) {
      returnToDockedSearch();
    }
  }

  private settleRouteScenePollsSnap({
    rootOverlayKey,
    snap,
    source,
    routeSceneTransitionAuthority,
    routeSceneSwitchActions,
  }: {
    rootOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
    source?: SearchRouteSceneSnapMeta['source'];
    routeSceneTransitionAuthority: Pick<AppRouteSceneTransitionAuthority, 'getSnapshot'>;
    routeSceneSwitchActions: Pick<
      RouteSceneSwitchTransitionActions,
      'clearDockedPollsRestoreIntent'
    >;
  }): void {
    const routeTransitionState = routeSceneTransitionAuthority.getSnapshot();
    const activeDockedRestoreIntent = routeTransitionState.activeDockedPollsRestoreIntent;
    this.recordRouteSceneSheetSettle({
      sceneKey: 'polls',
      snap,
    });
    if (
      activeDockedRestoreIntent &&
      (snap === activeDockedRestoreIntent.snap || source === 'gesture') &&
      snap !== 'hidden'
    ) {
      this.actions.setIsDockedPollsDismissed(false);
      routeSceneSwitchActions.clearDockedPollsRestoreIntent(
        activeDockedRestoreIntent.token,
        activeDockedRestoreIntent.snap
      );
    }
    if (snap === 'collapsed') {
      this.actions.setDockedPollsRestoreInFlight(false);
    }
    const sessionState = this.snapshot;
    if (sessionState.pollsDockedSnapRequest && sessionState.pollsDockedSnapRequest.snap === snap) {
      this.actions.setPollsDockedSnapRequest(null);
    }
    if (snap !== 'hidden') {
      return;
    }
    if (activeDockedRestoreIntent && source !== 'gesture') {
      return;
    }
    if (rootOverlayKey !== 'search') {
      return;
    }
    if (source !== 'gesture') {
      return;
    }
    const nextSessionState = this.snapshot;
    if (
      nextSessionState.dockedPollsRestoreInFlight ||
      nextSessionState.pollsDockedSnapRequest?.snap === 'collapsed' ||
      Date.now() < nextSessionState.ignoreDockedPollsHiddenUntilMs
    ) {
      return;
    }
    this.actions.setDockedPollsRestoreInFlight(false);
    this.actions.setPollsDockedSnapRequest(null);
    routeSceneSwitchActions.clearDockedPollsRestoreIntent(activeDockedRestoreIntent?.token);
    this.actions.setIsDockedPollsDismissed(true);
  }
}

export const createAppRouteSheetSnapSessionRuntime = (): AppRouteSheetSnapSessionRuntime =>
  new AppRouteSheetSnapSessionController();
