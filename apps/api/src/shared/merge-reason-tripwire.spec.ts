import {
  bannedMergeReasonClass,
  refusedMergeHoldReason,
} from './merge-reason-tripwire';

/**
 * THE REASON TRIPWIRE (merge-batch audit 2026-08-30, action #4).
 *
 * Every banned phrase below is a REAL reason string the judge recorded on a
 * wrong EXECUTED merge in the 2026-08-30 batch (plans/merge-batch-audit.md,
 * full verdict table) — the tripwire must refuse each one. Every clean
 * reason is a real reason from a CORRECT merge in the same batch — the
 * tripwire must pass each one.
 */
describe('bannedMergeReasonClass', () => {
  const bannedRealReasons: Array<[string, string]> = [
    // The audit's three announced banned classes, verbatim:
    ['category fold, same restaurant', 'category-fold'],
    ['specification fold, same restaurant', 'specification-fold'],
    ['specification fold', 'specification-fold'],
    ['format fold, same restaurant', 'format-fold'],
    ['format fold', 'format-fold'],
    ['category fold', 'category-fold'],
    // Same-restaurant licenses without a fold word (the audit's
    // "shorthand variant, same restaurant" wrong class, and mislabels
    // like duck carnitas taco's "venue-name decoration, same restaurant"):
    ['shorthand variant, same restaurant', 'same-restaurant-fold'],
    ['culinary synonym, same restaurant', 'same-restaurant-fold'],
    ['venue-name decoration, same restaurant', 'same-restaurant-fold'],
    ['same place, decorated retelling', 'same-restaurant-fold'],
    ['offerings share the same venue', 'same-restaurant-fold'],
    // The broader/narrower vocabulary for the same fold:
    ['term is broader than the candidate', 'broader-narrower'],
    ['narrower preparation of the same dish', 'broader-narrower'],
    // The two decoration classes deleted from the merge doctrine:
    ['narration decoration', 'narration-decoration'],
    ['channel wording', 'channel-wording'],
  ];

  it.each(bannedRealReasons)('refuses %j', (reason, expectedClass) => {
    expect(bannedMergeReasonClass(reason)).toBe(expectedClass);
  });

  const cleanRealReasons = [
    // CORRECT merges from the same batch's verdict table:
    'culinary synonym',
    'cross-language synonym',
    'spelling variant',
    'spacing variant',
    'singular/plural variant',
    'pluralization variant',
    'word order variant',
    'shorthand variant',
    'synonym variant',
    'established shorthand',
    'obvious typo of one ingredient',
    // The deterministic lanes' own ledgered reasons:
    'deterministic number-variant fold (food-lemma: same item up to a numeral)',
    'deterministic identical token multiset (canonical fold, stopwords dropped, accents agree)',
  ];

  it.each(cleanRealReasons)('passes %j', (reason) => {
    expect(bannedMergeReasonClass(reason)).toBeNull();
  });

  it('a DEGENERATE reason — the bare decision word, a placeholder, or too short to audit — is refused', () => {
    for (const reason of [
      'match',
      'Match.',
      '(same)',
      'merge',
      '(audit reasons off)',
      '',
      '   ',
      'yes',
      'identical',
    ]) {
      expect(bannedMergeReasonClass(reason)).toBe('degenerate-reason');
    }
    expect(
      bannedMergeReasonClass(
        'the same operating business: one owned domain, one menu, one address',
      ),
    ).toBeNull();
  });

  it('composes a hold reason that keeps the original ground legible', () => {
    const hold = refusedMergeHoldReason(
      'category-fold',
      'category fold, same restaurant',
    );
    expect(hold).toContain('banned class: category-fold');
    expect(hold).toContain('category fold, same restaurant');
    // The refusal reason itself must be non-empty (the ledger rejects
    // reasonless verdicts) and clearly marked as a tripwire hold.
    expect(hold.startsWith('merge refused by reason tripwire')).toBe(true);
  });
});
