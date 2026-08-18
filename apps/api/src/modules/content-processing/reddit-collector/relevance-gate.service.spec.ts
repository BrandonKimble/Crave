import {
  normalizeVerdictReason,
  RelevanceGateService,
} from './relevance-gate.service';

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

/**
 * CONFIG-SCOPED VERDICT REUSE (P7 re-open, 2026-08-17). The mutation this
 * pins: reverting the reuse query's promptHash filter (back to permanent
 * per-post verdicts) makes the superseded-config test fail — the post would
 * be served from cache and the judge would never run.
 */
describe('RelevanceGateService config-scoped reuse', () => {
  type StoredRow = {
    platform: string;
    postId: string;
    keep: boolean;
    promptHash: string;
  };
  type FindManyWhere = {
    platform: string;
    postId: { in: string[] };
    promptHash?: string;
  };

  const buildService = (storedRows: StoredRow[]) => {
    const created: Array<{ promptHash: string }> = [];
    const counters = { judgeCalls: 0 };
    const prisma = {
      collectionRelevanceVerdict: {
        findMany: (args: { where: FindManyWhere }) =>
          Promise.resolve(
            storedRows.filter(
              (row) =>
                row.platform === args.where.platform &&
                args.where.postId.in.includes(row.postId) &&
                (args.where.promptHash === undefined ||
                  row.promptHash === args.where.promptHash),
            ),
          ),
        createMany: (args: { data: Array<{ promptHash: string }> }) => {
          created.push(...args.data);
          return Promise.resolve({ count: args.data.length });
        },
      },
    };
    const logger = {
      setContext: () => logger,
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    const llmService = {
      generateForCaller: () => {
        counters.judgeCalls += 1;
        return Promise.resolve(
          JSON.stringify({ verdicts: [{ index: 0, keep: true }] }),
        );
      },
    };
    const promptRegistry = {
      getActive: () => Promise.resolve({ content: 'GATE PROMPT vTEST' }),
    };
    const service = new RelevanceGateService(
      prisma as never,
      logger as never,
      llmService as never,
      promptRegistry as never,
    );
    const currentHash = () =>
      (service as unknown as { promptHash: string }).promptHash;
    return { service, counters, created, currentHash };
  };

  const post = {
    id: 't3_reopen',
    title: 'ramen recs?',
    content: '',
    subreddit: 'testfood',
    author: null,
    url: '',
    score: 1,
    created_at: null,
    comments: [],
  };

  it('re-judges a post whose only verdict is from a superseded config', async () => {
    const { service, counters, created, currentHash } = buildService([
      {
        platform: 'reddit',
        postId: 't3_reopen',
        keep: false,
        promptHash: 'oldconfig0000000',
      },
    ]);
    await service.onModuleInit();
    const result = await service.filterPosts('reddit', [post]);
    expect(counters.judgeCalls).toBe(1);
    expect(result.fromCache).toBe(0);
    expect(result.kept.map((kept) => kept.id)).toEqual(['t3_reopen']);
    expect(created).toHaveLength(1);
    expect(created[0].promptHash).toBe(currentHash());
    expect(created[0].promptHash).not.toBe('oldconfig0000000');
  });

  it('reuses a verdict from the current config without calling the judge', async () => {
    // Two-phase: a first instance only reveals what the current config hash
    // IS; the instance under test then holds a stored verdict at that hash.
    const probe = buildService([]);
    await probe.service.onModuleInit();
    const warm = buildService([
      {
        platform: 'reddit',
        postId: 't3_reopen',
        keep: false,
        promptHash: probe.currentHash(),
      },
    ]);
    await warm.service.onModuleInit();
    const result = await warm.service.filterPosts('reddit', [post]);
    expect(warm.counters.judgeCalls).toBe(0);
    expect(result.fromCache).toBe(1);
    expect(result.dropped).toBe(1);
  });
});
