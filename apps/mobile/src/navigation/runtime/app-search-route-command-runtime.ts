import type { OverlayKey, OverlaySheetSnap } from '../../overlays/types';
import { getAppOverlayRouteMetadata, type OverlayRouteParamsMap } from './app-overlay-route-types';
import type { AppRouteSceneSwitchAuthority } from './app-route-scene-switch-authority';
import type { RouteSceneSwitchTransitionActions } from './app-route-scene-switch-controller';
import type { AppRouteSheetSnapSessionActions } from './app-route-sheet-snap-session-runtime';

// BUG 1 (canonical-transition-finish-plan.md §Phase 5 / Layer 3 origin axis): a
// restaurant profile opens via `ensureAppSearchRouteSearchScene` (ensure the search
// surface is the base) followed by a restaurant-route PUSH. When the active scene is
// already a shared-sheet CHILD overlay (a restaurant profile, a pollDetail, etc.), the
// search surface is ALREADY the base — and a `setRoot search` here is actively harmful:
//  • It clobbers the child off the route stack (the profile opens BEHIND pollDetail —
//    the documented BUG 1) instead of letting the restaurant push COVER it.
//  • It re-mounts the search map every time, which re-fires the seeded pin's native
//    marker-press → re-opens the profile → re-resets → an infinite setRoot⇄push
//    oscillation (the "sheet jerks / map pans behind" symptom), reproducible even from
//    the docked-search home reveal, not just from pollDetail.
// So for a child-overlay origin, skip the reset and let the subsequent restaurant push
// do the covering: the stack stays [search, …origin, restaurant], restaurant is the
// visible top, and a dismiss pops back to the origin (return-to-origin).
const isSharedSheetChildSceneKey = (sceneKey: OverlayKey | null | undefined): boolean => {
  if (sceneKey == null) {
    return false;
  }
  const metadata = getAppOverlayRouteMetadata(sceneKey);
  return metadata.role === 'child' && metadata.sheetPolicy === 'sharedPhysicalSheet';
};

export type AppSearchRouteCommandActions = {
  openAppSearchRouteResults: (args: {
    snap: Exclude<OverlaySheetSnap, 'hidden'>;
    mode?: 'spring' | 'instant';
    // Phase 2 — the redraw transactionId of the search results transaction driving
    // this reveal. Threaded into the switch so the controller links the redraw txn
    // (gate marks) to the minted settleToken (content plane). See the contract.
    contentReadinessTransactionId?: string | null;
  }) => void;
  dismissAppSearchRouteResultsToPolls: (args?: { sourceSceneKey?: OverlayKey }) => void;
  returnAppSearchRouteToDockedSearch: (args?: {
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  }) => void;
  ensureAppSearchRouteSearchScene: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
  openAppSearchRoutePollsHome: (args?: {
    params?: OverlayRouteParamsMap['polls'];
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  }) => void;
  ensureAppSearchRouteSearchEntry: (args: {
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  }) => void;
};

