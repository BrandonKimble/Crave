/**
 * THE ONE UNKNOWN-SEARCH INTAKE (owner-ordered merge, 2026-08-30):
 * segmentation → alias-match → demand routing, in one drain.
 *
 * Carried forward from the retired unsegmented-residue spec: the five-group
 * mapping law (entity-type coverage audit F-3 — no segmenter output array may
 * be dropped) and the discard-on-empty-segmentation behaviour.
 *
 * New under the merge: a KNOWN piece is a no-op (never demand), a LEARNED
 * piece becomes vocabulary instead of demand, a REFUSED (collision) or
 * unmatched piece stays demand, a single unknown word skips the splitter LLM
 * and flows as an untyped on_demand_ask signal, mixed queries route each
 * piece independently, the judge budget caps a pass, and the alias step is
 * flag-gated DEFAULT OFF.
 */
import { EntityType } from '@prisma/client';
import { UnknownSearchIntakeService } from './unknown-search-intake.service';
import { QUERY_ENTITY_GROUP_KEYS } from './dto/search-query.dto';
import type {
  VocabularyMatcher,
  VocabularyMatchResult,
} from './demand-vocabulary.service';

type Analysis = Record<string, string[]>;

const EMPTY_ANALYSIS: Analysis = {
  places: [],
  items: [],
  itemAttributes: [],
  placeAttributes: [],
  ingredients: [],
};

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    residueId: 'residue-1',
    residueText: 'something with yuzu kosho',
    engineIds: ['engine-1'],
    userId: 'user-1',
    searchRequestId: 'req-1',
    detectedLocale: 'en',
    context: {},
    ...overrides,
  };
}

