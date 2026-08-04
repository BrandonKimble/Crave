// A3 falsifier: depth-K retention of per-entry React identity. RED if the
// retention stops keeping the buried entry alive across a push (pop-back would
// no longer be byte-exact) or grows without bound.

import { TrackEntryRetention, TRACK_CHILD_RETENTION_DEPTH } from './track-entry-retention';

describe('TrackEntryRetention (A3 depth-K)', () => {
  it('push A then B (same scene): A stays retained for a byte-exact pop', () => {
    const retention = new TrackEntryRetention(TRACK_CHILD_RETENTION_DEPTH);
    expect(retention.touch('userProfile#e1')).toEqual([]);
    expect(retention.touch('userProfile#e2')).toEqual([]);
    expect(retention.keys()).toContain('userProfile#e1');
    expect(retention.keys()).toContain('userProfile#e2');
  });

  it('evicts the least-recently-presented beyond K; the presented entry never evicts itself', () => {
    const retention = new TrackEntryRetention(3);
    retention.touch('a#1');
    retention.touch('b#1');
    retention.touch('c#1');
    expect(retention.touch('d#1')).toEqual(['a#1']);
    expect(retention.keys()).toEqual(['b#1', 'c#1', 'd#1']);
  });

  it('re-presenting a retained entry refreshes its recency instead of duplicating it', () => {
    const retention = new TrackEntryRetention(3);
    retention.touch('a#1');
    retention.touch('b#1');
    retention.touch('a#1'); // pop back to a
    expect(retention.touch('c#1')).toEqual([]); // b is now oldest, not a
    expect(retention.touch('d#1')).toEqual(['b#1']);
    expect(retention.keys()).toContain('a#1');
  });
});
