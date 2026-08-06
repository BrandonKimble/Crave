// ─── FALSIFIERS: THE PRESS-UP HANDOFF, against the real host chain ───────────
//
// THE LAW: press-up commits the switch. The presented flip — presented entry,
// its chrome layer, the a11y navigation event, the txn's paint ack — lands in
// the FIRST frame after the press no matter what the destination's body costs
// to render; the real body is a later commit.
//
// These run the REAL TrackSheetRouteHost → useTrackLegResolver → TrackSheetPage
// chain (only the native/panel seams are stubbed), so a deletion of the wiring
// shows RED here even though the pure decision still passes its own spec.
//
// RED-PROVEN by mutation (executed 2026-08-05 after the audit corrections;
// counts are what the runs printed, not what they ought to have been):
//   M1 resolveLegList's handoff branch removed (real body in the flip commit)
//        -> 1 RED (the expensive body renders in the finger's frame)
//   M2 planTrackEntryHandoff's residency clause forced true (i.e. the deleted
//      has-ever-painted exemption, restored)
//        -> 4 RED here + 2 in the pure spec (the revisit blocks the finger
//           again \u2014 the measured 280ms defect, unfixed)
//   M3 planTrackEntryHandoff's participatesInWorldJoin clause removed
//        -> 1 RED here + 1 pure (listDetail deferred out of its join \u2014 OA1)
//   M4 the rAF release removed (deferredEntryRef never cleared)
//        -> 8 RED across three suites (rows never arrive anywhere)
//   M5 the FROZEN lookup dropped from the handoff frame (skeleton always)
//        -> 1 RED (a revisit flashes \u2014 OA6.1)
//   M6 the [PERF] probe reads the RESOLUTION again instead of what was painted
//        -> 1 RED (it reports real rows for the frame that deliberately has none)
//   M7 noteTrackPressFirstPaint made consuming again (the span closes on the
//      deferred frame)
//        -> 1 RED here + 4 pure (press->real-rows disappears; the rung's own
//           number would have gone green by definition)
//   M8 the press-span TTL deleted
//        -> 1 RED here + 1 pure (an unlanded press fabricates a latency)
// NOT CLAIMED: removing the hasOutgoingPaint clause is RED in the pure spec but
// only intermittently here (it perturbs the boot pass, whose ordering this lane
// does not pin) \u2014 an unreliable RED is not a falsifier, so it is stated as one
// pure check and nothing more.
//
// THE INSTRUMENT, and why it changed (audit): the revisit case used to assert
// row PRESENCE ("no skeleton, ever"). Presence is green whether or not the
// finger paid for the render, so it could not see the defect the rung exists to
// fix. It now asserts on cost.renders \u2014 the destination's CURRENT resolution
// is not rendered in the flip frame \u2014 and OA6.1 keeps its own separate check.

import type { ReactTestRenderer } from 'react-test-renderer';
import React from 'react';
import { act } from 'react-test-renderer';

import {
  clearRecords,
  findAllByType,
  flushFrame,
  focusedNodeTestId,
  harness,
  listPublication,
  renderHost,
  resetHarness,
  setFrame,
} from './render-utils';
import {
  markTrackNavPress,
  peekTrackPressSpan,
  resetTrackPressSpan,
  TRACK_PRESS_SPAN_TTL_MS,
} from '../track-entry-prewarm';

/** A publication whose rows are EXPENSIVE to render — the simulation of a real
 *  destination body. The counter is the instrument: it can only go up when the
 *  finger's frame actually paid for the render, so "the flip did not wait on
 *  the body" is a measured fact here, not an inference from what is on screen. */
const expensivePublication = (rows: string[], forEntryId?: string | null) => {
  const cost = { renders: 0 };
  return {
    cost,
    publication: {
      sceneBodyContent: {
        surfaceKind: 'list',
        data: rows,
        renderItem: (info: { item: string }) => {
          cost.renders += 1;
          return React.createElement('published-row', { id: info.item });
        },
        keyExtractor: (item: string) => item,
      },
      sceneBodyForEntryId: forEntryId,
    },
  };
};

const publish = async (scene: string, snapshot: unknown): Promise<void> => {
  await act(async () => {
    harness.world.publishSceneInput(
      scene,
      snapshot as Parameters<typeof harness.world.publishSceneInput>[1]
    );
  });
};

