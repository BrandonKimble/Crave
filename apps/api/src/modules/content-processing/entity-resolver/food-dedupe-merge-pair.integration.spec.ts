/* eslint-disable @typescript-eslint/require-await -- the `async` on these jest.fn mocks is
   not decoration: each stands in for a genuinely async method, so the mock must return a
   promise to match the interface it replaces. The rule targets a function that only
   PRETENDS to be async; that is not this. */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/**
 * FoodDedupeMergeService.mergeFoodPair — MERGE ORCHESTRATION, against a real
 * Postgres (F1870, the one gap this finding's prior pass left open).
 *
 * WHY THIS SPEC EXISTS. `run()` finds candidate duplicate-food pairs and
 * decides via a deterministic rule / LLM judge whether to merge them; that
 * decision layer is now covered elsewhere. What was NEVER exercised is what
 * happens once a merge is decided: `mergeFoodPair` folds the loser's
 * connections onto the winner's (re-pointing a clean connection, or —  when
 * both foods are already connected to the SAME restaurant — dedupe-merging
 * the two colliding connections' mentions and rebasing their counters), then
 * archives the loser via `finalizeMergeCompletion`. This is exactly the class
 * of bug this codebase's audit calls "verification that cannot fail": a
 * broken fold, a busted collision-dedupe, or a wrong counter rebase would
 * silently double-count evidence or merge two real dishes' history — no test
 * previously watched any of it.
 *
 * `run()` itself is NOT used here — it scans and merges EVERY active food
 * pair in the whole database above a similarity floor, which would be
 * destructive against the shared local dev DB this spec must run against.
 * `mergeFoodPair` is called directly (it is private; accessed via a typed
 * cast, the standard way to unit-test a private method) so the test is
 * scoped to only the two foods it seeds.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { FoodDedupeMergeService } from './food-dedupe-merge.service';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import { canonicalFold } from './entity-identity';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { LoggerService } from '../../../shared';

const TEST_TAG = 'itest-food-merge-pair';
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
  // The pairs this spec drives never reach a judge call (no order-twin,
  // no similarity-scan lane — mergeFoodPair is invoked directly) so a
  // call here is itself a defect; fail loudly rather than silently mock.
  return {
    matchEntitiesBatch: async () => {
      throw new Error('unexpected LLM call from a direct mergeFoodPair test');
    },
  } as unknown as LLMService;
}

async function seedEntity(label: string, type: 'food' | 'restaurant') {
  const name = `${TEST_TAG}-${label}`;
  // foldSurfacesFromMerge only banks the loser's name if identity_key is
  // populated (it reads the STORED fold, not a computed one — see the
  // function's own comment) — mirror the real creation path so this spec
  // exercises the true alias-banking behaviour, not an artifact of a
  // sparse seed.
  const entity = await prisma.entity.create({
    data: { name, type, identityKey: canonicalFold(name) },
  });
  entityIds.push(entity.entityId);
  return entity.entityId;
}

async function seedConnection(params: {
  restaurantId: string;
  foodId: string;
  mentionCount: number;
  totalUpvotes: number;
  supportMentionCount: number;
  supportTotalUpvotes: number;
  lastMentionedAt: Date;
}) {
  return prisma.connection.create({
    data: {
      restaurantId: params.restaurantId,
      foodId: params.foodId,
      mentionCount: params.mentionCount,
      totalUpvotes: params.totalUpvotes,
      supportMentionCount: params.supportMentionCount,
      supportTotalUpvotes: params.supportTotalUpvotes,
      lastMentionedAt: params.lastMentionedAt,
    },
  });
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
      OR: [{ foodId: { in: entityIds } }, { restaurantId: { in: entityIds } }],
    },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.$disconnect();
});

describe('FoodDedupeMergeService.mergeFoodPair — connection fold, mention-collision dedupe, counter rebase (F1870)', () => {
  it('folds colliding connections, drops duplicate mentions, rebases counters, and archives the loser', async () => {
    const restaurantShared = await seedEntity('r-shared', 'restaurant');
    const restaurantWinnerOnly = await seedEntity(
      'r-winner-only',
      'restaurant',
    );

    // Winner has TWO connections (more evidence) — the evidence rule
    // (`connectionsA > connectionsB`) must pick it regardless of name
    // length, so this also proves winner-selection is by connection COUNT,
    // not name-length (the tie-break only fires on an equal count).
    const winnerFood = await seedEntity('winner-food-longer-name', 'food');
    const loserFood = await seedEntity('loser', 'food');

    const winnerSharedConn = await seedConnection({
      restaurantId: restaurantShared,
      foodId: winnerFood,
      mentionCount: 10,
      totalUpvotes: 50,
      supportMentionCount: 2,
      supportTotalUpvotes: 6,
      lastMentionedAt: new Date('2024-01-01T00:00:00Z'),
    });
    const winnerOnlyConn = await seedConnection({
      restaurantId: restaurantWinnerOnly,
      foodId: winnerFood,
      mentionCount: 1,
      totalUpvotes: 1,
      supportMentionCount: 0,
      supportTotalUpvotes: 0,
      lastMentionedAt: new Date('2023-01-01T00:00:00Z'),
    });
    const loserSharedConn = await seedConnection({
      restaurantId: restaurantShared,
      foodId: loserFood,
      mentionCount: 5,
      totalUpvotes: 20,
      supportMentionCount: 1,
      supportTotalUpvotes: 3,
      // Later than the winner's — the survivor must ADOPT this later date.
      lastMentionedAt: new Date('2024-06-01T00:00:00Z'),
    });

    // Survivor-side mention that will COLLIDE with a loser mention on the
    // same (sourceDocumentId, kind) — the exact case the collision-dedupe
    // exists for.
    const collideDoc = '11111111-1111-1111-1111-111111111111';
    const uniqueSupportDoc = '22222222-2222-2222-2222-222222222222';
    const uniqueDirectDoc = '33333333-3333-3333-3333-333333333333';

    await prisma.restaurantItemMention.create({
      data: {
        connectionId: winnerSharedConn.connectionId,
        kind: 'direct',
        mentionedAt: new Date('2024-01-01T00:00:00Z'),
        sourceUpvotes: 8,
        sourceDocumentId: collideDoc,
      },
    });
    // Colliding loser mention — same (document, kind) as the survivor's
    // mention above. Must be DELETED, not moved, and its count/upvotes must
    // be subtracted out of the loser's counters before they roll onto the
    // survivor (otherwise the dish's mention_count/total_upvotes double it).
    await prisma.restaurantItemMention.create({
      data: {
        connectionId: loserSharedConn.connectionId,
        kind: 'direct',
        mentionedAt: new Date('2024-06-01T00:00:00Z'),
        sourceUpvotes: 3,
        sourceDocumentId: collideDoc,
      },
    });
    // Non-colliding loser mentions — must be RE-POINTED onto the survivor
    // connection, not dropped.
    await prisma.restaurantItemMention.create({
      data: {
        connectionId: loserSharedConn.connectionId,
        kind: 'support',
        mentionedAt: new Date('2024-06-01T00:00:00Z'),
        sourceUpvotes: 7,
        sourceDocumentId: uniqueSupportDoc,
      },
    });
    await prisma.restaurantItemMention.create({
      data: {
        connectionId: loserSharedConn.connectionId,
        kind: 'direct',
        mentionedAt: new Date('2024-06-01T00:00:00Z'),
        sourceUpvotes: 4,
        sourceDocumentId: uniqueDirectDoc,
      },
    });

    const service = new FoodDedupeMergeService(
      prisma as any,
      unusedLlm(),
      new EntityAnchorRehomeService(noopLogger()),
      new ClaimVerdictLedgerService(prisma as never),
      noopLogger(),
    );

    await (service as any).mergeFoodPair(winnerFood, loserFood);

    // --- Winner survives, loser archived ---
    const [winnerEntity, loserEntity] = await Promise.all([
      prisma.entity.findUniqueOrThrow({ where: { entityId: winnerFood } }),
      prisma.entity.findUniqueOrThrow({ where: { entityId: loserFood } }),
    ]);
    expect(winnerEntity.status).toBe('active');
    expect(loserEntity.status).toBe('archived');

    // --- Redirect: loser -> winner ---
    const redirect = await prisma.entityRedirect.findUnique({
      where: { fromEntityId: loserFood },
    });
    expect(redirect?.toEntityId).toBe(winnerFood);

    // --- Loser's connection at the shared restaurant is gone (folded, not
    //     merely orphaned) ---
    const loserConnAfter = await prisma.connection.findUnique({
      where: { connectionId: loserSharedConn.connectionId },
    });
    expect(loserConnAfter).toBeNull();

    // --- Survivor connection at the shared restaurant absorbed the fold,
    //     with counters REBASED (loser total minus the deduped collision) ---
    const survivorConnAfter = await prisma.connection.findUniqueOrThrow({
      where: { connectionId: winnerSharedConn.connectionId },
    });
    expect(survivorConnAfter.mentionCount).toBe(14); // 10 + (5 - 1 deduped)
    expect(survivorConnAfter.totalUpvotes).toBe(67); // 50 + (20 - 3 deduped)
    expect(survivorConnAfter.supportMentionCount).toBe(3); // 2 + (1 - 0)
    expect(survivorConnAfter.supportTotalUpvotes).toBe(9); // 6 + (3 - 0)
    expect(survivorConnAfter.lastMentionedAt?.toISOString()).toBe(
      '2024-06-01T00:00:00.000Z', // later of the two, adopted from the loser
    );

    // --- The winner's OTHER (non-colliding) connection is untouched ---
    const winnerOnlyAfter = await prisma.connection.findUniqueOrThrow({
      where: { connectionId: winnerOnlyConn.connectionId },
    });
    expect(winnerOnlyAfter.mentionCount).toBe(1);
    expect(winnerOnlyAfter.foodId).toBe(winnerFood);

    // --- Mentions: the colliding one is GONE, the two unique ones moved
    //     onto the survivor connection, with no duplicate (document, kind) ---
    const mentionsAfter = await prisma.restaurantItemMention.findMany({
      where: { connectionId: winnerSharedConn.connectionId },
      select: { sourceDocumentId: true, kind: true },
    });
    expect(mentionsAfter).toHaveLength(3);
    const keys = mentionsAfter
      .map((m) => `${m.sourceDocumentId}:${m.kind}`)
      .sort();
    expect(keys).toEqual(
      [
        `${collideDoc}:direct`,
        `${uniqueDirectDoc}:direct`,
        `${uniqueSupportDoc}:support`,
      ].sort(),
    );
    // The colliding loser mention row itself must be truly deleted, not
    // merely re-pointed and shadowed.
    const staleMention = await prisma.restaurantItemMention.findFirst({
      where: { sourceDocumentId: collideDoc, sourceUpvotes: 3 },
    });
    expect(staleMention).toBeNull();

    // --- Loser's name banked as a SURFACE ROW on the winner ---
    // Read from entity_surface, the one store: core_entities.aliases[] (the
    // derived projection this used to assert on) was retired with §11 item 4.
    const loserName = `${TEST_TAG}-loser`;
    const winnerSurfaces = await prisma.$queryRawUnsafe<
      Array<{ form: string }>
    >(
      `SELECT form FROM entity_surface
        WHERE entity_id = $1::uuid
          AND status = 'active' AND locale = 'und' AND role <> 'display'`,
      winnerEntity.entityId,
    );
    expect(winnerSurfaces.map((r) => r.form)).toContain(loserName);
  });
});
