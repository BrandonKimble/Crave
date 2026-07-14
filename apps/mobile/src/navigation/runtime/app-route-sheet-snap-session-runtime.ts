import React from 'react';

import type { OverlayKey, OverlaySheetSnap } from '../../overlays/types';
import type { SearchRouteSceneSnapMeta } from '../../overlays/searchRouteSceneShellMotionContract';
import { resolveAppRouteSheetScenePolicy } from './app-route-scene-policy-registry';

type Listener = () => void;

// ─── THE TWO-POSTURE LAW (owner, 2026-07-12 — plans/root-snap-law.md §Leg 2) ─────────────────
// The app has exactly TWO root sheet postures, each remembering wherever the user's FINGER
// last put it: HOME's (the search root's docked-polls presentation) and ONE SHARED posture for
// every other root page. Switching tabs never moves the sheet except when crossing between
// home and the rest, where each side's remembered seat is restored (the descriptor table's
// 'postureSeat' rule). Cold start: home collapsed, content seat expanded.
//
// WRITE CONTRACT (gesture-only memory): seat writers are exactly (a) user-gesture settles,
// (b) the origin-restore seam, (c) named product intents (primeDockedPollsForHomeLanding /
// dismissDockedPolls). Programmatic settles READ seats but never write them — a programmatic
// writer reaching a seat write is a contract violation (loud __DEV__ error + dropped write),
// which makes the 2026-07-12 ledger-laundering bug class structurally unrepeatable.
export type RouteSheetSeatWriter = 'gesture' | 'named' | 'programmatic';

/** Cold-start seats: home at the bottom (map dominant), content pages fully extended. */
export const HOME_SEAT_SEED_SNAP: Exclude<OverlaySheetSnap, 'hidden'> = 'collapsed';
export const CONTENT_SEAT_SEED_SNAP: Exclude<OverlaySheetSnap, 'hidden'> = 'expanded';

/** The ONE sanctioned resurrect posture for user-dismissed docked polls (product moment). */
export const DOCKED_POLLS_RESURRECT_SNAP = 'collapsed' as const;

/**
 * STRUCTURAL FACT (declared once): home's sheet CARRIER is the docked-polls scene — when home
 * is presented, the scene fronting the shared sheet is 'polls', never 'search' (the 'search'
 * scene key is the results sheet, whose facts are search-session-scoped, not a root posture).
 */
export const HOME_SEAT_CARRIER_SCENE_KEY: OverlayKey = 'polls';

/**
 * Which posture seat a scene presents at as a NAV-PAGE (topLevelSwitch) target. DERIVED from
 * the scene-policy registry's exhaustive `postureSeat` declaration — a new root page declares
 * its seat there (compile-forced) and this resolver, the descriptor table's topLevelSwitch
 * rows, and the seat storage below all follow. No hand-maintained scene list.
 */
export const resolveNavTargetPostureSeat = (sceneKey: OverlayKey): 'home' | 'content' | null =>
  resolveAppRouteSheetScenePolicy(sceneKey).postureSeat;

/**
 * Which posture seat (if any) a scene's OWN snap facts live in (seat storage routing). Same
 * derivation as the nav-target seat, with the one named structural exception: on the home side
 * only the CARRIER scene ('polls') owns the home seat — 'search' settles are the results
 * sheet's, recorded as search-session facts, never home posture.
 */
export const resolveSheetPostureSeat = (sceneKey: OverlayKey): 'home' | 'content' | null => {
  const navSeat = resolveNavTargetPostureSeat(sceneKey);
  if (navSeat === 'home') {
    return sceneKey === HOME_SEAT_CARRIER_SCENE_KEY ? 'home' : null;
  }
  return navSeat;
};

export type AppRouteSheetSnapSessionSnapshot = Readonly<{
  isDockedPollsDismissed: boolean;
  /** HOME's remembered posture ('hidden' = docked polls physically dismissed). */
  homeSeatSnap: OverlaySheetSnap;
  /** The ONE shared posture of every non-home root page (never hidden). */
  contentSeatSnap: Exclude<OverlaySheetSnap, 'hidden'>;
  /** Per-scene facts for CHILD scenes + the search session (closeChild/origin restores). */
  sceneSheetSnaps: Readonly<Partial<Record<OverlayKey, OverlaySheetSnap>>>;
  /** Per-scene `overlay:` snap persistence (`snapPersistence:'scene'` — no shared lane). */
  persistentSnaps: Readonly<Record<string, OverlaySheetSnap>>;
}>;

export type AppRouteSheetSnapSessionAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => AppRouteSheetSnapSessionSnapshot;
};

