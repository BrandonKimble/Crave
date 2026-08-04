// G-ENTRY falsifier (identity layer): entry identity must be sceneKey#entryId —
// two entries of the same scene are DIFFERENT identities. If someone collapses
// the key back to the scene (the pre-R1 behavior), these go RED.

import { makeTrackEntryKey, trackEntrySceneKey, TRACK_ROOT_ENTRY_ID } from './track-entry-identity';

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
