import { PERSISTED_KEYS, partializeSearchState } from './searchStore';
import type { SearchRuntimeMirroredState } from './searchStore';

const fullState: SearchRuntimeMirroredState = {
  openNow: true,
  dietary: ['vegan'],
  priceLevels: [1, 2],
  risingActive: true,
  activeTab: 'restaurants',
  preferredActiveTab: 'restaurants',
  hasActiveTabPreference: true,
};

describe('partializeSearchState', () => {
  it('emits exactly the PERSISTED_KEYS projection — no more, no less', () => {
    const persisted = partializeSearchState(fullState);
    // Drift guard: every key the list declares persisted must actually be emitted, and
    // nothing outside the list (the tab fields) may leak in. Adding a key to PERSISTED_KEYS
    // now flows here automatically; a hand-enumerated literal would silently drop it.
    expect(Object.keys(persisted).sort()).toEqual([...PERSISTED_KEYS].sort());
    for (const key of PERSISTED_KEYS) {
      expect(persisted[key]).toEqual(fullState[key]);
    }
  });

  it('does not persist the runtime-owned tab fields', () => {
    const persisted = partializeSearchState(fullState) as Record<string, unknown>;
    expect(persisted.activeTab).toBeUndefined();
    expect(persisted.preferredActiveTab).toBeUndefined();
    expect(persisted.hasActiveTabPreference).toBeUndefined();
  });
});