export const createAppSearchRouteCommandActions = ({
  routeSceneSwitchAuthority,
  routeSceneSwitchActions,
  routeSheetSnapSessionActions,
}: {
  routeSceneSwitchAuthority: Pick<AppRouteSceneSwitchAuthority, 'getSnapshot'>;
  routeSceneSwitchActions: RouteSceneSwitchTransitionActions;
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
}): AppSearchRouteCommandActions => {
  const openAppSearchRouteResults = ({
    snap,
    mode,
    contentReadinessTransactionId,
  }: {
    snap: Exclude<OverlaySheetSnap, 'hidden'>;
    mode?: 'spring' | 'instant';
    contentReadinessTransactionId?: string | null;
  }): void => {
    routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'search',
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'routeCommand',
      sheetMotion: { kind: 'snapTo', snap, mode },
      contentReadinessTransactionId: contentReadinessTransactionId ?? null,
    });
  };

  const dismissAppSearchRouteResultsToPolls = ({
    sourceSceneKey,
  }: {
    sourceSceneKey?: OverlayKey;
  } = {}): void => {
    routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
      sceneKey: 'polls',
      snap: 'collapsed',
    });
    routeSheetSnapSessionActions.setIsDockedPollsDismissed(false);
    routeSceneSwitchActions.requestOverlaySwitch({
      ...(sourceSceneKey != null ? { sourceSceneKey } : null),
      targetSceneKey: 'polls',
      sheetTransitionKind: 'terminalDismiss',
      sheetOpenerSource: 'systemDismiss',
      sheetMotion: { kind: 'snapTo', snap: 'collapsed' },
      contentHandoff: 'preserveOutgoingUntilSettle',
      routeAction: 'setRoot',
      dockedPollsRestoreSnap: 'collapsed',
    });
  };

  const returnAppSearchRouteToDockedSearch = ({
    snap = 'collapsed',
  }: {
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  } = {}): void => {
    routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'search',
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'routeCommand',
      sheetMotion: { kind: 'snapTo', snap },
      dockedPollsRestoreSnap: snap,
    });
  };

  const ensureAppSearchRouteSearchScene = ({
    snap = 'collapsed',
  }: {
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  } = {}): void => {
    const activeSceneKey = routeSceneSwitchAuthority.getSnapshot().routeActiveSceneKey;
    if (activeSceneKey === 'search') {
      return;
    }
    // BUG 1: a shared-sheet child overlay (restaurant / pollDetail / …) is already on
    // the search surface — resetting the root here clobbers it off the stack (profile
    // opens behind pollDetail) and drives the setRoot⇄push native-marker oscillation.
    // Skip the reset and let the restaurant push cover the current child instead.
    if (isSharedSheetChildSceneKey(activeSceneKey)) {
      return;
    }
    returnAppSearchRouteToDockedSearch({ snap });
  };

  const openAppSearchRoutePollsHome = ({
    params,
    snap = 'expanded',
  }: {
    params?: OverlayRouteParamsMap['polls'];
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  } = {}): void => {
    routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'polls',
      pollsParams: params ?? null,
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'navTab',
      sheetMotion: { kind: 'snapTo', snap },
    });
  };

  const ensureAppSearchRouteSearchEntry = ({
    rootOverlay,
    activeOverlayKey,
    snap = 'collapsed',
  }: {
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  }): void => {
    // Phase 1 (transition-engine-final-master-plan §5 Bug #1b / §7 Phase 1) — REVEAL
    // snap-overshoot fix. This is the SESSION-ENTRY re-root that runs on a reveal press-up
    // (search→results, comment-span→profile, recently-viewed restaurant tap). It exists only
    // to make `search` the route root; it must NOT move the sheet. Previously it emitted a
    // visible `snapTo:collapsed` (the gratuitous collapse) which — gated behind the async
    // restaurant fetch, then chased by the committed search's `snapTo:middle` — decomposed one
    // reveal tap into three fighting springs (down→up→no-op), visible as a drop-to-collapsed
    // then spring-back-up. The committed entity-search emits the SINGLE intended sheet motion
    // (openAppSearchRouteResults → snapTo:middle); this re-root must stay MOTIONLESS so that
    // one slide is the only motion.
    //
    // MOTIONLESS RE-ROOT — the exact pattern the child-origin dismiss already uses
    // (app-route-overlay-session-state-controller.ts:336-343): `sheetMotion:{kind:'none'}`
    // resolves to NO 'sheet' motion plane (resolveSnapTargetFromSheetMotion → null →
    // resolvedSheetIntent null → no 'sheet' plane), and `contentHandoff:'swapImmediately'`
    // keeps no content plane. With no camera/chrome delta the switch emits ZERO motion planes,
    // so it commits via the DIRECTION-AGNOSTIC idle-commit + synchronous settle-flush escape
    // hatch (runRouteSceneSwitchTransaction: motionPlanes.length === 0 → commitIdleState +
    // flushSettleCallbacks) — the same seam the {polls,search}@collapsed home dismiss rides,
    // now serving a FORWARD re-root too. `dockedPollsRestoreSnap: snap` re-arms the docked-polls
    // home exactly as the old visible re-root did.
    if (rootOverlay === 'search' && activeOverlayKey === 'search') {
      return;
    }
    if (__DEV__) {
      // [DISMISS-SEAM] dev trace — the favorites-as-search forward motionless re-root. Kept
      // behind __DEV__ for finger-testing the dismiss seam; never ships to release.
      // eslint-disable-next-line no-console
      console.log(
        `[DISMISS-SEAM] forward re-root motionless rootOverlay=${rootOverlay} activeOverlayKey=${activeOverlayKey} snap=${snap} sheetMotion=none swapImmediately`
      );
    }
    routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'search',
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'routeCommand',
      sheetMotion: { kind: 'none' },
      contentHandoff: 'swapImmediately',
      dockedPollsRestoreSnap: snap,
    });
  };

  return {
    openAppSearchRouteResults,
    dismissAppSearchRouteResultsToPolls,
    returnAppSearchRouteToDockedSearch,
    ensureAppSearchRouteSearchScene,
    openAppSearchRoutePollsHome,
    ensureAppSearchRouteSearchEntry,
  };
};
