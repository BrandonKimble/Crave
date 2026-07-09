import type { OverlayKey } from '../../overlays/types';
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
  params?: RouteSceneSwitchRouteParams
): OverlayRouteEntry =>
  ({
    entryId: `route-entry-${nextRouteEntrySeq++}`,
    key,
    params,
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
  }) as OverlayRouteEntry<K>;

export const ROOT_SEARCH_ROUTE_ENTRY: OverlayRouteEntry<'search'> = createSentinelRouteEntry(
  'search',
  'root-search'
);

// Value identity: same stack instance (entryId) with the same params value. `updateRouteState`
// preserves entryId while swapping params, so params must still participate.
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
    currentTop.params === params
  ) {
    return currentRouteState;
  }
  const nextRoute = createRouteEntry(overlay, params);
  return createRouteStateSnapshot({
    activeOverlayRoute: nextRoute,
    overlayRouteStack: [nextRoute],
  });
};

// NOTE (slice 4 target): the same-key top-REPLACEMENT branch below is the audited GAP-B
// behavior — `userProfile(A) → userProfile(B)` replaces instead of nesting. It stays until the
// legs/registries are entry-keyed (slice 3); deleting it earlier silently bleeds state across
// same-key instances.
export const pushRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  overlay: OverlayKey,
  params?: RouteSceneSwitchRouteParams
): RouteSceneSwitchRouteStateSnapshot => {
  const nextRoute = createRouteEntry(overlay, params);
  const currentStack = currentRouteState.overlayRouteStack;
  const currentTop = currentStack[currentStack.length - 1];
  const overlayRouteStack =
    currentTop?.key === overlay
      ? [...currentStack.slice(0, -1), nextRoute]
      : [...currentStack.slice(0, -1), currentTop, nextRoute].filter(
          (entry): entry is OverlayRouteEntry => entry != null
        );
  return createRouteStateSnapshot({
    activeOverlayRoute: nextRoute,
    overlayRouteStack,
  });
};

// Params update preserves entry IDENTITY: the stack instance persists (its leg must not
// remount); only the params value changes.
export const updateRouteState = (
  currentRouteState: RouteSceneSwitchRouteStateSnapshot,
  overlay: OverlayKey,
  params?: RouteSceneSwitchRouteParams
): RouteSceneSwitchRouteStateSnapshot => {
  let didUpdate = false;
  const overlayRouteStack = currentRouteState.overlayRouteStack.map((route) => {
    if (route.key !== overlay) {
      return route;
    }
    didUpdate = true;
    return { ...route, params } as OverlayRouteEntry;
  });
  if (!didUpdate) {
    return currentRouteState;
  }
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
