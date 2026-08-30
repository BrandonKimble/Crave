/**
 * Ingredient dedupe-merge — the F-2 extension of the sweep, against a real
 * Postgres. An ingredient is never a connection's food_id: its evidence
 * lives in REFERENCE arrays (`core_restaurant_items.ingredients`,
 * `core_entities.canonical_ingredients`), and the search seam reads those
 * arrays with the QUERY-time winner's id and no redirect hop. So the one
 * thing an ingredient merge must do beyond the shared machinery — and the
 * thing nothing previously tested because nothing previously did it — is
 * re-point every array reference from the loser onto the winner, deduped.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { ItemDedupeMergeService } from './food-dedupe-merge.service';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import { canonicalFold } from './entity-identity';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { LoggerService } from '../../../shared';

const TEST_TAG = 'itest-ingredient-merge';
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
    matchEntitiesBatch: () =>
      Promise.reject(
        new Error('unexpected LLM call from a direct mergeItemPair test'),
      ),
  } as unknown as LLMService;
}

async function seedEntity(
  label: string,
  type: 'item' | 'place' | 'ingredient',
  extra: Record<string, unknown> = {},
) {
  const name = `${TEST_TAG}-${label}`;
  const entity = await prisma.entity.create({
    data: { name, type, identityKey: canonicalFold(name), ...extra },
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
  await prisma.entityRedirect.deleteMany({
    where: { fromEntityId: { in: entityIds } },
  });
  await prisma.connection.deleteMany({
    where: {
      OR: [{ itemId: { in: entityIds } }, { placeId: { in: entityIds } }],
    },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.$disconnect();
});

describe('ItemDedupeMergeService — ingredient merge re-points array references (F-2)', () => {
  it('rewrites connection.ingredients and canonical_ingredients, dedupes, archives the loser, writes the redirect', async () => {
    const place = await seedEntity('place', 'place');
    const dish = await seedEntity('dish', 'item');
    const dishBoth = await seedEntity('dish-both', 'item');

    // Winner earns its win by EVIDENCE (5 referencing rows vs 4), not name
    // length — the loser's name is deliberately shorter, so a name-length
    // win here would mean the evidence rule broke.
    const winner = await seedEntity('roasted-red-pepper-longer', 'ingredient');
    const loser = await seedEntity('red-pepper', 'ingredient');
    const bystander = await seedEntity('basil', 'ingredient');

    // Three winner-only references give the winner its evidence lead
    // (5 referencing rows vs the loser's 4 — reference counts, not
    // connection counts, are an ingredient's evidence).
    for (const label of ['dish-w1', 'dish-w2', 'dish-w3']) {
      const winnerDish = await seedEntity(label, 'item');
      await prisma.connection.create({
        data: { placeId: place, itemId: winnerDish, ingredients: [winner] },
      });
    }

    // Connection referencing ONLY the loser (must flip to the winner).
    const connLoserOnly = await prisma.connection.create({
      data: {
        placeId: place,
        itemId: dish,
        ingredients: [loser, bystander],
      },
    });
    // Connection already referencing BOTH twins (must DEDUPE to one winner).
    const connBoth = await prisma.connection.create({
      data: {
        placeId: place,
        itemId: dishBoth,
        ingredients: [winner, loser],
      },
    });
    // Dish canon referencing the loser (must flip) — and this same row plus
    // connBoth give the winner its 2-reference evidence lead.
    await prisma.entity.update({
      where: { entityId: dish },
      data: { canonicalIngredients: [loser] },
    });
    await prisma.entity.update({
      where: { entityId: dishBoth },
      data: { canonicalIngredients: [winner, loser] },
    });

    const service = new ItemDedupeMergeService(
      prisma as never,
      unusedLlm(),
      new EntityAnchorRehomeService(noopLogger()),
      new ClaimVerdictLedgerService(prisma as never),
      noopLogger(),
    );

    const testable = service as unknown as {
      mergeItemPair(sweepType: string, idA: string, idB: string): Promise<void>;
    };
    await testable.mergeItemPair('ingredient', winner, loser);

    // Loser archived; redirect written toward the winner.
    const loserEntity = await prisma.entity.findUniqueOrThrow({
      where: { entityId: loser },
    });
    expect(loserEntity.status).toBe('archived');
    const redirect = await prisma.entityRedirect.findUnique({
      where: { fromEntityId: loser },
    });
    expect(redirect?.toEntityId).toBe(winner);

    // Array references re-pointed — the loser id survives NOWHERE.
    const [loserOnlyAfter, bothAfter] = await Promise.all([
      prisma.connection.findUniqueOrThrow({
        where: { connectionId: connLoserOnly.connectionId },
      }),
      prisma.connection.findUniqueOrThrow({
        where: { connectionId: connBoth.connectionId },
      }),
    ]);
    expect([...loserOnlyAfter.ingredients].sort()).toEqual(
      [winner, bystander].sort(),
    );
    // Deduped: winner appears ONCE, not twice.
    expect(bothAfter.ingredients).toEqual([winner]);

    const [dishAfter, dishBothAfter] = await Promise.all([
      prisma.entity.findUniqueOrThrow({ where: { entityId: dish } }),
      prisma.entity.findUniqueOrThrow({ where: { entityId: dishBoth } }),
    ]);
    expect(dishAfter.canonicalIngredients).toEqual([winner]);
    expect(dishBothAfter.canonicalIngredients).toEqual([winner]);

    // The winner keeps its own identity and gets the loser's name banked as
    // a surface (finalizeMergeCompletion — shared contract, still runs).
    const winnerEntity = await prisma.entity.findUniqueOrThrow({
      where: { entityId: winner },
    });
    expect(winnerEntity.status).toBe('active');
  });
});
