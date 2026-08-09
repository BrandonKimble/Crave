/**
 * THE LEDGER KEYS ON THE FOLD AND REMEMBERS THE QUERY.
 *
 * `normalizeKeywordTerm` is NFKD followed by "strip every combining mark". It
 * is the right IDENTITY for the (engine, term) attempt ledger — two spellings
 * of one query must be one row — and the wrong string to put on the wire.
 * Measured on the live corpus before this fix:
 *
 *   normalizeKeywordTerm('bún đậu mắm tôm') === 'bun đau mam tom'
 *
 * — neither Vietnamese nor ASCII, and matching nothing on any search vendor
 * (the 'đ' survives because it is a distinct letter, not a base plus a
 * combining mark, which is what makes the output a mongrel rather than a
 * clean ASCII fold).
 *
 * The REFRESH slice re-runs terms straight out of this ledger. It used to
 * build its outbound term from `normalizedTerm`, so every re-searched
 * foreign-language term went back out mangled in perpetuity — and the zero
 * results it then got back were written here as a harvest snapshot, teaching
 * the eligibility clamp that the term was barren. A term could therefore be
 * measured worthless purely because we kept asking the wrong question.
 *
 * These tests pin both halves: the fold still folds (identity is stable), and
 * the query survives it intact (what we re-send is what we asked).
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

  it('the fold MANGLES a Vietnamese query — which is why it may only be an identity', () => {
    // Not an aspiration: this is the measured behaviour the defect rested on.
    expect(normalizeKeywordTerm('bún đậu mắm tôm')).toBe('bun đau mam tom');
    expect(normalizeKeywordTerm('cơm tấm')).toBe('com tam');
  });

  it('the fold is a stable IDENTITY — two spellings collapse to one ledger key', () => {
    expect(normalizeKeywordTerm('Bún Đậu Mắm Tôm')).toBe(
      normalizeKeywordTerm('bún đậu mắm tôm'),
    );
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
      'bun đau mam tom',
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
