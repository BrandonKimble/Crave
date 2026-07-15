import type { OverlayKey } from '../../overlays/types';
import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';
import type { OverlayRouteEntry } from './app-overlay-route-types';
import type { RouteSceneSwitchRouteParams } from './app-overlay-route-transition-contract';

/**
 * The route-stack algebra (S-B, entries-as-values).
 *
 * Stack entries are VALUES: each carries an `entryId` minted at construction, so two entries
 * with the same scene key are distinct stack instances. Everything here is pure — the scene
 * switch controller owns WHEN these run; this module owns WHAT they mean. Reducer semantics
 * are locked by app-overlay-route-stack-algebra.spec.ts.
 *
 * `previousOverlayRoute` is DERIVED from the stack (stack[len-2] ?? null), never stored
 * independently — the old hand-maintained field could disagree with the stack (popToRoot
 * preserved a stale previous after collapsing to [root]).
 */

export type RouteSceneSwitchRouteStateSnapshot = {
  activeOverlayRoute: OverlayRouteEntry;
  previousOverlayRoute: OverlayRouteEntry | null;
  overlayRouteStack: readonly OverlayRouteEntry[];
  rootOverlayKey: OverlayKey;
  overlayRouteStackLength: number;
};

let nextRouteEntrySeq = 1;

export const createRouteEntry = (
  key: OverlayKey,
  params?: RouteSceneSwitchRouteParams,
  origin?: OriginSnapshot | null
): OverlayRouteEntry =>
  ({
    entryId: `route-entry-${nextRouteEntrySeq++}`,
    key,
    params,
    origin: origin ?? null,
  }) as OverlayRouteEntry;

// Sentinel entries (module literals that predate any push — the boot root, inactive-slot
// placeholders in snapshot contracts). Stable ids so equality is deterministic across module
// instances.
export const createSentinelRouteEntry = <K extends OverlayKey>(
  key: K,
  sentinelId: string
): OverlayRouteEntry<K> =>
  ({
    entryId: `route-entry-sentinel-${sentinelId}`,
    key,
    params: undefined,
    origin: null,
  }) as OverlayRouteEntry<K>;

export const ROOT_SEARCH_ROUTE_ENTRY: OverlayRouteEntry<'search'> = createSentinelRouteEntry(
  'search',
  'root-search'
);

// Value identity: same stack instance (entryId) with the same params value. `updateRouteState`
// preserves entryId while swapping params, so params must still participate.
/** A search SESSION entry exists above the stack bottom (red team RT-1/RT-2: pushed-session
 * detection must be STACK MEMBERSHIP — top-of-stack identity misses child-topped sessions). */
// Red team RT-3: setRoot idempotence must compare params by VALUE — reference equality
// re-mints the root for value-equal rebuilt param objects (the leave-and-re-enter teardown
// class the idempotence rule exists to prevent). Params are flat key→primitive maps.
const areRouteParamsShallowValueEqual = (
  left: RouteSceneSwitchRouteParams | undefined,
  right: RouteSceneSwitchRouteParams | undefined
): boolean => {
  if (left === right) {
    return true;
  }
  if (left == null || right == null) {
    return left == null && right == null;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    (key) => (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key]
  );
};

export const hasSearchSessionAboveRoot = (
  routeState: RouteSceneSwitchRouteStateSnapshot
): boolean => routeState.overlayRouteStack.slice(1).some((entry) => entry.key === 'search');

export const areOverlayRoutesEqual = (
  left: OverlayRouteEntry | null,
  right: OverlayRouteEntry | null
): boolean =>
  left === right ||
  (left != null && right != null && left.entryId === right.entryId && left.params === right.params);

export const areOverlayRouteStacksEqual = (
  left: readonly OverlayRouteEntry[],
  right: readonly OverlayRouteEntry[]
): boolean =>
  left.length === right.length &&
  left.every((route, index) => areOverlayRoutesEqual(route, right[index] ?? null));

export const areRouteStateSnapshotsEqual = (
  left: RouteSceneSwitchRouteStateSnapshot,
  right: RouteSceneSwitchRouteStateSnapshot
): boolean =>
  areOverlayRoutesEqual(left.activeOverlayRoute, right.activeOverlayRoute) &&
  areOverlayRoutesEqual(left.previousOverlayRoute, right.previousOverlayRoute) &&
  areOverlayRouteStacksEqual(left.overlayRouteStack, right.overlayRouteStack);

