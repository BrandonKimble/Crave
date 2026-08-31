import { resolveMatchExplainChipText, resolveSearchNoticeText } from './match-explain-strings';

describe('resolveMatchExplainChipText', () => {
  it('exact rows (no matchExplain) render NOTHING', () => {
    expect(resolveMatchExplainChipText(undefined)).toBeNull();
    expect(resolveMatchExplainChipText(null)).toBeNull();
  });

  it('similar names the asked word', () => {
    expect(resolveMatchExplainChipText({ kind: 'similar', terms: ['bar'] })).toBe(
      'Close match for ‘bar’'
    );
  });

  it('similar with no word falls back to the generic quiet cue', () => {
    expect(resolveMatchExplainChipText({ kind: 'similar', terms: [] })).toBe('Close match');
  });

  it('contains with EVIDENCE basis asserts plainly (a human wrote it)', () => {
    expect(
      resolveMatchExplainChipText({
        kind: 'contains',
        terms: ['pancetta'],
        basis: 'evidence',
      })
    ).toBe('Has ‘pancetta’ in it');
  });

  it('contains with DERIVED basis hedges — never promise what we inferred', () => {
    expect(
      resolveMatchExplainChipText({
        kind: 'contains',
        terms: ['pancetta'],
        basis: 'derived',
      })
    ).toBe('May have ‘pancetta’ in it');
  });

  it('contains with NO basis hedges too (older server = uninspected)', () => {
    expect(resolveMatchExplainChipText({ kind: 'contains', terms: ['pancetta'] })).toBe(
      'May have ‘pancetta’ in it'
    );
  });

  it('contains + widening, evidence basis: asserts the family', () => {
    expect(
      resolveMatchExplainChipText({
        kind: 'contains',
        terms: ['bacon'],
        widened: true,
        basis: 'evidence',
      })
    ).toBe('Made with ‘bacon’ or a close cousin');
  });

  it('contains + widening, derived basis: hedges on both counts', () => {
    expect(
      resolveMatchExplainChipText({
        kind: 'contains',
        terms: ['bacon'],
        widened: true,
        basis: 'derived',
      })
    ).toBe('May have ‘bacon’ (or a close cousin) in it');
  });

  it('partial names the words the row DID match — never the missing ones', () => {
    expect(resolveMatchExplainChipText({ kind: 'partial', terms: ['patio', 'cozy'] })).toBe(
      'Matches ‘patio’ and ‘cozy’'
    );
  });

  it('partial with nothing nameable stays silent', () => {
    expect(resolveMatchExplainChipText({ kind: 'partial', terms: [] })).toBeNull();
  });
});

describe('resolveSearchNoticeText', () => {
  it('renders the friendly starved line once', () => {
    expect(resolveSearchNoticeText({ kind: 'starved_on_demand', terms: ['patio'] })).toBe(
      "Nothing here mentions ‘patio’ yet — we're on the lookout. Showing closest matches."
    );
  });

  it('no notice or no terms → nothing', () => {
    expect(resolveSearchNoticeText(undefined)).toBeNull();
    expect(resolveSearchNoticeText({ kind: 'starved_on_demand', terms: [] })).toBeNull();
  });
});
