/**
 * THE LEDGER KEYS ON THE FOLD AND REMEMBERS THE QUERY — and the fold folds
 * SPELLINGS, not WORDS.
 *
 * The (engine, term) attempt ledger holds a term's harvest snapshot: when the
 * query last ran, how many posts it returned, how big the corpus was. Two
 * spellings of one query must be one row, or the same query gets two budgets;
 * two DIFFERENT WORDS must not be one row, or one word's measured yield is
 * recorded against the other, last-writer-wins.
 *
 * `normalizeKeywordTerm` used to strip every combining mark, which put it on
 * the wrong side of that line:
 *
 *   bò (beef) | bo | bơ (butter)  ->  one ledger key, 'bo'
 *   nón lá    | non la            ->  one ledger key
 *   táo       | tao               ->  one ledger key
 *
 * Measured over the 55,458 banked surface forms this lane draws candidates
 * from: 469 keys swallowing 942 distinct words. It also produced strings that
 * were neither Vietnamese nor ASCII ('bún đậu mắm tôm' -> 'bun đau mam tom',
 * the 'đ' surviving because it is a distinct letter rather than a base plus a
 * mark) — which is why the REFRESH slice, which re-runs terms straight out of
 * this ledger, once sent that mongrel to the vendor forever and wrote the
 * resulting zero back as evidence the term was barren.
 *
 * The fold now preserves accents (it delegates to `diacriticFold`, the one
 * accent-preserving fold in the codebase, which `surfaceClaimKey` already
 * uses for the identical ruling one store over). These tests pin all three
 * halves: spellings still collapse, WORDS no longer do, and the query
 * survives intact alongside the identity.
 */
import { normalizeKeywordTerm } from './keyword-term-normalization';
import { KeywordAttemptHistoryService } from './keyword-attempt-history.service';

/**
 * The slice of the upsert argument these tests actually read. Declared rather
 * than reached for through `any`, so the assertions below are type-checked
 * against the shape they claim to be inspecting.
 */
interface UpsertCall {
  where: { engineName_normalizedTerm: { normalizedTerm: string } };
  create: { term: string };
  update: { term: string };
}

describe('keyword attempt ledger — identity is a fold, the query is not', () => {
  function harness() {
    const upsert = jest
      .fn<Promise<unknown>, [UpsertCall]>()
      .mockResolvedValue({});
    const prisma = { keywordAttemptHistory: { upsert } };
    const logger = { setContext: jest.fn().mockReturnThis(), warn: jest.fn() };
    const service = new KeywordAttemptHistoryService(
      prisma as never,
      logger as never,
    );
    return { service, upsert };
  }

  it('DIFFERENT WORDS get different ledger keys (F7 — the defect, pinned)', () => {
    // Under the accent-stripping fold all three of these were 'bo': one row,
    // one harvest snapshot, last-writer-wins across three real Vietnamese
    // words. This is the assertion that would have caught it.
    const keys = ['bò', 'bo', 'bơ'].map(normalizeKeywordTerm);
    expect(new Set(keys).size).toBe(3);
    expect(normalizeKeywordTerm('nón lá')).not.toBe(
      normalizeKeywordTerm('non la'),
    );
    expect(normalizeKeywordTerm('táo')).not.toBe(normalizeKeywordTerm('tao'));
  });

  it('the fold is still a stable IDENTITY over SPELLINGS of one word', () => {
    // Case, whitespace and punctuation are how one word gets typed; they must
    // still collapse, or one query buys two budgets. 809 of the measured
    // collision groups are exactly this, and they are the fold doing its job.
    expect(normalizeKeywordTerm('Bún Đậu Mắm Tôm')).toBe(
      normalizeKeywordTerm('bún đậu mắm tôm'),
    );
    expect(normalizeKeywordTerm('Cabana')).toBe(normalizeKeywordTerm('cabana'));
    expect(normalizeKeywordTerm('hand-pulled  noodle')).toBe(
      normalizeKeywordTerm('hand pulled noodle'),
    );
  });

  it('the identity is NOT a query — it is never what goes on the wire', () => {
    // The fold is still lossy (apostrophes, punctuation), which is exactly
    // why the ledger carries `term` separately.
    expect(normalizeKeywordTerm("Phil's Ice House")).toBe('phils ice house');
  });

  it('records the diacritic-preserving query ALONGSIDE the folded identity', async () => {
    const { service, upsert } = harness();
    await service.recordAttempt({
      engineName: 'region-us-tx-austin',
      normalizedTerm: normalizeKeywordTerm('bún đậu mắm tôm'),
      term: 'bún đậu mắm tôm',
      outcome: 'success',
      resultCount: 3,
      corpusDocs: 9_000,
    });

    const call: UpsertCall = upsert.mock.calls[0][0];
    // The row is KEYED by the fold ...
    expect(call.where.engineName_normalizedTerm.normalizedTerm).toBe(
      // ACCENTS SURVIVE — AND SO DOES 'đ'. This assertion used to read
      // 'bún dậu mắm tôm', pinning the claim that folding đ→d "cannot
      // produce the bò/bơ class". It could and it did: measured over the
      // banked corpus, that fold merged `Đầu` (head) with `dầu` (oil) into
      // one ledger row whose harvest snapshot is last-writer-wins (A0 R3).
      // đ is the eighth letter of the Vietnamese alphabet, not a decorated
      // d, so the shared fold now folds it only where accents fold. There
      // is still ONE fold implementation — two folds drift.
      'bún đậu mắm tôm',
    );
    // ... and REMEMBERS the query, on create and on update alike, so the
    // refresh lane has something true to re-send.
    expect(call.create.term).toBe('bún đậu mắm tôm');
    expect(call.update.term).toBe('bún đậu mắm tôm');
  });

  it('refuses a write with no query rather than banking a fold as one', async () => {
    const { service, upsert } = harness();
    await service.recordAttempt({
      engineName: 'region-us-tx-austin',
      normalizedTerm: 'birria',
      term: '   ',
      outcome: 'success',
    });
    expect(upsert).not.toHaveBeenCalled();
  });
});
