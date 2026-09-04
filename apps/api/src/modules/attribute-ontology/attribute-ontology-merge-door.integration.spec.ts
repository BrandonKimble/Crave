/**
 * THE ONE MERGE DOOR FOR ATTRIBUTES (red team 2026-09-04 ID-3), proven
 * against a real database.
 *
 * The ontology canonicalization pass used to execute its merges privately:
 * a bare fold with no verdict (loser's name at 'recall' — powerless under
 * the grade law), the loser archived with NO redirect and NO ledger row.
 * Since the grade law, a later mention of the merged-away name was sunk into
 * the redirect-less tombstone and dropped instead of routed. RED against the
 * old applyPlan: zero claim_verdicts rows, zero entity_redirects rows, the
 * winner's carried name at 'recall'.
 */
import { PrismaClient } from '@prisma/client';
import { AttributeDedupeMergeService } from './attribute-dedupe-merge.service';
import {
  AttributeOntologyService,
  CanonicalizationPlan,
} from './attribute-ontology.service';
import { ATTRIBUTE_MERGE_LANE } from './attribute-merge-lane.adapter';
import { ClaimVerdictLedgerService } from '../content-processing/entity-resolver/claim-verdict-ledger.service';
import { EntityAnchorRehomeService } from '../content-processing/entity-resolver/entity-anchor-rehome.service';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';
import { addSurfaces } from '../content-processing/entity-resolver/entity-surface.service';
import { LLMService } from '../external-integrations/llm/llm.service';
import { EmbeddingService } from '../external-integrations/llm/embedding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const TEST_TAG = 'itest-ontology-merge-door';
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
    placeAttribute: async () => {
      await Promise.resolve();
      throw new Error('applyPlan must not call the placement judge');
    },
    judgeAttributeMergesBatch: async () => {
      await Promise.resolve();
      throw new Error('the door must not re-judge a decided merge');
    },
  } as unknown as LLMService;
}

async function seedAttribute(label: string): Promise<string> {
  const name = `${TEST_TAG}-${label}`;
  const entity = await prisma.entity.create({
    data: {
      name,
      type: 'place_attribute',
      status: 'active',
      identityKey: canonicalFold(name),
    },
  });
  entityIds.push(entity.entityId);
  // Birth testimony: the entity's own name, observed.
  await prisma.$transaction((tx) =>
    addSurfaces(tx, entity.entityId, [
      { form: name, source: 'extraction', claimGrade: 'observed' },
    ]),
  );
  return entity.entityId;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required — this spec proves a merge law');
  }
});

afterAll(async () => {
  if (entityIds.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE lane = $1 AND claim_key LIKE '%' || $2 || '%'`,
      ATTRIBUTE_MERGE_LANE,
      entityIds[0],
    );
    await prisma.entityRedirect.deleteMany({
      where: { fromEntityId: { in: entityIds } },
    });
    await prisma.$executeRawUnsafe(
      `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
      entityIds,
    );
    await prisma.entity.deleteMany({ where: { entityId: { in: entityIds } } });
  }
  await prisma.$disconnect();
});

describe('AttributeOntologyService.applyPlan merges (real DB)', () => {
  it('records the verdict, writes the redirect, and folds the loser name at judged — through the one merge door', async () => {
    const winnerId = await seedAttribute('outdoor-seating');
    const loserId = await seedAttribute('outside-seating');
    const winnerName = `${TEST_TAG}-outdoor-seating`;
    const loserName = `${TEST_TAG}-outside-seating`;

    const door = new AttributeDedupeMergeService(
      prisma as unknown as PrismaService,
      unusedLlm(),
      {} as EmbeddingService,
      new EntityAnchorRehomeService(noopLogger()),
      new ClaimVerdictLedgerService(prisma as unknown as PrismaService),
      noopLogger(),
      { embedEntities: () => Promise.resolve(0) } as never,
    );
    const ontology = new AttributeOntologyService(
      prisma as unknown as PrismaService,
      unusedLlm(),
      {} as EmbeddingService,
      noopLogger(),
      door,
      { embedEntities: () => Promise.resolve(0) } as never,
    );
    const plan: CanonicalizationPlan = {
      type: 'place_attribute',
      scope: 'pending',
      candidateCount: 1,
      promotions: [],
      merges: [
        {
          canonicalEntityId: winnerId,
          canonicalName: winnerName,
          mergedEntityId: loserId,
          mergedName: loserName,
          reason: 'itest: the same seating property, one spelling variant',
        },
      ],
      rejections: [],
      renames: [],
    };

    const verified = await ontology.applyPlan(plan, { apply: false });
    expect(verified).toMatchObject({ applied: false, merges: 1 });
    // Verify mode executes nothing: the loser is still live.
    const stillLive = await prisma.entity.findUniqueOrThrow({
      where: { entityId: loserId },
      select: { status: true },
    });
    expect(stillLive.status).toBe('active');

    const applied = await ontology.applyPlan(plan, { apply: true });
    expect(applied).toMatchObject({ applied: true, merges: 1 });

    const verdicts = await prisma.$queryRawUnsafe<
      Array<{ outcome: string; executed: boolean }>
    >(
      `SELECT outcome::text, executed_at IS NOT NULL AS executed
         FROM claim_verdicts
        WHERE lane = $1 AND claim_key LIKE '%' || $2 || '%'`,
      ATTRIBUTE_MERGE_LANE,
      loserId,
    );
    expect(verdicts).toEqual([{ outcome: 'merge', executed: true }]);

    const redirect = await prisma.entityRedirect.findFirst({
      where: { fromEntityId: loserId },
      select: { toEntityId: true },
    });
    expect(redirect?.toEntityId).toBe(winnerId);

    const loser = await prisma.entity.findUniqueOrThrow({
      where: { entityId: loserId },
      select: { status: true },
    });
    expect(loser.status).toBe('archived');

    const carried = await prisma.$queryRawUnsafe<
      Array<{ claim_grade: string; origin_lane: string | null }>
    >(
      `SELECT claim_grade::text, origin_lane FROM entity_surface
        WHERE entity_id = $1::uuid AND form = $2`,
      winnerId,
      loserName,
    );
    expect(carried).toEqual([
      { claim_grade: 'judged', origin_lane: ATTRIBUTE_MERGE_LANE },
    ]);
  });
});
