// ─── F3 falsifiers: THE ENTRY SWITCH + RESTORE + HIDDEN family, real wiring ──
//
// Pins: the presentedEntryKey layout effect running planEntrySwitch /
// executeEntrySwitch against the REAL refs (save outgoing → chrome re-assert →
// arm → apply), the attach-gated one-shot replay (offset-0 honored, exactly
// once, superseded by a later switch), the hidden-domain armed-not-refused
// switch (the F1 fix at host level), the deferred swap at the screen edge
// (native trackHiddenEdgeCleared → 'boundary' offer → repaint), and the ack
// bridge's freeze routing.

import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

import {
  beginDrag,
  clearRecords,
  emitNative,
  endDrag,
  flushFrame,
  sendMotionCommand,
  harness,
  nativeCallsNamed,
  renderHost,
  resetHarness,
  setFrame,
  scrollTo,
} from './render-utils';

describe('the entry switch + restore + hidden family — host wiring', () => {
  let renderer: ReactTestRenderer;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    resetHarness();
    renderer = await renderHost();
    clearRecords(harness.world);
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    jest.useRealTimers();
    logSpy.mockRestore();
  });

  it('a presented-entry change runs the plan/execute pair: chrome re-assert BEFORE the scroll restore, and the outgoing scroll round-trips', async () => {
    const world = harness.world;
    // Scroll home into the list region: τ=720 → outgoing scroll term 120.
    await scrollTo(720);
    clearRecords(world);
    await setFrame({ presentedSceneKey: 'profile', activeSceneKey: 'profile' });
    // ORDER LAW (A4): bindShell (chrome/config re-assert) lands before refuse.
    const orderedNames = world.nativeCalls
      .map((call) => call.name)
      .filter((name) => name === 'bindShell' || name === 'refuse');
    expect(orderedNames[0]).toBe('bindShell');
    expect(orderedNames).toContain('refuse');
    // Cold profile restores 0.
    expect(nativeCallsNamed(world, 'refuse').map((call) => call.args[1])).toEqual([0]);
    // Switch back: home's remembered 120 comes back through refuse.
    clearRecords(world);
    await setFrame({ presentedSceneKey: 'home', activeSceneKey: 'home' });
    expect(nativeCallsNamed(world, 'refuse').map((call) => call.args[1])).toEqual([120]);
  });

  it('the attach replay consumes the coordinator exactly once, and a remembered offset of exactly 0 still applies', async () => {
    const world = harness.world;
    // Visit profile, come back to home at τ=600 → home saved offset 0.
    await scrollTo(600);
    await setFrame({ presentedSceneKey: 'profile', activeSceneKey: 'profile' });
    await setFrame({ presentedSceneKey: 'home', activeSceneKey: 'home' });
    clearRecords(world);
    // An attach (drag's belt-and-braces re-attach) replays the armed restore:
    // remembered 0 APPLIES (consumeOnAttach returns 0, never null-for-0).
    await beginDrag();
    await endDrag();
    expect(nativeCallsNamed(world, 'refuse').map((call) => call.args[1])).toEqual([0]);
    // Exactly once: a second attach replays nothing.
    clearRecords(world);
    await beginDrag();
    await endDrag();
    expect(nativeCallsNamed(world, 'refuse')).toEqual([]);
  });

  it('a superseding switch drops the stale pending restore — the replay applies the LATEST entry offset only', async () => {
    const world = harness.world;
    await scrollTo(720); // home list scroll 120
    await setFrame({ presentedSceneKey: 'profile', activeSceneKey: 'profile' });
    await setFrame({ presentedSceneKey: 'home', activeSceneKey: 'home' });
    clearRecords(world);
    await beginDrag();
    await endDrag();
    // Only home's 120 replays; profile's stale arm was superseded.
    expect(nativeCallsNamed(world, 'refuse').map((call) => call.args[1])).toEqual([120]);
  });

  it('a switch committing in the HIDDEN domain (τ<0) arms but does NOT immediately refuse (F1 at host level)', async () => {
    const world = harness.world;
    await scrollTo(-144); // the hidden excursion's domain
    clearRecords(world);
    await setFrame({ presentedSceneKey: 'profile', activeSceneKey: 'profile' });
    // No immediate refuse: that would teleport τ from −depth to ≥0 (OA5 RED).
    expect(nativeCallsNamed(world, 'refuse')).toEqual([]);
    // The restore stays ARMED: the next attach applies it.
    await beginDrag();
    await endDrag();
    expect(nativeCallsNamed(world, 'refuse').map((call) => call.args[1])).toEqual([0]);
  });

  it('the deferred swap holds the outgoing entry until trackHiddenEdgeCleared, then offers the boundary and repaints', async () => {
    const world = harness.world;
    world.routeState.overlayRouteStack = [{ entryId: 'u1' }];
    await setFrame({ presentedSceneKey: 'userProfile', presentedEntryId: 'u1' });
    // THE PRESS-UP HANDOFF: a first-ever paint lands its real body in the NEXT
    // commit (track-entry-handoff.ts) — this spec is about the hidden family,
    // so it steps past the handoff frame to reach the painted body.
    await flushFrame();
    expect(
      renderer.root.findAll(
        (node) => node.type === 'mounted-body' && node.props.scene === 'userProfile'
      )
    ).toHaveLength(1);
    // The hide arms: a 'hidden' motion command glides below collapsed and the
    // native snapTo outcome stamps the armed excursion generation.
    await sendMotionCommand('hidden', 21);
    const armedGeneration = world.lastHiddenGeneration;
    expect(armedGeneration).toBeGreaterThan(0);
    // A freeze-dismiss txn goes live and the frame flips home — the painted
    // entry must RIDE the slide (no mid-flight content flip).
    world.txn.live = {
      phase: 'staged',
      plan: { content: { kind: 'freezeUntilSnap' } },
      mutation: { targetSceneKey: 'home' },
    };
    clearRecords(world);
    await setFrame({ presentedSceneKey: 'home', presentedEntryId: null });
    expect(
      renderer.root.findAll(
        (node) => node.type === 'mounted-body' && node.props.scene === 'userProfile'
      )
    ).toHaveLength(1);
    expect(world.txn.offers).not.toContain('boundary');
    // A STALE edge (wrong/absent generation) must not be consumed.
    await emitNative('trackHiddenEdgeCleared', { generation: armedGeneration + 99 });
    expect(world.txn.offers).not.toContain('boundary');
    expect(
      renderer.root.findAll(
        (node) => node.type === 'mounted-body' && node.props.scene === 'userProfile'
      )
    ).toHaveLength(1);
    // OUR excursion's edge lands → boundary offered, swap commits next paint,
    // and the hide's settleToken completes at the edge (its rest is no detent).
    await emitNative('trackHiddenEdgeCleared', { generation: armedGeneration });
    expect(world.txn.offers).toContain('boundary');
    expect(world.settleCompletions).toContain(21);
    expect(
      renderer.root.findAll(
        (node) => node.type === 'mounted-body' && node.props.scene === 'userProfile'
      )
    ).toHaveLength(0);
  });

  it('the ack bridge arms+seals {paint, chrome} for a normal txn but must NOT amend a freeze txn (the hidden family routing)', async () => {
    const world = harness.world;
    world.txn.live = {
      phase: 'staged',
      plan: { content: { kind: 'swapEntries' } },
      mutation: { targetSceneKey: 'profile' },
    };
    clearRecords(world);
    await setFrame({ presentedSceneKey: 'profile', activeSceneKey: 'profile' });
    expect(world.txn.amends).toEqual([['paint', 'chrome']]);
    expect(world.txn.seals).toBe(1);
    expect(world.txn.offers).toEqual(expect.arrayContaining(['chrome', 'paint']));
    // Freeze txn: paint only — amending would clobber the boundary join.
    world.txn.live = {
      phase: 'staged',
      plan: { content: { kind: 'freezeUntilSnap' } },
      mutation: { targetSceneKey: 'home' },
    };
    clearRecords(world);
    await setFrame({ presentedSceneKey: 'home', activeSceneKey: 'home' });
    expect(world.txn.amends).toEqual([]);
    expect(world.txn.seals).toBe(0);
    expect(world.txn.offers).toContain('paint');
    expect(world.txn.offers).not.toContain('chrome');
  });
});
