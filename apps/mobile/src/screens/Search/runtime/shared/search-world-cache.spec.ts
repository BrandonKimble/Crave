import { createSearchWorldCache } from './search-world-cache';

describe('search-world-cache', () => {
  const make = () => createSearchWorldCache<string>({ maxUnpinnedWorlds: 2, staleAfterMs: 1000 });

  it('versions values under one identity — worldId changes per commit, never mutates', () => {
    const cache = make();
    const v1 = cache.commit({
      worldKey: 'K',
      status: { kind: 'ready' },
      value: 'page1',
      resolvedAt: 0,
    });
    const v2 = cache.commit({
      worldKey: 'K',
      status: { kind: 'ready' },
      value: 'page1+2',
      resolvedAt: 5,
    });
    expect(v1.worldId).not.toBe(v2.worldId);
    expect(v2.version).toBe(2);
    expect(cache.get('K')?.value).toBe('page1+2');
  });

  it('LRU-evicts only unpinned worlds beyond the budget', () => {
    const cache = make();
    cache.commit({ worldKey: 'A', status: { kind: 'ready' }, value: 'a', resolvedAt: 0 });
    cache.pin('A');
    cache.commit({ worldKey: 'B', status: { kind: 'ready' }, value: 'b', resolvedAt: 0 });
    cache.commit({ worldKey: 'C', status: { kind: 'ready' }, value: 'c', resolvedAt: 0 });
    cache.commit({ worldKey: 'D', status: { kind: 'ready' }, value: 'd', resolvedAt: 0 });
    // budget 2 unpinned: B (oldest unpinned) evicted; pinned A survives.
    expect(cache.get('A')).not.toBeNull();
    expect(cache.get('B')).toBeNull();
    expect(cache.get('C')).not.toBeNull();
    expect(cache.get('D')).not.toBeNull();
  });

  it('a get() touch protects a world from the next eviction (true LRU)', () => {
    const cache = make();
    cache.commit({ worldKey: 'B', status: { kind: 'ready' }, value: 'b', resolvedAt: 0 });
    cache.commit({ worldKey: 'C', status: { kind: 'ready' }, value: 'c', resolvedAt: 0 });
    cache.get('B'); // touch B — C becomes least-recently-used
    cache.commit({ worldKey: 'D', status: { kind: 'ready' }, value: 'd', resolvedAt: 0 });
    expect(cache.get('B')).not.toBeNull();
    expect(cache.get('C')).toBeNull();
  });

  it('unpinning below budget evicts; counted pins survive single unpin', () => {
    const cache = make();
    cache.commit({ worldKey: 'A', status: { kind: 'ready' }, value: 'a', resolvedAt: 0 });
    cache.pin('A');
    cache.pin('A'); // two stack entries reference this world
    cache.commit({ worldKey: 'B', status: { kind: 'ready' }, value: 'b', resolvedAt: 0 });
    cache.commit({ worldKey: 'C', status: { kind: 'ready' }, value: 'c', resolvedAt: 0 });
    cache.commit({ worldKey: 'D', status: { kind: 'ready' }, value: 'd', resolvedAt: 0 });
    cache.unpin('A');
    expect(cache.get('A')).not.toBeNull(); // still pinned once
    cache.unpin('A');
    cache.commit({ worldKey: 'E', status: { kind: 'ready' }, value: 'e', resolvedAt: 0 });
    // A is now unpinned and was least-recently-used among unpinned... eviction applies.
    expect(cache.size()).toBeLessThanOrEqual(3);
  });

  it('staleness is a query-time judgment on resolvedAt', () => {
    const cache = make();
    const entry = cache.commit({
      worldKey: 'K',
      status: { kind: 'ready' },
      value: 'x',
      resolvedAt: 100,
    });
    expect(cache.isEntryStale(entry, 500)).toBe(false);
    expect(cache.isEntryStale(entry, 1200)).toBe(true);
  });

  it('empty and failed are first-class committed states', () => {
    const cache = make();
    cache.commit({
      worldKey: 'K',
      status: { kind: 'empty', reason: 'filtered_out' },
      value: '',
      resolvedAt: 0,
    });
    expect(cache.get('K')?.status).toEqual({ kind: 'empty', reason: 'filtered_out' });
    cache.commit({
      worldKey: 'K2',
      status: { kind: 'failed', reason: 'network' },
      value: '',
      resolvedAt: 0,
    });
    expect(cache.get('K2')?.status.kind).toBe('failed');
  });
});
