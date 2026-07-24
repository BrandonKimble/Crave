/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
/**
 * The no-fake-estimates keyword eligibility law (2026-07-24): no cooldown
 * timers — a harvested term re-enters when corpus delta × measured match
 * share expects ≥ 1 whole new document. RED-able on both sides.
 */
import { keywordTermExpectedNewDocs } from './keyword-slice-selection.service';
import { KeywordAttemptHistoryService } from './keyword-attempt-history.service';

describe('keywordTermExpectedNewDocs — the derived clamp', () => {
  it('never-harvested terms are ALWAYS eligible (the first search is the measurement)', () => {
    expect(keywordTermExpectedNewDocs(undefined, 10_000)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(
      keywordTermExpectedNewDocs(
        {
          lastHarvestAt: null,
          lastResultCount: null,
          corpusDocsAtHarvest: null,
        },
        10_000,
      ),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('a just-harvested term sinks (corpus delta 0 → expectation 0) — rotation without timers', () => {
    const history = {
      lastHarvestAt: new Date(),
      lastResultCount: 200,
      corpusDocsAtHarvest: 10_000,
    };
    expect(keywordTermExpectedNewDocs(history, 10_000)).toBe(0);
  });

  it('re-enters exactly when the source has produced enough new content for its measured share', () => {
    // share = 200/10,000 = 2% → needs 50 new posts to expect 1 new doc.
    const history = {
      lastHarvestAt: new Date(),
      lastResultCount: 200,
      corpusDocsAtHarvest: 10_000,
    };
    expect(keywordTermExpectedNewDocs(history, 10_049)).toBeLessThan(1);
    expect(keywordTermExpectedNewDocs(history, 10_050)).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('measured-barren terms (share 0) never re-enter via the clamp — only demand pierces', () => {
    const history = {
      lastHarvestAt: new Date(),
      lastResultCount: 0,
      corpusDocsAtHarvest: 10_000,
    };
    expect(keywordTermExpectedNewDocs(history, 1_000_000)).toBe(0);
  });
});

describe('KeywordAttemptHistoryService — harvest snapshot (§12.3 exact)', () => {
  function harness() {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { keywordAttemptHistory: { upsert } };
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      warn: jest.fn(),
    };
    const service = new KeywordAttemptHistoryService(
      prisma as never,
      logger as never,
    );
    return { service, upsert };
  }

  it('success records the FULL harvest snapshot', async () => {
    const { service, upsert } = harness();
    await service.recordAttempt({
      engineName: 'region-us-tx-austin',
      normalizedTerm: 'birria',
      outcome: 'success',
      resultCount: 42,
      corpusDocs: 9_000,
    });
    const { update } = upsert.mock.calls[0][0];
    expect(update).toMatchObject({
      lastResultCount: 42,
      corpusDocsAtHarvest: 9_000,
    });
    expect(update.lastHarvestAt).toBeInstanceOf(Date);
  });

  it('no_results is a MEASURED-BARREN harvest (count 0, snapshot kept)', async () => {
    const { service, upsert } = harness();
    await service.recordAttempt({
      engineName: 'region-us-tx-austin',
      normalizedTerm: 'quokka',
      outcome: 'no_results',
      resultCount: 0,
      corpusDocs: 9_000,
    });
    const { update } = upsert.mock.calls[0][0];
    expect(update).toMatchObject({
      lastResultCount: 0,
      corpusDocsAtHarvest: 9_000,
    });
  });

  it('error/deferred NEVER touch the harvest snapshot (§12.3: a fault cannot re-time a term)', async () => {
    const { service, upsert } = harness();
    for (const outcome of ['error', 'deferred'] as const) {
      await service.recordAttempt({
        engineName: 'region-us-tx-austin',
        normalizedTerm: 'birria',
        outcome,
        resultCount: 99,
        corpusDocs: 9_999,
      });
    }
    for (const call of upsert.mock.calls) {
      expect(call[0].update).not.toHaveProperty('lastHarvestAt');
      expect(call[0].update).not.toHaveProperty('lastResultCount');
      expect(call[0].update).not.toHaveProperty('corpusDocsAtHarvest');
    }
  });
});