describe('the press-up handoff — the flip never waits on the destination body', () => {
  let renderer: ReactTestRenderer;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    resetHarness();
    renderer = await renderHost();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    logSpy.mockRestore();
  });

  const perfLines = () =>
    logSpy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('[PERF]'));
  const pressLines = () => perfLines().filter((line) => line.startsWith('[PERF] press '));

  it('THE FLIP COMMITS IN THE FIRST FRAME regardless of destination render cost: an expensive body is not rendered at all in the switch commit', async () => {
    const world = harness.world;
    // The destination's data is ALREADY WARM before the press — the measured
    // defect's exact shape (the probe said "presented real rows in the switch
    // commit" and the finger paid 280ms).
    const { cost, publication } = expensivePublication(['d1', 'd2', 'd3'], 'r1');
    world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    await publish('restaurant', publication);
    expect(cost.renders).toBe(0);

    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });

    // THE FINGER'S FRAME. The flip is complete…
    expect(world.a11y.announcements).toContain('Restaurant');
    // …the destination's chrome layer is the presented one (the page flipped
    // its opacity stack in this same commit, and the a11y cursor moved there)…
    expect(focusedNodeTestId(world)).toBe('track-chrome-layer:restaurant#r1');
    // …and the presentation paint ack was committed FROM THIS COMMIT (the ack
    // bridge's layout effect ran on the flip frame, not behind the body)…
    expect(world.paintAcks.length).toBeGreaterThan(0);
    // …and the destination's body cost NOTHING: zero expensive rows rendered.
    expect(cost.renders).toBe(0);
    // What it painted instead is THE SKELETON (the owner's stated fallback),
    // with the scene's own variant from the foundation-spec resolver.
    const skeletons = findAllByType(renderer, 'scene-loading-surface');
    expect(skeletons).toHaveLength(1);
    expect(skeletons[0].props.rowType).toBe('restaurant');

    // THE SECOND PHASE: the real rows land in a LATER commit.
    await flushFrame();
    expect(findAllByType(renderer, 'published-row')).toHaveLength(3);
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(0);
    expect(cost.renders).toBeGreaterThan(0);
  });

  it('REAL ROWS ARRIVE WITHOUT A SECOND ANNOUNCEMENT: the two-phase flip is ONE navigation (G-A11Y)', async () => {
    const world = harness.world;
    world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    await publish('restaurant', listPublication(['d1'], 'r1'));
    clearRecords(world);
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    expect(world.a11y.announcements).toEqual(['Restaurant']);
    await flushFrame();
    expect(findAllByType(renderer, 'published-row')).toHaveLength(1);
    // The release commit is a phase, not a navigation.
    expect(world.a11y.announcements).toEqual(['Restaurant']);
  });

  it("THE REVISIT DEFERS TOO, and the flip frame does NOT pay the destination's CURRENT render cost \u2014 the measured 280ms case", async () => {
    const world = harness.world;
    world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    // First visit, cheap rows.
    await publish('restaurant', listPublication(['d1', 'd2'], 'r1'));
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    await flushFrame();
    expect(findAllByType(renderer, 'published-row')).toHaveLength(2);
    // Leave\u2026
    await setFrame({ presentedSceneKey: 'home', activeSceneKey: 'home', presentedEntryId: null });
    await flushFrame();
    // \u2026while away, the destination's lane resolves a NEW, EXPENSIVE body.
    // This is the instrument: `cost` counts renders of THE CURRENT RESOLUTION
    // only, so it can only go up when the finger's frame actually paid for the
    // destination's live first screenful. Asserting row PRESENCE (what this
    // spec used to do) cannot show that \u2014 rows are present either way.
    const { cost, publication } = expensivePublication(['n1', 'n2', 'n3'], 'r1');
    await publish('restaurant', publication);
    expect(cost.renders).toBe(0);

    // \u2026and come back. THE FINGER'S FRAME.
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    // THE WHOLE POINT OF THE RUNG: the flip frame paid NONE of it.
    expect(cost.renders).toBe(0);
    // The release commit is where it lands.
    await flushFrame();
    expect(cost.renders).toBeGreaterThan(0);
    expect(findAllByType(renderer, 'published-row')).toHaveLength(3);
  });

  it("OA6.1 SURVIVES THE DEFERRAL: the revisit's flip frame paints the FROZEN last-good body, never a skeleton", async () => {
    const world = harness.world;
    world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    await publish('restaurant', listPublication(['d1', 'd2'], 'r1'));
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    await flushFrame();
    expect(findAllByType(renderer, 'published-row')).toHaveLength(2);
    await setFrame({ presentedSceneKey: 'home', activeSceneKey: 'home', presentedEntryId: null });
    await flushFrame();
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    // No skeleton on an entry that has shown content \u2014 the deferred frame
    // reaches for lastGoodListRef, which is why the exemption could be deleted.
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(0);
    expect(findAllByType(renderer, 'published-row')).toHaveLength(2);
  });

  it('OA1: a WORLD-JOIN scene is never handed off — listDetail reveals with its world, not one frame behind it', async () => {
    const world = harness.world;
    world.routeState.overlayRouteStack = [{ entryId: 'l1' }];
    await setFrame({ presentedSceneKey: 'listDetail', presentedEntryId: 'l1' });
    // Its mounted body is in the flip commit: the join's cards leg is present
    // at the moment the join is offered, so the reveal can be simultaneous.
    expect(
      renderer.root.findAll(
        (node) => node.type === 'mounted-body' && node.props.scene === 'listDetail'
      )
    ).toHaveLength(1);
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(0);
  });

  it('a destination with NO body is untouched: readiness still owns the cold skeleton, and the handoff adds no second mechanism', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'r9' }];
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r9' });
    expect(findAllByType(renderer, 'scene-loading-surface')).toHaveLength(1);
    // Rows arriving later flow straight through — no frame is withheld.
    await publish('restaurant', listPublication(['late'], 'r9'));
    expect(findAllByType(renderer, 'published-row')).toHaveLength(1);
  });

  it('THE PROBE TELLS THE TRUTH: a handed-off switch reports the DEFERRED commit and closes it ONCE — never "presented real rows in the switch commit"', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    await publish('restaurant', listPublication(['d1'], 'r1'));
    logSpy.mockClear();
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    const flipLines = perfLines();
    expect(flipLines.some((line) => line.includes('presented deferred (handoff frame)'))).toBe(
      true
    );
    expect(
      flipLines.some((line) => line.includes('presented real rows in the switch commit'))
    ).toBe(false);
    await flushFrame();
    const closing = perfLines().filter((line) => line.includes('switch-commit->real-rows'));
    expect(closing).toHaveLength(1);
  });

  it('THE PRESS SPAN IS ONE LINE OFF ONE ANCHOR: press->first-paint AND press->real-rows, and the deferred frame does not close it', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    await publish('restaurant', listPublication(['d1'], 'r1'));
    resetTrackPressSpan();
    // The finger. (A child reveal stamps this at revealRoute; a tab at onPress.)
    markTrackNavPress('restaurant', Date.now());
    logSpy.mockClear();

    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    await flushFrame();
    // The deferred frame marked first-paint but did NOT report: a skeleton is a
    // phase of the span, not its result.
    expect(pressLines()).toHaveLength(0);
    expect(peekTrackPressSpan()).not.toBeNull();

    await flushFrame();
    const reported = pressLines();
    expect(reported).toHaveLength(1);
    // BOTH numbers, one line, one anchor — and it is honest about the phase.
    expect(reported[0]).toContain('[PERF] press restaurant#r1');
    expect(reported[0]).toMatch(/press->first-paint=\d+ms/);
    expect(reported[0]).toMatch(/press->real-rows=\d+ms/);
    expect(reported[0]).toContain('deferred=true');
    // The span is closed exactly once: a later paint reports nothing.
    expect(peekTrackPressSpan()).toBeNull();
  });

  it('AN UNCONSUMED STAMP REPORTS NOTHING: a press that landed nowhere cannot fabricate a latency for a later, unrelated paint', async () => {
    harness.world.routeState.overlayRouteStack = [{ entryId: 'r1' }];
    resetTrackPressSpan();
    // A press for a scene that never presents, long ago.
    markTrackNavPress('restaurant', Date.now() - (TRACK_PRESS_SPAN_TTL_MS + 1000));
    logSpy.mockClear();
    await publish('restaurant', listPublication(['d1'], 'r1'));
    await setFrame({ presentedSceneKey: 'restaurant', presentedEntryId: 'r1' });
    await flushFrame();
    await flushFrame();
    expect(pressLines()).toHaveLength(0);
  });
});
