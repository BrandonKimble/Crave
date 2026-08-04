// ─── THE ENTRY SWITCH (G-ENTRY + G-RESTORE falsifier home) ───────────────────
//
// The switch formula's decision layer, extracted PURE so the jest lane (pure-TS
// only, no .tsx) can falsify the G-RESTORE laws against the exact code the page
// executes — not a mirror:
//   • planEntrySwitch: what to save (outgoing entry's scroll) and what to
//     restore (incoming entry's remembered offset; 0 only when NO memory).
//   • executeEntrySwitch: the ORDER law (A4): save → chrome/segment selection
//     → arm restore → apply restore. Strip/segment state restores BEFORE the
//     scroll lands; reordering these is a RED jest failure.
//   • TrackRestoreCoordinator: the one-shot attach-gated restore. A restore is
//     applied only for the entry that scheduled it (a later switch supersedes
//     it) and at most once per attach consumption — and a remembered offset of
//     exactly 0 still APPLIES (null means "nothing pending", never "pending 0").

import type { TrackEntryKey } from './track-entry-identity';
import { computeOutgoingScroll } from './track-entry-scroll-memory';

type ScrollMemoryReader = {
  read: (entryKey: TrackEntryKey) => number | null;
};

export type EntrySwitchPlan = {
  save: { entryKey: TrackEntryKey; offset: number } | null;
  incomingEntryKey: TrackEntryKey;
  /** The offset refuse() re-fuses with the current posture. */
  restoreOffset: number;
  /** True when restoreOffset came from memory (including a remembered 0). */
  hadMemory: boolean;
  /**
   * False when the switch commits in the HIDDEN domain (tau < 0, the deferred
   * swap at the screen edge): an immediate refuse there would jump tau from
   * -depth to >= 0 in one frame (the posture register clamps at 0) - the exact
   * "sheet instantly appears" OA5 forbids. The restore stays ARMED (attach-
   * gated / superseded like any other); the return to screen is the resurrect
   * glide's job, never a teleport. (Red-team F1.)
   */
  immediateRestore: boolean;
};

export const planEntrySwitch = (args: {
  outgoingEntryKey: TrackEntryKey | null;
  incomingEntryKey: TrackEntryKey;
  tau: number;
  trackH: number;
  sigma: number;
  memory: ScrollMemoryReader;
}): EntrySwitchPlan => {
  const { outgoingEntryKey, incomingEntryKey, tau, trackH, sigma, memory } = args;
  // THE HIDDEN DOMAIN NEVER WRITES MEMORY (G-HIDDEN, R4): a switch committing
  // while τ is below collapsed (the deferred swap lands after the sheet clears
  // the screen edge, τ = −depth) has NO live list scroll to save — computing
  // the term there would overwrite the outgoing entry's real remembered offset
  // with ~0. The true offset was snapshotted at hide START
  // (saveScrollForPresentedEntry, before the excursion moved τ).
  const save =
    outgoingEntryKey != null && tau >= 0
      ? { entryKey: outgoingEntryKey, offset: computeOutgoingScroll(tau, trackH, sigma) }
      : null;
  const remembered = memory.read(incomingEntryKey);
  return {
    save,
    incomingEntryKey,
    restoreOffset: remembered ?? 0,
    hadMemory: remembered != null,
    immediateRestore: tau >= 0,
  };
};

export type EntrySwitchEffects = {
  saveOutgoing: (entryKey: TrackEntryKey, offset: number) => void;
  /** Shell config + chrome selection re-assert (segment/strip state is React
   * element identity, already committed by render; this re-asserts the native
   * per-scene config). MUST run before the scroll restore (A4 ordering). */
  applyChromeSelection: () => void;
  /** Arm the attach-gated one-shot (fresh legs attach async). */
  armRestore: (entryKey: TrackEntryKey, offset: number) => void;
  /** Immediate native re-fuse for the already-attached track. */
  applyRestore: (offset: number) => void;
};

export const executeEntrySwitch = (plan: EntrySwitchPlan, effects: EntrySwitchEffects): void => {
  if (plan.save != null) {
    effects.saveOutgoing(plan.save.entryKey, plan.save.offset);
  }
  effects.applyChromeSelection();
  effects.armRestore(plan.incomingEntryKey, plan.restoreOffset);
  if (plan.immediateRestore) {
    effects.applyRestore(plan.restoreOffset);
  }
};

export class TrackRestoreCoordinator {
  private pending: { entryKey: TrackEntryKey; offset: number } | null = null;

  /** A new switch's restore supersedes any earlier pending one. */
  schedule(entryKey: TrackEntryKey, offset: number): void {
    this.pending = { entryKey, offset };
  }

  /**
   * Called on every native attach. Returns the offset to re-fuse — possibly 0,
   * a real restore — or null when nothing pending FOR THE PRESENTED ENTRY.
   * One-shot: a consumed restore never re-applies on later attaches (the
   * recycler re-attaches constantly; a stale re-run was the original bug).
   */
  consumeOnAttach(presentedEntryKey: TrackEntryKey | null): number | null {
    if (this.pending == null || this.pending.entryKey !== presentedEntryKey) {
      return null;
    }
    const { offset } = this.pending;
    this.pending = null;
    return offset;
  }
}