export const createRouteStateSnapshot = ({
  activeOverlayRoute,
  overlayRouteStack,
}: {
  activeOverlayRoute: OverlayRouteEntry;
  overlayRouteStack: readonly OverlayRouteEntry[];
}): RouteSceneSwitchRouteStateSnapshot => ({
  activeOverlayRoute,
  previousOverlayRoute:
    overlayRouteStack.length > 1 ? (overlayRouteStack[overlayRouteStack.length - 2] ?? null) : null,
  overlayRouteStack,
  rootOverlayKey: overlayRouteStack[0]?.key ?? activeOverlayRoute.key,
  overlayRouteStackLength: overlayRouteStack.length,
});

export const setRootRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  overlay: OverlayKey,
  params?: RouteSceneSwitchRouteParams
): RouteSceneSwitchRouteStateSnapshot => {
  // Idempotence: re-rooting to the root you are already on (same key, same params value) is a
  // no-op — it must NOT mint a new instance. Pre-entryId this fell out of the equality fns
  // (undefined params compared equal downstream); with value identity it must be explicit, or
  // a double setRoot (ensure-scene + open-results both re-root) reads as leave-and-re-enter
  // and tears down the search session.
  const currentTop = currentRouteState.overlayRouteStack[0];
  if (
    currentRouteState.overlayRouteStack.length === 1 &&
    currentTop?.key === overlay &&
    areRouteParamsShallowValueEqual(currentTop.params, params)
  ) {
    return currentRouteState;
  }
  const nextRoute = createRouteEntry(overlay, params);
  return createRouteStateSnapshot({
    activeOverlayRoute: nextRoute,
    overlayRouteStack: [nextRoute],
  });
};

// S-B slice 4: push ALWAYS stacks — the same-key top-replacement is DELETED, so
// `userProfile(A) → userProfile(B)` nests as two distinct entries and pop returns to A.
// Rendering stays one leg per scene key (a rendering CACHE under the hard-swap engine); the
// leg re-seeds from the top-most entry of its key, so no same-key state can bleed between
// instances at the route layer.
export const pushRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  overlay: OverlayKey,
  params?: RouteSceneSwitchRouteParams,
  origin?: OriginSnapshot | null
): RouteSceneSwitchRouteStateSnapshot => {
  // Leg 2a (phase-1 design §1.3): every PUSHED entry carries its return address. The
  // capture seam is total (captureRouteEntryOrigin never returns null), so a null here
  // means a push call site skipped capture entirely — a contract violation, not a state.
  if (__DEV__ && origin == null) {
    // eslint-disable-next-line no-console
    console.error(
      `[ORIGIN-CONTRACT] pushRouteState('${overlay}') committed WITHOUT an origin — this entry cannot restore its departure point on pop`
    );
  }
  const nextRoute = createRouteEntry(overlay, params, origin);
  const overlayRouteStack = [...currentRouteState.overlayRouteStack, nextRoute];
  return createRouteStateSnapshot({
    activeOverlayRoute: nextRoute,
    overlayRouteStack,
  });
};

// Params update preserves entry IDENTITY: the stack instance persists (its leg must not
// remount); only the params value changes. With same-key nesting legal, exactly the TOP-MOST
// matching entry updates — updating every same-key entry would smear one instance's params
// across its siblings (§5 resolution).
export const updateRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  overlay: OverlayKey,
  params?: RouteSceneSwitchRouteParams
): RouteSceneSwitchRouteStateSnapshot => {
  const currentStack = currentRouteState.overlayRouteStack;
  let topMatchIndex = -1;
  for (let index = currentStack.length - 1; index >= 0; index -= 1) {
    if (currentStack[index]?.key === overlay) {
      topMatchIndex = index;
      break;
    }
  }
  if (topMatchIndex === -1) {
    return currentRouteState;
  }
  const overlayRouteStack = currentStack.map((route, index) =>
    index === topMatchIndex ? ({ ...route, params } as OverlayRouteEntry) : route
  );
  const activeOverlayRoute =
    overlayRouteStack[overlayRouteStack.length - 1] ?? currentRouteState.activeOverlayRoute;
  return createRouteStateSnapshot({
    activeOverlayRoute,
    overlayRouteStack,
  });
};

export const closeActiveRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot
): RouteSceneSwitchRouteStateSnapshot => {
  if (currentRouteState.overlayRouteStack.length <= 1) {
    return currentRouteState;
  }
  const overlayRouteStack = currentRouteState.overlayRouteStack.slice(0, -1);
  const activeOverlayRoute =
    overlayRouteStack[overlayRouteStack.length - 1] ?? ROOT_SEARCH_ROUTE_ENTRY;
  return createRouteStateSnapshot({
    activeOverlayRoute,
    overlayRouteStack,
  });
};

