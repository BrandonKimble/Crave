/**
 * EMBEDDINGS ARE WRITTEN AT WRITE TIME — against a REAL Postgres.
 *
 * Recall-scope rederivation (2026-09-04): the writer that mints or renames
 * an entity embeds it after its commit, before the call returns — never a
 * cron. The 5-minute sweep was the only path and does not run where crons
 * are off: on staging every rehearsal place (1,375) and item (794) had a
 * NULL vector and the judge's dense lane was blind to all of them; the
 * sweep also embedded status='active' only, so a shadow's own mints could
 * never be embedded at all.
 *
 * Two facts, each proven on real rows with a deterministic provider stub
 * (no spend):
 *   1. a REAL mint path (PollEntitySeedService.resolveItem, the poll
 *      seed's item minter) returns with name_embedding already non-null;
 *   2. embedEntities covers every recallable status — active-stale,
 *      pending, and rehearsal — and leaves archived rows alone.
 *
 * MUTATION (shown RED on 2026-09-04): with the pre-rederivation poll seed
 * (no reconciler call) the minted item came back with a NULL vector; with
 * the pre-rederivation reconciler (active-only sweep, no embedEntities)
 * the rehearsal and pending rows stayed NULL.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EntityEmbeddingReconcilerService } from './entity-embedding-reconciler.service';
import { PollEntitySeedService } from '../polls/poll-entity-seed.service';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';

const TAG = 'zzqwritetime';
const prisma = new PrismaClient();
const DIMS = 768;
const unit = (): number[] => [1, ...Array<number>(DIMS - 1).fill(0)];

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

/** Deterministic provider: one unit vector per doc, no network. */
const embeddingStub = {
  embed: (docs: string[]) => Promise.resolve(docs.map(() => unit())),
} as never;

const reconciler = new EntityEmbeddingReconcilerService(
  prisma as never,
  embeddingStub,
  { emit: () => undefined } as never,
  logger,
);

const pollSeed = new PollEntitySeedService(
  prisma as never,
  logger,
  { validateScopeConstraints: () => ({ violations: [] }) } as never,
  {} as never,
  {} as never,
  {} as never,
  reconciler,
);

const created: string[] = [];

async function vectorState(
  entityId: string,
): Promise<{ hasVector: boolean; stale: boolean }> {
  const [row] = await prisma.$queryRawUnsafe<
    Array<{ has_vector: boolean; stale: boolean }>
  >(
    `SELECT name_embedding IS NOT NULL AS has_vector, name_embedding_stale AS stale
       FROM core_entities WHERE entity_id = $1::uuid`,
    entityId,
  );
  return { hasVector: row.has_vector, stale: row.stale };
}

async function seed(opts: {
  name: string;
  type: 'item' | 'place' | 'place_attribute';
  status: 'active' | 'pending' | 'rehearsal' | 'archived';
  stale?: boolean;
}): Promise<string> {
  const id = randomUUID();
  await prisma.entity.create({
    data: {
      entityId: id,
      name: opts.name,
      type: opts.type,
      status: opts.status,
      bornExtractionRunId: opts.status === 'rehearsal' ? randomUUID() : null,
      nameEmbeddingStale: opts.stale ?? false,
      ...identityInsertData(opts.name, opts.type),
    },
  });
  if (opts.stale) {
    await prisma.$executeRawUnsafe(
      `UPDATE core_entities SET name_embedding = $1::vector WHERE entity_id = $2::uuid`,
      `[${[0, 1, ...Array<number>(DIMS - 2).fill(0)].join(',')}]`,
      id,
    );
  }
  created.push(id);
  return id;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a write-time DB effect',
    );
  }
});

afterAll(async () => {
  await prisma.entitySurface.deleteMany({
    where: { entityId: { in: created } },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: created } } });
  await prisma.$disconnect();
});

describe('write-time embedding law', () => {
  it('a real mint path returns with the vector already written', async () => {
    const name = `${TAG} dish ${randomUUID().slice(0, 8)}`;
    const resolved = await pollSeed.resolveItem({ name });
    created.push(resolved.entityId);
    expect(resolved.created).toBe(true);
    expect(await vectorState(resolved.entityId)).toEqual({
      hasVector: true,
      stale: false,
    });
  });

  it('embedEntities covers active-stale, pending and rehearsal rows and leaves archived alone', async () => {
    const stale = await seed({
      name: `${TAG} stale item`,
      type: 'item',
      status: 'active',
      stale: true,
    });
    const pending = await seed({
      name: `${TAG} pending attr`,
      type: 'place_attribute',
      status: 'pending',
    });
    const rehearsal = await seed({
      name: `${TAG} rehearsal place`,
      type: 'place',
      status: 'rehearsal',
    });
    const archived = await seed({
      name: `${TAG} archived place`,
      type: 'place',
      status: 'archived',
    });

    const embedded = await reconciler.embedEntities([
      stale,
      pending,
      rehearsal,
      archived,
      stale,
    ]);
    expect(embedded).toBe(3);
    expect(await vectorState(stale)).toEqual({ hasVector: true, stale: false });
    expect(await vectorState(pending)).toEqual({
      hasVector: true,
      stale: false,
    });
    expect(await vectorState(rehearsal)).toEqual({
      hasVector: true,
      stale: false,
    });
    expect(await vectorState(archived)).toEqual({
      hasVector: false,
      stale: false,
    });
    // Idempotent: nothing left to do for these ids.
    expect(await reconciler.embedEntities([stale, pending, rehearsal])).toBe(0);
  });
});
