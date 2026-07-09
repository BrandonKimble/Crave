// The GLOBAL WORLD CACHE (charter §3): query-cache semantics adopted deliberately —
// keys, staleness/TTL, pinning, versioned values — never reinvented ad hoc.
//
// - Identity = the tuple-derived world key; VALUE is versioned (never mutated in place):
//   pagination appends commit a new version under the same identity. Presentation
//   choreography fires on IDENTITY change only; version changes are in-place updates.
// - Residency: every live scene-stack entry's world is PINNED (return-to-origin is a pin,
//   not an LRU lottery); unpinned worlds are LRU'd against a budget.
// - Time axis: entries carry resolvedAt; staleness is a QUERY-TIME judgment
//   (isEntryStale) — a stale hit is a designed present-stale + revalidate state, never a
//   silent wrong answer.
// - Superseded resolutions COMPLETE INTO CACHE (the resolver commits them here without
//   presenting) — free resilience for A→B→A retoggle.

export type SearchWorldStatus =
  | { kind: 'ready' }
  | { kind: 'empty'; reason: 'no_results' | 'on_demand_pending' | 'filtered_out' }
  | { kind: 'failed'; reason: string };

export type SearchWorldEntry<TValue> = {
  worldKey: string;
  worldId: string;
  version: number;
  status: SearchWorldStatus;
  value: TValue;
  resolvedAt: number;
};

export type SearchWorldCache<TValue> = {
  get: (worldKey: string) => SearchWorldEntry<TValue> | null;
  /** Commit a resolved world. Same key ⇒ version bumps and worldId gains a version
   *  suffix (an in-place value update is unrepresentable). */
  commit: (args: {
    worldKey: string;
    status: SearchWorldStatus;
    value: TValue;
    resolvedAt: number;
  }) => SearchWorldEntry<TValue>;
  /** Pin/unpin for scene-stack residency. Pins are counted (nested entries may pin the
   *  same world); a pinned world is never evicted. */
  pin: (worldKey: string) => void;
  unpin: (worldKey: string) => void;
  isEntryStale: (entry: SearchWorldEntry<TValue>, nowMs: number) => boolean;
  /** Evict unpinned worlds beyond the budget, least-recently-USED first. */
  size: () => number;
  keys: () => string[];
};

export const createSearchWorldCache = <TValue>(options: {
  /** Max UNPINNED resident worlds; pinned worlds never count against eviction. */
  maxUnpinnedWorlds: number;
  /** Wall-clock TTL after which a hit is stale (present-stale + revalidate). */
  staleAfterMs: number;
}): SearchWorldCache<TValue> => {
  const entries = new Map<string, SearchWorldEntry<TValue>>();
  const pinCounts = new Map<string, number>();
  // Map iteration order is insertion order; re-inserting on touch gives LRU for free.
  const touch = (worldKey: string): void => {
    const entry = entries.get(worldKey);
    if (entry != null) {
      entries.delete(worldKey);
      entries.set(worldKey, entry);
    }
  };
  const evictBeyondBudget = (): void => {
    let unpinned = 0;
    for (const key of entries.keys()) {
      if ((pinCounts.get(key) ?? 0) === 0) {
        unpinned += 1;
      }
    }
    if (unpinned <= options.maxUnpinnedWorlds) {
      return;
    }
    for (const key of entries.keys()) {
      if (unpinned <= options.maxUnpinnedWorlds) {
        break;
      }
      if ((pinCounts.get(key) ?? 0) === 0) {
        entries.delete(key);
        unpinned -= 1;
      }
    }
  };
  return {
    get: (worldKey) => {
      const entry = entries.get(worldKey) ?? null;
      if (entry != null) {
        touch(worldKey);
      }
      return entry;
    },
    commit: ({ worldKey, status, value, resolvedAt }) => {
      const previous = entries.get(worldKey);
      const version = (previous?.version ?? 0) + 1;
      const entry: SearchWorldEntry<TValue> = {
        worldKey,
        worldId: `${worldKey}@v${version}`,
        version,
        status,
        value,
        resolvedAt,
      };
      entries.delete(worldKey);
      entries.set(worldKey, entry);
      evictBeyondBudget();
      return entry;
    },
    pin: (worldKey) => {
      pinCounts.set(worldKey, (pinCounts.get(worldKey) ?? 0) + 1);
    },
    unpin: (worldKey) => {
      const current = pinCounts.get(worldKey) ?? 0;
      if (current <= 1) {
        pinCounts.delete(worldKey);
        evictBeyondBudget();
        return;
      }
      pinCounts.set(worldKey, current - 1);
    },
    isEntryStale: (entry, nowMs) => nowMs - entry.resolvedAt > options.staleAfterMs,
    size: () => entries.size,
    keys: () => Array.from(entries.keys()),
  };
};
