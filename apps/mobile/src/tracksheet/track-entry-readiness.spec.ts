// ─── G-READY / OA6.1 FALSIFIERS (R2 — same commit as the mechanism) ──────────
//
// RED-proof record (how each was proven able to fail, per the regime):
//   • "cold switch commits a body" — deleting the 'skeleton' return (making
//     present() return 'frozen' for unlatched misses) fails the cold tests.
//   • "never regresses to skeleton" — removing the latch (present() returning
//     'skeleton' whenever !ready) fails the OA6.1 tests.
//   • rows/ready split — collapsing isResolutionReady to rowCount>0 fails the
//     empty-face test.

import {
  isResolutionReady,
  resolutionHasRealRows,
  TrackEntryReadinessLedger,
} from './track-entry-readiness';

describe('resolution readiness (G-READY: ready = a concrete body exists)', () => {
  it('no lane is NOT ready — the skeleton branch is reachable by condition', () => {
    expect(isResolutionReady({ kind: 'none' })).toBe(false);
  });

  it('a mounted body is ready', () => {
    expect(isResolutionReady({ kind: 'mounted' })).toBe(true);
  });

  it('a published/parts list is ready even with zero rows (the scene owns its empty face — leg-4 gap, promise card)', () => {
    expect(isResolutionReady({ kind: 'list', rowCount: 0 })).toBe(true);
    expect(isResolutionReady({ kind: 'list', rowCount: 12 })).toBe(true);
  });

  it('real-rows (the two-phase second phase) is a SEPARATE fact from ready', () => {
    expect(resolutionHasRealRows({ kind: 'list', rowCount: 0 })).toBe(false);
    expect(resolutionHasRealRows({ kind: 'list', rowCount: 1 })).toBe(true);
    expect(resolutionHasRealRows({ kind: 'mounted' })).toBe(true);
    expect(resolutionHasRealRows({ kind: 'none' })).toBe(false);
  });
});

describe('TrackEntryReadinessLedger (the paint decision — never a wait)', () => {
  it('cold first visit paints the SKELETON in the same decision (no empty frame, no wait state exists in the type)', () => {
    const ledger = new TrackEntryReadinessLedger();
    // The decision is total: 'content' | 'skeleton' | 'frozen' — there is no
    // null/wait to return, so the switch commit always paints a body.
    expect(ledger.present('pollDetail#e1', false)).toBe('skeleton');
  });

  it('readiness flips skeleton → content (the two-phase flip)', () => {
    const ledger = new TrackEntryReadinessLedger();
    expect(ledger.present('pollDetail#e1', false)).toBe('skeleton');
    expect(ledger.present('pollDetail#e1', true)).toBe('content');
  });

  it('OA6.1: an entry that has shown content NEVER regresses to skeleton — a later gap presents the frozen world', () => {
    const ledger = new TrackEntryReadinessLedger();
    expect(ledger.present('restaurant#e7', true)).toBe('content');
    expect(ledger.present('restaurant#e7', false)).toBe('frozen');
    // And stays frozen, never skeleton, on repeated misses.
    expect(ledger.present('restaurant#e7', false)).toBe('frozen');
  });

  it('the latch is PER ENTRY (G-ENTRY: a sibling entry of the same scene is cold on its own)', () => {
    const ledger = new TrackEntryReadinessLedger();
    ledger.present('userProfile#a', true);
    expect(ledger.present('userProfile#b', false)).toBe('skeleton');
  });

  it('forget() drops the latch with the evicted leg (a child entryId never returns)', () => {
    const ledger = new TrackEntryReadinessLedger();
    ledger.present('dmSession#e3', true);
    ledger.forget('dmSession#e3');
    expect(ledger.hasShownContent('dmSession#e3')).toBe(false);
    expect(ledger.present('dmSession#e3', false)).toBe('skeleton');
  });
});
