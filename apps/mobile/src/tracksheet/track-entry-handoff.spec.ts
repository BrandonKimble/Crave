// ─── FALSIFIERS: THE PRESS-UP HANDOFF (touch-latency rung) ───────────────────
//
// The pure half. Every 'direct' in planTrackEntryHandoff is a STATED reason, so
// each one gets a check that goes RED when that reason is dropped; the 'defer'
// case is the rung's whole purpose and gets the strictest one.
//
// RED-PROVEN by mutation (executed 2026-08-05, one clause deleted per run):
//   destinationRowsAreResident -> 1 RED   participatesInWorldJoin -> 1 RED
//   destinationHasRealRows     -> 1 RED   hasOutgoingPaint        -> 1 RED
// Each also lands in the render lane except hasOutgoingPaint, whose host-side
// effect is on the boot pass (see the render spec's NOT CLAIMED note).

import {
  planTrackEntryHandoff,
  TrackEntryResidencyLedger,
  type TrackEntryHandoffFacts,
} from './track-entry-handoff';

const facts = (partial: Partial<TrackEntryHandoffFacts> = {}): TrackEntryHandoffFacts => ({
  destinationHasRealRows: true,
  destinationRowsAreResident: false,
  participatesInWorldJoin: false,
  hasOutgoingPaint: true,
  ...partial,
});

describe('planTrackEntryHandoff — the finger never pays the first paint', () => {
  it('DEFERS a data-warm entry whose rows are not mounted (the measured 280ms defect)', () => {
    expect(planTrackEntryHandoff(facts())).toBe('defer');
  });

  it('DEFERS A REVISIT TOO — "has painted before" is not "is painted now", and it was the revisit the owner measured at 280ms', () => {
    // The fact that used to exempt this case does not exist any more; the only
    // exemption is residency, and a revisit's rows unmounted when it was left.
    expect(planTrackEntryHandoff(facts({ destinationRowsAreResident: false }))).toBe('defer');
  });

  it('an entry whose rows are STILL MOUNTED is direct — the frame really is free, so there is nothing to defer', () => {
    expect(planTrackEntryHandoff(facts({ destinationRowsAreResident: true }))).toBe('direct');
  });

  it('OA1: a world-join scene is never deferred — its reveal is joined on {map items, cards}, and a handoff would be a rival phase inside that join', () => {
    expect(planTrackEntryHandoff(facts({ participatesInWorldJoin: true }))).toBe('direct');
  });

  it('an entry with no real rows is not deferred — readiness is already painting its skeleton or frozen body, and a second mechanism deciding the same thing is the class this system deletes', () => {
    expect(planTrackEntryHandoff(facts({ destinationHasRealRows: false }))).toBe('direct');
  });

  it('the first presentation of the session is not a handoff — there is no outgoing paint to hand off from, and no finger waiting on a flip', () => {
    expect(planTrackEntryHandoff(facts({ hasOutgoingPaint: false }))).toBe('direct');
  });

  it('is TOTAL: every combination of the four facts answers direct or defer — no "wait" is representable, so a switch commit always paints', () => {
    for (const destinationHasRealRows of [true, false]) {
      for (const destinationRowsAreResident of [true, false]) {
        for (const participatesInWorldJoin of [true, false]) {
          for (const hasOutgoingPaint of [true, false]) {
            expect(['direct', 'defer']).toContain(
              planTrackEntryHandoff({
                destinationHasRealRows,
                destinationRowsAreResident,
                participatesInWorldJoin,
                hasOutgoingPaint,
              })
            );
          }
        }
      }
    }
  });
});

describe('TrackEntryResidencyLedger — whose rows are mounted NOW, not who once painted', () => {
  it('an entry is not resident until it is marked, and is resident after', () => {
    const ledger = new TrackEntryResidencyLedger();
    expect(ledger.isResident('polls#root')).toBe(false);
    ledger.markResident('polls#root');
    expect(ledger.isResident('polls#root')).toBe(true);
  });

  it('IS EXCLUSIVE: the page has ONE body, so marking a new resident un-residents the old one — the has-ever-painted bug is not representable', () => {
    const ledger = new TrackEntryResidencyLedger();
    ledger.markResident('home#root');
    ledger.markResident('polls#root');
    expect(ledger.isResident('home#root')).toBe(false);
    expect(ledger.isResident('polls#root')).toBe(true);
  });

  it('clear() empties the slot — the flip unmounts the outgoing body, so nothing is resident until some leg builds its real body again', () => {
    const ledger = new TrackEntryResidencyLedger();
    ledger.markResident('polls#root');
    ledger.clear();
    expect(ledger.isResident('polls#root')).toBe(false);
  });

  it('the fact is per ENTRY, not per scene: two stacked entries of one scene do not share it (G-ENTRY)', () => {
    const ledger = new TrackEntryResidencyLedger();
    ledger.markResident('userProfile#e1');
    expect(ledger.isResident('userProfile#e2')).toBe(false);
  });

  it('eviction forgets the fact — a re-push mints a new entry id, so a stale residency could only mislabel an unmounted body as free to paint', () => {
    const ledger = new TrackEntryResidencyLedger();
    ledger.markResident('userProfile#e1');
    ledger.forget('userProfile#e1');
    expect(ledger.isResident('userProfile#e1')).toBe(false);
  });
});
