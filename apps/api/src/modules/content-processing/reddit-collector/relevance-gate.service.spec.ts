import { normalizeVerdictReason } from './relevance-gate.service';

/**
 * The prompt no longer tells the model how to behave when the `reason` field
 * is not in the requested output shape (that sentence was deleted in the
 * 2026-08-12 rederivation). Parsing owns it, so these are the shapes that used
 * to depend on the model obeying prose.
 */
describe('normalizeVerdictReason', () => {
  it('keeps a real reason, trimmed', () => {
    expect(normalizeVerdictReason('  asks: "ramen recs"  ')).toBe(
      'asks: "ramen recs"',
    );
  });

  it('drops an absent or empty reason instead of persisting a blank', () => {
    expect(normalizeVerdictReason(undefined)).toBeUndefined();
    expect(normalizeVerdictReason(null)).toBeUndefined();
    expect(normalizeVerdictReason('')).toBeUndefined();
    expect(normalizeVerdictReason('   ')).toBeUndefined();
  });

  it('drops a reason returned in the wrong shape', () => {
    expect(normalizeVerdictReason(42)).toBeUndefined();
    expect(normalizeVerdictReason({ text: 'food ask' })).toBeUndefined();
    expect(normalizeVerdictReason(['food ask'])).toBeUndefined();
  });
});
