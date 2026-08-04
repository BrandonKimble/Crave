// G-ENTRY + G-RESTORE falsifiers — against the EXACT switch code the page
// executes (planEntrySwitch / executeEntrySwitch / TrackRestoreCoordinator are
// what TrackSheetPage calls; this is not a mirror).
//
// RED conditions:
//   (a) keying scroll memory by scene instead of entry → the push-A/push-B/pop
//       test restores B's offset for A and fails.
//   (b) treating remembered-0 as no-memory → hadMemory flips false and fails.
//   (c) the coordinator re-applying a consumed restore, or applying another
//       entry's restore → the one-shot / identity tests fail.
//   (d) reordering the switch effects (scroll before chrome/segment) → the
//       order test fails.

import { makeTrackEntryKey } from './track-entry-identity';
import { TrackEntryScrollMemory } from './track-entry-scroll-memory';
import { executeEntrySwitch, planEntrySwitch, TrackRestoreCoordinator } from './track-entry-switch';

const noopEffects = () => ({
  saveOutgoing: jest.fn(),
  applyChromeSelection: jest.fn(),
  armRestore: jest.fn(),
  applyRestore: jest.fn(),
});

describe('entry switch (G-ENTRY)', () => {
  it('push A, push B (same scene), pop -> A restores ITS OWN offset', () => {
    const memory = new TrackEntryScrollMemory();
    const parent = makeTrackEntryKey('profile', null);
    const a = makeTrackEntryKey('userProfile', 'route-entry-1');
    const b = makeTrackEntryKey('userProfile', 'route-entry-2');
    const trackH = 400;

    // parent -> A (fresh)
    let plan = planEntrySwitch({
      outgoingEntryKey: parent,
      incomingEntryKey: a,
      tau: trackH,
      trackH,
      sigma: 0,
      memory,
    });
    executeEntrySwitch(plan, {
      ...noopEffects(),
      saveOutgoing: (k, o) => memory.save(k, o),
    });
    expect(plan.hadMemory).toBe(false);

    // A scrolled to 250 (tau = H + 250); push B over A
    plan = planEntrySwitch({
      outgoingEntryKey: a,
      incomingEntryKey: b,
      tau: trackH + 250,
      trackH,
      sigma: 0,
      memory,
    });
    executeEntrySwitch(plan, { ...noopEffects(), saveOutgoing: (k, o) => memory.save(k, o) });
    expect(memory.read(a)).toBe(250);

    // B scrolled to 90; pop back to A
    plan = planEntrySwitch({
      outgoingEntryKey: b,
      incomingEntryKey: a,
      tau: trackH + 90,
      trackH,
      sigma: 0,
      memory,
    });
    // A's offset survives B's session — the scene-keyed collision would have
    // overwritten it with 90.
    expect(plan.hadMemory).toBe(true);
    expect(plan.restoreOffset).toBe(250);
  });

  it('a remembered offset of exactly 0 restores as a memory (G-RESTORE b)', () => {
    const memory = new TrackEntryScrollMemory();
    const a = makeTrackEntryKey('dmSession', 'route-entry-5');
    memory.save(a, 0);
    const plan = planEntrySwitch({
      outgoingEntryKey: null,
      incomingEntryKey: a,
      tau: 0,
      trackH: 400,
      sigma: 0,
      memory,
    });
    expect(plan.hadMemory).toBe(true);
    expect(plan.restoreOffset).toBe(0);
  });

  it('effects run in the A4 order: save -> chrome/segment selection -> arm -> scroll restore', () => {
    const order: string[] = [];
    const memory = new TrackEntryScrollMemory();
    const plan = planEntrySwitch({
      outgoingEntryKey: makeTrackEntryKey('polls', null),
      incomingEntryKey: makeTrackEntryKey('profile', null),
      tau: 500,
      trackH: 400,
      sigma: 0,
      memory,
    });
    executeEntrySwitch(plan, {
      saveOutgoing: () => order.push('save'),
      applyChromeSelection: () => order.push('chrome'),
      armRestore: () => order.push('arm'),
      applyRestore: () => order.push('restore'),
    });
    expect(order).toEqual(['save', 'chrome', 'arm', 'restore']);
    // Segment/strip selection restores BEFORE the scroll lands.
    expect(order.indexOf('chrome')).toBeLessThan(order.indexOf('restore'));
  });
});

describe('TrackRestoreCoordinator (G-RESTORE c)', () => {
  it('applies only after attach, only for the entry that scheduled it', () => {
    const coordinator = new TrackRestoreCoordinator();
    const a = makeTrackEntryKey('userProfile', 'route-entry-1');
    const b = makeTrackEntryKey('userProfile', 'route-entry-2');
    coordinator.schedule(a, 250);
    // An attach while a DIFFERENT entry is presented must not consume it.
    expect(coordinator.consumeOnAttach(b)).toBeNull();
    // The matching attach applies it...
    expect(coordinator.consumeOnAttach(a)).toBe(250);
    // ...exactly once (the recycler re-attaches constantly).
    expect(coordinator.consumeOnAttach(a)).toBeNull();
  });

  it('a pending restore of 0 still applies (0 is not "nothing pending")', () => {
    const coordinator = new TrackRestoreCoordinator();
    const a = makeTrackEntryKey('dmSession', 'route-entry-3');
    coordinator.schedule(a, 0);
    expect(coordinator.consumeOnAttach(a)).toBe(0);
  });

  it('a later switch supersedes an earlier pending restore', () => {
    const coordinator = new TrackRestoreCoordinator();
    const a = makeTrackEntryKey('listDetail', 'route-entry-1');
    const b = makeTrackEntryKey('listDetail', 'route-entry-2');
    coordinator.schedule(a, 100);
    coordinator.schedule(b, 40);
    expect(coordinator.consumeOnAttach(a)).toBeNull();
    expect(coordinator.consumeOnAttach(b)).toBe(40);
  });
});

// ─── F1 (red-team): the hidden-domain switch must NOT immediately re-fuse ────
// At swap time tau = -depth; an immediate applyRestore would clamp through the
// posture register to >= 0 and teleport the sheet back on-screen in one frame
// (OA5 RED). The restore stays armed; only the resurrect glide moves the sheet.
describe('hidden-domain switch (F1)', () => {
  const memoryWith = (value: number | null) => ({ read: () => value });

  const runPlan = (tau: number) => {
    const calls: string[] = [];
    const plan = planEntrySwitch({
      outgoingEntryKey: 'search#root',
      incomingEntryKey: 'home#root',
      tau,
      trackH: 600,
      sigma: 0,
      memory: memoryWith(120),
    });
    executeEntrySwitch(plan, {
      saveOutgoing: () => calls.push('save'),
      applyChromeSelection: () => calls.push('chrome'),
      armRestore: () => calls.push('arm'),
      applyRestore: () => calls.push('apply'),
    });
    return { plan, calls };
  };

  it('a switch committing at tau < 0 arms but never immediately applies', () => {
    const { plan, calls } = runPlan(-320);
    expect(plan.immediateRestore).toBe(false);
    expect(calls).toContain('arm');
    expect(calls).not.toContain('apply');
    // and the hidden domain still never writes memory
    expect(calls).not.toContain('save');
  });

  it('an on-screen switch still applies immediately (guard is not over-broad)', () => {
    const { plan, calls } = runPlan(240);
    expect(plan.immediateRestore).toBe(true);
    expect(calls).toEqual(['save', 'chrome', 'arm', 'apply']);
  });
});
