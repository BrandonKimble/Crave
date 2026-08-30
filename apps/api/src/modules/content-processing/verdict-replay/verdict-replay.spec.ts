/* eslint-disable @typescript-eslint/require-await -- jest async mocks */
import { buildVerdictReplayRegistry } from './verdict-replay-adapters';
import { sampleLaneVerdicts } from './verdict-replay-sampler';
import { VerdictReplayRunner } from './verdict-replay.service';
import {
  HARD_SAMPLE_CAP,
  StoredVerdictRow,
  VerdictReplayRegistry,
} from './verdict-replay.types';

/**
 * Unit specs for the verdict-replay harness: the sampler's stratification
 * and dedupe, each implemented adapter against a MOCK LLM (flip /
 * unchanged / unreplayable all provable), and the runner's read-only
 * change-table contract. No database, no LLM, no spend.
 */

const row = (over: Partial<StoredVerdictRow>): StoredVerdictRow => ({
  claimKey: 'k',
  ruleVersion: 1,
  foldVersion: 0,
  outcome: 'match',
  reason: 'stored reason',
  subject: {},
  decidedAt: new Date('2026-08-01T00:00:00Z'),
  stratum: 'random',
  ...over,
});

describe('sampleLaneVerdicts', () => {
  const raw = (claimKey: string, outcome: string) => ({
    claim_key: claimKey,
    rule_version: 1,
    fold_version: 0,
    outcome,
    reason: 'r',
    subject: {},
    decided_at: new Date(),
  });

  it('unions the three strata, dedupes by claim identity, and caps', async () => {
    const perOutcome = [raw('a', 'match'), raw('b', 'new')];
    const recent = [raw('a', 'match'), raw('c', 'match')];
    const random = [raw('d', 'new'), raw('e', 'new'), raw('f', 'new')];
    let call = 0;
    const prisma = {
      $queryRaw: jest.fn(async () => [perOutcome, recent, random][call++]),
    };
    const rows = await sampleLaneVerdicts(prisma as never, 'entity_match', 4);
    // 'a' appears in two strata but once in the sample, stamped by the
    // outcome stratum (listed first).
    expect(rows.filter((r) => r.claimKey === 'a')).toHaveLength(1);
    expect(rows.find((r) => r.claimKey === 'a')?.stratum).toBe('outcome');
    expect(rows).toHaveLength(4);
  });

  it('excludes rehearsal rows in the SQL it issues', async () => {
    const prisma = { $queryRaw: jest.fn(async () => []) };
    await sampleLaneVerdicts(prisma as never, 'entity_match', 10);
    for (const callArgs of prisma.$queryRaw.mock.calls as unknown[][]) {
      const sql = (callArgs[0] ?? {}) as { sql?: string; strings?: string[] };
      const text = sql.sql ?? (sql.strings ?? []).join('?');
      expect(text).toContain("NOT LIKE 'rehearsal:%'");
    }
  });
});

