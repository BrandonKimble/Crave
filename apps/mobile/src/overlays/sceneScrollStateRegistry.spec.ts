import {
  consumePendingOverlayScrollRestore,
  getOverlayScrollOffset,
  registerOverlaySceneScrollHandle,
  setOverlayScrollOffset,
  stageOverlayScrollRestore,
} from './sceneScrollStateRegistry';

// THE BOUND EXISTS (F912). Before this, the record store was an unbounded module-global
// Map keyed by CONTENT identity (`restaurant:${id}`), so a session accumulated one
// permanent record per restaurant/list/DM ever opened, with no removal path.
//
// RED recipe: delete the `evictLeastRecentlyTouched()` call in `getState` (or raise
// SCENE_SCROLL_RECORD_LIMIT above 400) and the first test fails — the 10th record's
// offset survives 400 later scenes.

const RECORD_LIMIT = 48;

describe('sceneScrollStateRegistry record bounding', () => {
  it('evicts least-recently-touched records once the cap is passed', () => {
    setOverlayScrollOffset('evictable:probe', 123);
    expect(getOverlayScrollOffset('evictable:probe')).toBe(123);

    for (let index = 0; index < RECORD_LIMIT * 2; index += 1) {
      setOverlayScrollOffset(`filler:${index}`, index + 1);
    }

    // The probe is long past the least-recently-used end and owns nothing live.
    expect(getOverlayScrollOffset('evictable:probe')).toBe(0);
  });

  it('keeps a record alive while it owns a live scroll handle (pinned)', () => {
    const release = registerOverlaySceneScrollHandle('pinned:handle', {
      scrollTo: () => undefined,
      scrollOffset: { value: 0 } as never,
    });
    setOverlayScrollOffset('pinned:handle', 456);

    for (let index = 0; index < RECORD_LIMIT * 2; index += 1) {
      setOverlayScrollOffset(`pin-filler:${index}`, index + 1);
    }

    expect(getOverlayScrollOffset('pinned:handle')).toBe(456);
    release();
  });

  it('keeps a record alive while a one-shot restore is staged (pinned)', () => {
    stageOverlayScrollRestore('pinned:restore', 789);

    for (let index = 0; index < RECORD_LIMIT * 2; index += 1) {
      setOverlayScrollOffset(`restore-filler:${index}`, index + 1);
    }

    expect(consumePendingOverlayScrollRestore('pinned:restore')).toBe(789);
  });
});
