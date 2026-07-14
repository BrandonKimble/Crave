import { hasSearchSessionAboveRoot } from './app-overlay-route-stack-algebra';
import {
  DOCKED_POLLS_RESURRECT_SNAP,
  HOME_SEAT_CARRIER_SCENE_KEY,
} from './app-route-sheet-snap-session-runtime';
import type { OverlayKey, OverlaySheetSnap } from '../../overlays/types';
import type { OverlayRouteParamsMap } from './app-overlay-route-types';
import type { AppRouteSceneSwitchAuthority } from './app-route-scene-switch-authority';
import type { RouteSceneSwitchTransitionActions } from './app-route-scene-switch-controller';
import type { AppRouteSheetSnapSessionActions } from './app-route-sheet-snap-session-runtime';

export type AppSearchRouteCommandActions = {
  openAppSearchRouteResults: (args: {
    snap: Exclude<OverlaySheetSnap, 'hidden'>;
    mode?: 'spring' | 'instant';
    // Phase 2 — the redraw transactionId of the search results transaction driving
    // this reveal. Threaded into the switch so the controller links the redraw txn
    // (gate marks) to the minted settleToken (content plane). See the contract.
    contentReadinessTransactionId?: string | null;
  }) => void;
  dismissAppSearchRouteResultsToHome: (args?: { sourceSceneKey?: OverlayKey }) => void;
  returnAppSearchRouteToDockedSearch: () => void;
  openAppSearchRoutePollsHome: (args?: {
    params?: OverlayRouteParamsMap['polls'];
    snap?: Exclude<OverlaySheetSnap, 'hidden'>;
  }) => void;
};

// S-C.5 item 4b VERDICT (probe 2026-07-10, plans/s-c5-restaurant-stack-fact.md): this pair is
// LOAD-BEARING, not derivable. A home dismissal RESURRECTS user-dismissed docked polls by
// design; without the explicit un-dismiss the settle-side clear is CIRCULAR (a dismissed lane
// never presents, so the polls sheet never settles collapsed, so the flag never clears) and
// the home lands with the stale results banner docked. ONE named intent, two callers (this
// verb + the no-origin clear-lane restore).
export const primeDockedPollsForHomeLanding = (
  routeSheetSnapSessionActions: Pick<
    AppRouteSheetSnapSessionActions,
    'recordRouteSceneSheetSettle' | 'setIsDockedPollsDismissed'
  >
): void => {
  // NAMED product intent — one of the sanctioned HOME-seat writers (two-posture write
  // contract): the results drag-to-bottom dismissal is a deliberate map-dominant moment.
  routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
    sceneKey: 'polls',
    snap: 'collapsed',
    writer: 'named',
  });
  routeSheetSnapSessionActions.setIsDockedPollsDismissed(false);
};

/**
 * NAV RE-TAP (wave-2 charter §4 / leg 6 — plans/root-snap-law.md writer category (c)):
 * tapping the ACTIVE tab is a NAMED PRODUCT INTENT — extend the root's shared sheet to
 * FULLY EXTENDED and remember it in the side's posture seat. EXTEND-ONLY by construction:
 * the motion is promoteAtLeast('expanded') (inert at expanded) and the seat write is
 * value-idempotent — a third tap does nothing; drag is the only way down (no slot-machine).
 * The seat write rides the 'named' writer lane; routing it as 'programmatic' trips the
 * [snap-law] contract bark (the RED proof).
 */
