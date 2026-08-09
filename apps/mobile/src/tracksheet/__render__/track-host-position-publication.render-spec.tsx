// ─── FALSIFIERS: THE POSITION PUBLICATION IS THE PAGE'S OWN PHYSICS ──────────
//
// Residue-kill item 12: the publication bridge (per-frame mirrors into rival
// app-owned SVs) is deleted; TrackSheetPage publishes its OWN derived sheetTopY
// plus a point-in-time presented-list-scroll getter through
// track-sheet-position-authority. Every rider — the chrome transition chain,
// the scrim dim, the dismiss motion plane, the results shell, origin capture,
// the profile snapshot — reads THIS publication (directly or via the
// motion-state pipe's sheetYValue). So the ONE structural fact to falsify is:
// the published object is live physics, not a seed, not a copy.
//
// RED if: the page's publish effect is deleted (test 1), the publication stops
// tracking τ (test 2 — every per-frame rider freezes exactly when this reds),
// the scroll getter stops being point-in-time (test 3 — origin capture and the
// profile snapshot would fossilize), or unmount leaks the publication (test 4).

import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import { getTrackSheetPositionAuthority } from '../track-sheet-position-authority';
import { renderHost, resetHarness, settleAt } from './render-utils';

// Geometry from the harness sharedSheetOwner: expanded 100 / middle 400 /
// collapsed 700 → trackH 600. sheetTopY = 100 + max(0, 600 + σ − τ).
const EXPANDED_TAU = 600;

describe('the track position publication — host wiring (residue-kill item 12)', () => {
  let renderer: ReactTestRenderer;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    resetHarness();
    renderer = await renderHost();
  });

  afterEach(async () => {
    if (renderer != null) {
      await act(async () => {
        renderer.unmount();
      });
    }
    jest.useRealTimers();
    logSpy.mockRestore();
  });

  it('mounting the host publishes a REAL position (not the offscreen seed)', () => {
    const authority = getTrackSheetPositionAuthority();
    expect(authority.getPosition()).not.toBeNull();
    // The seed reads ≥ 10000; live physics geometry never does.
    expect(authority.getSheetTopY().value).toBeLessThan(10000);
  });

  it('the published sheetTopY IS live physics — it tracks τ with zero copies', async () => {
    const authority = getTrackSheetPositionAuthority();
    const published = authority.getSheetTopY();
    await settleAt(EXPANDED_TAU);
    // τ = 600 ⇒ sheetTopY = 100 + max(0, 600 − 600) = 100 (expanded top).
    // A mirror that missed a frame — or a re-grown rival SV — reads stale here.
    expect(published.value).toBe(100);
    // Same OBJECT still published (zero-copy law): no re-publication happened.
    expect(authority.getSheetTopY()).toBe(published);
  });

  it('getPresentedListScroll is point-in-time: max(0, τ − trackH) at CALL time', async () => {
    const authority = getTrackSheetPositionAuthority();
    await settleAt(EXPANDED_TAU);
    expect(authority.getPresentedListScroll()).toBe(0);
    // Scroll past the boundary: τ = 650 ⇒ presented list scroll 50.
    await settleAt(650);
    expect(authority.getPresentedListScroll()).toBe(50);
  });

  it('unmounting the host clears the publication (no stale physics leaks)', async () => {
    const authority = getTrackSheetPositionAuthority();
    expect(authority.getPosition()).not.toBeNull();
    await act(async () => {
      renderer.unmount();
    });
    renderer = null as unknown as ReactTestRenderer;
    expect(authority.getPosition()).toBeNull();
    // Total reads fall back to the offscreen seed / zero — never a crash.
    expect(authority.getSheetTopY().value).toBeGreaterThanOrEqual(10000);
    expect(authority.getPresentedListScroll()).toBe(0);
  });
});
