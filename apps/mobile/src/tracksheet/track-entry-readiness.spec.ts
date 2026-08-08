// ─── G-READY RESOLUTION FACTS (R2; ledger deleted in R8) ─────────────────────
//
// The paint DECISION moved to track-paint-resolver.spec.ts (one total
// resolver, OA8). What this file still falsifies are the resolution facts:
//   • rows/ready split — collapsing isResolutionReady to rowCount>0 fails the
//     empty-face test.

import { isResolutionReady, resolutionHasRealRows } from './track-entry-readiness';

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
