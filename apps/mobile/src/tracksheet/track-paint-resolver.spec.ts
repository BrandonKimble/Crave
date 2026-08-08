// ─── THE ONE PAINT RESOLVER — FALSIFIERS (R8, same change as the merge) ──────
//
// RED-proof ledger (each mutation applied to track-paint-resolver.ts and the
// failing test observed before revert — recorded in the R8 report):
//   M1 live-when-resident: `if (facts.ready)` → `if (false)` — reds the live
//      tests (a ready entry would paint frozen/skeleton forever).
//   M2 frozen-when-affordable: handoff branch returns skeleton regardless of
//      hasFrozenBody — reds the frozen handoff test.
//   M3 skeleton-when-not: gap branch returns frozen even when no frozen body
//      exists — reds the cold-gap test (the resolver would name a body the
//      store cannot produce).
//   M4 no-ban-on-revisit: adding an OA6.1-style latch parameter that forces
//      frozen on any revisit is unrepresentable — the facts type has no
//      history axis; the totality test reds if a branch returns undefined.
//   M5 freeze-instruction drift: freezeLiveBody hardcoded false — reds the
//      freeze-instruction test.

import { resolveTrackPaint, type TrackPaintFacts } from './track-paint-resolver';

const facts = (partial: Partial<TrackPaintFacts>): TrackPaintFacts => ({
  isHandingOff: false,
  ready: false,
  hasFrozenBody: false,
  ...partial,
});

describe('resolveTrackPaint — live when resident', () => {
  it('a ready entry paints its live body and records it as the frozen world', () => {
    expect(resolveTrackPaint(facts({ ready: true }))).toEqual({
      body: 'live',
      freezeLiveBody: true,
    });
    // Even when a frozen body exists — live content always wins outside a handoff.
    expect(resolveTrackPaint(facts({ ready: true, hasFrozenBody: true }))).toEqual({
      body: 'live',
      freezeLiveBody: true,
    });
  });
});

describe('resolveTrackPaint — frozen when affordable', () => {
  it('the handoff frame paints the frozen body when one exists (revisit never obliged to flash)', () => {
    expect(
      resolveTrackPaint(facts({ isHandingOff: true, ready: true, hasFrozenBody: true }))
    ).toEqual({ body: 'frozen', freezeLiveBody: false });
  });

  it('a live resolution gap paints the frozen body when one exists (OA6.1 as OA8 reframed it)', () => {
    expect(resolveTrackPaint(facts({ hasFrozenBody: true }))).toEqual({
      body: 'frozen',
      freezeLiveBody: false,
    });
  });
});

describe('resolveTrackPaint — skeleton when not (NO ban on revisit skeletons, OA8)', () => {
  it('a cold entry with no frozen body paints the skeleton — including on a handoff frame', () => {
    expect(resolveTrackPaint(facts({ isHandingOff: true, ready: true }))).toEqual({
      body: 'skeleton',
      freezeLiveBody: false,
    });
    expect(resolveTrackPaint(facts({}))).toEqual({ body: 'skeleton', freezeLiveBody: false });
  });

  it('OA8: the facts carry NO history axis — a revisit whose frozen body is gone paints an honest skeleton, not a rule-bound frozen frame', () => {
    // A revisit is representable only through hasFrozenBody; once the store
    // evicted the body, the resolver CANNOT be forced to hide the skeleton.
    expect(resolveTrackPaint(facts({ isHandingOff: true })).body).toBe('skeleton');
  });
});

describe('resolveTrackPaint — totality (every commit paints; wait is unrepresentable)', () => {
  it('all 8 fact combinations return a named body', () => {
    for (const isHandingOff of [false, true]) {
      for (const ready of [false, true]) {
        for (const hasFrozenBody of [false, true]) {
          const decision = resolveTrackPaint({ isHandingOff, ready, hasFrozenBody });
          expect(['live', 'frozen', 'skeleton']).toContain(decision.body);
          // The freeze instruction accompanies exactly the live body.
          expect(decision.freezeLiveBody).toBe(decision.body === 'live');
        }
      }
    }
  });

  it('the frozen verdict is never issued without an affordable frozen body', () => {
    for (const isHandingOff of [false, true]) {
      for (const ready of [false, true]) {
        expect(resolveTrackPaint({ isHandingOff, ready, hasFrozenBody: false }).body).not.toBe(
          'frozen'
        );
      }
    }
  });
});
