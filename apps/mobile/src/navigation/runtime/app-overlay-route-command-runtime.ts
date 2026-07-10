import {
  createPollCreationChildRouteParams,
  createPollDetailChildRouteParams,
  getAppOverlayRouteMetadata,
  isAppOverlayRouteSceneSwitchKey,
  type OverlayKey,
  type OverlayRouteParamsMap,
} from './app-overlay-route-types';
import type {
  RouteSceneSwitchRequestInput,
  RouteSceneSwitchRouteParams,
} from './app-overlay-route-transition-contract';
import type { OverlaySheetSnap } from '../../overlays/types';
import { stageRouteEntryOriginRestore } from './route-entry-origin-capture-delegate';
import type {
  AppRouteSceneSwitchRuntime,
  RouteSceneSwitchRouteStateSnapshot,
  RouteSceneSwitchSettleCallback,
} from './app-route-scene-switch-controller';

const shouldRouteThroughSceneSwitch = <K extends OverlayKey>(
  overlay: K,
  params?: OverlayRouteParamsMap[K]
): boolean =>
  isAppOverlayRouteSceneSwitchKey(overlay) &&
  (params == null || overlay === 'polls' || overlay === 'restaurant');

const resolveRouteSwitchPollsParams = <K extends OverlayKey>(
  overlay: K,
  params?: OverlayRouteParamsMap[K]
): OverlayRouteParamsMap['polls'] | null =>
  overlay === 'polls' ? ((params as OverlayRouteParamsMap['polls']) ?? null) : null;

export type AppOverlayRouteCommandRuntime = {
  getRouteState: () => RouteSceneSwitchRouteStateSnapshot;
  setRootRoute: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  updateRoute: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  // Phase 3b (canonical-sheet-transition-master-plan §2 Layer 3 / §6 Phase 3) — the
  // ONE canonical reveal verb: PUSH a scene onto the OverlayRouteStack so dismiss has a
  // real origin to pop back to (Invariant 6). Every reveal (poll-open, restaurant,
  // saveList, pollCreation, pollDetail) flows through this; `pushRoute` is the legacy
  // alias kept so existing call sites need no churn.
  revealRoute: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  pushRoute: <K extends OverlayKey>(overlay: K, params?: OverlayRouteParamsMap[K]) => void;
  restoreDockedPolls: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
  collapseActiveSheet: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
  // The shared HEADER-TAP / grab-handle press (owner req 2026-07-02): tapping the persistent
  // header PROMOTES the sheet up to at least middle when it sits below middle, and is a no-op
  // at/above middle. It NEVER collapses or dismisses — pages dismiss ONLY via the close (X)
  // button. `promoteAtLeast` reuses the existing spring machinery (resolvePromotedSnapTarget),
  // so an already-middle/expanded sheet resolves to null motion (structurally cannot demote).
  promoteActiveSheet: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
  // Phase 3b — the ONE canonical dismiss verb: POP-to-restore from the OverlayRouteStack
  // (return to the exact origin entry beneath the reveal). `closeActiveRoute` is the
  // legacy alias.
  dismissActiveRoute: () => void;
  closeActiveRoute: (options?: { applyOriginDetent?: boolean }) => void;
  closeActiveRouteAfterSettle: (onSettle: RouteSceneSwitchSettleCallback) => void;
  popToRootRoute: (options?: { applyOriginDetent?: boolean }) => void;
};

