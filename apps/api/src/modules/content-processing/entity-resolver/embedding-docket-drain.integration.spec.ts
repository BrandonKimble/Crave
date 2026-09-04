/**
 * THE EMBEDDING DOCKET DRAINS (red-team F2, plans/wave-redteam-report.md).
 *
 * The lane's law is "the ledger's memory drains the docket across runs,
 * closest pairs first" — but the LIMIT used to run BEFORE the memory, so
 * every run recalled the same closest 200 pairs and, once judged, heard
 * nothing forever; pairs 201+ were unreachable. The fix anti-joins the
 * hearing ledger inside the candidate SQL (the attribute lane's
 * candidates → ledger filter → cap order), so a judged pair never occupies
 * the recall bound again.
 *
 * Two-run simulation against a real Postgres, read-only where it matters:
 * run 1's recall must SEE a seeded twin pair; after its verdict is recorded
 * (a persisted 'hold', the exact re-recall trap), run 2's recall must not
 * return the pair AT ALL — proving the exclusion happens in the query,
 * before the LIMIT, not in the adjudicator after it.
 *
 * The full sweep (`run()`) is deliberately not driven — it scans and merges
 * the whole shared database. `embeddingCandidatePairs` is the extracted
 * candidate query, protected for exactly this proof.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { ClaimRehearingBudgetService } from './claim-rehearing-budget.service';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { ItemDedupeMergeService } from './food-dedupe-merge.service';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import { canonicalFold } from './entity-identity';
import {
  ENTITY_DEDUPE_LANE,
  entityDedupeLane,
} from './entity-dedupe-lane.adapter';
import {
  ENTITY_DEDUPE_RULE_FINGERPRINT,
  ENTITY_DEDUPE_RULE_VERSION,
} from './entity-dedupe-rule';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { LoggerService } from '../../../shared';

/** The dedupe judge lane drains through the hearing allowance (G2); these
 *  proofs are about the hearing itself, not the allowance, and this
 *  machine's window may already be spent. */
class UnspentWindowBudget extends ClaimRehearingBudgetService {
  hearingsSpentInWindow(): Promise<number> {
    return Promise.resolve(0);
  }
}

const TEST_TAG = 'itest-embed-docket';
const prisma = new PrismaClient();
const entityIds: string[] = [];
const claimKeys: string[] = [];

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

async function seedIngredient(label: string): Promise<string> {
  const name = `${TEST_TAG}-${label}`;
  const entity = await prisma.entity.create({
    data: { name, type: 'ingredient', identityKey: canonicalFold(name) },
  });
  entityIds.push(entity.entityId);
  // Identical unit vectors: cosine distance 0 — the pair sorts to the very
  // top of the distance ranking, so the outer LIMIT cannot hide it.
  const vector = `[1${',0'.repeat(767)}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE core_entities SET name_embedding = '${vector}'::vector WHERE entity_id = $1::uuid`,
    entity.entityId,
  );
  return entity.entityId;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves the docket-drain law and must not be skipped',
    );
  }
});

afterAll(async () => {
  if (claimKeys.length) {
    await prisma.$executeRaw`
      DELETE FROM claim_verdicts
      WHERE lane = ${ENTITY_DEDUPE_LANE}
        AND claim_key = ANY(${claimKeys}::text[])`;
  }
  await prisma.connection.deleteMany({
    where: {
      OR: [{ itemId: { in: entityIds } }, { placeId: { in: entityIds } }],
    },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.$disconnect();
});

describe('embedding recall — a judged pair never re-occupies the docket (F2)', () => {
  it('recalls a twin pair once, then never again after its verdict lands', async () => {
    const twinA = await seedIngredient('beef-ribeye');
    const twinB = await seedIngredient('ribeye-beef');

    // Active support (D5): reference each twin from a connection's
    // ingredients array so the sweep's ingredient support predicate admits
    // them.
    const place = await prisma.entity.create({
      data: {
        name: `${TEST_TAG}-place`,
        type: 'place',
        identityKey: canonicalFold(`${TEST_TAG}-place`),
      },
    });
    entityIds.push(place.entityId);
    const dish = await prisma.entity.create({
      data: {
        name: `${TEST_TAG}-dish`,
        type: 'item',
        identityKey: canonicalFold(`${TEST_TAG}-dish`),
      },
    });
    entityIds.push(dish.entityId);
    await prisma.connection.create({
      data: {
        placeId: place.entityId,
        itemId: dish.entityId,
        ingredients: [twinA, twinB],
      },
    });

    const ledger = new ClaimVerdictLedgerService(prisma as never);
    const service = new ItemDedupeMergeService(
      prisma as never,
      {} as LLMService,
      new EntityAnchorRehomeService(noopLogger()),
      ledger,
      noopLogger(),
      new UnspentWindowBudget(
        prisma as never,
        new ClaimVerdictLedgerService(prisma as never),
      ),
    );

    const testable = service as unknown as {
      embeddingCandidatePairs(
        sweepType: string,
      ): Promise<Array<{ a_id: string; b_id: string }>>;
    };
    const pairKey = ([a, b]: [string, string]) =>
      entityDedupeLane.canonicalClaimKey({ entityId: a, otherEntityId: b });
    const hasTwinPair = (
      pairs: Array<{ a_id: string; b_id: string }>,
    ): boolean =>
      pairs.some(
        (pair) => pairKey([pair.a_id, pair.b_id]) === pairKey([twinA, twinB]),
      );

    // RUN 1: the undrained docket must surface the pair.
    const run1 = await testable.embeddingCandidatePairs('ingredient');
    expect(hasTwinPair(run1)).toBe(true);

    // The verdict lands — a persisted 'hold', the re-recall trap verbatim.
    const claimKey = pairKey([twinA, twinB]);
    claimKeys.push(claimKey);
    await ledger.record({
      lane: ENTITY_DEDUPE_LANE,
      claimKey,
      ruleVersion: ENTITY_DEDUPE_RULE_VERSION,
      foldVersion: entityDedupeLane.keyFoldVersion,
      outcome: 'hold',
      reason: 'itest: distinct concepts (docket-drain proof)',
      ruleFingerprint: ENTITY_DEDUPE_RULE_FINGERPRINT,
      subject: {
        aId: twinA,
        aName: 'itest twin a',
        bId: twinB,
        bName: 'itest twin b',
        via: 'embedding+judge',
        plan: null,
      },
    });

    // RUN 2: the pair is excluded IN THE QUERY — it never reaches the LIMIT,
    // so the bound is spent on undrained pairs instead.
    const run2 = await testable.embeddingCandidatePairs('ingredient');
    expect(hasTwinPair(run2)).toBe(false);
  });
});
