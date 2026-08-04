// ─── F3 falsifiers: THE SHEET-LEG FENCE, through the REAL host wiring ────────
//
// Every test here goes RED if the host's fence wiring is deleted or reordered:
// the willMove markSheetLegMotionPending call, the onDragBegin prop, the
// settle-side markSheetLegReady restores, the 700ms deadline, and the
// sheetLegIsAtRest gate inside offerSheetReadyIfAtRest. Mutation-verified
// (see the ledger in the task report).

import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import {
  beginDrag,
  clearRecords,
  endDrag,
  flushAsync,
  harness,
  nativeCallsNamed,
  renderHost,
  resetHarness,
  sendMotionCommand,
  settleAt,
  scrollTo,
} from './render-utils';

// Geometry from the harness sharedSheetOwner: expanded 100 / middle 400 /
// collapsed 700 → trackH 600, middleTau 300.
const EXPANDED_TAU = 600;

describe('the sheet-leg fence — host wiring (R7 D2, F3)', () => {
  let renderer: ReactTestRenderer;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    resetHarness();
    renderer = await renderHost();
    harness.world.surface.redrawTxnId = 'rt1';
    clearRecords(harness.world);
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    jest.useRealTimers();
    logSpy.mockRestore();
  });

  it('a willMove motion command flips motion-pending BEFORE the spring, and the settle fact restores + completes the token', async () => {
    const world = harness.world;
    await sendMotionCommand('expanded', 11);
    // PENDING flipped at the command (the D2-closing call site).
    expect(world.surface.motionPendingMarks).toEqual(['rt1']);
    expect(world.surface.readyMarks).toEqual([]);
    // The command reached the native spring.
    const snaps = nativeCallsNamed(world, 'snapTo');
    expect(snaps.length).toBeGreaterThan(0);
    expect(snaps[0].args[1]).toBe(EXPANDED_TAU);
    // The settle fact (two stable frames on the expanded detent).
    await settleAt(EXPANDED_TAU);
    expect(world.surface.readyMarks).toContain('rt1');
    expect(world.settleCompletions).toEqual([11]);
  });

  it('a zero-move command never flips pending and completes its settle token synchronously', async () => {
    const world = harness.world;
    // τ is at 0 (collapsed) — commanding collapsed moves nothing.
    await sendMotionCommand('collapsed', 12);
    expect(world.surface.motionPendingMarks).toEqual([]);
    expect(world.settleCompletions).toEqual([12]);
  });

  it('a native drag begin flips motion-pending (the onDragBegin prop wiring)', async () => {
    const world = harness.world;
    await beginDrag();
    expect(world.surface.motionPendingMarks).toEqual(['rt1']);
    await endDrag();
  });

  it('offerSheetReadyIfAtRest consults sheetLegIsAtRest: a runtime publish mid-flight must NOT self-offer ready', async () => {
    const world = harness.world;
    // At rest: a publish self-offers ready.
    await act(async () => {
      world.surface.publish();
    });
    expect(world.surface.readyMarks).toContain('rt1');
    clearRecords(world);
    // Mid-flight (uncompleted settle token + in-flight target): publish must not.
    await sendMotionCommand('expanded', 13);
    world.surface.readyMarks.length = 0;
    await act(async () => {
      world.surface.publish();
    });
    expect(world.surface.readyMarks).toEqual([]);
  });

  it('the 700ms deadline is the never-strand restore: completes the token and re-offers ready', async () => {
    const world = harness.world;
    await sendMotionCommand('expanded', 14);
    world.surface.readyMarks.length = 0;
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(world.settleCompletions).toEqual([14]);
    expect(world.surface.readyMarks).toContain('rt1');
    await flushAsync();
  });

  it('a drag that ends on a detent restores the fence through the settle observer and writes gesture posture memory', async () => {
    const world = harness.world;
    await beginDrag();
    expect(world.surface.motionPendingMarks).toEqual(['rt1']);
    await scrollTo(300);
    await endDrag(300);
    await settleAt(300); // middle detent
    expect(world.surface.readyMarks).toContain('rt1');
    // Gesture-born rest → posture memory write (writer: 'gesture').
    expect(world.gestureSettles).toEqual([
      expect.objectContaining({ sceneKey: 'home', snap: 'middle', writer: 'gesture' }),
    ]);
  });
});
