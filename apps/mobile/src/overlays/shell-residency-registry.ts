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
export const residentUnitIdentityOf = (entry: OverlayRouteEntry): string => {
  if (entry.key === 'listDetail') {
    const params = (entry.params as { listDetail?: { listId?: string | null; targetUserId?: string | null } } | null | undefined)?.listDetail;
    if (params?.listId != null && params.listId !== '') {
      return `list:${params.listId}:${params.targetUserId ?? 'self'}`;
    }
    return entry.entryId;
  }
  return 'scene';
};
