import { createResolverCore } from './search-world-resolver-core';

describe('search-world-resolver-core', () => {
  it('a landed resolution presents iff its key is STILL desired (not by start generation)', () => {
    const core = createResolverCore();
    core.begin({ generation: 1, worldKey: 'A' });
    // Desire moved to B and back to A while A resolved:
    core.observeGeneration(3);
    expect(core.land({ generation: 1, worldKey: 'A' }, (key) => key === 'A')).toBe('present');
  });

  it('a superseded resolution completes into cache, never presents', () => {
    const core = createResolverCore();
    core.begin({ generation: 1, worldKey: 'A' });
    core.observeGeneration(2); // desire moved to B
    expect(core.land({ generation: 1, worldKey: 'A' }, (key) => key === 'B')).toBe('cache_only');
  });

  it('in-flight dedupe: a second begin for the same key attaches instead of double-fetching', () => {
    const core = createResolverCore();
    expect(core.begin({ generation: 1, worldKey: 'A' })).toBe(true);
    expect(core.begin({ generation: 2, worldKey: 'A' })).toBe(false);
    expect(core.inFlightKeys()).toEqual(['A']);
  });

  it('failure clears in-flight so retry can begin', () => {
    const core = createResolverCore();
    core.begin({ generation: 1, worldKey: 'A' });
    core.fail({ generation: 1, worldKey: 'A' });
    expect(core.begin({ generation: 2, worldKey: 'A' })).toBe(true);
  });
});
