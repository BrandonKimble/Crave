// ─── FALSIFIERS: EVERY CONSUMER READS THE MOTION AUTHORITY (host wiring) ──────
//
// The pure lane proves the authority's law; this lane proves the REAL host
// consults it. Each test names the consumer whose read, if deleted, turns it
// RED — the point of the exercise is that a consumer can no longer re-grow a
// private ledger without a falsifier screaming.

import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import { getTrackMotionAuthority } from '../track-motion-authority';
import {
  beginDrag,
  clearRecords,
  endDrag,
  emitNative,
  flushAsync,
  harness,
  renderHost,
  resetHarness,
  sendMotionCommand,
  settleAt,
} from './render-utils';

// Geometry from the harness sharedSheetOwner: expanded 100 / middle 400 /
// collapsed 700 → trackH 600, middleTau 300.
const EXPANDED_TAU = 600;

describe('the motion authority — host wiring (deep red team item 1)', () => {
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

  // CONSUMER 1 — executeMotionCommand: the command fact opens an EPISODE.
  it('a will-move command opens an episode any consumer can query; a zero-move command opens none', async () => {
    const authority = getTrackMotionAuthority();
    expect(authority.isAtRest()).toBe(true);
    await sendMotionCommand('expanded', 11);
    expect(authority.isAtRest()).toBe(false);
    expect(authority.currentEpisode()).toMatchObject({ kind: 'flight', settleToken: 11 });
    await settleAt(EXPANDED_TAU);
    expect(authority.isAtRest()).toBe(true);
    // Zero-move (τ is already at the expanded detent): no episode, no motion.
    await sendMotionCommand('expanded', 12);
    expect(authority.isAtRest()).toBe(true);
    expect(harness.world.settleCompletions).toContain(12);
  });

  // CONSUMER 2 — the drag fact (onDragBegin): this is F2's window. A consumer
  // born mid-drag must be able to SEE the motion.
  it('a native drag begin opens a drag episode (F2: the reveal seed can ask)', async () => {
    const authority = getTrackMotionAuthority();
    // The page's drag-begin observer (physics.dragging false→true) fires the
    // host's reportDragBeginFact, which dispatches the fact.
    await beginDrag();
    expect(authority.isAtRest()).toBe(false);
    expect(authority.currentEpisode()?.kind).toBe('drag');
    expect(harness.world.surface.motionPendingMarks).toEqual(['rt1']);
    await endDrag(300);
    await settleAt(300);
    expect(authority.isAtRest()).toBe(true);
  });

  // CONSUMER 3 — the interrupt read (resolveCurrentSnapTarget / G-INTERRUPT A5).
  // RED when the read goes back to a private inFlightSnapTargetRef or to the
  // instantaneous posture.
  it('the registered motion target resolves mid-flight from the AUTHORITY’s episode target, not τ', async () => {
    const world = harness.world;
    // τ is at 0 (collapsed) throughout — a posture read would say 'collapsed'.
    await sendMotionCommand('expanded', 13);
    expect(world.motionTarget?.resolveCurrentSnapTarget()).toBe('expanded');
    await settleAt(EXPANDED_TAU);
    // At rest the read falls back to the posture classification.
    expect(world.motionTarget?.resolveCurrentSnapTarget()).toBe('expanded');
  });

  // CONSUMER 4 — the fence self-offer (offerSheetReadyIfAtRest).
  it('a runtime publish during a HIDDEN excursion must not self-offer ready (no detent target exists)', async () => {
    const world = harness.world;
    await sendMotionCommand('hidden', 21);
    expect(getTrackMotionAuthority().currentEpisode()?.kind).toBe('excursion');
    world.surface.readyMarks.length = 0;
    await act(async () => {
      world.surface.publish();
    });
    expect(world.surface.readyMarks).toEqual([]);
    // The screen-edge fact is the hide's rest: it restores the fence.
    await emitNative('trackHiddenEdgeCleared', { generation: world.lastHiddenGeneration });
    expect(world.surface.readyMarks).toContain('rt1');
    expect(world.settleCompletions).toContain(21);
  });

  // CONSUMER 5 — the ONE native edge subscription, fanned out by the authority.
  it('one emission serves BOTH consumers exactly once (two hand-rolled subscriptions collapsed)', async () => {
    const world = harness.world;
    await sendMotionCommand('hidden', 22);
    clearRecords(world);
    await emitNative('trackHiddenEdgeCleared', { generation: world.lastHiddenGeneration });
    expect(world.txn.offers.filter((offer) => offer === 'boundary')).toHaveLength(1);
    expect(world.settleCompletions).toEqual([22]);
    // The edge is a ONE-SHOT: the armed excursion is consumed with it.
    clearRecords(world);
    await emitNative('trackHiddenEdgeCleared', { generation: world.lastHiddenGeneration });
    expect(world.txn.offers).not.toContain('boundary');
    expect(world.settleCompletions).toEqual([]);
  });

  // EPISODE IDENTITY through the host: a superseded command's deadline must not
  // complete the LIVE episode's token or open the fence under it.
  it('a superseded command’s 700ms deadline is episode-matched — it cannot end the live episode', async () => {
    const world = harness.world;
    await sendMotionCommand('middle', 31);
    // Supersede before the first deadline fires.
    await sendMotionCommand('expanded', 32);
    world.surface.readyMarks.length = 0;
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    // The FIRST deadline landed on a dead episode: token 31 is abandoned (its
    // command was superseded), and only the live episode's deadline restores.
    expect(world.settleCompletions).not.toContain(31);
    expect(world.settleCompletions).toContain(32);
    await flushAsync();
  });
});
