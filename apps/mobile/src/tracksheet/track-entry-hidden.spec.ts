// G-HIDDEN falsifiers (R4) — against the EXACT modules the host executes.
//
// RED conditions (each proven by mutation before landing):
//   (a) any hide path producing a non-glide placement → the plan type has no
//       teleport variant AND the glide test pins targetPostureTau < 0; a
//       0/positive target (an "instant place at collapsed" regression) fails.
//   (b) swap-at-edge ordering: resolveHiddenPresentation swapping BEFORE
//       edgeCleared (a mid-flight content flip) fails the hold test.
//   (c) a hide disturbing the outgoing entry's scroll memory: planEntrySwitch
//       in the hidden domain (τ<0) writing a save fails the preservation test.
//   (d) re-present after hide not restoring: the remembered offset (including
//       0) must come back with hadMemory=true.

import {
  hasClearedScreenEdge,
  planHiddenExcursion,
  resolveHiddenPresentation,
  computeHiddenDepth,
} from './track-entry-hidden';
import { makeTrackEntryKey } from './track-entry-identity';
import { TrackEntryScrollMemory } from './track-entry-scroll-memory';
import { TrackEntryReadinessLedger } from './track-entry-readiness';
import { planEntrySwitch } from './track-entry-switch';

describe('hidden excursion plan (OA5: every hide glides)', () => {
  it('plans a GLIDE with a negative tau target for every geometry', () => {
    for (const [collapsedTop, screenH] of [
      [700, 852],
      [640, 852],
      [500, 926],
    ] as const) {
      const plan = planHiddenExcursion({ collapsedTop, screenHeight: screenH });
      expect(plan.kind).toBe('glide');
      expect(plan.targetPostureTau).toBe(-(screenH - collapsedTop));
      expect(plan.targetPostureTau).toBeLessThan(0);
    }
  });

  it('depth is never negative (a collapsedTop already offscreen hides in place)', () => {
    expect(computeHiddenDepth(900, 852)).toBe(0);
  });

  it('the edge fact fires only AT/BEYOND the excursion target', () => {
    expect(hasClearedScreenEdge(-151.8, -152)).toBe(true);
    expect(hasClearedScreenEdge(-152, -152)).toBe(true);
    // Mid-flight (sheet band still visible) is NOT cleared.
    expect(hasClearedScreenEdge(-80, -152)).toBe(false);
    expect(hasClearedScreenEdge(0, -152)).toBe(false);
    // A non-hidden target never clears (guards a τ=0 misuse).
    expect(hasClearedScreenEdge(0, 0)).toBe(false);
  });
});

describe('deferred swap at the screen edge (A2)', () => {
  const frame = { frameScene: 'home', frameEntryId: null };
  const painted = { paintedScene: 'pollDetail', paintedEntryId: 'e-9' };

  it('HOLDS the outgoing entry while the hide is in flight and the edge is not cleared', () => {
    const decision = resolveHiddenPresentation({
      ...frame,
      ...painted,
      hideInFlight: true,
      edgeCleared: false,
    });
    expect(decision).toEqual({ scene: 'pollDetail', entryId: 'e-9', deferred: true });
  });

  it('swaps in the first resolve AFTER the edge fact lands', () => {
    const decision = resolveHiddenPresentation({
      ...frame,
      ...painted,
      hideInFlight: true,
      edgeCleared: true,
    });
    expect(decision).toEqual({ scene: 'home', entryId: null, deferred: false });
  });

  it('no hide in flight -> the frame is painted directly (no phantom hold)', () => {
    const decision = resolveHiddenPresentation({
      ...frame,
      ...painted,
      hideInFlight: false,
      edgeCleared: false,
    });
    expect(decision.deferred).toBe(false);
    expect(decision.scene).toBe('home');
  });

  it('a dismiss that does not change the painted entry never defers', () => {
    const decision = resolveHiddenPresentation({
      frameScene: 'search',
      frameEntryId: null,
      paintedScene: 'search',
      paintedEntryId: null,
      hideInFlight: true,
      edgeCleared: false,
    });
    expect(decision.deferred).toBe(false);
  });
});

describe('hide preserves the entry (R2 composition)', () => {
  it('a switch committing in the hidden domain (tau<0) writes NO scroll memory', () => {
    const memory = new TrackEntryScrollMemory();
    const outgoing = makeTrackEntryKey('pollDetail', 'e-9');
    memory.save(outgoing, 240); // snapshotted at hide START
    const plan = planEntrySwitch({
      outgoingEntryKey: outgoing,
      incomingEntryKey: makeTrackEntryKey('home', null),
      tau: -152, // post-excursion: the sheet is off screen
      trackH: 400,
      sigma: 0,
      memory,
    });
    expect(plan.save).toBeNull();
    expect(memory.read(outgoing)).toBe(240);
  });

  it('re-presenting after hide restores the remembered offset (including 0)', () => {
    const memory = new TrackEntryScrollMemory();
    const hidden = makeTrackEntryKey('pollDetail', 'e-9');
    memory.save(hidden, 240);
    const back = planEntrySwitch({
      outgoingEntryKey: makeTrackEntryKey('home', null),
      incomingEntryKey: hidden,
      tau: 0,
      trackH: 400,
      sigma: 0,
      memory,
    });
    expect(back.restoreOffset).toBe(240);
    expect(back.hadMemory).toBe(true);

    memory.save(hidden, 0);
    const backAtTop = planEntrySwitch({
      outgoingEntryKey: makeTrackEntryKey('home', null),
      incomingEntryKey: hidden,
      tau: 0,
      trackH: 400,
      sigma: 0,
      memory,
    });
    expect(backAtTop.restoreOffset).toBe(0);
    expect(backAtTop.hadMemory).toBe(true);
  });

  it('hide never touches the readiness latch', () => {
    const ledger = new TrackEntryReadinessLedger();
    const entry = makeTrackEntryKey('pollDetail', 'e-9');
    ledger.present(entry, true); // latched: has shown content
    // The hide family (plan + presentation decision) has no ledger access at
    // all — the latch survives by construction; assert the fact it protects:
    resolveHiddenPresentation({
      frameScene: 'home',
      frameEntryId: null,
      paintedScene: 'pollDetail',
      paintedEntryId: 'e-9',
      hideInFlight: true,
      edgeCleared: false,
    });
    expect(ledger.hasShownContent(entry)).toBe(true);
  });
});
