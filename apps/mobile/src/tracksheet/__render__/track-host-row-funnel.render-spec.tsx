// ─── THE FUNNEL FALSIFIER (touch-latency attribution) ────────────────────────
//
// rowInvokes became the load-bearing instrument the moment it contradicted the
// row Profiler: the funnel counted 23 cell renders on a polls switch while the
// Profiler counted 0, because the Profiler sat in the PARTS lane's row wrapper
// and polls resolves through the PUBLISHED lane (track-leg-plan.ts:45 prefers
// it). An instrument that load-bearing needs a guard of its own, and the guard
// has to fail for the reason the original probe failed: cells rendering
// somewhere the counter does not sit.
//
// So this spec asserts the counter against the LIST's actual cell renders,
// through the published lane — the exact lane whose cells the first probe
// missed. Bypass the funnel (or move the count back into one lane's wrapper)
// and the counts diverge and this goes RED.

import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import { markTrackNavPress, resetTrackPressSpan } from '../track-entry-prewarm';
import { resetTrackPressPhaseSpan } from '../track-press-phase-probe';
import {
  findAllByType,
  flushFrame,
  harness,
  listPublication,
  renderHost,
  resetHarness,
  setFrame,
} from './render-utils';

describe('the renderItem funnel — rowInvokes counts every lane’s cells', () => {
  let renderer: ReactTestRenderer;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    resetHarness();
    resetTrackPressPhaseSpan();
    resetTrackPressSpan();
    renderer = await renderHost();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    logSpy.mockRestore();
  });

  it('counts PUBLISHED-lane cells — the lane whose rows the parts-lane probe could not see', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    await act(async () => {
      harness.world.publishSceneInput(
        'restaurant',
        listPublication(['a', 'b', 'c'], 'r1') as Parameters<
          typeof harness.world.publishSceneInput
        >[1]
      );
    });

    // Drive the REAL wiring: the press stamp opens the span and the row window
    // (TrackSheetRouteHost), and the production path closes and logs the window
    // at press->real-rows. Asserting on the LOGGED line rather than on the
    // module keeps the test honest about the whole chain, not just the tally.
    markTrackNavPress('restaurant', Date.now());
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    // The handoff defers the real body; the rows land in the release commit.
    await flushFrame();
    await flushFrame();

    const renderedCells = findAllByType(renderer, 'published-row').length;
    const line = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((entry) => entry.startsWith('[PERF] rowwindow'));

    // Zero on either side would make the comparison vacuous.
    expect(renderedCells).toBeGreaterThan(0);
    expect(line).toBeDefined();
    const distinct = Number(/distinct=(\d+)/.exec(line ?? '')?.[1] ?? -1);
    const invokes = Number(/invokes=(\d+)/.exec(line ?? '')?.[1] ?? -1);
    expect(invokes).toBeGreaterThanOrEqual(renderedCells);
    expect(distinct).toBe(renderedCells);
  });
});
