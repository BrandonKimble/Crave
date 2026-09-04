/**
 * AttributeDedupeMergeService — the decision layer, unit-proven:
 * survivor selection (owner-canon pin > evidence weight > shorter name),
 * the unordered pair key, and the rule-version ledger's loud failure mode.
 * The merge EFFECT is proven against a real Postgres in
 * attribute-merge-pair.integration.spec.ts.
 */
import { AttributeDedupeMergeService } from './attribute-dedupe-merge.service';
import { attributeMergeLane } from './attribute-merge-lane.adapter';
import { ATTRIBUTE_MERGE_RULE_VERSION } from './attribute-merge-rule';
import { LoggerService } from '../../shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LLMService } from '../external-integrations/llm/llm.service';
import { EmbeddingService } from '../external-integrations/llm/embedding.service';
import { ClaimVerdictLedgerService } from '../content-processing/entity-resolver/claim-verdict-ledger.service';
import { EntityAnchorRehomeService } from '../content-processing/entity-resolver/entity-anchor-rehome.service';

function noopLogger(): LoggerService {
  const logger: Partial<LoggerService> = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  logger.setContext = () => logger as LoggerService;
  return logger as LoggerService;
}

describe('attributeMergeLane', () => {
  it('spells one key for a pair however it is emitted (unordered claim)', () => {
    const forward = attributeMergeLane.canonicalClaimKey({
      entityId: 'b-id',
      otherEntityId: 'a-id',
    });
    const reverse = attributeMergeLane.canonicalClaimKey({
      entityId: 'a-id',
      otherEntityId: 'b-id',
    });
    expect(forward).toBe(reverse);
    expect(forward).toBe('a-id|b-id');
  });
});

describe('attribute-merge-rule', () => {
  it('resolves a versioned rule from the prompt text (an unlisted fingerprint throws at load)', () => {
    expect(ATTRIBUTE_MERGE_RULE_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe('AttributeDedupeMergeService.planMerge', () => {
  function build(
    entities: Record<string, { name: string }>,
    refCounts: Record<string, number>,
  ): AttributeDedupeMergeService {
    const prisma = {
      entity: {
        findUniqueOrThrow: jest.fn(
          ({ where }: { where: { entityId: string } }) =>
            Promise.resolve({
              entityId: where.entityId,
              name: entities[where.entityId].name,
            }),
        ),
      },
      $queryRawUnsafe: jest.fn((_sql: string, id: string) =>
        Promise.resolve([{ n: BigInt(refCounts[id] ?? 0) }]),
      ),
    } as unknown as PrismaService;
    return new AttributeDedupeMergeService(
      prisma,
      {} as LLMService,
      {} as EmbeddingService,
      {} as EntityAnchorRehomeService,
      {} as ClaimVerdictLedgerService,
      noopLogger(),
      { embedEntities: () => Promise.resolve(0) } as never,
    );
  }

  it('NO canonical dictionary (owner-overruled 2026-08-30): evidence count decides even against a former pinned spelling', async () => {
    const service = build(
      { a: { name: 'cheap' }, b: { name: 'affordable' } },
      { a: 999, b: 1 },
    );
    const plan = await service.planMerge('place_attribute', 'a', 'b');
    expect(plan.winnerName).toBe('cheap');
    expect(plan.loserName).toBe('affordable');
  });

  it('otherwise more references wins (the name more testimony lives under)', async () => {
    const service = build(
      { a: { name: 'great ambience' }, b: { name: 'great ambiance' } },
      { a: 3, b: 7 },
    );
    const plan = await service.planMerge('place_attribute', 'a', 'b');
    expect(plan.winnerId).toBe('b');
  });

  it('reference ties break to the shorter name', async () => {
    const service = build(
      { a: { name: 'live jazz music' }, b: { name: 'live jazz' } },
      { a: 2, b: 2 },
    );
    const plan = await service.planMerge('place_attribute', 'a', 'b');
    expect(plan.winnerName).toBe('live jazz');
  });
});