export const extendActiveRootFromNavReTap = ({
  targetSceneKey,
  promoteActiveSheet,
  routeSheetSnapSessionActions,
}: {
  targetSceneKey: OverlayKey;
  promoteActiveSheet: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
  routeSheetSnapSessionActions: Pick<
    AppRouteSheetSnapSessionActions,
    'recordRouteSceneSheetSettle'
  >;
}): void => {
  promoteActiveSheet({ snap: 'expanded' });
  // Seat routing: home's carrier scene is 'polls' (the docked feed IS home's sheet); every
  // other tab writes its own scene (bookmarks/profile → the content seat, polls → home seat).
  const seatSceneKey = targetSceneKey === 'search' ? HOME_SEAT_CARRIER_SCENE_KEY : targetSceneKey;
  routeSheetSnapSessionActions.recordRouteSceneSheetSettle({
    sceneKey: seatSceneKey,
    snap: 'expanded',
    writer: 'named',
  });
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
    // S-C.3 (plans/s-c-de-special-search.md): ONE rule — presenting a session is a PUSH; a
    // re-present INSIDE the session (variant rerun, search-this-area, tab adoption) PRESERVES
    // the route (the desire changed, not the stack). Home submit pushes search#session over
    // search#home (same-key nesting); non-search roots push over their root. This also closes
    // the S-C.2 gap where an in-session rerun from a favorites root would have stacked a
    // duplicate session entry.
    const routeState = routeSceneSwitchAuthority.getSnapshot().routeState;
    // Red team RT-2: in-session must be STACK MEMBERSHIP — a rerun issued while a child tops
    // the session (restaurant over results) must not stack a duplicate session entry.
    const isInSessionRePresent = hasSearchSessionAboveRoot(routeState);
    routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'search',
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'routeCommand',
      sheetMotion: { kind: 'snapTo', snap, mode },
      contentReadinessTransactionId: contentReadinessTransactionId ?? null,
      routeAction: isInSessionRePresent ? ('preserve' as const) : ('push' as const),
    });
  };

  const dismissAppSearchRouteResultsToHome = ({
    sourceSceneKey,
  }: {
    sourceSceneKey?: OverlayKey;
  } = {}): void => {
    primeDockedPollsForHomeLanding(routeSheetSnapSessionActions);
    // S-C.3-B: dismissing a session POPS the stack back to the surviving search#home root
    // ([search#home, search#session] → [search#home]). Proven by the [SC3B] probe: the old
    // explicit setRoot here was what destroyed the home entry before the golden home
    // emission ever ran.
    //
    // S-C.4 item 3 (ONE-SWITCH home dismissal): the switch targets 'search' — the docked HOME
    // — directly, instead of the old 'polls' intermediate + a second topLevelSwitch→search
    // re-emission at the finalize boundary. Docked polls is a presentation MODE of the search
    // root (the PF laneKind formula presents 'polls' beneath the search root on its own);
    // terminalDismiss arms no content plane regardless of target (resolveMotionPlanes), so the
    // {cards,nativeMarkerFrame,sheet} readiness contract for 'search' never gates this switch.
    // The dismiss-transaction choreography (armDismissMotion → commitDismissBoundary →
    // completeDismissHandoff, the owner of the native map wire exit) rides the sheet motion,
    // not the route switches — unchanged.
    const dismissRouteState = routeSceneSwitchAuthority.getSnapshot().routeState;
    // Post-S-C.4 red team #2 — LOUD invariant, not a compensation: the terminal dance is a
    // HOME dismissal (the dismiss selector pops non-search roots before it). A session-less
    // non-search-root entrant would setRoot('search') and DESTROY that root with no recovery
    // (the finalize restore that used to catch this is deleted). Reachability is believed
    // nil; if this ever fires, fix the SELECTOR, don't soften the dance.
    if (__DEV__ && dismissRouteState.rootOverlayKey !== 'search') {
      // eslint-disable-next-line no-console
      console.error(
        '[NAV-CONTRACT] terminal home dismissal entered with a non-search root — the setRoot arm would destroy it',
        { rootOverlayKey: dismissRouteState.rootOverlayKey }
      );
    }
    // S-C.5 item 4a: routeAction is UNCONDITIONALLY popToRoot. The old setRoot arm guarded
    // the session-less home shape, where popToRoot on a depth-1 stack is a NO-OP — exactly
    // as idempotent as the value-equal setRoot it replaces, with no fresh-root minting risk.
    // (The non-search-root shape is the loud [NAV-CONTRACT] invariant above, not this arm's
    // job.)
    routeSceneSwitchActions.requestOverlaySwitch({
      ...(sourceSceneKey != null ? { sourceSceneKey } : null),
      targetSceneKey: 'search',
      sheetTransitionKind: 'terminalDismiss',
      sheetOpenerSource: 'systemDismiss',
      sheetMotion: { kind: 'snapTo', snap: 'collapsed' },
      contentHandoff: 'preserveOutgoingUntilSettle',
      routeAction: 'popToRoot',
      dockedPollsRestoreSnap: 'collapsed',
    });
  };

  const returnAppSearchRouteToDockedSearch = (): void => {
    // Two-posture law: dismissing a non-home page lands on HOME at home's remembered posture —
    // no sheetMotion here; the descriptor table's 'postureSeat' rule reads the home seat (a
    // dismissed/hidden docked feed falls to the sanctioned resurrect posture). The restore
    // intent re-presents a dismissed docked lane, mirroring the nav-tab press.
    const isPollsSheetPhysicallyHidden =
      routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls') === 'hidden';
    routeSceneSwitchActions.requestOverlaySwitch({
      targetSceneKey: 'search',
      sheetTransitionKind: 'topLevelSwitch',
      sheetOpenerSource: 'routeCommand',
      dockedPollsRestoreSnap: isPollsSheetPhysicallyHidden ? DOCKED_POLLS_RESURRECT_SNAP : null,
    });
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

  return {
    openAppSearchRouteResults,
    dismissAppSearchRouteResultsToHome,
    returnAppSearchRouteToDockedSearch,
    openAppSearchRoutePollsHome,
  };
};
