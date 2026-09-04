/**
 * AttributeDedupeMergeService.executeMergePlan — MERGE EXECUTION against a
 * real Postgres (the food-dedupe-merge-pair pattern, applied to the
 * attribute vocabulary).
 *
 * What is proven: given a decided plan, the effect (1) repoints every
 * registered reference array (restaurant_attributes with DISTINCT collapse),
 * (2) folds the evidence ledger's colliding PK rows (observations summed),
 * (3) archives the loser, (4) writes the entity_redirects row, (5) is
 * idempotent by state (a second execution is a no-op). The decision layer
 * (candidates, judge, ledger) is covered in attribute-dedupe-merge.spec.ts;
 * `run()` is NOT used here — it would scan the shared dev corpus.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import {
  AttributeDedupeMergeService,
  AttributeMergePlan,
} from './attribute-dedupe-merge.service';
import { ClaimVerdictLedgerService } from '../content-processing/entity-resolver/claim-verdict-ledger.service';
import { EntityAnchorRehomeService } from '../content-processing/entity-resolver/entity-anchor-rehome.service';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';
import { LLMService } from '../external-integrations/llm/llm.service';
import { EmbeddingService } from '../external-integrations/llm/embedding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const TEST_TAG = 'itest-attr-merge-pair';
const prisma = new PrismaClient();
const entityIds: string[] = [];

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

function unusedLlm(): LLMService {
  return {
    judgeAttributeMergesBatch: async () => {
      await Promise.resolve();
      throw new Error(
        'unexpected LLM call from a direct executeMergePlan test',
      );
    },
  } as unknown as LLMService;
}

async function seedEntity(
  label: string,
  type: 'place' | 'place_attribute',
): Promise<string> {
  const name = `${TEST_TAG}-${label}`;
  const entity = await prisma.entity.create({
    data: { name, type, identityKey: canonicalFold(name) },
  });
  entityIds.push(entity.entityId);
  return entity.entityId;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a writer invariant and must not be skipped',
    );
  }
});

afterAll(async () => {
  await prisma.placeAttributeEvidence.deleteMany({
    where: { placeId: { in: entityIds } },
  });
  await prisma.entityRedirect.deleteMany({
    where: { fromEntityId: { in: entityIds } },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.$disconnect();
});

function buildService(): AttributeDedupeMergeService {
  return new AttributeDedupeMergeService(
    prisma as unknown as PrismaService,
    unusedLlm(),
    {} as EmbeddingService,
    new EntityAnchorRehomeService(noopLogger()),
    new ClaimVerdictLedgerService(prisma as unknown as PrismaService),
    noopLogger(),
    { embedEntities: () => Promise.resolve(0) } as never,
  );
}

describe('AttributeDedupeMergeService.executeMergePlan (real DB)', () => {
  it('repoints arrays, folds evidence, archives, redirects — and re-runs as a no-op', async () => {
    const winnerId = await seedEntity('great-atmosphere', 'place_attribute');
    const loserId = await seedEntity('killer-atmosphere', 'place_attribute');

    // A place carrying BOTH ids: the repoint must collapse to DISTINCT,
    // never leave the loser id or double the winner.
    const placeBoth = await seedEntity('place-both', 'place');
    await prisma.entity.update({
      where: { entityId: placeBoth },
      data: { placeAttributes: [winnerId, loserId] },
    });
    // A place carrying only the loser id: plain repoint.
    const placeLoserOnly = await seedEntity('place-loser-only', 'place');
    await prisma.entity.update({
      where: { entityId: placeLoserOnly },
      data: { placeAttributes: [loserId] },
    });
    // Evidence: a colliding (place, source_class) row pair must FOLD
    // (observations summed) and a loser-only row must repoint.
    await prisma.placeAttributeEvidence.createMany({
      data: [
        {
          placeId: placeBoth,
          attributeId: winnerId,
          sourceClass: 'reddit',
          observations: 2,
        },
        {
          placeId: placeBoth,
          attributeId: loserId,
          sourceClass: 'reddit',
          observations: 3,
        },
        {
          placeId: placeLoserOnly,
          attributeId: loserId,
          sourceClass: 'reddit',
          observations: 1,
        },
      ],
    });

    const service = buildService();
    const plan: AttributeMergePlan = {
      type: 'place_attribute',
      winnerId,
      winnerName: `${TEST_TAG}-great-atmosphere`,
      loserId,
      loserName: `${TEST_TAG}-killer-atmosphere`,
    };
    await (
      service as unknown as {
        executeMergePlan(p: AttributeMergePlan): Promise<void>;
      }
    ).executeMergePlan(plan);

    const both = await prisma.entity.findUniqueOrThrow({
      where: { entityId: placeBoth },
      select: { placeAttributes: true },
    });
    expect(both.placeAttributes).toEqual([winnerId]);
    const loserOnly = await prisma.entity.findUniqueOrThrow({
      where: { entityId: placeLoserOnly },
      select: { placeAttributes: true },
    });
    expect(loserOnly.placeAttributes).toEqual([winnerId]);

    const evidence = await prisma.placeAttributeEvidence.findMany({
      where: { placeId: { in: [placeBoth, placeLoserOnly] } },
      orderBy: { observations: 'desc' },
    });
    expect(evidence).toHaveLength(2);
    expect(evidence.every((row) => row.attributeId === winnerId)).toBe(true);
    expect(evidence[0].observations).toBe(5); // 2 + 3 folded
    expect(evidence[1].observations).toBe(1);

    const loser = await prisma.entity.findUniqueOrThrow({
      where: { entityId: loserId },
      select: { status: true },
    });
    expect(String(loser.status)).toBe('archived');

    const redirect = await prisma.entityRedirect.findUnique({
      where: { fromEntityId: loserId },
    });
    expect(redirect?.toEntityId).toBe(winnerId);

    // Idempotent by state: the loser is archived, so a replay is a no-op
    // (counters would double if it were not).
    await (
      service as unknown as {
        executeMergePlan(p: AttributeMergePlan): Promise<void>;
      }
    ).executeMergePlan(plan);
    const evidenceAfterReplay = await prisma.placeAttributeEvidence.findMany({
      where: { placeId: placeBoth },
    });
    expect(evidenceAfterReplay).toHaveLength(1);
    expect(evidenceAfterReplay[0].observations).toBe(5);
  });
});
