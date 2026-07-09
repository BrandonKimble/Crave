import React from 'react';

import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';
import type { OverlayKey, OverlaySheetSnap } from '../../overlays/types';
import type { SearchRouteSceneSnapMeta } from '../../overlays/searchRouteSceneShellMotionContract';

type Listener = () => void;

export type RouteSheetSharedSnap = Exclude<OverlaySheetSnap, 'hidden' | 'collapsed'>;

export const ROUTE_SHARED_SNAP_PERSISTENCE_KEY = 'search-route-shared-snap';

export type AppRouteSheetSnapSessionSnapshot = Readonly<{
  isDockedPollsDismissed: boolean;
  isNavRestorePending: boolean;
  pendingOriginRestoreContext: OriginSnapshot | null;
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

export type AppRouteSheetSnapSessionActions = {
  setIsDockedPollsDismissed: (next: React.SetStateAction<boolean>) => void;
  dismissDockedPolls: () => void;
  setNavRestorePending: (next: boolean) => void;
  setPendingOriginRestoreContext: (next: OriginSnapshot | null) => void;
  setIsSearchOriginRestorePending: (next: boolean) => void;
  recordRouteSceneSheetSettle: (args: { sceneKey: OverlayKey; snap: OverlaySheetSnap }) => void;
  settleRouteSceneTabSnap: (args: {
    sceneKey: 'bookmarks' | 'profile';
    snap: OverlaySheetSnap;
  }) => void;
  settleRouteScenePollsSnap: (args: {
    rootOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
    source?: SearchRouteSceneSnapMeta['source'];
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
  isDockedPollsDismissed: false,
  isNavRestorePending: false,
  pendingOriginRestoreContext: null,
  isSearchOriginRestorePending: false,
  sceneSheetSnaps: {
    polls: 'collapsed',
  },
  hasUserSharedSnap: false,
  sharedSnap: DEFAULT_SHARED_SNAP,
  persistentSnaps: {},
});

const resolveStateUpdate = <TValue>(current: TValue, next: React.SetStateAction<TValue>): TValue =>
  typeof next === 'function' ? (next as (value: TValue) => TValue)(current) : next;

// CURATED POLICY (intentionally NOT derived from metadata): the scenes whose
// user-drag persists as the *shared* sheet snap (carried across scenes). This is
// a product decision, not a structural property — it deliberately includes the
// poll children (pollCreation/pollDetail) and restaurant-under-search but EXCLUDES
// saveList (which opens at its own snap and doesn't write it
// back) and search (own snap model). It does not align with `role`, `sheetPolicy`,
// or `snapPersistence`, so it can't be derived without changing snap behavior.
// Degrades gracefully: a forgotten scene simply won't persist its snap. When you
// add a shared-sheet scene, decide here whether its drag should persist.
const isSharedOverlaySnapOwner = ({
  rootOverlay,
  activeOverlayKey,
}: {
  rootOverlay: OverlayKey;
  activeOverlayKey: OverlayKey;
}): boolean =>
  activeOverlayKey === 'polls' ||
  activeOverlayKey === 'pollCreation' ||
  activeOverlayKey === 'pollDetail' ||
  activeOverlayKey === 'bookmarks' ||
  activeOverlayKey === 'profile' ||
  (rootOverlay === 'search' && activeOverlayKey === 'restaurant');

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

  public readonly authority: AppRouteSheetSnapSessionAuthority = {
    subscribe: (listener) => this.subscribe(listener),
    getSnapshot: () => this.snapshot,
  };

  public readonly actions: AppRouteSheetSnapSessionActions = {
    setIsDockedPollsDismissed: (next) => {
      this.commit({
        isDockedPollsDismissed: resolveStateUpdate(this.snapshot.isDockedPollsDismissed, next),
      });
    },
    dismissDockedPolls: () => {
      this.dismissDockedPolls();
    },
    setNavRestorePending: (next) => {
      this.commit({ isNavRestorePending: next });
    },
    setPendingOriginRestoreContext: (next) => {
      this.commit({ pendingOriginRestoreContext: next });
    },
    setIsSearchOriginRestorePending: (next) => {
      this.commit({ isSearchOriginRestorePending: next });
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

  private dismissDockedPolls(): void {
    this.commit({
      isDockedPollsDismissed: true,
      sceneSheetSnaps:
        this.snapshot.sceneSheetSnaps.polls === 'hidden'
          ? this.snapshot.sceneSheetSnaps
          : {
              ...this.snapshot.sceneSheetSnaps,
              polls: 'hidden',
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
    rootOverlay,
    activeOverlayKey,
    snap,
  }: {
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
  }): void {
    // recordUserSnap persists only USER (gesture-sourced) snaps — the sole call site gates on
    // meta.source==='gesture' (app-route-sheet-host-authority-controller.ts). A programmatic
    // origin-restore morph emits a single snapTo to the CAPTURED detent and never reaches here, so
    // it can't pollute the persisted shared snap; no restore-transaction guard is needed.
    if (!isSharedOverlaySnapOwner({ rootOverlay, activeOverlayKey })) {
      return;
    }
    if (snap === 'hidden' || snap === 'collapsed') {
      return;
    }
    this.setSharedSnap(snap);
  }

  private settleRouteSceneTabSnap({
    sceneKey,
    snap,
  }: {
    sceneKey: 'bookmarks' | 'profile';
    snap: OverlaySheetSnap;
  }): void {
    this.recordRouteSceneSheetSettle({ sceneKey, snap });
  }

  private settleRouteScenePollsSnap({
    rootOverlayKey,
    snap,
    source,
  }: {
    rootOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
    source?: SearchRouteSceneSnapMeta['source'];
  }): void {
    this.recordRouteSceneSheetSettle({
      sceneKey: 'polls',
      snap,
    });
    if (source === 'gesture' && snap !== 'hidden') {
      this.actions.setIsDockedPollsDismissed(false);
    }
    if (snap === 'collapsed') {
      this.actions.setIsDockedPollsDismissed(false);
    }
    if (snap !== 'hidden') {
      return;
    }
    if (rootOverlayKey !== 'search') {
      return;
    }
    if (source !== 'gesture') {
      return;
    }
    this.dismissDockedPolls();
  }
}

export const createAppRouteSheetSnapSessionRuntime = (): AppRouteSheetSnapSessionRuntime =>
  new AppRouteSheetSnapSessionController();
