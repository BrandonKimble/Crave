// LEAF MODULE — imports nothing at runtime (type-only imports erase). This is
// deliberate and load-bearing: the docked-scene constants are read at MODULE
// INIT time by several runtime files that sit inside import cycles with
// app-overlay-route-types; hosting the values there produced a real
// boot-order TDZ (ReferenceError: DOCKED_SCENE_KEY doesn't exist) that tsc
// and jest cannot see. Values that other modules evaluate during their own
// initialization must live where no cycle can reach them. Do not add runtime
// imports to this file.
import type { OverlayKey } from '../../overlays/types';
import type { OverlayRouteEntry } from './app-overlay-route-types';

export type AppOverlayTopLevelProductRouteKey = 'search' | 'home' | 'polls' | 'lists' | 'profile';

/**
 * Every top-level product scene, in canonical order. The single source for the
 * repeated "openable from any top-level page" parentSceneKeys lists — child
 * scenes that can open from every top-level page reference this instead of
 * hand-repeating the union. (Sites that deliberately allow only a SUBSET of
 * parents keep their explicit lists.)
 */
export const ALL_TOP_LEVEL_SCENE_KEYS: readonly AppOverlayTopLevelProductRouteKey[] = [
  'search',
  'home',
  'lists',
  'profile',
  'polls',
];

/**
 * THE membership test for "is this a top-level product page". F945: this predicate and its
 * backing Set were COPY-PASTED VERBATIM into app-route-overlay-command-controller and
 * app-route-global-restaurant-route-controller, and both copies had already dropped 'home'
 * — so a restaurant or saveList opened while home was root resolved its owner as 'search'
 * by fallback rather than by fact. One set, derived from ALL_TOP_LEVEL_SCENE_KEYS above, so
 * a new top-level page cannot be half-registered.
 */
const ALL_TOP_LEVEL_SCENE_KEY_SET: ReadonlySet<string> = new Set<string>(ALL_TOP_LEVEL_SCENE_KEYS);

export const isTopLevelProductSceneKey = (
  sceneKey: string | null | undefined
): sceneKey is AppOverlayTopLevelProductRouteKey =>
  sceneKey != null && ALL_TOP_LEVEL_SCENE_KEY_SET.has(sceneKey);

/**
 * THE scene the docked lane presents — the one scene that presents under the
 * search root whenever the search sheet dismisses; restorable after dismissal;
 * not a tab. Changing this constant re-targets the persistent docked surface
 * (the designed one-constant retarget: polls → home landed 2026-07-26). No
 * lane/runtime code may name the docked scene directly — everything reads
 * this constant. Polls is a regular tab page now; home is the docked surface.
 */
export const DOCKED_SCENE_KEY = 'home' satisfies AppOverlayTopLevelProductRouteKey;

// Compile-time guard: the docked scene must remain a valid OverlayKey.
const _dockedSceneIsOverlayKey: OverlayKey = DOCKED_SCENE_KEY;
void _dockedSceneIsOverlayKey;

/**
 * F1365: byte-for-byte duplicate (down to a shared "F945" comment) between
 * app-route-overlay-command-controller.ts and app-route-global-restaurant-route-controller.ts
 * — one shared home so an owner-resolution fix can't land in one and not the other.
 */
export const getRouteOwnerSceneKey = (
  route: OverlayRouteEntry
): AppOverlayTopLevelProductRouteKey | null => {
  const params = route.params as
    | {
        ownerSceneKey?: AppOverlayTopLevelProductRouteKey | null;
      }
    | undefined;
  const ownerSceneKey = params?.ownerSceneKey ?? null;
  return isTopLevelProductSceneKey(ownerSceneKey) ? ownerSceneKey : null;
};

/**
 * F1365: the other half of the duplicate pair — `resolveCurrentSaveSheetOwner` and
 * `resolveCurrentRestaurantOwner` were byte-for-byte identical apart from name. Both
 * callers already have `activeOverlayRoute`/`rootOverlayKey` off their own route-state
 * snapshot, so this takes those directly rather than a runtime object.
 */
export const resolveOwnerSceneKeyAndOpener = ({
  activeRoute,
  rootOverlayKey,
}: {
  activeRoute: OverlayRouteEntry;
  rootOverlayKey: OverlayKey;
}): {
  ownerSceneKey: AppOverlayTopLevelProductRouteKey;
  openerRouteKey: OverlayKey;
} => {
  const routeOwnerSceneKey = getRouteOwnerSceneKey(activeRoute);
  const rootOwnerSceneKey = isTopLevelProductSceneKey(rootOverlayKey) ? rootOverlayKey : null;
  // ─── F2404: INSTRUMENTATION, NOT A FIX ──────────────────────────────────────────────
  // One line below the paragraph condemning owner resolution "BY FALLBACK RATHER THAN BY
  // FACT", this `?? 'search'` does exactly that. Whether the arm is ever TAKEN was never
  // proven — and that ambiguity IS the finding: either it is unreachable (dead code
  // masquerading as a safety net, which is why nobody notices it) or it is reachable (a
  // route silently attributes itself to the wrong parent page and pops back to the wrong
  // screen). Nothing in the code or any test distinguishes the two.
  //
  // CLAUDE.md's law is ATTRIBUTE → PROVE → THEN FIX, so the fallback STAYS and it now
  // says when it fires. Deleting it on reasoning alone would be guessing with a straight
  // face. TO CLOSE THIS: drive restaurant/saveList opens from every root
  // (search/home/lists/profile/polls) and `grep '\[OWNER-FALLBACK\]' /tmp/crave-metro.log`
  // (dev console goes to Metro's stdout, never to os_log). If it never fires, delete the
  // arm and narrow the return type. If it fires, the owner belongs in the pushed entry's
  // params — `getRouteOwnerSceneKey` already reads `ownerSceneKey`, so
  // making it REQUIRED at push makes the fallback unnecessary rather than defaulted.
  const resolvedOwnerSceneKey = routeOwnerSceneKey ?? rootOwnerSceneKey;
  if (__DEV__ && resolvedOwnerSceneKey == null) {
    // eslint-disable-next-line no-console
    console.error(
      `[OWNER-FALLBACK] owner resolved to 'search' BY FALLBACK, not by fact: route='${activeRoute.key}' ` +
        `routeOwner=${routeOwnerSceneKey ?? 'null'} rootOverlayKey='${rootOverlayKey}' ` +
        '— this route will attribute itself to search and pop back there'
    );
  }
  const ownerSceneKey = resolvedOwnerSceneKey ?? 'search';
  return {
    ownerSceneKey,
    openerRouteKey: activeRoute.key,
  };
};
