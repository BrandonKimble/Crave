// LEAF MODULE — imports nothing at runtime (type-only imports erase). This is
// deliberate and load-bearing: the docked-scene constants are read at MODULE
// INIT time by several runtime files that sit inside import cycles with
// app-overlay-route-types; hosting the values there produced a real
// boot-order TDZ (ReferenceError: DOCKED_SCENE_KEY doesn't exist) that tsc
// and jest cannot see. Values that other modules evaluate during their own
// initialization must live where no cycle can reach them. Do not add runtime
// imports to this file.
import type { OverlayKey } from '../../overlays/types';

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
