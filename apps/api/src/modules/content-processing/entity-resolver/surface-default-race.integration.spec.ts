/**
 * THE DEFAULT-LABEL ELECTION SURVIVES A GENUINE RACE (CI 2026-09-04, the
 * first green-path DB-integration run in 25 days), proven against a real
 * database with two interleaved transactions.
 *
 * The writer elects `is_default` inside its INSERT ("wants it AND no default
 * exists") and lets the partial unique arbitrate the one truly simultaneous
 * case with a forceNonDefault retry. But a unique violation ABORTS the
 * enclosing transaction, so the retry ran into "current transaction is
 * aborted" — the label sweep's concurrent spec passed locally (the racers
 * never collided at the database) and failed on CI's slower Postgres every
 * time. The retry now rolls back to a savepoint first.
 *
 * Deterministic race: transaction A inserts a default and HOLDS; B inserts a
 * default for the same (entity, locale) — its NOT EXISTS cannot see A's
 * uncommitted row, so it blocks on the unique index; A commits; B's insert
 * violates; B must retry and land non-default. RED against the old writer:
 * B rejects with the aborted-transaction error.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { addSurfaces } from './entity-surface.service';
import { identityInsertData } from './entity-identity';

const TAG = 'itest-default-race';
const prisma = new PrismaClient();
let entityId = '';

beforeAll(async () => {
  entityId = randomUUID();
  const name = `${TAG}:${entityId.slice(0, 8)}`;
  const identity = identityInsertData(name, 'item' as never);
  await prisma.$executeRawUnsafe(
    `INSERT INTO core_entities (entity_id, name, type, status, identity_key, identity_key_sorted, fold_version)
     VALUES ($1::uuid, $2, 'item'::entity_type, 'active'::entity_status, $3, $4, $5)`,
    entityId,
    name,
    identity.identityKey,
    identity.identityKeySorted,
    identity.foldVersion,
  );
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(
    `DELETE FROM entity_surface WHERE entity_id = $1::uuid`,
    entityId,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE entity_id = $1::uuid`,
    entityId,
  );
  await prisma.$disconnect();
});

describe('default election under a real two-transaction race', () => {
  it('the loser retries non-default instead of dying in an aborted transaction', async () => {
    let releaseA: () => void = () => undefined;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let aInserted: () => void = () => undefined;
    const aHasInserted = new Promise<void>((resolve) => {
      aInserted = resolve;
    });

    const txA = prisma.$transaction(
      async (tx) => {
        await addSurfaces(tx, entityId, [
          {
            form: `${TAG} first`,
            locale: 'es',
            source: 'sweep',
            role: 'display',
            isDefault: true,
          },
        ]);
        aInserted();
        await holdA;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    await aHasInserted;
    const txB = prisma.$transaction(
      (tx) =>
        addSurfaces(tx, entityId, [
          {
            form: `${TAG} second`,
            locale: 'es',
            source: 'sweep',
            role: 'display',
            isDefault: true,
          },
        ]),
      { timeout: 30_000, maxWait: 10_000 },
    );
    // Let B reach the unique index and block on A's uncommitted default.
    await new Promise((resolve) => setTimeout(resolve, 500));
    releaseA();
    await txA;
    await expect(txB).resolves.toEqual({ blocked: [] });

    const defaults = await prisma.$queryRawUnsafe<Array<{ form: string }>>(
      `SELECT form FROM entity_surface
        WHERE entity_id = $1::uuid AND locale = 'es' AND is_default ORDER BY form`,
      entityId,
    );
    expect(defaults).toEqual([{ form: `${TAG} first` }]);
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM entity_surface WHERE entity_id = $1::uuid`,
      entityId,
    );
    expect(Number(rows[0].n)).toBe(2);
  });
});
