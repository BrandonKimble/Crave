/**
 * THE REDIRECT GRAPH IS FLAT — one hop, always (F515) — against a REAL Postgres.
 *
 * WHY THIS SPEC EXISTS. Every read surface in this codebase resolves a stale
 * entity id with a SINGLE hop: `COALESCE(r.to_entity_id, id)` / one
 * `entityRedirect.findMany`. That is correct ONLY because the merge writer
 * (`finalizeMergeCompletion`) keeps `entity_redirects` flat: when B is merged
 * into C, every redirect that pointed AT B is repointed to C, and any redirect
 * FROM the live winner is dropped. If that ever stopped holding, single-hop
 * resolution would silently degrade — an A→B→C chain would resolve A to the
 * ARCHIVED B, i.e. exactly the not-found/leak the six-surface fix just closed,
 * reintroduced from the writer's end where no reader can see it.
 *
 * F515 was recorded as IDEAL-VERIFIED *conditional* on that writer invariant.
 * This is the assertion that discharges the condition — and it is BEHAVIOURAL:
 * it performs a real chained merge in a transaction and reads the resulting
 * graph, so a writer change that drops the flattening statements turns it RED.
 *
 * The writer file itself is untouched (another lane owns it); this spec only
 * calls its exported contract.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 */
import { PrismaClient } from '@prisma/client';
import { finalizeMergeCompletion } from '../reddit-collector/extraction-scope.service';

const TEST_TAG = 'itest-redirect-flat';

const prisma = new PrismaClient();

const ids: string[] = [];

async function seed(label: string): Promise<string> {
  const entity = await prisma.entity.create({
    data: { name: `${TEST_TAG}-${label}`, type: 'item' },
  });
  ids.push(entity.entityId);
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
    where: { fromEntityId: { in: ids } },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.$disconnect();
});

describe('merge writer keeps redirect chains FLAT (F515)', () => {
  it('A→B then B→C leaves A→C and B→C — never a two-hop chain', async () => {
    const a = await seed('a');
    const b = await seed('b');
    const c = await seed('c');

    // Merge 1: A into B.
    await prisma.$transaction((tx) => finalizeMergeCompletion(tx, b, a));
    // Merge 2: B into C — B is now a winner-turned-loser, the chain case.
    await prisma.$transaction((tx) => finalizeMergeCompletion(tx, c, b));

    const rows = await prisma.entityRedirect.findMany({
      where: { fromEntityId: { in: [a, b, c] } },
      select: { fromEntityId: true, toEntityId: true },
    });
    const target = new Map(rows.map((r) => [r.fromEntityId, r.toEntityId]));

    // The invariant, stated two ways.
    // (1) Both losers point DIRECTLY at the final survivor.
    expect(target.get(a)).toBe(c);
    expect(target.get(b)).toBe(c);
    // (2) No redirect target is itself a redirect source — that IS "flat", and
    //     it is the property single-hop resolution depends on.
    for (const [, to] of target) {
      expect(target.has(to)).toBe(false);
    }
    // And the survivor is not a source at all.
    expect(target.has(c)).toBe(false);
  });

  it('single-hop resolution therefore reaches a LIVE entity for every stale id', async () => {
    const stale = await seed('stale');
    const survivor = await seed('survivor');
    await prisma.$transaction((tx) =>
      finalizeMergeCompletion(tx, survivor, stale),
    );

    // The exact shape every read surface uses: ONE lookup, then the entity.
    const hop = await prisma.entityRedirect.findUnique({
      where: { fromEntityId: stale },
    });
    const resolved = await prisma.entity.findFirst({
      where: {
        entityId: hop?.toEntityId ?? stale,
        status: { not: 'archived' },
      },
      select: { entityId: true },
    });
    expect(resolved?.entityId).toBe(survivor);
  });
});
