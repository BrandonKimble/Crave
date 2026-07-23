import type {
  OverlayKey,
  OverlayRouteEntry,
} from '../navigation/runtime/app-overlay-route-types';
import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';

// ─── THE RESIDENCY REGISTRY (L3 — the strangler's pure facts) ───────────────────────
//
// Which scenes are residency-managed, and WHAT KEYS a resident unit, are PURE facts
// consulted by pure modules (the entry-unit resolver runs in hermetic node tests) —
// so they live apart from the manager, which imports react-native for its prewarm
// scheduler. Grows per-slice per the migration bridge order; deleted-with-the-
// strangler when every scene is managed.

export const RESIDENCY_MANAGED_SCENES: readonly SheetSceneKey[] = [
  // Slices 1-2: the self-contained leaves.
  'notifications',
  'settings',
  // Slice 3: profile — the root own-tab (data lane stays with the central activity
  // flags until the runtime-governance merge).
  'profile',
  // Slice 4 (the bridge's pair — both sides of the owner's worst transition cross
  // together): bookmarks (root tab, singleton path) + listDetail (the first
  // MULTI-ENTRY managed scene — identity-keyed resident units below).
  'bookmarks',
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
];

export const isResidencyManagedScene = (scene: OverlayKey): boolean =>
  (RESIDENCY_MANAGED_SCENES as readonly string[]).includes(scene);

/** How many popped identities a multi-entry managed scene retains resident — the
 *  EVICTION LAW's first live budget (last-N exemption; the stack-pinned set is
 *  always exempt). The measured prototype says commitment is what the budget
 *  counts (~170KB/image-free row; RSS sticky) — N stays small. */
export const RESIDENT_UNIT_RETENTION_LIMIT = 3;

/** THE RESIDENT-UNIT IDENTITY (the eviction law's shell identity): what a resident
 *  unit is KEYED BY — content identity, never the ephemeral entryId, so a re-push
 *  of the same content reuses the resident tree (the unitKey is React's key).
 *  - listDetail: listId (+ targetUserId scope — it keys the world, wave-4 identity
 *    law). shareSlug is ACCESS MATERIAL, never identity (RT-18) — slug-only entries
 *    fall back to entryId: no cross-entry reuse until the slug resolves to a listId.
 *  - single-identity leaves: one unit per scene. */
export const residentUnitIdentityOf = (entry: OverlayRouteEntry): string | null => {
  const params = entry.params as Record<string, Record<string, unknown> | undefined> | null | undefined;
  switch (entry.key) {
    case 'listDetail': {
      const listId = params?.listDetail?.listId;
      const targetUserId = params?.listDetail?.targetUserId;
      if (typeof listId === 'string' && listId !== '') {
        return `list:${listId}:${typeof targetUserId === 'string' ? targetUserId : 'self'}`;
      }
      // shareSlug is ACCESS MATERIAL, never identity (RT-18) — slug-only entries get
      // per-entry units with retention (the slug resolves in place).
      return entry.entryId;
    }
    case 'userProfile': {
      const userId = params?.userProfile?.userId;
      return typeof userId === 'string' && userId !== '' ? `user:${userId}` : entry.entryId;
    }
    case 'followList': {
      const userId = params?.followList?.userId;
      const mode = params?.followList?.mode;
      return typeof userId === 'string' && userId !== ''
        ? `follow:${userId}:${typeof mode === 'string' ? mode : 'followers'}`
        : entry.entryId;
    }
    case 'dmSession': {
      const conversationId = params?.dmSession?.conversationId;
      return typeof conversationId === 'string' && conversationId !== ''
        ? `dm:${conversationId}`
        : entry.entryId;
    }
    // Creation flows: per-invocation EPHEMERAL — null = no post-pop retention;
    // units stay legacy entry-keyed (a new invocation always starts fresh).
    case 'saveList':
    case 'postPhotos':
      return null;
    default:
      return 'scene';
  }
};

// ─── THE DEFERRED-PUBLICATION SET (L4 — a distinct fact from residency) ─────────────
//
// Scenes whose ACTIVITY-ONLY body-surface publications hold until the reveal-gated
// flush. Search joins HERE without joining the residency set: its display/choreography
// stays bespoke (the world enter machinery — its own slice), but its activity flips
// (root-tab hops in/out of search) are the same transition tax the managed scenes
// shed. Safe by analysis: during search SUBMITS the scene is already active (no
// activity change → nothing held; the pending block rides the surface fence and
// structural publications stay synchronous); the flips happen exactly on the tab
// hops where deferral is the win.
export const DEFERRED_PUBLICATION_SCENES: readonly OverlayKey[] = [
  ...RESIDENCY_MANAGED_SCENES,
  'search',
];

export const isDeferredPublicationScene = (scene: OverlayKey): boolean =>
  (DEFERRED_PUBLICATION_SCENES as readonly string[]).includes(scene);