/** Pop until the entry with `entryId` is top-of-stack (no-op if absent or already top). The
 * general pop-to-origin verb: dismissing a session pops to the entry BENEATH the deepest
 * session entry — which may be a CHILD (poll-dish search over pollDetail), not the root. */
export const popToEntryRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  entryId: string
): RouteSceneSwitchRouteStateSnapshot => {
  const currentStack = currentRouteState.overlayRouteStack;
  const targetIndex = currentStack.findIndex((entry) => entry.entryId === entryId);
  if (targetIndex === -1 || targetIndex === currentStack.length - 1) {
    return currentRouteState;
  }
  const overlayRouteStack = currentStack.slice(0, targetIndex + 1);
  const activeOverlayRoute =
    overlayRouteStack[overlayRouteStack.length - 1] ?? ROOT_SEARCH_ROUTE_ENTRY;
  return createRouteStateSnapshot({
    activeOverlayRoute,
    overlayRouteStack,
  });
};

export const popToRootRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot
): RouteSceneSwitchRouteStateSnapshot => {
  const rootOverlayRoute = currentRouteState.overlayRouteStack[0] ?? ROOT_SEARCH_ROUTE_ENTRY;
  if (
    currentRouteState.overlayRouteStack.length <= 1 &&
    currentRouteState.activeOverlayRoute.key === rootOverlayRoute.key
  ) {
    return currentRouteState;
  }
  return createRouteStateSnapshot({
    activeOverlayRoute: rootOverlayRoute,
    overlayRouteStack: [rootOverlayRoute],
  });
};

// S-C.5 item 1 (plans/s-c5-restaurant-stack-fact.md #1) — THE session-dismiss plan resolver.
// One place answers "what does dismissing the search session mean for THIS stack shape";
// the executors stay per-plan-kind (the motionless pop vs the terminal home dance own
// different choreography), but the SHAPE DECISION lives in the algebra, not a UI hook.
//
// Everything at-or-above the DEEPEST session entry belongs to the session (children may sit
// both beneath it — poll-dish over pollDetail — and above it — restaurant over results); the
// dismissal pops to the entry beneath it:
//  • a CHILD beneath → popToEntry (reveal the untouched child leg; entries-as-values keeps
//    scroll/thread state alive on the surviving entry);
//  • a NON-SEARCH root → popToRoot (the deepest pushed entry's origin restores the departed
//    presentation);
//  • the SEARCH root (or no session at all) → the terminal home dance (the ONE-SWITCH
//    terminalDismiss that owns the docked-home landing).
export type SessionDismissPlan =
  | { kind: 'popToEntry'; entryId: string }
  | { kind: 'popToRoot' }
  | { kind: 'terminalHome' };

// Leg 4 (phase-1 design §1.3): a SESSION is any entry that presents a world — the
// pushed 'search' results entry, OR a world-bearing child (a listDetail pushed by the
// listWorld composite stamps `worldBacked: true`; the v2 end state is `desire` on the
// entry). The old search-key-only scan classified [bookmarks, listDetail(world)] as
// session-less and fell through to terminalHome — the owner-repro'd [NAV-CONTRACT]
// bark and the home-shaped dismissal from a non-home origin.
const isWorldBearingEntry = (entry: OverlayRouteEntry | undefined): boolean =>
  entry != null &&
  (entry.key === 'search' ||
    (entry.params as { worldBacked?: boolean } | undefined)?.worldBacked === true);

export const resolveSessionDismissPlan = (routeState: {
  overlayRouteStack: readonly OverlayRouteEntry[];
  overlayRouteStackLength: number;
  rootOverlayKey: OverlayKey;
}): SessionDismissPlan => {
  let deepestSessionIndex = -1;
  for (let index = 1; index < routeState.overlayRouteStackLength; index += 1) {
    if (isWorldBearingEntry(routeState.overlayRouteStack[index])) {
      deepestSessionIndex = index;
      break;
    }
  }
  const hasSession = deepestSessionIndex > 0;
  const entryBeneathSession = hasSession
    ? (routeState.overlayRouteStack[deepestSessionIndex - 1] ?? null)
    : null;
  const beneathSessionIsChild =
    entryBeneathSession != null && entryBeneathSession !== routeState.overlayRouteStack[0];
  if (hasSession && beneathSessionIsChild && entryBeneathSession != null) {
    return { kind: 'popToEntry', entryId: entryBeneathSession.entryId };
  }
  if (hasSession && routeState.rootOverlayKey !== 'search') {
    return { kind: 'popToRoot' };
  }
  return { kind: 'terminalHome' };
};
