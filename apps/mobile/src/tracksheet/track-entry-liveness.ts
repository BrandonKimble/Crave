// ─── THE LIVENESS PROBE (G-LIVENESS, R5 / amendment A4) ──────────────────────
//
// The contract requires a RUNTIME falsifier: an instrument that can show RED
// when a presented entry's body stops receiving the updates it should — the
// activity gate wrongly leaving a PRESENTED entry suspended (frozen content
// that looks like slow data), or a hidden entry running live lanes it should
// not (the pre-R2 all-true leak, resumed without presentation).
//
// The DECISION is pure and lives here; the host's dev-only effect feeds it the
// activity objects that were ACTUALLY DELIVERED to bodies at render time (not
// re-derived — re-deriving would compare the derivation with itself and could
// never show RED; the samples come from the render closures, which is exactly
// where the stale-capture bug class lives).

export type TrackEntryLivenessSample = {
  entryKey: string;
  /** The presentation flag the render closure USED when it built the body. */
  renderedAsPresented: boolean;
  /** The gated lanes as delivered to the body's activity contexts. */
  shouldRunDataLane: boolean;
  shouldSubscribeDataLane: boolean;
  shouldRenderExpandedContent: boolean;
};

export type TrackEntryLivenessViolation = {
  entryKey: string;
  kind: 'presented-suspended' | 'hidden-live' | 'stale-presentation-flag';
  detail: string;
};

/**
 * The audit: given WHO is presented this commit and what each body last
 * received, every violation is RED-able:
 *   • presented-suspended — the presented entry's body was last rendered with
 *     any live lane OFF (it will never see the updates it should).
 *   • hidden-live — a non-presented entry's body was last rendered with a
 *     gated lane ON (resumed without being presented / the all-true leak).
 *   • stale-presentation-flag — the flag the closure used disagrees with the
 *     commit's presentation (the cached-closure stale-ref class).
 * A missing sample for the presented entry is NOT a violation: list-lane
 * scenes (polls/home) render through host hooks, not the mounted closure.
 */
export const auditTrackEntryLiveness = (
  presentedEntryKey: string,
  samples: readonly TrackEntryLivenessSample[]
): TrackEntryLivenessViolation[] => {
  const violations: TrackEntryLivenessViolation[] = [];
  for (const sample of samples) {
    const isPresented = sample.entryKey === presentedEntryKey;
    if (sample.renderedAsPresented !== isPresented) {
      violations.push({
        entryKey: sample.entryKey,
        kind: 'stale-presentation-flag',
        detail: `rendered as ${sample.renderedAsPresented ? 'presented' : 'hidden'} but is ${
          isPresented ? 'presented' : 'hidden'
        }`,
      });
      // The flag mismatch already implies one of the lane violations below —
      // still check them so a partial mutation cannot hide behind it.
    }
    const lanesLive =
      sample.shouldRunDataLane &&
      sample.shouldSubscribeDataLane &&
      sample.shouldRenderExpandedContent;
    const anyLaneLive =
      sample.shouldRunDataLane ||
      sample.shouldSubscribeDataLane ||
      sample.shouldRenderExpandedContent;
    if (isPresented && !lanesLive) {
      violations.push({
        entryKey: sample.entryKey,
        kind: 'presented-suspended',
        detail: `run=${sample.shouldRunDataLane} subscribe=${sample.shouldSubscribeDataLane} render=${sample.shouldRenderExpandedContent}`,
      });
    }
    if (!isPresented && anyLaneLive) {
      violations.push({
        entryKey: sample.entryKey,
        kind: 'hidden-live',
        detail: `run=${sample.shouldRunDataLane} subscribe=${sample.shouldSubscribeDataLane} render=${sample.shouldRenderExpandedContent}`,
      });
    }
  }
  return violations;
};
