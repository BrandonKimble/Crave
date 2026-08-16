/**
 * IDENTITY-KEY HEAL — narrowed candidate window, proven against Postgres.
 *
 * The heal (FoodDedupeMergeService.refreshSortedIdentityKeys) used to
 * recompute the fold for EVERY core_entities row nightly. It now reads only
 * rows that could possibly have drifted: NULL-keyed rows (any age) plus rows
 * touched inside the lookback window; { full: true } remains the explicit
 * backfill lever (2026-08-11 convergence audit, change #4).
 *
 * MUTATION PROOFS (each direction can go RED):
 *  - break the heal's recompute/write → 'recent drifted row heals' fails;
 *  - revert to the full-table scan → 'ancient drifted row is NOT a nightly
 *    candidate' fails (the row would be healed);
 *  - drop the NULL-key clause from the window → 'ancient NULL-keyed row
 *    still heals nightly' fails;
 *  - break the { full } lever → 'full pass heals the ancient drift' fails.
 *
 * Run: yarn test:db (needs DATABASE_URL — a dev database, never prod).
 */
import { PrismaClient } from '@prisma/client';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { ItemDedupeMergeService } from './food-dedupe-merge.service';
import { canonicalFold, entityIdentityKey } from './entity-identity';

const TEST_TAG = 'itest-identity-heal';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const service = new ItemDedupeMergeService(
  prisma as never,
  // The heal never calls the LLM or the anchor rehome; stubs that throw
  // prove it.
  {
    matchEntitiesBatch: () => {
      throw new Error('the heal must never call the judge');
    },
  } as never,
  {} as never,
  new ClaimVerdictLedgerService(prisma as never),
  logger,
);

const DRIFT_KEY = 'itest-drifted-key';

async function seedItem(
  label: string,
  opts: { key: string | null; sorted: string | null; ageDays: number },
): Promise<string> {
  const name = `${TEST_TAG} ${label}`;
  const [row] = await prisma.$queryRawUnsafe<Array<{ entity_id: string }>>(
    `INSERT INTO core_entities
       (name, type, status, identity_key, identity_key_sorted,
        created_at, last_updated)
     VALUES ($1, 'item', 'active', $2, $3,
             (now() AT TIME ZONE 'UTC') - ($4 * interval '1 day'),
             now() - ($4 * interval '1 day'))
     RETURNING entity_id`,
    name,
    opts.key,
    opts.sorted,
    opts.ageDays,
  );
  return row.entity_id;
}

async function keysOf(
  entityId: string,
): Promise<{ key: string | null; sorted: string | null }> {
  const [row] = await prisma.$queryRawUnsafe<
    Array<{ key: string | null; sorted: string | null }>
  >(
    `SELECT identity_key AS key, identity_key_sorted AS sorted
     FROM core_entities WHERE entity_id = $1::uuid`,
    entityId,
  );
  return row;
}

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE name LIKE '${TEST_TAG}%'`,
  );
}

let recentDrifted: string;
let ancientDrifted: string;
let ancientNullKey: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'identity-key-heal.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
  await cleanup();
  // Touched yesterday with wrong keys — the write-path-drift shape the
  // nightly window exists for.
  recentDrifted = await seedItem('recent birria', {
    key: DRIFT_KEY,
    sorted: DRIFT_KEY,
    ageDays: 1,
  });
  // Untouched for 30 days with wrong-but-present keys — outside the window,
  // deliberately NOT a nightly candidate (the proof the narrowing is real).
  ancientDrifted = await seedItem('ancient tlayuda', {
    key: DRIFT_KEY,
    sorted: DRIFT_KEY,
    ageDays: 30,
  });
  // Ancient but NULL-keyed — a backfill gap, always a candidate.
  ancientNullKey = await seedItem('ancient khachapuri', {
    key: null,
    sorted: null,
    ageDays: 30,
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('the narrowed nightly heal', () => {
  beforeAll(async () => {
    await service.refreshSortedIdentityKeys();
  });

  it('heals a recently-touched drifted row (RED if the heal itself breaks)', async () => {
    const name = `${TEST_TAG} recent birria`;
    expect(await keysOf(recentDrifted)).toEqual({
      key: canonicalFold(name),
      sorted: entityIdentityKey(name, 'item' as never),
    });
  });

  it('heals an ancient NULL-keyed row — backfill gaps have no touch timestamp to trust', async () => {
    const name = `${TEST_TAG} ancient khachapuri`;
    expect(await keysOf(ancientNullKey)).toEqual({
      key: canonicalFold(name),
      sorted: entityIdentityKey(name, 'item' as never),
    });
  });

  it('does NOT read an ancient, keyed, untouched row — the narrowing is real (RED under a full-table scan)', async () => {
    expect(await keysOf(ancientDrifted)).toEqual({
      key: DRIFT_KEY,
      sorted: DRIFT_KEY,
    });
  });
});

describe('the explicit full lever', () => {
  it('{ full: true } heals what the window deliberately skips', async () => {
    await service.refreshSortedIdentityKeys({ full: true });
    const name = `${TEST_TAG} ancient tlayuda`;
    expect(await keysOf(ancientDrifted)).toEqual({
      key: canonicalFold(name),
      sorted: entityIdentityKey(name, 'item' as never),
    });
  });
});