export const createAppOverlayRouteCommandRuntime = ({
  routeSceneSwitchRuntime,
}: {
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
}): AppOverlayRouteCommandRuntime => {
  const requestRouteSceneSwitch = (
    input: RouteSceneSwitchRequestInput,
    onSettle?: RouteSceneSwitchSettleCallback
  ): number =>
    onSettle
      ? routeSceneSwitchRuntime.requestOverlaySwitchWithSettleCallback(input, onSettle)
      : routeSceneSwitchRuntime.requestOverlaySwitch(input);

  // Phase 3b/5 — the canonical POP-to-restore dismiss. When a real previous entry sits
  // beneath the active reveal, pop to it (closeChild / preserveLiveY → motionPlanes=[] →
  // synchronous idle: this is the byte-identical {polls,search}@collapsed deadlock seam).
  // The restaurant→`setRoot polls` hardcode that used to fire when a restaurant reveal had
  // NO previous entry (a flattened stack) is DELETED (Phase 5, master plan §4 Failure 4):
  // the restaurant reveal now rides the committed search lane whose dismiss restores the
  // captured CHILD origin (pollDetail @ snap + comment) via restorePendingOrigin, so a
  // restaurant left with no previous entry just pops the stack like any other child rather
  // than stranding the user on polls HOME.
  const closeActiveRoute = (
    onSettle?: RouteSceneSwitchSettleCallback,
    options?: { applyOriginDetent?: boolean }
  ): void => {
    const routeState = routeSceneSwitchRuntime.getRouteState();
    const { activeOverlayRoute } = routeState;
    // S-B: the pop target is the ENTRY beneath the top (a value), not a key lookup — with
    // same-key nesting (slice 4) a key cannot identify which instance is revealed.
    const previousOverlayRoute = routeSceneSwitchRuntime.getPreviousRouteEntry();
    // Stage the POPPED entry's origin BEFORE the switch request: the motion plan reads the
    // remembered-snap ledger during plan resolution (staging at commit is a stale read).
    stageRouteEntryOriginRestore(activeOverlayRoute.origin);
    if (previousOverlayRoute != null && isAppOverlayRouteSceneSwitchKey(activeOverlayRoute.key)) {
      // Ledger item 6 VERDICT (one mechanism per POP CLASS, not one flag-free mechanism):
      // applyOriginDetent selects the WORLD-SESSION pop shape — explicit snapTo of the popped
      // entry's origin detent + topLevelSwitch/swapImmediately (the proven seam shape for
      // dismissing a presented world). CHILD pops keep descriptor-table motion + the staged
      // remembered-snap ledger: their dismiss detent is a PRODUCT choice (e.g. pollDetail
      // deliberately lands on the expanded feed, not the captured docked origin — flipping
      // that is an owner call, tracked in plans/s-c-de-special-search.md). Origin restore is
      // an EXPLICIT application in both classes; the classes legitimately differ in shape.
      const originDetent =
        options?.applyOriginDetent === true ? activeOverlayRoute.origin?.detent : undefined;
      requestRouteSceneSwitch(
        {
          targetSceneKey: previousOverlayRoute.key,
          routeAction: 'closeActive',
          // An origin-detent pop mimics the restore seam's switch EXACTLY (topLevelSwitch +
          // swapImmediately + explicit snapTo) — the closeChild kind left the search surface's
          // clip/band ownership latched (the zombie-results residue); the seam's switch shape
          // is the one proven to hand the sheet back cleanly.
          sheetTransitionKind: originDetent != null ? 'topLevelSwitch' : 'closeChild',
          sheetOpenerSource: 'routeCommand',
          ...(originDetent != null
            ? {
                sheetMotion: { kind: 'snapTo' as const, snap: originDetent },
                contentHandoff: 'swapImmediately' as const,
              }
            : null),
          // sheetMotion intentionally omitted (P6 req 2d): the closeChild dismiss motion is a
          // descriptor-table decision (app-route-sheet-motion-descriptor-table.ts — today
          // preserveLiveY via the pollDetail dismiss row / the catch-all). Tuning a child's
          // dismiss pattern is a row edit, not a call-site edit.
        },
        onSettle
      );
      return;
    }
    routeSceneSwitchRuntime.closeActiveRouteState();
    onSettle?.();
  };

  // Phase 3b — the canonical PUSH reveal, extracted so both `revealRoute` and the legacy
  // `pushRoute` alias share one body.
  const revealRoute = <K extends OverlayKey>(
    overlay: K,
    params?: OverlayRouteParamsMap[K]
  ): void => {
    if (overlay === 'pollCreation') {
      requestRouteSceneSwitch({
        targetSceneKey: overlay,
        routeAction: 'push',
        routeParams: createPollCreationChildRouteParams(
          params as OverlayRouteParamsMap['pollCreation']
        ),
        sheetTransitionKind: 'openChild',
        sheetOpenerSource: 'pollAction',
        // sheetMotion intentionally omitted (P6 req 2d): the pollCreation open motion — the
        // INSTANT expanded cover (full-screen child snaps over the partial feed immediately, no
        // rise that reveals the search-surface home above) — is the descriptor-table row
        // ('*','pollCreation','openChild'). Tune it there.
      });
      return;
    }
    if (overlay === 'pollDetail') {
      requestRouteSceneSwitch({
        targetSceneKey: overlay,
        routeAction: 'push',
        routeParams: createPollDetailChildRouteParams(
          params as OverlayRouteParamsMap['pollDetail']
        ),
        sheetTransitionKind: 'openChild',
        sheetOpenerSource: 'pollAction',
        // sheetMotion intentionally omitted (P6 req 2d): the pollDetail open motion — SPRING the
        // sheet Y from the feed's live snap up to expanded so the open SLIDES naturally — is the
        // descriptor-table row ('*','pollDetail','openChild'). The content is already correct from
        // frame 1: pollDetail is SEEDED (SEEDED_FORWARD_OPEN_SCENES) → contentHandoff
        // 'swapImmediately', so the seeded header + comment skeleton paint immediately under the
        // rising sheet. The snap-persistence guard is unaffected: pollDetail's snapPersistence is
        // 'none', so the spring-settle snap fact never writes the shared docked-feed key. Owner
        // req 2d: changing this movement pattern (or its dismiss) is a table row edit, not a
        // call-site edit.
      });
      return;
    }
    if (getAppOverlayRouteMetadata(overlay).role === 'child') {
      // Metadata-driven (was `overlay === 'saveList' || overlay === 'restaurant'`): EVERY
      // child-role scene push is a real openChild scene switch — a child that fell through to
      // the bare pushRouteState below silently updated the route stack without ever presenting
      // (the page-registry stub scenes hit exactly that). pollCreation/pollDetail stay special
      // above only for their param normalization; behavior for saveList/restaurant is unchanged.
      requestRouteSceneSwitch({
        targetSceneKey: overlay,
        routeAction: 'push',
        routeParams: params,
        sheetTransitionKind: 'openChild',
        sheetOpenerSource: 'routeCommand',
        // contentHandoff intentionally omitted: forward-open children sit in
        // SEEDED_FORWARD_OPEN_SCENES, so the central descriptor resolves swapImmediately —
        // each paints its own seeded shell at once (saveList's form shell, restaurant's
        // dish-skeleton seed) while its data loads, so holding the outgoing surface would only
        // show a stale feed. Central descriptor decision, no per-call-site opt-out.
      });
      return;
    }
    routeSceneSwitchRuntime.pushRouteState(overlay, params);
  };

  return {
    getRouteState: () => routeSceneSwitchRuntime.getRouteState(),
    setRootRoute: (overlay, params) => {
      if (shouldRouteThroughSceneSwitch(overlay, params)) {
        requestRouteSceneSwitch({
          targetSceneKey: overlay,
          pollsParams: resolveRouteSwitchPollsParams(overlay, params),
          routeAction: 'setRoot',
          routeParams: params,
          sheetTransitionKind: 'topLevelSwitch',
          sheetOpenerSource: 'navTab',
        });
        return;
      }
      routeSceneSwitchRuntime.setRootRouteState(overlay, params);
    },
    updateRoute: (overlay, params) => {
      routeSceneSwitchRuntime.updateRouteState(overlay, params);
    },
    restoreDockedPolls: ({ snap = 'collapsed' } = {}) => {
      requestRouteSceneSwitch({
        targetSceneKey: 'search',
        routeAction: 'setRoot',
        sheetTransitionKind: 'topLevelSwitch',
        sheetOpenerSource: 'routeCommand',
        sheetMotion: { kind: 'snapTo', snap },
        dockedPollsRestoreSnap: snap,
      });
    },
    collapseActiveSheet: ({ snap = 'collapsed' } = {}) => {
      const { activeOverlayRoute } = routeSceneSwitchRuntime.getRouteState();
      if (!isAppOverlayRouteSceneSwitchKey(activeOverlayRoute.key)) {
        return;
      }
      requestRouteSceneSwitch({
        targetSceneKey: activeOverlayRoute.key,
        routeAction: 'updateActive',
        routeParams: activeOverlayRoute.params as RouteSceneSwitchRouteParams,
        sheetTransitionKind: 'gesture',
        sheetOpenerSource: 'routeCommand',
        sheetMotion: { kind: 'snapTo', snap },
      });
    },
    promoteActiveSheet: ({ snap = 'middle' } = {}) => {
      const { activeOverlayRoute } = routeSceneSwitchRuntime.getRouteState();
      if (!isAppOverlayRouteSceneSwitchKey(activeOverlayRoute.key)) {
        return;
      }
      // promoteAtLeast (NOT snapTo): only rises when below `snap`; at/above it resolves to null
      // motion. This is what makes the header tap incapable of collapsing or dismissing.
      requestRouteSceneSwitch({
        targetSceneKey: activeOverlayRoute.key,
        routeAction: 'updateActive',
        routeParams: activeOverlayRoute.params as RouteSceneSwitchRouteParams,
        sheetTransitionKind: 'gesture',
        sheetOpenerSource: 'routeCommand',
        sheetMotion: { kind: 'promoteAtLeast', snap },
      });
    },
    // Phase 3b — the canonical PUSH reveal verb; `pushRoute` aliases it so existing call
    // sites keep working. Every reveal lands a NEW stack entry above the origin
    // (Invariant 6), giving the canonical dismiss a real entry to pop back to.
    revealRoute,
    pushRoute: revealRoute,
    // Phase 3b — the canonical POP-to-restore dismiss verb; `closeActiveRoute` aliases it.
    dismissActiveRoute: () => {
      closeActiveRoute();
    },
    closeActiveRoute: (options) => {
      closeActiveRoute(undefined, options);
    },
    closeActiveRouteAfterSettle: (onSettle) => {
      closeActiveRoute(onSettle);
    },
    popToRootRoute: (options?: { applyOriginDetent?: boolean }) => {
      const routeState = routeSceneSwitchRuntime.getRouteState();
      const { activeOverlayRoute } = routeState;
      const rootOverlayRouteKey = routeSceneSwitchRuntime.getRootRouteKey();
      // Red team RT-4: the root's captured presentation lives on the DEEPEST pushed entry
      // (stack[1]); popToRoot restores it (intermediate entries' origins are correctly
      // discarded). Staged before the request — the motion plan reads the ledger.
      const deepestPushedOrigin = routeState.overlayRouteStack[1]?.origin ?? null;
      stageRouteEntryOriginRestore(deepestPushedOrigin);
      if (rootOverlayRouteKey != null && isAppOverlayRouteSceneSwitchKey(activeOverlayRoute.key)) {
        const originDetent =
          options?.applyOriginDetent === true ? deepestPushedOrigin?.detent : undefined;
        requestRouteSceneSwitch({
          targetSceneKey: rootOverlayRouteKey,
          routeAction: 'popToRoot',
          sheetTransitionKind: originDetent != null ? 'topLevelSwitch' : 'closeChild',
          sheetOpenerSource: 'routeCommand',
          ...(originDetent != null
            ? {
                sheetMotion: { kind: 'snapTo' as const, snap: originDetent },
                contentHandoff: 'swapImmediately' as const,
              }
            : null),
        });
        return;
      }
      routeSceneSwitchRuntime.popToRootRouteState();
    },
  };
};
