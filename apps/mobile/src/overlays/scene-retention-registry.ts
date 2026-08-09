import type { OverlayKey, OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';

// ─── THE SCENE-RETENTION REGISTRY (L3 — the strangler's pure facts) ───────────────────────
//
// Which scenes are retention-managed shell scenes, and WHAT KEYS a retained unit, are PURE facts
// consulted by pure modules (the entry-unit resolver runs in hermetic node tests) —
// so they live apart from the manager, which imports react-native for its prewarm
// scheduler. Grows per-slice per the migration bridge order; deleted-with-the-
// strangler when every scene is managed.
//
// THE ARRAY IS THE TYPE (F908). `RetainedShellSceneKey` used to be declared
// independently as `SheetSceneKey | 'search'` — i.e. the type claimed EVERY sheet
// scene was managed while the array listed the migrated subset (polls/restaurant are
// still bespoke). A new sheet scene therefore compiled fine and was silently
// UNMANAGED, and an exhaustive switch over the type was forced to handle scenes that
// can never reach it. Deriving the type FROM the array makes divergence
// unrepresentable and leaves the strangler's remaining work visible in the type.

export const RETAINED_SHELL_SCENES = [
  // Slices 1-2: the self-contained leaves.
  'notifications',
  'settings',
  // Slice 3: profile — the root own-tab (data lane stays with the central activity
  // flags until the runtime-governance merge).
  'profile',
  // Slice 4 (the bridge's pair — both sides of the owner's worst transition cross
  // together): lists (root tab, singleton path) + listDetail (the first
  // MULTI-ENTRY managed scene — identity-keyed retained units below).
  'lists',
  'listDetail',
  // Slice 6 (the census sweep — every registry child joins; search/polls/restaurant
  // stay bespoke until their own slices): entity scenes get content identity;
  // creation flows (saveList/postPhotos) are per-invocation EPHEMERAL — identity
  // null = no post-pop retention (legacy entry-keyed units), but they still get the
  // boundary + the deferred publication.
  'userProfile',
  'followList',
  'messagesInbox',
  'dmSession',
  'editProfile',
  'saveList',
  'postPhotos',
  // The search slice (structural half): the search sheet body display-detaches when
  // another root presents; the world/dismiss choreography rides transitionLive via
  // the frame's outgoing leg. The display target stays bespoke — only the display
  // fact joins the manager.
  'search',
] as const satisfies readonly SheetSceneKey[] | readonly OverlayKey[];

/** The retained-shell key space: DERIVED from the membership array above, never
 *  restated. (The `satisfies` on the array keeps every entry a real OverlayKey.) */
export type RetainedShellSceneKey = (typeof RETAINED_SHELL_SCENES)[number];

export const isRetainedShellScene = (scene: OverlayKey): scene is RetainedShellSceneKey =>
  (RETAINED_SHELL_SCENES as readonly string[]).includes(scene);

/** WARM-BEFORE-NAVIGATE's reachable set (A#6/B#6iii): every managed scene whose SHELL
 * (leg + spec host + visibility boundary) mounts at first app-idle, so a navigation
 * never compiles a shell. DERIVED from the one membership list — 'search' is excluded
 * only because its leg is always-mounted by the bespoke search composition. Content
 * identities (a specific list, a specific DM thread) still mount their retained UNIT
 * on navigation — that is content, not shell; shells are the free part (measured,
 * ResidentShellPrototype 2026-07-21). */
export const RETAINED_SHELL_PREWARM_SCENES: readonly RetainedShellSceneKey[] =
  RETAINED_SHELL_SCENES.filter((scene) => scene !== 'search');

/** How many popped identities a multi-entry managed scene keeps retained — the
 *  EVICTION LAW's first live budget (last-N exemption; the stack-pinned set is
 *  always exempt). The measured prototype says commitment is what the budget
 *  counts (~170KB/image-free row; RSS sticky) — N stays small.
 *
 *  F1387: numerically equal to `SCENE_ENTRY_MOUNT_DEPTH_LIMIT`
 *  (navigation/runtime/app-route-scene-entry-mounts.ts) but a DIFFERENT fact, independently
 *  derived — see that constant's comment for why they must not be silently merged. */
export const RETAINED_UNIT_RETENTION_LIMIT = 3;

/** THE RETAINED-UNIT IDENTITY (the eviction law's shell identity): what a retained
 *  unit is KEYED BY — content identity, never the ephemeral entryId, so a re-push
 *  of the same content reuses the retained tree (the unitKey is React's key).
 *  - listDetail: listId (+ targetUserId scope — it keys the world, wave-4 identity
 *    law). shareSlug is ACCESS MATERIAL, never identity (RT-18) — slug-only entries
 *    fall back to entryId: no cross-entry reuse until the slug resolves to a listId.
 *  - single-identity leaves: one unit per scene. */
type ResidentUnitIdentityResolver = (
  entry: OverlayRouteEntry,
  params: Record<string, Record<string, unknown> | undefined> | null | undefined
) => string | null;

/** ONE UNIT PER SCENE — the single-identity leaves. Named so the table below reads as
 *  a declaration rather than a repeated literal. */
const SINGLETON_UNIT: ResidentUnitIdentityResolver = () => 'scene';

/** PER-INVOCATION EPHEMERAL — null = no post-pop retention; units stay legacy
 *  entry-keyed (a new invocation always starts fresh). */
const EPHEMERAL_UNIT: ResidentUnitIdentityResolver = () => null;

/** THE EXHAUSTIVE IDENTITY TABLE (F939). This used to be a `switch` ending in
 *  `default: return 'scene'` — so a new MULTI-ENTRY managed scene silently collapsed
 *  to ONE shared singleton retained unit instead of per-identity units, which is the
 *  same "a missing registry entry silently broke nav" class ADDING_A_SCENE.md's
 *  exhaustiveness law was written for, one layer down. As a
 *  `Record<RetainedShellSceneKey, ...>` (whose key type is itself derived from the
 *  membership array, F908), joining the retained-shell set now FORCES the scene to declare
 *  its unit identity, and the compile error names the key.
 *  Mutation recipe to prove RED: delete the `dmSession` row →
 *  "Property 'dmSession' is missing in type ... but required in type
 *  Record<RetainedShellSceneKey, ResidentUnitIdentityResolver>". */
const RETAINED_UNIT_IDENTITY_BY_SCENE: Record<RetainedShellSceneKey, ResidentUnitIdentityResolver> =
  {
    notifications: SINGLETON_UNIT,
    settings: SINGLETON_UNIT,
    profile: SINGLETON_UNIT,
    lists: SINGLETON_UNIT,
    editProfile: SINGLETON_UNIT,
    messagesInbox: SINGLETON_UNIT,
    search: SINGLETON_UNIT,
    saveList: EPHEMERAL_UNIT,
    postPhotos: EPHEMERAL_UNIT,
    listDetail: (entry, params) => {
      const listId = params?.listDetail?.listId;
      const targetUserId = params?.listDetail?.targetUserId;
      if (typeof listId === 'string' && listId !== '') {
        return `list:${listId}:${typeof targetUserId === 'string' ? targetUserId : 'self'}`;
      }
      // shareSlug is ACCESS MATERIAL, never identity (RT-18) — slug-only entries get
      // per-entry units with retention (the slug resolves in place).
      return entry.entryId;
    },
    userProfile: (entry, params) => {
      const userId = params?.userProfile?.userId;
      return typeof userId === 'string' && userId !== '' ? `user:${userId}` : entry.entryId;
    },
    followList: (entry, params) => {
      const userId = params?.followList?.userId;
      const mode = params?.followList?.mode;
      return typeof userId === 'string' && userId !== ''
        ? `follow:${userId}:${typeof mode === 'string' ? mode : 'followers'}`
        : entry.entryId;
    },
    dmSession: (entry, params) => {
      const conversationId = params?.dmSession?.conversationId;
      return typeof conversationId === 'string' && conversationId !== ''
        ? `dm:${conversationId}`
        : entry.entryId;
    },
  };

export const retainedUnitIdentityOf = (entry: OverlayRouteEntry): string | null => {
  const params = entry.params as
    | Record<string, Record<string, unknown> | undefined>
    | null
    | undefined;
  // Unmanaged scenes (polls/restaurant — still bespoke) keep the legacy singleton unit.
  const resolve = isRetainedShellScene(entry.key)
    ? RETAINED_UNIT_IDENTITY_BY_SCENE[entry.key]
    : SINGLETON_UNIT;
  return resolve(entry, params);
};

// ─── THE DEFERRED-PUBLICATION SET (L4 — a distinct fact from shell retention) ─────────────
//
// Scenes whose ACTIVITY-ONLY body-surface publications hold until the reveal-gated
// flush. Safe by analysis: during search SUBMITS the scene is already active (no
// activity change → nothing held; the pending block rides the surface fence and
// structural publications stay synchronous); the flips happen exactly on the tab
// hops where deferral is the win.
//
// F909: this used to be `[...RETAINED_SHELL_SCENES, 'search']` under a paragraph
// claiming "search joins HERE without joining the retained-shell set" — but 'search' is
// already the LAST entry of the retained-shell set, so the spread listed it twice and the
// paragraph was simply false beside the code. Search DOES join the retained-shell set (its
// visibility rides the manager bit; only its DISPLAY TARGET stays bespoke, which the
// membership array says in place). The two sets are the same set today; when they
// genuinely diverge, the divergence gets written as a difference from this one list,
// not as a re-listing.
export const DEFERRED_PUBLICATION_SCENES: readonly OverlayKey[] = RETAINED_SHELL_SCENES;

export const isDeferredPublicationScene = (scene: OverlayKey): boolean =>
  (DEFERRED_PUBLICATION_SCENES as readonly string[]).includes(scene);