function build(options: {
  rows?: Array<Record<string, unknown>>;
  analysis?: Analysis;
  matcher?: Partial<VocabularyMatcher>;
  aliasFlag?: boolean;
}) {
  const rows = options.rows ?? [makeRow()];
  const prisma = {
    onDemandUnsegmentedResidue: {
      findMany: jest.fn().mockResolvedValue(rows),
      updateMany: jest.fn<
        Promise<{ count: number }>,
        [{ where: Record<string, unknown>; data: Record<string, unknown> }]
      >(() => Promise.resolve({ count: rows.length })),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const llmService = {
    interpretResidue: jest
      .fn()
      .mockResolvedValue(options.analysis ?? EMPTY_ANALYSIS),
  };
  const onDemand = { recordRequests: jest.fn().mockResolvedValue([]) };
  const matcher: VocabularyMatcher = {
    isKnown: jest.fn().mockResolvedValue(false),
    match: jest.fn().mockResolvedValue({
      outcome: 'left_as_demand',
      judged: true,
    } satisfies VocabularyMatchResult),
    ...options.matcher,
  };
  const demandVocabulary = {
    createMatcher: jest.fn().mockResolvedValue(matcher),
  };
  const signals = {
    record: jest.fn<void, [Record<string, unknown>]>(),
    bboxFromBounds: jest.fn().mockReturnValue(null),
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- jest.fn()
  const matchMock = matcher.match as jest.Mock;
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  if (options.aliasFlag) {
    process.env.UNKNOWN_INTAKE_ALIAS_MATCH_ENABLED = 'true';
  } else {
    delete process.env.UNKNOWN_INTAKE_ALIAS_MATCH_ENABLED;
  }
  const service = new UnknownSearchIntakeService(
    prisma as never,
    llmService as never,
    onDemand as never,
    demandVocabulary as never,
    signals as never,
    logger as never,
  );
  return { service, prisma, llmService, onDemand, matcher, matchMock, signals };
}

afterEach(() => {
  delete process.env.UNKNOWN_INTAKE_ALIAS_MATCH_ENABLED;
});

describe('UnknownSearchIntakeService — segmentation → typed demand (F-3 carried forward)', () => {
  it('records an ingredient answer as an ingredient-typed on-demand request', async () => {
    const { service, onDemand } = build({
      analysis: { ...EMPTY_ANALYSIS, ingredients: ['yuzu kosho'] },
    });
    await service.drainBatch();
    expect(onDemand.recordRequests).toHaveBeenCalledTimes(1);
    const [requests] = onDemand.recordRequests.mock.calls[0] as [
      Array<{ term: string; entityType: EntityType }>,
    ];
    expect(requests).toEqual([
      expect.objectContaining({
        term: 'yuzu kosho',
        entityType: EntityType.ingredient,
      }),
    ]);
  });

  it('maps every group of the search vocabulary — no arm can be dropped again', async () => {
    const analysis: Analysis = {};
    for (const key of QUERY_ENTITY_GROUP_KEYS) {
      analysis[key] = [`term-${key}`];
    }
    const { service, onDemand } = build({ analysis });
    await service.drainBatch();
    const [requests] = onDemand.recordRequests.mock.calls[0] as [
      Array<{ term: string; entityType: EntityType }>,
    ];
    expect(requests.map((request) => request.entityType).sort()).toEqual(
      [...Object.values(EntityType)].sort(),
    );
    expect(requests).toHaveLength(QUERY_ENTITY_GROUP_KEYS.length);
  });

  it('discards a residue whose segmentation names nothing, unchanged behaviour', async () => {
    const { service, onDemand, prisma, signals } = build({});
    await service.drainBatch();
    expect(onDemand.recordRequests).not.toHaveBeenCalled();
    expect(signals.record).not.toHaveBeenCalled();
    const [updateArgs] =
      prisma.onDemandUnsegmentedResidue.updateMany.mock.calls[0];
    expect(updateArgs.data.status).toBe('discarded');
  });
});

describe('UnknownSearchIntakeService — single unknown word (untyped lane)', () => {
  it('skips the splitter LLM and records a direct untyped on_demand_ask signal per row', async () => {
    const { service, llmService, onDemand, signals, prisma } = build({
      rows: [
        makeRow({ residueText: 'khachapuri' }),
        makeRow({
          residueId: 'residue-2',
          residueText: 'khachapuri',
          userId: 'user-2',
          searchRequestId: 'req-2',
        }),
      ],
    });
    await service.drainBatch();
    expect(llmService.interpretResidue).not.toHaveBeenCalled();
    expect(onDemand.recordRequests).not.toHaveBeenCalled();
    expect(signals.record).toHaveBeenCalledTimes(2);
    expect(signals.record.mock.calls[0][0]).toMatchObject({
      kind: 'on_demand_ask',
      subject: { entityId: null, term: 'khachapuri' },
      meta: { reason: 'unresolved', source: 'gazetteer_residue' },
    });
    const [updateArgs] =
      prisma.onDemandUnsegmentedResidue.updateMany.mock.calls[0];
    expect(updateArgs.data.status).toBe('segmented');
  });
});

describe('UnknownSearchIntakeService — alias-match routing (the merge)', () => {
  it('a KNOWN piece is a no-op: never demand, no judge call — the free filter is always on', async () => {
    const { service, onDemand, matchMock, signals } = build({
      analysis: { ...EMPTY_ANALYSIS, items: ['birria tacos', 'taco'] },
      matcher: {
        isKnown: jest
          .fn()
          .mockImplementation((term: string) =>
            Promise.resolve(term === 'taco'),
          ),
      },
    });
    await service.drainBatch();
    const [requests] = onDemand.recordRequests.mock.calls[0] as [
      Array<{ term: string }>,
    ];
    expect(requests.map((r) => r.term)).toEqual(['birria tacos']);
    expect(matchMock).not.toHaveBeenCalled(); // flag off
    expect(signals.record).not.toHaveBeenCalled();
  });

  it('flag ON: a LEARNED piece becomes vocabulary, not demand; unmatched pieces stay demand (mixed query)', async () => {
    const { service, onDemand, matchMock } = build({
      aliasFlag: true,
      analysis: { ...EMPTY_ANALYSIS, items: ['gambas', 'khinkali'] },
      matcher: {
        match: jest
          .fn()
          .mockImplementation((term: string) =>
            Promise.resolve(
              term === 'gambas'
                ? { outcome: 'learned', judged: true, entityName: 'shrimp' }
                : { outcome: 'left_as_demand', judged: true },
            ),
          ),
      },
    });
    await service.drainBatch();
    expect(matchMock).toHaveBeenCalledTimes(2);
    const [requests] = onDemand.recordRequests.mock.calls[0] as [
      Array<{ term: string }>,
    ];
    expect(requests.map((r) => r.term)).toEqual(['khinkali']);
  });

  it('flag ON: a REFUSED (collision-guarded) piece falls through to demand — never silently vanishes', async () => {
    const { service, signals } = build({
      aliasFlag: true,
      rows: [makeRow({ residueText: 'gambas' })],
      matcher: {
        match: jest.fn().mockResolvedValue({
          outcome: 'refused',
          judged: true,
          entityName: 'shrimp',
        }),
      },
    });
    await service.drainBatch();
    expect(signals.record).toHaveBeenCalledTimes(1);
    const [refusedSignal] = signals.record.mock.calls[0];
    expect(refusedSignal.subject).toMatchObject({ term: 'gambas' });
  });

  it('flag OFF (the default): no judge calls are ever spent', async () => {
    const { service, matchMock } = build({
      analysis: { ...EMPTY_ANALYSIS, items: ['gambas'] },
    });
    await service.drainBatch();
    expect(matchMock).not.toHaveBeenCalled();
  });

  it('the judge budget caps a pass: pieces past the cap stay demand un-judged', async () => {
    const manyRows = Array.from({ length: 101 }, (_, i) =>
      makeRow({
        residueId: `residue-${i}`,
        residueText: `unknownword${i}`,
      }),
    );
    const { service, matchMock, signals } = build({
      aliasFlag: true,
      rows: manyRows,
    });
    await service.drainBatch();
    expect(matchMock.mock.calls.length).toBeLessThanOrEqual(100);
    // The 101st piece still became demand, just without a judge call.
    expect(signals.record).toHaveBeenCalledTimes(101);
  });

  it('one matcher per pass and per-locale grouping: the group locale is the newest decided answer', async () => {
    const { service, matchMock } = build({
      aliasFlag: true,
      rows: [
        makeRow({ residueText: 'gambas', detectedLocale: null }),
        makeRow({
          residueId: 'residue-2',
          residueText: 'gambas',
          detectedLocale: 'es',
        }),
      ],
    });
    await service.drainBatch();
    expect(matchMock).toHaveBeenCalledWith('gambas', 'es');
  });
});

describe('UnknownSearchIntakeService — idempotency and failure', () => {
  it('a failed segmentation increments attempts and reaches failed at 3 — rows retry, never wedge', async () => {
    const { service, prisma, llmService } = build({
      rows: [makeRow({ residueText: 'three word phrase' })],
    });
    llmService.interpretResidue.mockRejectedValue(new Error('boom'));
    await service.drainBatch();
    const calls = prisma.onDemandUnsegmentedResidue.updateMany.mock.calls;
    expect(calls[0][0].data.attempts).toEqual({ increment: 1 });
    expect(calls[1][0].where.attempts).toEqual({ gte: 3 });
    expect(calls[1][0].data.status).toBe('failed');
  });

  it('one LLM segmentation per DISTINCT text, one demand write per row', async () => {
    const { service, llmService, onDemand } = build({
      analysis: { ...EMPTY_ANALYSIS, items: ['birria tacos'] },
      rows: [
        makeRow({ residueText: 'birria tacos please' }),
        makeRow({
          residueId: 'residue-2',
          residueText: 'birria tacos please',
          userId: 'user-2',
        }),
      ],
    });
    await service.drainBatch();
    expect(llmService.interpretResidue).toHaveBeenCalledTimes(1);
    expect(onDemand.recordRequests).toHaveBeenCalledTimes(2);
  });
});
