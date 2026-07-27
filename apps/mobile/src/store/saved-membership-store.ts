import React from 'react';
import { create } from 'zustand';

import { userListsService } from '../services/user-lists';

/**
 * SAVED-ANYWHERE state for result cards (the plus→saved pill design,
 * 2026-07-26): a card shows "Save" (plus) until its restaurant/connection
 * lives in ANY list the viewer owns or co-edits, then "Saved" (check).
 *
 * Reads are BATCHED: each rendered card enqueues its id via
 * useSavedMembership; the queue flushes as ONE /lists/memberships request
 * per screenful (per-row reads would be dishonest jank). Results and
 * optimistic mutation marks live here so every surface (search results,
 * list detail, save modal, heart) stays coherent.
 */
type SavedTargetKind = 'restaurant' | 'connection';

type SavedMembershipState = {
  savedRestaurantIds: ReadonlySet<string>;
  savedConnectionIds: ReadonlySet<string>;
  markSaved: (kind: SavedTargetKind, id: string) => void;
  markUnsaved: (kind: SavedTargetKind, id: string) => void;
  absorb: (result: { savedRestaurantIds: string[]; savedConnectionIds: string[] }) => void;
};

const addTo = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  if (set.has(id)) {
    return set;
  }
  const next = new Set(set);
  next.add(id);
  return next;
};

const removeFrom = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  if (!set.has(id)) {
    return set;
  }
  const next = new Set(set);
  next.delete(id);
  return next;
};

export const useSavedMembershipStore = create<SavedMembershipState>((set) => ({
  savedRestaurantIds: new Set(),
  savedConnectionIds: new Set(),
  markSaved: (kind, id) =>
    set((state) =>
      kind === 'restaurant'
        ? { savedRestaurantIds: addTo(state.savedRestaurantIds, id) }
        : { savedConnectionIds: addTo(state.savedConnectionIds, id) }
    ),
  markUnsaved: (kind, id) =>
    set((state) =>
      kind === 'restaurant'
        ? { savedRestaurantIds: removeFrom(state.savedRestaurantIds, id) }
        : { savedConnectionIds: removeFrom(state.savedConnectionIds, id) }
    ),
  absorb: (result) =>
    set((state) => {
      let restaurants = state.savedRestaurantIds;
      let connections = state.savedConnectionIds;
      for (const id of result.savedRestaurantIds) {
        restaurants = addTo(restaurants, id);
      }
      for (const id of result.savedConnectionIds) {
        connections = addTo(connections, id);
      }
      return { savedRestaurantIds: restaurants, savedConnectionIds: connections };
    }),
}));

// ─── Batched ensure queue ────────────────────────────────────────────────────
// Ids already asked this session are not re-asked (mutations keep the store
// current via the mark* seams); unknown ids collect for one flush.

const requested = { restaurant: new Set<string>(), connection: new Set<string>() };
const pending = { restaurant: new Set<string>(), connection: new Set<string>() };
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_DELAY_MS = 50;

const flush = (): void => {
  flushTimer = null;
  const restaurantIds = [...pending.restaurant];
  const connectionIds = [...pending.connection];
  pending.restaurant.clear();
  pending.connection.clear();
  if (!restaurantIds.length && !connectionIds.length) {
    return;
  }
  void userListsService
    .batchMemberships({ restaurantIds, connectionIds })
    .then((result) => useSavedMembershipStore.getState().absorb(result))
    .catch(() => {
      // Honest failure: pills simply stay in the "Save" state; a later
      // mutation or fresh surface retries naturally.
      for (const id of restaurantIds) {
        requested.restaurant.delete(id);
      }
      for (const id of connectionIds) {
        requested.connection.delete(id);
      }
    });
};

export const ensureSavedMembership = (kind: SavedTargetKind, id: string): void => {
  if (requested[kind].has(id)) {
    return;
  }
  requested[kind].add(id);
  pending[kind].add(id);
  if (flushTimer == null) {
    flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  }
};

/** Re-ask the server about one target (after a removal, where "still saved
 *  in some other list?" cannot be known locally). */
export const refreshSavedMembership = (kind: SavedTargetKind, id: string): void => {
  useSavedMembershipStore.getState().markUnsaved(kind, id);
  requested[kind].delete(id);
  ensureSavedMembership(kind, id);
};

/** Card-side hook: live saved state + the batched ensure (effects fire in
 *  committed card components, unlike the scene body-spec hooks). */
export const useSavedMembership = (
  kind: SavedTargetKind,
  id: string | null | undefined
): boolean => {
  React.useEffect(() => {
    if (id) {
      ensureSavedMembership(kind, id);
    }
  }, [kind, id]);
  return useSavedMembershipStore((state) =>
    id
      ? (kind === 'restaurant' ? state.savedRestaurantIds : state.savedConnectionIds).has(id)
      : false
  );
};