describe('replay adapters (mock LLM)', () => {
  const activeEntityRows = [
    {
      entity_id: 'aaaaaaaa-0000-0000-0000-000000000001',
      name: 'Birria Taco',
      type: 'item',
    },
    {
      entity_id: 'aaaaaaaa-0000-0000-0000-000000000002',
      name: 'Quesabirria',
      type: 'item',
    },
  ];
  const A = activeEntityRows[0].entity_id;
  const B = activeEntityRows[1].entity_id;

  const makeDeps = (llmOverrides: Record<string, unknown>) => {
    const prisma = {
      // activeEntities + foodHomes both go through $queryRaw; homes return
      // empty so the D2 context fields fall away.
      $queryRaw: jest.fn(
        async (query: { sql?: string; strings?: string[] }) => {
          const text = query?.sql ?? (query?.strings ?? []).join('?');
          if (text.includes('FROM core_entities')) return activeEntityRows;
          return [];
        },
      ),
    };
    return {
      prisma: prisma as never,
      llm: llmOverrides as never,
      wordJudge: {
        replayClaims: jest.fn(async (_lane: string, rows: never[]) =>
          (rows as Array<{ claimKey: string; outcome: string }>).map((r) => ({
            claimKey: r.claimKey,
            storedOutcome: r.outcome,
            newOutcome: 'carries_concept',
            newReason: 'replayed',
          })),
        ),
      } as never,
    };
  };

  it('entity_match: unchanged, flipped and unreplayable are all told apart', async () => {
    const deps = makeDeps({
      matchEntitiesBatch: jest.fn(async ({ items }: { items: unknown[] }) =>
        items.map((_item, i) => ({
          decision: i === 0 ? 'match' : 'new',
          candidateId: i === 0 ? 0 : null,
          reason: 'today the judge says so',
        })),
      ),
    });
    const registry = buildVerdictReplayRegistry(deps);
    const adapter = registry.get('entity_match')!;
    const results = await adapter.rejudge([
      row({
        claimKey: `item|birria taco|${A}`,
        outcome: 'match',
        subject: { kind: 'item', term: 'birria taco', candidateEntityId: A },
      }),
      row({
        claimKey: `item|quesabirria|${B}`,
        outcome: 'match',
        subject: { kind: 'item', term: 'quesabirria', candidateEntityId: B },
      }),
      row({
        claimKey: 'item|ghost|gone',
        outcome: 'new',
        subject: {
          kind: 'item',
          term: 'ghost',
          candidateEntityId: 'bbbbbbbb-0000-0000-0000-000000000009',
        },
      }),
    ]);
    const byStatus = (status: string) =>
      results.filter((r) => r.status === status);
    expect(byStatus('unchanged')).toHaveLength(1); // match -> match
    expect(byStatus('flipped')).toHaveLength(1); // match -> new
    expect(byStatus('flipped')[0]).toMatchObject({
      storedOutcome: 'match',
      newOutcome: 'new',
      newReason: 'today the judge says so',
      storedReason: 'stored reason',
    });
    expect(byStatus('unreplayable')).toHaveLength(1);
    expect(byStatus('unreplayable')[0].note).toBe('candidate-entity-gone');
  });

  it('entity_dedupe: maps the judge decision onto the lane vocabulary (match->merge)', async () => {
    const deps = makeDeps({
      matchEntitiesBatch: jest.fn(async ({ items }: { items: unknown[] }) =>
        items.map(() => ({
          decision: 'match',
          candidateId: 1,
          reason: 'same dish',
        })),
      ),
    });
    const registry = buildVerdictReplayRegistry(deps);
    const results = await registry.get('entity_dedupe')!.rejudge([
      row({
        claimKey: `${A}|${B}`,
        outcome: 'hold',
        subject: { aId: A, aName: 'Birria Taco', bId: B, bName: 'Quesabirria' },
      }),
    ]);
    expect(results[0]).toMatchObject({
      status: 'flipped',
      storedOutcome: 'hold',
      newOutcome: 'merge',
    });
  });

  it('attribute_merge: a reasonless verdict is unreplayable, never a flip', async () => {
    const deps = makeDeps({
      judgeAttributeMergesBatch: jest.fn(async () => [{ decision: 'merge' }]),
    });
    const registry = buildVerdictReplayRegistry(deps);
    const results = await registry.get('attribute_merge')!.rejudge([
      row({
        claimKey: `${A}|${B}`,
        outcome: 'hold',
        subject: {
          type: 'item_attribute',
          aId: A,
          aName: 'spicy',
          bId: B,
          bName: 'picante',
        },
      }),
    ]);
    expect(results[0].status).toBe('unreplayable');
    expect(results[0].note).toBe('judge-returned-no-answer');
  });

  it('concept_satisfies: rebuilds the pair from the claim key when the subject is thin', async () => {
    const deps = makeDeps({
      generateForCaller: jest.fn(async () =>
        JSON.stringify({ items: [{ n: 1, verdict: 'cousin' }] }),
      ),
    });
    const registry = buildVerdictReplayRegistry(deps);
    const results = await registry
      .get('concept_satisfies')!
      .rejudge([
        row({ claimKey: `${A}>${B}`, outcome: 'satisfies', subject: null }),
      ]);
    expect(results[0]).toMatchObject({
      status: 'flipped',
      storedOutcome: 'satisfies',
      newOutcome: 'cousin',
    });
  });

  it('word lanes ride WordVocabularyJudgeService.replayClaims', async () => {
    const deps = makeDeps({});
    const registry = buildVerdictReplayRegistry(deps);
    const results = await registry.get('word-genericness')!.rejudge([
      row({
        claimKey: 'en|vegan',
        outcome: 'carries_concept',
        subject: { word: 'vegan', locale: 'en' },
      }),
    ]);
    expect(results[0].status).toBe('unchanged');
  });

  it('registers every unimplemented lane loudly, never silently', () => {
    const registry = buildVerdictReplayRegistry(makeDeps({}));
    for (const lane of [
      'place_grounding',
      'restaurant_name',
      'word_claim',
      'dish.knowledge_synthesize',
    ]) {
      expect(registry.noAdapter(lane)?.reason).toContain('no adapter');
      expect(registry.lanes()).toContain(lane);
    }
  });
});

