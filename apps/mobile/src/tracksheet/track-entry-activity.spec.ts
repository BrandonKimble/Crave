// ─── G-ACTIVITY FALSIFIERS (R2 / amendment A7) ───────────────────────────────
//
// RED-proof record: hardcoding the derivation back to all-true (the exact
// pre-R2 host object) fails the hidden-lane tests; flipping
// shouldAttachMountedContent off while hidden fails the retention test.

import { deriveTrackEntryBodyActivity } from './track-entry-activity';

describe('deriveTrackEntryBodyActivity (activity derived from presentation — no all-true)', () => {
  it("a HIDDEN entry's gated lanes do not run", () => {
    const hidden = deriveTrackEntryBodyActivity('dmSession', false);
    expect(hidden.shouldRunDataLane).toBe(false);
    expect(hidden.shouldSubscribeDataLane).toBe(false);
    expect(hidden.shouldRenderExpandedContent).toBe(false);
  });

  it('a HIDDEN entry stays ATTACHED — state survives re-presentation (the point of retention)', () => {
    const hidden = deriveTrackEntryBodyActivity('dmSession', false);
    expect(hidden.shouldAttachMountedContent).toBe(true);
    // Activation is history: hiding must not replay the activation
    // choreography (scroll/segment restore edges) on re-presentation.
    expect(hidden.hasActivatedExpandedContent).toBe(true);
  });

  it('a PRESENTED entry runs the full production activity', () => {
    const presented = deriveTrackEntryBodyActivity('listDetail', true);
    expect(presented).toEqual({
      sceneKey: 'listDetail',
      shouldAttachMountedContent: true,
      shouldRunDataLane: true,
      shouldSubscribeDataLane: true,
      shouldRenderExpandedContent: true,
      hasActivatedExpandedContent: true,
    });
  });

  it('resume on presentation: the same entry derives suspended → full across the flip', () => {
    const before = deriveTrackEntryBodyActivity('userProfile', false);
    const after = deriveTrackEntryBodyActivity('userProfile', true);
    expect(before.shouldRunDataLane).toBe(false);
    expect(after.shouldRunDataLane).toBe(true);
    expect(before.shouldAttachMountedContent).toBe(after.shouldAttachMountedContent);
  });
});
