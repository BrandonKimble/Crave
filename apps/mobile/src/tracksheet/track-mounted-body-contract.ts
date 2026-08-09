import type { SearchRouteMountedSceneBodyKey } from '../overlays/searchOverlayRouteHostContract';
import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';

/**
 * THE mounted-body contract (residue-kill-plan §3). Pure module — type-only
 * imports, so the schema parity spec can consume the key list without pulling
 * a single panel component.
 *
 * W1 slice 1 (C2): a mounted CHILD body receives ITS route entry as a prop —
 * entryId + params flow from the entry-keyed mount unit, never from
 * useTopMostRouteEntryForScene (topmost-per-key breaks with two live entries of
 * one key). Root bodies (lists/profile) stay prop-less singletons; `entry` is
 * optional so the singleton render path stays byte-identical.
 */
export type MountedSceneBodyProps = {
  entry?: OverlayRouteEntry | null;
};

/**
 * F981 — THE `Partial<>` IS THE DEFECT, so it is gone (ported here from the
 * deleted overlays mounted-body registry, which carried this rationale):
 * a `Partial<Record<...>>` component map removed the compile force it was built
 * to provide — a declared key with no entry silently rendered NOTHING.
 *
 * The shape (F908's array-derives-the-type, F939's exhaustive Record):
 *  - `NON_MOUNTED_TRACK_BODY_SCENES` states the closed, deliberate exclusion
 *    set — 'home', 'search' and 'polls' publish parts/list bodies, not mounted
 *    bodies.
 *  - `MOUNTED_TRACK_BODY_SCENE_KEYS` is the ONE runtime-enumerable key list;
 *    the component map in use-track-leg-resolver is an exhaustive `Record` over
 *    it, so a missing component is a BUILD ERROR, and the schema parity spec
 *    asserts this list ≡ the schema's `body.kind: 'mounted'` set (CI RED
 *    replaced the old dev-only console.error bark).
 */
export const NON_MOUNTED_TRACK_BODY_SCENES = ['home', 'search', 'polls'] as const;

type NonMountedTrackBodySceneKey = (typeof NON_MOUNTED_TRACK_BODY_SCENES)[number];

export const MOUNTED_TRACK_BODY_SCENE_KEYS = [
  'lists',
  'profile',
  'saveList',
  'userProfile',
  'listDetail',
  'followList',
  'notifications',
  'settings',
  'editProfile',
  'postPhotos',
  'messagesInbox',
  'dmSession',
] as const satisfies readonly Exclude<
  SearchRouteMountedSceneBodyKey,
  NonMountedTrackBodySceneKey
>[];

export type MountedTrackBodySceneKey = (typeof MOUNTED_TRACK_BODY_SCENE_KEYS)[number];

// Exhaustiveness lock: every member of the mounted-body key union is either in
// the exclusion set or in the key list — a new union member that joins neither
// is a build error here, not a blank scene at runtime.
type UnlistedMountedSceneBodyKey = Exclude<
  SearchRouteMountedSceneBodyKey,
  NonMountedTrackBodySceneKey | MountedTrackBodySceneKey
>;
const assertEveryMountedSceneBodyKeyListed: [UnlistedMountedSceneBodyKey] extends [never]
  ? true
  : never = true;
void assertEveryMountedSceneBodyKeyListed;
