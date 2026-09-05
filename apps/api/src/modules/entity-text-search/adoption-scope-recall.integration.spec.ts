/**
 * THE COURT SEES THE WHOLE ROSTER — against a REAL Postgres (integration).
 *
 * Recall-scope rederivation (2026-09-04): the judge's candidate recall must
 * read exactly the rows a mention may ADOPT — the tiers' status law
 * (active/pending + this run's rehearsal mints) — not the reader's world
 * (active only, engine place-DAG polygon). Both lanes (lexical name arms,
 * dense name_embedding) share one RecallScope.
 *
 * IDENTITY IS GLOBAL (owner ruling, later the same day): geography is
 * NEVER a recall filter. The metro anchor is a bounded RANKING PRIOR — a
 * near place outranks a far one at equal evidence, by exactly one rank —
 * and every candidate carries `metroLocal` so the judge can be shown where
 * it is.
 *
 * Executed causes on staging: "Cuba Cafe" (r/Austin) could not recall
 * "Cuba Bakery & Café" (Round Rock, outside the Austin polygon, 28 km from
 * the anchor) and the judge minted a twin; the same shadow run minted
 * "Salt Lick" and then "Salt Lick Bbq" because status='active' hid its own
 * first mint from the second mention's judge; and under the one-day metro
 * FILTER a Chicagoan's "Ema" in r/austinfood could never reach the real
 * Chicago Ema held from another community.
 *
 * WHY A DB SPEC: every scope predicate is SQL, and the prior's "local" is
 * the metro-distance SQL law; only real rows can show a lane admitting,
 * refusing, or reordering one.
 *
 * MUTATIONS (shown RED on 2026-09-04): the pre-rederivation service had no
 * adoption scope — pending, rehearsal and out-of-polygon rows were never
 * returned; the metro-FILTER version refused the far exact-name row (the
 * "far exact-name is recalled" case below was red against commit 1277f1944).
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
  /** Two equally-evidenced fuzzy twins, one near and one far — the prior's
   *  own case. Same shape as "Ema": a name that exists in two cities. */
  twinNear: randomUUID(),
  twinFar: randomUUID(),
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
  await seedEntity({
    id: ids.twinFar,
    name: `${TAG} ema twin dallas`,
    type: 'place',
    status: 'active',
    location: DALLAS,
  });
  await seedEntity({
    id: ids.twinNear,
    name: `${TAG} ema twin roundrock`,
    type: 'place',
    status: 'active',
    location: ROUND_ROCK,
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
  opts: { term?: string; denseMode?: 'always' | 'none' } = {},
) =>
  service.retrieveCandidates(opts.term ?? `${TAG}`, types, 50, {
    denseMode: opts.denseMode ?? 'always',
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

  it('identity is global: a FAR exact-name place is recalled under a metro anchor — in BOTH lanes — and carries its geography', async () => {
    // RED against 1277f1944 (metro FILTER): Dallas was refused outright.
    const candidates = await recall(['place'], {
      rehearsalRunId: null,
      metro: ANCHOR,
    });
    const byId = new Map(candidates.map((c) => [c.entityId, c]));
    expect(byId.has(ids.far)).toBe(true);
    expect(byId.has(ids.near)).toBe(true);
    expect(byId.has(ids.ungrounded)).toBe(true);
    // One RecallScope governs both lanes: each row reached by lexical AND dense.
    expect(byId.get(ids.far)?.sparseRank).not.toBeNull();
    expect(byId.get(ids.far)?.denseRank).not.toBeNull();
    expect(byId.get(ids.near)?.denseRank).not.toBeNull();
    // The prior's input is on every place candidate: geocoded within 80 km
    // of the anchor = local; Dallas and the ungrounded row are not.
    expect(byId.get(ids.near)?.metroLocal).toBe(true);
    expect(byId.get(ids.far)?.metroLocal).toBe(false);
    expect(byId.get(ids.ungrounded)?.metroLocal).toBe(false);
  });

  it('no anchor / reader scope: the prior does not apply and metroLocal is null', async () => {
    const adopted = await recall(['place'], {
      rehearsalRunId: null,
      metro: null,
    });
    expect(adopted.every((c) => c.metroLocal === null)).toBe(true);
    const reader = await recall(['place']);
    expect(reader.every((c) => c.metroLocal === null)).toBe(true);
  });

  it('a far EXACT-name match surfaces at the top of the shortlist, not buried by near fuzzy neighbours', async () => {
    // Probe by the far row's own full name: it is the sparse lane's exact
    // hit (rank 0). Near non-exact rows may be lifted one rank — so the far
    // exact row is first or second, never lower. Sparse-only so the ranks
    // are the lexical ladder's, not an arbitrary dense tie order.
    const candidates = await recall(
      ['place'],
      { rehearsalRunId: null, metro: ANCHOR },
      { term: `${TAG} far cafe`, denseMode: 'none' },
    );
    const index = candidates.findIndex((c) => c.entityId === ids.far);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThanOrEqual(1);
    expect(candidates[index].sparseEvidence).toBe('exact');
  });

  it('the prior: at equal evidence the near twin outranks the far twin — whichever order the lane returned them', async () => {
    // Both twins match "<tag> ema twin" with the same lexical evidence; the
    // SQL lane's order between them is arbitrary (adjacent ranks). The
    // bounded prior (one rank, local wins the tie) puts Round Rock first.
    const candidates = await recall(
      ['place'],
      { rehearsalRunId: null, metro: ANCHOR },
      { term: `${TAG} ema twin`, denseMode: 'none' },
    );
    const nearIdx = candidates.findIndex((c) => c.entityId === ids.twinNear);
    const farIdx = candidates.findIndex((c) => c.entityId === ids.twinFar);
    expect(nearIdx).toBeGreaterThanOrEqual(0);
    expect(farIdx).toBeGreaterThanOrEqual(0);
    expect(nearIdx).toBeLessThan(farIdx);
    // Without an anchor the same probe is ordered by evidence alone.
    const unanchored = await recall(
      ['place'],
      { rehearsalRunId: null, metro: null },
      { term: `${TAG} ema twin`, denseMode: 'none' },
    );
    expect(unanchored.some((c) => c.entityId === ids.twinFar)).toBe(true);
  });

  it('the prior is BOUNDED: worth exactly one rank, never two', () => {
    // Pure arithmetic of the stated law: a local row one rank behind ties
    // the far row (and wins the tie); two ranks behind, it does not reach it.
    const K = 60;
    const far0 = 1 / K;
    expect(EntityTextSearchService.geographyPriorScore([1])).toBeCloseTo(
      far0,
      12,
    );
    expect(EntityTextSearchService.geographyPriorScore([2])).toBeLessThan(far0);
    // Rank 0 cannot be bettered.
    expect(EntityTextSearchService.geographyPriorScore([0])).toBeCloseTo(
      far0,
      12,
    );
  });
});
