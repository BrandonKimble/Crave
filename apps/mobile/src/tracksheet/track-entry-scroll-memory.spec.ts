// G-RESTORE falsifiers (A4): entry-keyed scroll memory. The remembered-0 law —
// a remembered offset of exactly 0 is a MEMORY, distinguishable from "never
// visited". If read() ever returns via `get(key) ?? 0`-style collapse (0 and
// no-memory indistinguishable), the first test goes RED.

import { makeTrackEntryKey } from './track-entry-identity';
import { computeOutgoingScroll, TrackEntryScrollMemory } from './track-entry-scroll-memory';

describe('TrackEntryScrollMemory (G-RESTORE)', () => {
  it('a remembered offset of exactly 0 is honored, not treated as no-memory', () => {
    const memory = new TrackEntryScrollMemory();
    const key = makeTrackEntryKey('profile', null);
    expect(memory.read(key)).toBeNull(); // never visited
    memory.save(key, 0);
    expect(memory.read(key)).toBe(0); // remembered top — a real memory
  });

  it('two entries of the same scene keep independent offsets (G-ENTRY)', () => {
    const memory = new TrackEntryScrollMemory();
    const a = makeTrackEntryKey('userProfile', 'route-entry-1');
    const b = makeTrackEntryKey('userProfile', 'route-entry-2');
    memory.save(a, 420);
    memory.save(b, 77);
    expect(memory.read(a)).toBe(420);
    expect(memory.read(b)).toBe(77);
  });

  it('computeOutgoingScroll = stash sigma + live scroll past the effective boundary', () => {
    // at rest below the boundary: only the stash
    expect(computeOutgoingScroll(100, 400, 30)).toBe(30);
    // scrolled past H+sigma: stash + overshoot
    expect(computeOutgoingScroll(700, 400, 30)).toBe(300);
    // no stash, no list scroll
    expect(computeOutgoingScroll(200, 400, 0)).toBe(0);
  });
});
