import {
  denied,
  granted,
  indeterminate,
  resolveVerdict,
  type AccessVerdict,
} from './access-verdict';

// THREE ANSWERS, NOT TWO.
//
// `hasAccess` returned a boolean, so its catch block had to invent an
// assertion about the world from the ABSENCE of information — it picked
// `true`. That is one global lie on behalf of every caller, and it cannot be
// right everywhere: a shared-poll read should allow when the store is down
// (availability wins), while an LLM-backed search should deny (money wins).
//
// These tests pin the property that makes the type worth having: an
// indeterminate verdict has NO default. A caller must name its policy, and
// the two policies must actually differ.

describe('access verdict', () => {
  it('granted and denied are unambiguous under EITHER policy', () => {
    // The indeterminate policy must not be able to change a real answer —
    // otherwise it is not a fallback, it is an override.
    for (const policy of ['allow', 'deny'] as const) {
      expect(resolveVerdict(granted('crave_plus'), policy)).toBe(true);
      expect(resolveVerdict(denied('no_grant'), policy)).toBe(false);
      expect(resolveVerdict(denied('expired'), policy)).toBe(false);
    }
  });

  it('indeterminate resolves BY THE CALLER, and the two policies disagree', () => {
    const unknown = indeterminate('store_unavailable', 'redis timeout');
    expect(resolveVerdict(unknown, 'allow')).toBe(true);
    expect(resolveVerdict(unknown, 'deny')).toBe(false);
  });

  it('carries WHY, so a denial is debuggable and an outage is identifiable', () => {
    // The old boolean threw this away: a false could be "no subscription" or
    // "the database is on fire" and nothing downstream could tell.
    const d = denied('expired');
    expect(d.kind === 'denied' && d.reason).toBe('expired');
    const i = indeterminate('store_unavailable', 'connection refused');
    expect(i.kind === 'indeterminate' && i.cause).toBe('store_unavailable');
    expect(i.kind === 'indeterminate' && i.message).toBe('connection refused');
  });

  it('every verdict kind is handled — a new kind cannot be silently ignored', () => {
    // resolveVerdict switches exhaustively; if a kind is ever added without a
    // branch, TypeScript fails the build rather than falling through to a
    // default that quietly means "allow".
    const kinds = (
      [
        granted('c'),
        denied('no_grant'),
        indeterminate('unexpected_error', 'x'),
      ] as AccessVerdict[]
    ).map((v) => v.kind);
    expect(new Set(kinds).size).toBe(3);
  });
});
