/**
 * THE COURT SEES THE WHOLE ROSTER — against a REAL Postgres (integration).
 *
 * Recall-scope rederivation (2026-09-04): the judge's candidate recall must
 * read exactly the world a mention may ADOPT — the tiers' status law
 * (active/pending + this run's rehearsal mints) and the metro gate's
 * geography (80 km from the anchor, ungrounded places included) — not the
 * reader's world (active only, engine place-DAG polygon). Both lanes
 * (lexical name arms, dense name_embedding) share one RecallScope.
 *
 * Executed cause on staging: "Cuba Cafe" (r/Austin) could not recall
 * "Cuba Bakery & Café" (Round Rock, outside the Austin polygon, 28 km from
 * the anchor) and the judge minted a twin; the same shadow run minted
 * "Salt Lick" and then "Salt Lick Bbq" because status='active' hid its own
 * first mint from the second mention's judge.
 *
 * WHY A DB SPEC: every scope predicate is SQL; only real rows can show a
 * lane admitting or refusing one.
 *
 * MUTATION (shown RED on 2026-09-04): the pre-rederivation service had no
 * adoption scope — pending, rehearsal and out-of-polygon rows were never
 * returned, so every adoption assertion below failed.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EntityTextSearchService } from './entity-text-search.service';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';

const TAG = 'zzqscope';
const prisma = new PrismaClient();
const RUN_MINE = randomUUID();
const RUN_FOREIGN = randomUUID();
// Austin anchor; Round Rock is ~28 km out (inside the metro, outside the
// Austin place polygon); Dallas is ~290 km out.
const ANCHOR = { lat: 30.2672, lng: -97.7431 };
const ROUND_ROCK = { lat: 30.5083, lng: -97.6789 };
const DALLAS = { lat: 32.7767, lng: -96.797 };
const DIMS = 768;
const UNIT = `[${[1, ...Array<number>(DIMS - 1).fill(0)].join(',')}]`;

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const service = new EntityTextSearchService(
  prisma as never,
  // The dense lane's query vector: every seeded row carries the same unit
  // vector, so dense admission is decided by SCOPE alone.
  { embedQuery: () => Promise.resolve(JSON.parse(UNIT) as number[]) } as never,
  logger,
  {
    deniedNamePairs: () => Promise.resolve([]),
    isDeniedName: () => Promise.resolve(false),
  } as never,
);

const ids = {
  near: randomUUID(),
  far: randomUUID(),
  ungrounded: randomUUID(),
  mine: randomUUID(),
  foreign: randomUUID(),
  pending: randomUUID(),
};

async function seedEntity(opts: {
  id: string;
  name: string;
  type: 'place' | 'item_attribute';
  status: 'active' | 'pending' | 'rehearsal';
  bornRun?: string;
  location?: { lat: number; lng: number };
}): Promise<void> {
  await prisma.entity.create({
    data: {
      entityId: opts.id,
      name: opts.name,
      type: opts.type,
      status: opts.status,
      bornExtractionRunId: opts.bornRun ?? null,
      ...identityInsertData(opts.name, opts.type),
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE core_entities SET name_embedding = $1::vector WHERE entity_id = $2::uuid`,
    UNIT,
    opts.id,
  );
  if (opts.location) {
    await prisma.placeLocation.create({
      data: {
        placeId: opts.id,
        latitude: opts.location.lat,
        longitude: opts.location.lng,
        isPrimary: true,
      },
    });
  }
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves SQL scope predicates',
    );
  }
  await seedEntity({
    id: ids.near,
    name: `${TAG} near cafe`,
    type: 'place',
    status: 'active',
    location: ROUND_ROCK,
  });
  await seedEntity({
    id: ids.far,
    name: `${TAG} far cafe`,
    type: 'place',
    status: 'active',
    location: DALLAS,
  });
  await seedEntity({
    id: ids.ungrounded,
    name: `${TAG} ungrounded cafe`,
    type: 'place',
    status: 'active',
  });
  await seedEntity({
    id: ids.mine,
    name: `${TAG} mine cafe`,
    type: 'place',
    status: 'rehearsal',
    bornRun: RUN_MINE,
    location: ROUND_ROCK,
  });
  await seedEntity({
    id: ids.foreign,
    name: `${TAG} foreign cafe`,
    type: 'place',
    status: 'rehearsal',
    bornRun: RUN_FOREIGN,
    location: ROUND_ROCK,
  });
  await seedEntity({
    id: ids.pending,
    name: `${TAG} pending attribute`,
    type: 'item_attribute',
    status: 'pending',
  });
});

afterAll(async () => {
  const all = Object.values(ids);
  await prisma.placeLocation.deleteMany({ where: { placeId: { in: all } } });
  await prisma.entitySurface.deleteMany({ where: { entityId: { in: all } } });
  await prisma.entity.deleteMany({ where: { entityId: { in: all } } });
  await prisma.$disconnect();
});

const recall = (
  types: Array<'place' | 'item_attribute'>,
  adoption?: {
    rehearsalRunId: string | null;
    metro: { lat: number; lng: number } | null;
  },
) =>
  service.retrieveCandidates(`${TAG}`, types, 50, {
    denseMode: 'always',
    poolSize: 50,
    ...(adoption ? { adoption } : {}),
  });

describe('adoption-scoped recall — the judge sees what a mention may adopt', () => {
  it('reader scope (no adoption): active rows only, no geography', async () => {
    const found = new Set(
      (await recall(['place', 'item_attribute'])).map((c) => c.entityId),
    );
    expect(found.has(ids.near)).toBe(true);
    expect(found.has(ids.far)).toBe(true);
    expect(found.has(ids.ungrounded)).toBe(true);
    expect(found.has(ids.mine)).toBe(false);
    expect(found.has(ids.foreign)).toBe(false);
    expect(found.has(ids.pending)).toBe(false);
  });

  it("status law: pending rows and THIS run's rehearsal mints are recallable; foreign shadows never", async () => {
    const found = new Set(
      (
        await recall(['place', 'item_attribute'], {
          rehearsalRunId: RUN_MINE,
          metro: null,
        })
      ).map((c) => c.entityId),
    );
    expect(found.has(ids.pending)).toBe(true);
    expect(found.has(ids.mine)).toBe(true);
    expect(found.has(ids.foreign)).toBe(false);
    // No metro anchor = no geo-scope, exactly as the gate stands down.
    expect(found.has(ids.far)).toBe(true);
  });

  it('geography law: the metro radius admits Round Rock and ungrounded places, refuses Dallas — in BOTH lanes', async () => {
    const candidates = await recall(['place'], {
      rehearsalRunId: null,
      metro: ANCHOR,
    });
    const byId = new Map(candidates.map((c) => [c.entityId, c]));
    expect(byId.has(ids.near)).toBe(true);
    expect(byId.has(ids.ungrounded)).toBe(true);
    expect(byId.has(ids.far)).toBe(false);
    // Each admitted row was reached by the lexical lane AND the dense lane:
    // one RecallScope governs both.
    expect(byId.get(ids.near)?.sparseRank).not.toBeNull();
    expect(byId.get(ids.near)?.denseRank).not.toBeNull();
    expect(byId.get(ids.ungrounded)?.denseRank).not.toBeNull();
  });
});
