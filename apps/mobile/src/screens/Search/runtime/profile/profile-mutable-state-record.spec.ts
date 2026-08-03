// F1065: the restaurant-profile cache is BOUNDED (it was unbounded and never invalidated —
// one entry per distinct restaurant viewed, for the lifetime of the search runtime).
// Invalidation semantics under test: capacity + write-recency eviction, no read promotion,
// no TTL. See profile-mutable-state-record.ts for why each of those is what it is.
//
// RED recipe (mutation-proved before landing): delete the `while (cache.size > LIMIT)`
// eviction loop in setRestaurantProfileCacheEntryOnRecord → 'the cache is BOUNDED' fails
// with size 13 (Expected 12), and 'the least-recently-WRITTEN entry is evicted' fails
// because the evicted entry is still there.

import {
  getRestaurantProfileCacheEntryFromRecord,
  setRestaurantProfileCacheEntryOnRecord,
} from './profile-mutable-state-record';
import { createInitialProfileControllerState } from './profile-runtime-state-record';
import type { HydratedRestaurantProfile } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

const profile = (restaurantId: string): HydratedRestaurantProfile =>
  ({ restaurant: { restaurantId }, dishes: [] }) as unknown as HydratedRestaurantProfile;

const LIMIT = 12;

describe('restaurant-profile cache is a bounded LRU (F1065)', () => {
  it('the cache is BOUNDED — 40 distinct profiles never grow it past the limit', () => {
    const state = createInitialProfileControllerState();
    for (let index = 0; index < 40; index += 1) {
      setRestaurantProfileCacheEntryOnRecord(state, `r${index}`, profile(`r${index}`));
    }
    expect(state.mutable.restaurantProfileCache.size).toBe(LIMIT);
  });

  it('the least-recently-WRITTEN entry is evicted; the most recent survive', () => {
    const state = createInitialProfileControllerState();
    for (let index = 0; index < LIMIT + 1; index += 1) {
      setRestaurantProfileCacheEntryOnRecord(state, `r${index}`, profile(`r${index}`));
    }
    expect(getRestaurantProfileCacheEntryFromRecord(state, 'r0')).toBeUndefined();
    expect(getRestaurantProfileCacheEntryFromRecord(state, 'r1')).toBeDefined();
    expect(getRestaurantProfileCacheEntryFromRecord(state, `r${LIMIT}`)).toBeDefined();
  });

  it('a REWRITE refreshes recency (the entry moves to the back, and the next one goes)', () => {
    const state = createInitialProfileControllerState();
    for (let index = 0; index < LIMIT; index += 1) {
      setRestaurantProfileCacheEntryOnRecord(state, `r${index}`, profile(`r${index}`));
    }
    setRestaurantProfileCacheEntryOnRecord(state, 'r0', profile('r0'));
    setRestaurantProfileCacheEntryOnRecord(state, 'new', profile('new'));
    expect(getRestaurantProfileCacheEntryFromRecord(state, 'r0')).toBeDefined();
    expect(getRestaurantProfileCacheEntryFromRecord(state, 'r1')).toBeUndefined();
  });

  it('a READ does NOT promote — no read-pinning, by design (stated invalidation semantics)', () => {
    const state = createInitialProfileControllerState();
    for (let index = 0; index < LIMIT; index += 1) {
      setRestaurantProfileCacheEntryOnRecord(state, `r${index}`, profile(`r${index}`));
    }
    expect(getRestaurantProfileCacheEntryFromRecord(state, 'r0')).toBeDefined();
    setRestaurantProfileCacheEntryOnRecord(state, 'new', profile('new'));
    expect(getRestaurantProfileCacheEntryFromRecord(state, 'r0')).toBeUndefined();
  });

  it('a cached entry is served unchanged within the bound — NO TTL (pre-existing, preserved)', () => {
    const state = createInitialProfileControllerState();
    const first = profile('r1');
    setRestaurantProfileCacheEntryOnRecord(state, 'r1', first);
    expect(getRestaurantProfileCacheEntryFromRecord(state, 'r1')).toBe(first);
  });
});
