// G-LIVENESS falsifiers (R5) — the probe must be able to show RED.
//
// RED conditions (each proven by mutation before landing):
//   (a) a presented entry delivered a suspended lane → 'presented-suspended'
//       (mutating deriveTrackEntryBodyActivity to gate on !isPresented, or the
//       host to capture a stale all-false, produces this violation).
//   (b) a hidden entry delivered a live lane → 'hidden-live' (re-introducing
//       the pre-R2 all-true activity object produces this).
//   (c) a cached render closure using a stale presented flag →
//       'stale-presentation-flag' (freezing presentedEntryKeyLiveRef produces
//       this even when the lanes happen to agree).
//   (d) the probe itself must be provably not-always-green: the healthy-commit
//       test asserts ZERO violations, so an audit mutated to always-flag fails.

import { deriveTrackEntryBodyActivity } from './track-entry-activity';
import { auditTrackEntryLiveness, type TrackEntryLivenessSample } from './track-entry-liveness';

const sampleFromDerivation = (
  entryKey: string,
  renderedAsPresented: boolean
): TrackEntryLivenessSample => {
  const activity = deriveTrackEntryBodyActivity('scene', renderedAsPresented);
  return {
    entryKey,
    renderedAsPresented,
    shouldRunDataLane: activity.shouldRunDataLane,
    shouldSubscribeDataLane: activity.shouldSubscribeDataLane,
    shouldRenderExpandedContent: activity.shouldRenderExpandedContent,
  };
};

describe('auditTrackEntryLiveness', () => {
  it('a healthy commit (derivation + correct flags) has ZERO violations', () => {
    const violations = auditTrackEntryLiveness('userProfile#e-1', [
      sampleFromDerivation('userProfile#e-1', true),
      sampleFromDerivation('userProfile#e-2', false),
      sampleFromDerivation('listDetail#e-3', false),
    ]);
    expect(violations).toEqual([]);
  });

  it('RED: the presented entry delivered with suspended lanes', () => {
    const violations = auditTrackEntryLiveness('userProfile#e-1', [
      // The activity-gate-wrongly-suspends-presented mutation, as delivered.
      sampleFromDerivation('userProfile#e-1', false),
    ]);
    expect(violations.map((violation) => violation.kind)).toContain('presented-suspended');
  });

  it('RED: a hidden entry delivered with live lanes (the all-true leak)', () => {
    const violations = auditTrackEntryLiveness('userProfile#e-1', [
      sampleFromDerivation('userProfile#e-1', true),
      // all-true delivered to a hidden entry:
      {
        entryKey: 'userProfile#e-2',
        renderedAsPresented: false,
        shouldRunDataLane: true,
        shouldSubscribeDataLane: true,
        shouldRenderExpandedContent: true,
      },
    ]);
    expect(violations.map((violation) => violation.kind)).toContain('hidden-live');
  });

  it('RED: a stale presentation flag is its own violation, even with agreeing lanes', () => {
    // The closure believed e-2 was presented (stale live-ref) while the commit
    // presents e-1: both flag mismatch AND hidden-live fire — a partial
    // mutation cannot hide behind either.
    const violations = auditTrackEntryLiveness('userProfile#e-1', [
      sampleFromDerivation('userProfile#e-2', true),
    ]);
    const kinds = violations.map((violation) => violation.kind);
    expect(kinds).toContain('stale-presentation-flag');
    expect(kinds).toContain('hidden-live');
  });

  it('a presented entry with a fully-suspended sample AND stale flag reports both', () => {
    const violations = auditTrackEntryLiveness('dmSession#e-9', [
      sampleFromDerivation('dmSession#e-9', false),
    ]);
    const kinds = violations.map((violation) => violation.kind);
    expect(kinds).toContain('stale-presentation-flag');
    expect(kinds).toContain('presented-suspended');
  });

  it('no sample for the presented entry is NOT a violation (list-lane scenes)', () => {
    expect(auditTrackEntryLiveness('polls#root', [])).toEqual([]);
  });
});