export type AppRouteSheetSnapSessionActions = {
  setIsDockedPollsDismissed: (next: React.SetStateAction<boolean>) => void;
  dismissDockedPolls: () => void;
  /**
   * The ONE snap-fact write. `writer` is REQUIRED so every call site declares which sanctioned
   * seat writer it is; 'programmatic' targeting a posture seat is dropped with a __DEV__ error
   * (the two-posture write contract). Non-seat (child/search-session) facts record for any
   * writer — their sheet position is programmatic by construction.
   */
  recordRouteSceneSheetSettle: (args: {
    sceneKey: OverlayKey;
    snap: OverlaySheetSnap;
    writer: RouteSheetSeatWriter;
  }) => void;
  settleRouteScenePollsSnap: (args: {
    rootOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
    source?: SearchRouteSceneSnapMeta['source'];
  }) => void;
  getRouteSceneSwitchSceneSnap: (sceneKey: OverlayKey) => OverlaySheetSnap;
  getPersistentSnap: (key: string) => OverlaySheetSnap | null;
  recordPersistentSnap: (options: { key: string; snap: OverlaySheetSnap }) => void;
};

export type AppRouteSheetSnapSessionRuntime = {
  authority: AppRouteSheetSnapSessionAuthority;
  actions: AppRouteSheetSnapSessionActions;
  dispose: () => void;
};

const createInitialSnapshot = (): AppRouteSheetSnapSessionSnapshot => ({
  isDockedPollsDismissed: false,
  homeSeatSnap: HOME_SEAT_SEED_SNAP,
  contentSeatSnap: CONTENT_SEAT_SEED_SNAP,
  sceneSheetSnaps: {},
  persistentSnaps: {},
});

const resolveStateUpdate = <TValue>(current: TValue, next: React.SetStateAction<TValue>): TValue =>
  typeof next === 'function' ? (next as (value: TValue) => TValue)(current) : next;

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
    recordRouteSceneSheetSettle: (args) => {
      this.recordRouteSceneSheetSettle(args);
    },
    settleRouteScenePollsSnap: (args) => {
      this.settleRouteScenePollsSnap(args);
    },
    getRouteSceneSwitchSceneSnap: (sceneKey) => this.getRouteSceneSwitchSceneSnap(sceneKey),
    getPersistentSnap: (key) => this.snapshot.persistentSnaps[key] ?? null,
    recordPersistentSnap: (options) => {
      this.recordPersistentSnap(options);
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
    const seat = resolveSheetPostureSeat(sceneKey);
    if (seat === 'home') {
      return this.snapshot.homeSeatSnap;
    }
    if (seat === 'content') {
      return this.snapshot.contentSeatSnap;
    }
    return this.snapshot.sceneSheetSnaps[sceneKey] ?? 'hidden';
  }

  private recordRouteSceneSheetSettle({
    sceneKey,
    snap,
    writer,
  }: {
    sceneKey: OverlayKey;
    snap: OverlaySheetSnap;
    writer: RouteSheetSeatWriter;
  }): void {
    const seat = resolveSheetPostureSeat(sceneKey);
    if (seat != null) {
      // Two-posture write contract: programmatic settles read seats, never write them.
      // A violation here means a settle hook lost its gesture gate — fix the caller.
      if (writer === 'programmatic') {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          // eslint-disable-next-line no-console
          console.error(
            `[snap-law] CONTRACT VIOLATION: programmatic settle attempted to write the ${seat} ` +
              `posture seat (scene=${sceneKey}, snap=${snap}) — gesture/named writers only`
          );
        }
        return;
      }
      if (seat === 'content') {
        if (snap === 'hidden') {
          // 'hidden' is not a content posture (the content seat has no dismissal concept).
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            // eslint-disable-next-line no-console
            console.error(
              `[snap-law] CONTRACT VIOLATION: 'hidden' written to the content posture seat ` +
                `(scene=${sceneKey}, writer=${writer})`
            );
          }
          return;
        }
        this.commit({ contentSeatSnap: snap });
        return;
      }
      this.commit({ homeSeatSnap: snap });
      return;
    }
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
      homeSeatSnap: 'hidden',
    });
  }

  private recordPersistentSnap({ key, snap }: { key: string; snap: OverlaySheetSnap }): void {
    if (snap === 'hidden') {
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

  private settleRouteScenePollsSnap({
    rootOverlayKey,
    snap,
    source,
  }: {
    rootOverlayKey: OverlayKey;
    snap: OverlaySheetSnap;
    source?: SearchRouteSceneSnapMeta['source'];
  }): void {
    // Gesture-only seat memory (two-posture law): the HOME seat records only what the user's
    // finger did. The isDockedPollsDismissed flag arms below stay on EVERY settle — they are
    // lane-dismissal semantics, not posture memory. This gate is what killed the laundering
    // bug (a programmatic collapsed arrival used to overwrite the remembered posture).
    if (source === 'gesture') {
      this.recordRouteSceneSheetSettle({
        sceneKey: 'polls',
        snap,
        writer: 'gesture',
      });
    }
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