describe('VerdictReplayRunner', () => {
  const prisma = {
    $queryRaw: jest.fn(async (query: { sql?: string; strings?: string[] }) => {
      const text = query?.sql ?? (query?.strings ?? []).join('?');
      if (text.includes('api_usage_ledger')) {
        return [{ requests: 3n, input_tokens: 100n, output_tokens: 50n }];
      }
      return [
        {
          claim_key: 'k1',
          rule_version: 1,
          fold_version: 0,
          outcome: 'match',
          reason: 'r',
          subject: {},
          decided_at: new Date(),
        },
      ];
    }),
  };

  const registryWith = (
    rejudge: (rows: readonly StoredVerdictRow[]) => never,
  ) => {
    const registry = new VerdictReplayRegistry();
    registry.register({
      lane: 'fake_lane',
      currentRuleVersion: () => 7,
      rejudge: rejudge as never,
    });
    return registry;
  };

  it('builds the change table and derives the flip rate from compared rows only', async () => {
    const registry = registryWith((async (rows: StoredVerdictRow[]) =>
      rows.flatMap((r) => [
        {
          claimKey: r.claimKey,
          storedOutcome: 'match',
          storedReason: 'r',
          storedRuleVersion: 1,
          status: 'flipped' as const,
          newOutcome: 'new',
          newReason: 'nr',
        },
        {
          claimKey: 'k2',
          storedOutcome: 'new',
          storedReason: 'r',
          storedRuleVersion: 1,
          status: 'unreplayable' as const,
          note: 'gone',
        },
      ])) as never);
    const runner = new VerdictReplayRunner(prisma as never, registry);
    const report = await runner.replayLane('fake_lane', 10);
    expect(report).toMatchObject({
      implemented: true,
      currentRuleVersion: 7,
      unchanged: 0,
      unreplayable: 1,
      flipRate: 1,
      flipTransitions: { 'match->new': 1 },
      unreplayableNotes: { gone: 1 },
      usage: { requests: 3, inputTokens: 100, outputTokens: 50 },
    });
  });

  it('reports an unimplemented lane without sampling or judging', async () => {
    const registry = new VerdictReplayRegistry();
    registry.registerUnimplemented({ lane: 'ghost', reason: 'no adapter: x' });
    const localPrisma = { $queryRaw: jest.fn() };
    const runner = new VerdictReplayRunner(localPrisma as never, registry);
    const report = await runner.replayLane('ghost', 10);
    expect(report.implemented).toBe(false);
    expect(report.noAdapterReason).toBe('no adapter: x');
    expect(localPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('refuses to exceed the hard sample cap', async () => {
    const seen: number[] = [];
    const registry = registryWith((async () => []) as never);
    const localPrisma = {
      $queryRaw: jest.fn(
        async (query: { sql?: string; strings?: string[] }) => {
          const text = query?.sql ?? (query?.strings ?? []).join('?');
          if (text.includes('api_usage_ledger')) {
            return [{ requests: 0n, input_tokens: 0n, output_tokens: 0n }];
          }
          const values = (query as { values?: unknown[] }).values ?? [];
          seen.push(
            ...values.filter((v): v is number => typeof v === 'number'),
          );
          return [];
        },
      ),
    };
    const runner = new VerdictReplayRunner(localPrisma as never, registry);
    await runner.replayLane('fake_lane', 5_000);
    expect(Math.max(...seen)).toBeLessThanOrEqual(HARD_SAMPLE_CAP);
  });
});
