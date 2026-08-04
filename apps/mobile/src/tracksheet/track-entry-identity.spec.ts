// G-ENTRY falsifier (identity layer): entry identity must be sceneKey#entryId —
// two entries of the same scene are DIFFERENT identities. If someone collapses
// the key back to the scene (the pre-R1 behavior), these go RED.

import {
  makeTrackEntryKey,
  publicationMatchesEntry,
  trackEntrySceneKey,
  TRACK_ROOT_ENTRY_ID,
} from './track-entry-identity';

describe('track entry identity (G-ENTRY)', () => {
  it('two entries of the same scene have distinct keys', () => {
    const a = makeTrackEntryKey('userProfile', 'route-entry-1');
    const b = makeTrackEntryKey('userProfile', 'route-entry-2');
    expect(a).not.toBe(b);
    expect(trackEntrySceneKey(a)).toBe('userProfile');
    expect(trackEntrySceneKey(b)).toBe('userProfile');
  });

  it('null/absent entryId is the scene singleton root (resident tabs)', () => {
    expect(makeTrackEntryKey('polls', null)).toBe(`polls#${TRACK_ROOT_ENTRY_ID}`);
    expect(makeTrackEntryKey('polls')).toBe(makeTrackEntryKey('polls', null));
  });

  it('the scene half is recoverable for chrome/foundation lookups', () => {
    expect(trackEntrySceneKey(makeTrackEntryKey('dmSession', 'route-entry-9'))).toBe('dmSession');
  });
});

// THE ENTRY STAMP falsifiers (R6, same-scene pop aliasing — R2 item-5 residual).
// RED conditions, proven by mutation:
//   (a) the host accepting a MISMATCHED stamp (pollDetail A's rows aliasing
//       into B on pop) → the mismatch test fails if the guard is dropped.
//   (b) the guard rejecting UNSTAMPED publications (legacy writers going
//       skeleton forever) → the null-stamp tests fail if null stops matching.
describe('publicationMatchesEntry (the entry stamp)', () => {
  it('RED-able core: a stamped publication for entry A does NOT match presented entry B', () => {
    expect(publicationMatchesEntry('route-entry-A', 'route-entry-B')).toBe(false);
  });

  it('a stamped publication matches its own entry', () => {
    expect(publicationMatchesEntry('route-entry-A', 'route-entry-A')).toBe(true);
  });

  it('unstamped publications always match (per-writer adoption, no flag day)', () => {
    expect(publicationMatchesEntry(null, 'route-entry-A')).toBe(true);
    expect(publicationMatchesEntry(undefined, null)).toBe(true);
    expect(publicationMatchesEntry(null, null)).toBe(true);
  });

  it('a stamp against a null presented entry (resident root) is a mismatch', () => {
    expect(publicationMatchesEntry('route-entry-A', null)).toBe(false);
  });
});
